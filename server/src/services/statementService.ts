import { Types } from 'mongoose';
import { Statement } from '../models/Statement';
import { Account } from '../models/Account';
import { Customer } from '../models/Customer';
import { Transaction } from '../models/Transaction';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import { generateReference } from '../utils/reference';
import logger from '../utils/logger';

export interface StatementView {
  id: string;
  statementNumber: string;
  accountId: string;
  accountNumber: string;
  accountType?: string;
  fromDate: Date;
  toDate: Date;
  periodLabel: string;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
  generatedAt: Date;
}

const CREDIT_TYPES = ['DEPOSIT', 'OPENING_DEPOSIT', 'TRANSFER_IN', 'LOAN_DISBURSEMENT', 'INTEREST'];

const periodLabelFor = (from: Date, to: Date): string => {
  const sameYear = from.getFullYear() === to.getFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });

  if (sameYear) {
    return `${fmt(from, false)} – ${fmt(to, true)}`;
  }
  return `${fmt(from, true)} – ${fmt(to, true)}`;
};

/**
 * Build an immutable statement snapshot for an account and period.
 *
 * Rows are copied out of `transactions` at generation time. Once a customer
 * has been handed a statement number, the numbers in it must never change --
 * a later correction is a new statement, not a silent edit.
 */
export const generateStatement = async (
  customerId: string,
  userId: string,
  accountId: string,
  fromDate: Date,
  toDate: Date
): Promise<{ statement: StatementView; rows: any[] }> => {
  const account = await Account.findOne({ _id: accountId, customerId });
  if (!account) throw new NotFoundError('Account');
  if (account.status === 'CLOSED' && toDate > new Date()) {
    throw new ValidationError('Cannot generate a future statement for a closed account');
  }
  if (toDate <= fromDate) {
    throw new ValidationError('The end date must be after the start date');
  }

  // Allow a window of at most 5 years, matching what most banks offer online.
  const fiveYearsMs = 5 * 365 * 24 * 60 * 60 * 1000;
  if (fromDate.getTime() < Date.now() - fiveYearsMs) {
    throw new ValidationError('Statements are available for the last 5 years only');
  }

  const transactions = await Transaction.find({
    accountId: account._id,
    createdAt: { $gte: fromDate, $lte: toDate },
    status: 'COMPLETED',
  })
    .sort({ createdAt: 1 })
    .lean();

  // The balance immediately before the window opens.
  const prior = await Transaction.findOne({
    accountId: account._id,
    createdAt: { $lt: fromDate },
    status: 'COMPLETED',
  })
    .sort({ createdAt: -1 })
    .select('balanceAfter')
    .lean();

  const openingBalance = prior?.balanceAfter ?? 0;

  let running = openingBalance;
  let totalCredits = 0;
  let totalDebits = 0;

  const rows = transactions.map((txn) => {
    const isCredit = CREDIT_TYPES.includes(txn.transactionType);
    if (isCredit) {
      totalCredits += txn.amount;
    } else {
      totalDebits += txn.amount;
    }
    // Prefer the stored running balance; recompute only if it is missing.
    running = typeof txn.balanceAfter === 'number' ? txn.balanceAfter : running + (isCredit ? txn.amount : -txn.amount);

    return {
      date: txn.createdAt,
      reference: txn.reference,
      description: txn.description || txn.transactionType.replace(/_/g, ' ').toLowerCase(),
      type: txn.transactionType,
      debit: isCredit ? 0 : txn.amount,
      credit: isCredit ? txn.amount : 0,
      balance: running,
    };
  });

  const doc = await Statement.create({
    statementNumber: generateReference('STMT'),
    accountId: account._id,
    accountNumber: account.accountNumber,
    customerId: customerId,
    userId,
    fromDate,
    toDate,
    periodLabel: periodLabelFor(fromDate, toDate),
    openingBalance,
    closingBalance: rows.length > 0 ? rows[rows.length - 1].balance : openingBalance,
    totalCredits: Math.round(totalCredits * 100) / 100,
    totalDebits: Math.round(totalDebits * 100) / 100,
    transactionCount: rows.length,
    rows,
    generatedAt: new Date(),
  });

  logger.info(`Statement generated: ${doc.statementNumber} for ${account.accountNumber}`);

  return {
    statement: {
      id: String(doc._id),
      statementNumber: doc.statementNumber,
      accountId: String(account._id),
      accountNumber: account.accountNumber,
      accountType: account.accountType,
      fromDate: doc.fromDate,
      toDate: doc.toDate,
      periodLabel: doc.periodLabel,
      openingBalance: doc.openingBalance,
      closingBalance: doc.closingBalance,
      totalCredits: doc.totalCredits,
      totalDebits: doc.totalDebits,
      transactionCount: doc.transactionCount,
      generatedAt: doc.generatedAt,
    },
    rows: doc.rows,
  };
};

