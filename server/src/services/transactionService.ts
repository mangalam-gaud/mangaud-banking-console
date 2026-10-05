import { Transaction } from '../models/Transaction';
import { AppError, NotFoundError, ForbiddenError } from '../middleware/errorHandler';
import { ITransactionQuery } from '@shared/types';
import { IUserDocument } from '../models/User';
import { visibleAccountIds, loadAccountForUser } from '../utils/ownership';
import logger from '../utils/logger';

export interface TransactionWithAccount {
  _id: string;
  /** Alias of `_id`; the client types and pages read `id`. */
  id: string;
  accountId: string;
  transactionType: string;
  amount: number;
  balanceAfter: number;
  relatedAccountId?: string;
  /** Set when the money went to a saved payee outside this ledger. */
  beneficiaryId?: string;
  /** Snapshot of the counterparty, preserved after the payee is deleted. */
  counterparty?: {
    name?: string;
    accountNumber?: string;
    ifsc?: string;
    bankName?: string;
    upiId?: string;
  };
  description?: string;
  status: string;
  reference: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  account?: {
    accountNumber: string;
  };
  relatedAccount?: {
    accountNumber: string;
  };
}

/**
 * `.populate()` replaces an ObjectId ref with a sub-document, so a ref can be
 * either an ObjectId or a populated object depending on the query. Calling
 * `.toString()` blindly on a populated object yields the literal string
 * "[object Object]", which is what the API was returning for accountId.
 */
const refId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'object') {
    return (value._id ?? value.id)?.toString() ?? '';
  }
  return value.toString();
};

const refAccountNumber = (value: any): string | undefined => {
  if (value && typeof value === 'object') return value.accountNumber;
  return undefined;
};

const toTransactionWithAccount = (doc: any): TransactionWithAccount => ({
  _id: doc._id.toString(),
  // The client types (shared/types.ts) and every page read `id`, not `_id`.
  id: doc._id.toString(),
  accountId: refId(doc.accountId),
  transactionType: doc.transactionType,
  amount: doc.amount,
  balanceAfter: doc.balanceAfter,
  relatedAccountId: refId(doc.relatedAccountId) || undefined,
  // A populated payee ref is a sub-document; the snapshot next to it is what
  // the UI should show, so take the snapshot and only fall back to the id.
  beneficiaryId: refId(doc.beneficiaryId) || undefined,
  counterparty: doc.counterparty
    ? {
        name: doc.counterparty.name,
        accountNumber: doc.counterparty.accountNumber,
        ifsc: doc.counterparty.ifsc,
        bankName: doc.counterparty.bankName,
        upiId: doc.counterparty.upiId,
      }
    : undefined,
  description: doc.description,
  status: doc.status,
  reference: doc.reference,
  metadata: doc.metadata,
  createdAt: doc.createdAt,
  account: refAccountNumber(doc.accountId)
    ? { accountNumber: refAccountNumber(doc.accountId)! }
    : undefined,
  relatedAccount: refAccountNumber(doc.relatedAccountId)
    ? { accountNumber: refAccountNumber(doc.relatedAccountId)! }
    : undefined,
});

export const getTransactions = async (
  query: ITransactionQuery,
  user: IUserDocument
): Promise<{ transactions: TransactionWithAccount[]; total: number; totalPages: number }> => {
  const { page = 1, limit = 10, accountId, type, fromDate, toDate, minAmount, maxAmount } = query;

  // Scope first, then intersect with the caller's filter. This is the tenant
  // boundary: without it `GET /transactions` returned the whole bank's ledger to
  // anyone with a valid token.
  const allowed = await visibleAccountIds(user);

  const filter: any = { accountId: { $in: allowed } };
  if (accountId) {
    // A caller-supplied `accountId` narrows the set, and can only ever select
    // from `allowed` -- the intersection, not the union, or passing someone
    // else's id would hand it straight back.
    const requested = new Set(allowed.map(String));
    filter.accountId = { $in: [accountId].filter((id) => requested.has(String(id))) };
  }
  if (type) filter.transactionType = type;
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }
  if (minAmount !== undefined || maxAmount !== undefined) {
    filter.amount = {};
    if (minAmount !== undefined) filter.amount.$gte = minAmount;
    if (maxAmount !== undefined) filter.amount.$lte = maxAmount;
  }

  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .populate('accountId', 'accountNumber')
      .populate('relatedAccountId', 'accountNumber')
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  return {
    transactions: transactions.map(toTransactionWithAccount),
    total,
    totalPages: Math.ceil(total / limit),
  };
};

export const getTransactionById = async (
  transactionId: string,
  user: IUserDocument
): Promise<TransactionWithAccount | null> => {
  const transaction = await Transaction.findById(transactionId)
    .populate('accountId', 'accountNumber')
    .populate('relatedAccountId', 'accountNumber')
    .lean();

  if (!transaction) return null;

  // Knowing a transaction id is not enough to read it. Without this check,
  // any authenticated user could read any row in the ledger by iterating ids.
  const allowed = await visibleAccountIds(user);
  const populated = transaction.accountId as any;
  const owner = String(populated && typeof populated === 'object' ? populated._id : populated);
  if (!allowed.some((id) => String(id) === owner)) {
    throw new ForbiddenError('You do not have access to this transaction');
  }

  return toTransactionWithAccount(transaction);
};

export const getMiniStatement = async (
  accountNumber: string,
  limit: number = 10,
  user: IUserDocument
): Promise<TransactionWithAccount[]> => {
  // Verify ownership up front rather than filtering rows afterwards: a 403 is
  // the correct answer for someone else's account, and the query cost is the
  // same either way.
  const account = await loadAccountForUser(accountNumber, user);

  const transactions = await Transaction.find({ accountId: account._id })
    .populate('relatedAccountId', 'accountNumber')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return transactions.map(toTransactionWithAccount);
};

export const getAccountTransactionSummary = async (
  accountId: string,
  user: IUserDocument
): Promise<{
  totalDeposits: number;
  totalWithdrawals: number;
  totalTransfersIn: number;
  totalTransfersOut: number;
  transactionCount: number;
}> => {
  // Same tenant boundary as the list endpoint -- this is a per-account rollup,
  // so the account id in the path is the thing that has to be authorised.
  const allowed = await visibleAccountIds(user);
  if (!allowed.some((id) => String(id) === String(accountId))) {
    throw new ForbiddenError('You do not have access to this account');
  }

  const pipeline = [
    { $match: { accountId: accountId, status: 'COMPLETED' } },
    {
      $group: {
        _id: '$transactionType',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ];

  const results = await Transaction.aggregate(pipeline);
  
  const summary = {
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalTransfersIn: 0,
    totalTransfersOut: 0,
    transactionCount: 0,
  };

  for (const result of results) {
    summary.transactionCount += result.count;
    switch (result._id) {
      case 'DEPOSIT':
      case 'OPENING_DEPOSIT':
      case 'LOAN_DISBURSEMENT':
        summary.totalDeposits += result.total;
        break;
      case 'WITHDRAWAL':
      case 'LOAN_REPAYMENT':
        summary.totalWithdrawals += result.total;
        break;
      case 'TRANSFER_IN':
        summary.totalTransfersIn += result.total;
        break;
      case 'TRANSFER_OUT':
        summary.totalTransfersOut += result.total;
        break;
    }
  }

  return summary;
};

export const getTransactionStats = async (): Promise<{
  totalTransactions: number;
  totalVolume: number;
  byType: Record<string, { count: number; volume: number }>;
  byStatus: Record<string, number>;
}> => {
  const [totalTransactions, totalVolume, byType, byStatus] = await Promise.all([
    Transaction.countDocuments(),
    Transaction.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: '$transactionType', count: { $sum: 1 }, volume: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const typeStats: Record<string, { count: number; volume: number }> = {};
  for (const item of byType) {
    typeStats[item._id] = { count: item.count, volume: item.volume };
  }

  const statusStats: Record<string, number> = {};
  for (const item of byStatus) {
    statusStats[item._id] = item.count;
  }

  return {
    totalTransactions,
    totalVolume: totalVolume[0]?.total || 0,
    byType: typeStats,
    byStatus: statusStats,
  };
};