export const getStatements = async (
  customerId: string,
  options: { page?: number; limit?: number; accountId?: string } = {}
): Promise<{ statements: StatementView[]; total: number; totalPages: number }> => {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  const query: Record<string, unknown> = { customerId };
  if (options.accountId) query.accountId = options.accountId;

  const [docs, total] = await Promise.all([
    Statement.find(query)
      .sort({ generatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Statement.countDocuments(query),
  ]);

  return { statements: docs.map(toStatementView), total, totalPages: Math.ceil(total / limit) };
};

const toStatementView = (doc: any): StatementView => ({
  id: String(doc._id),
  statementNumber: doc.statementNumber,
  accountId: String(doc.accountId),
  accountNumber: doc.accountNumber,
  fromDate: doc.fromDate,
  toDate: doc.toDate,
  periodLabel: doc.periodLabel,
  openingBalance: doc.openingBalance,
  closingBalance: doc.closingBalance,
  totalCredits: doc.totalCredits,
  totalDebits: doc.totalDebits,
  transactionCount: doc.transactionCount,
  generatedAt: doc.generatedAt,
});

/**
 * Just the owner of a statement, used to decide access.
 *
 * A statement id already identifies its owner, so resolving the customer from
 * the caller is the wrong direction for a staff read -- they have no Customer
 * record of their own to compare against, which is why `GET /statements/:id`
 * answered 403 for every staff role despite holding `statement:read:any`.
 */
export const getStatementSummary = async (
  statementId: string
): Promise<{ customerId: string; accountId: string } | null> => {
  if (!Types.ObjectId.isValid(statementId)) return null;
  const doc = await Statement.findById(statementId).select('customerId accountId').lean();
  if (!doc) return null;
  return { customerId: String(doc.customerId), accountId: String(doc.accountId) };
};

/** Full statement including rows, for the detail view and CSV export. */
export const getStatementById = async (
  statementId: string,
  customerId: string
): Promise<{ statement: StatementView; rows: any[]; accountType?: string }> => {
  const doc = await Statement.findOne({ _id: statementId, customerId }).lean();
  if (!doc) throw new NotFoundError('Statement');

  const account = await Account.findById(doc.accountId).select('accountType').lean();

  return {
    statement: { ...toStatementView(doc), accountType: account?.accountType },
    rows: doc.rows,
  };
};

/** Renders a statement as CSV. The caller decides what to do with the string. */
export const statementToCsv = (statement: StatementView, rows: any[]): string => {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    'MANGAUD BANKING CONSOLE',
    `Statement ${statement.statementNumber}`,
    `Account ${statement.accountNumber}`,
    `Period ${statement.periodLabel}`,
    `Generated ${new Date(statement.generatedAt).toISOString().slice(0, 10)}`,
    '',
  ].join('\n');

  const columns = 'Date,Reference,Description,Type,Debit,Credit,Balance';
  const body = rows
    .map((r) =>
      [
        new Date(r.date).toISOString().slice(0, 10),
        r.reference,
        r.description,
        r.type,
        r.debit || '',
        r.credit || '',
        r.balance,
      ]
        .map(escape)
        .join(',')
    )
    .join('\n');

  const totals = [
    '',
    '',
    '',
    'Totals',
    statement.totalDebits || '',
    statement.totalCredits || '',
    statement.closingBalance,
  ]
    .map(escape)
    .join(',');

  return `${header}\n${columns}\n${body}\n${totals}\n`;
};

/** Convenience: generate for every open account belonging to a customer. */
export const generateForAllAccounts = async (
  customerId: string,
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<StatementView[]> => {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new NotFoundError('Customer');

  const accounts = await Account.find({ customerId, status: { $ne: 'CLOSED' } })
    .select('_id')
    .lean();

  const results: StatementView[] = [];
  for (const account of accounts) {
    const { statement } = await generateStatement(customerId, userId, String(account._id), fromDate, toDate);
    results.push(statement);
  }
  return results;
};

export { ForbiddenError };
export default {
  generateStatement,
  getStatements,
  getStatementById,
  statementToCsv,
  generateForAllAccounts,
};
