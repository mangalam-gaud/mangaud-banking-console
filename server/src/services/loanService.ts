import mongoose, { ClientSession, Types } from 'mongoose';
import { Loan, LoanPayment } from '../models/Loan';
import { Account } from '../models/Account';
import { Transaction } from '../models/Transaction';
import { AppError, NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import logger from '../utils/logger';
// Multi-document transactions require a replica set / mongos. Shared with
// accountService and probed once per process.
import { canUseMongoTransactions } from './accountService';

interface LoanWithDetails {
  _id: string;
  /** Alias of `_id`; the client types and pages read `id`. */
  id: string;
  accountId: string;
  principalAmount: number;
  interestRate: number;
  termMonths: number;
  outstandingAmount: number;
  status: string;
  appliedAt: Date;
  approvedAt?: Date;
  disbursedAt?: Date;
  lastPaymentAt?: Date;
  emiAmount?: number;
  nextDueDate?: Date;
  account?: {
    accountNumber: string;
    customerId: string;
  };
  totalPaid?: number;
  progressPercentage?: number;
}

/**
 * `.populate()` swaps an ObjectId ref for a sub-document, so refs must be
 * unwrapped defensively -- a populated object has an `_id`, not a value you
 * can call `.toString()` on for the id.
 */
const refId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'object') return (value._id ?? value.id)?.toString() ?? '';
  return value.toString();
};

const toLoanWithDetails = (doc: any): LoanWithDetails => ({
  _id: doc._id.toString(),
  // The client types (shared/types.ts) and every page read `id`, not `_id`.
  // Without this alias the UI sees `loan.id === undefined` and crashes.
  id: doc._id.toString(),
  accountId: refId(doc.accountId),
  principalAmount: doc.principalAmount,
  interestRate: doc.interestRate,
  termMonths: doc.termMonths,
  outstandingAmount: doc.outstandingAmount,
  status: doc.status,
  appliedAt: doc.appliedAt,
  approvedAt: doc.approvedAt,
  disbursedAt: doc.disbursedAt,
  lastPaymentAt: doc.lastPaymentAt,
  emiAmount: doc.emiAmount,
  nextDueDate: doc.nextDueDate,
  account: doc.accountId && typeof doc.accountId === 'object' ? {
    accountNumber: doc.accountId.accountNumber,
    customerId: refId(doc.accountId.customerId),
  } : undefined,
  totalPaid: doc.totalPaid,
  progressPercentage: doc.progressPercentage,
});

const generateReference = (prefix: string): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

const calculateEMI = (principal: number, annualRate: number, termMonths: number): number => {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) {
    return Math.round(principal / termMonths * 100) / 100;
  }
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
              (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.round(emi * 100) / 100;
};

export const applyLoan = async (
  accountNumber: string,
  principalAmount: number,
  interestRate: number,
  termMonths: number
): Promise<LoanWithDetails> => {
  const account = await Account.findOne({ 
    accountNumber: accountNumber.toUpperCase(),
    status: 'ACTIVE'
  });

  if (!account) {
    throw new NotFoundError('Account');
  }

  if (principalAmount < 1000) {
    throw new ValidationError('Minimum loan amount is 1000');
  }

  if (interestRate < 0.1 || interestRate > 30) {
    throw new ValidationError('Interest rate must be between 0.1% and 30%');
  }

  if (termMonths < 1 || termMonths > 360) {
    throw new ValidationError('Term must be between 1 and 360 months');
  }

  const emiAmount = calculateEMI(principalAmount, interestRate, termMonths);

  const loan = await Loan.create([{
    accountId: account._id,
    principalAmount,
    interestRate,
    termMonths,
    outstandingAmount: principalAmount,
    status: 'APPLIED',
    appliedAt: new Date(),
    emiAmount,
    nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }]);

  logger.info(`Loan application created: ${loan[0]._id} for account: ${accountNumber}`);
  return toLoanWithDetails(loan[0]);
};

export const getLoanById = async (loanId: string): Promise<LoanWithDetails | null> => {
  const loan = await Loan.findById(loanId)
    .populate('accountId', 'accountNumber customerId')
    .lean();

  return loan ? toLoanWithDetails(loan) : null;
};

export const getLoansByAccount = async (accountId: string): Promise<LoanWithDetails[]> => {
  if (!accountId) return [];

  const loans = await Loan.find({ accountId })
    .populate('accountId', 'accountNumber customerId')
    .sort({ createdAt: -1 })
    .lean();

  return loans.map(toLoanWithDetails);
};

export const getAllLoans = async (
  page: number = 1,
  limit: number = 20,
  filters: { status?: string; accountId?: string; accountIds?: string[] } = {}
): Promise<{ loans: LoanWithDetails[]; total: number; totalPages: number }> => {
  const query: any = {};
  if (filters.status) query.status = filters.status;
  if (filters.accountId) query.accountId = filters.accountId;
  /*
    Branch scoping for the staff loan book.

    `Loan` carries no `branchCode`, so scope is expressed the only way it can be:
    as the set of account ids the caller may see, which `visibleAccountIds`
    already computes with the branch rule inside it. Listing loans is the view a
    loan officer and a manager use to decide who to chase, so an unscoped list
    leaks one branch's borrowers to another branch's officer — including their
    balances, which arrive in the populated account sub-document.
  */
  if (filters.accountIds) {
    if (filters.accountIds.length === 0) {
      // No visible accounts: return an empty page, never an unfiltered list.
      return { loans: [], total: 0, totalPages: 0 };
    }
    query.accountId = { $in: filters.accountIds };
  }

  const [loans, total] = await Promise.all([
    Loan.find(query)
      .populate('accountId', 'accountNumber customerId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Loan.countDocuments(query),
  ]);

  return {
    loans: loans.map(toLoanWithDetails),
    total,
    totalPages: Math.ceil(total / limit),
  };
};

export const approveLoan = async (loanId: string): Promise<LoanWithDetails> => {
  const loan = await Loan.findById(loanId);
  if (!loan) {
    throw new NotFoundError('Loan');
  }

  if (loan.status !== 'APPLIED') {
    throw new ValidationError('Loan is not available for approval');
  }

  loan.status = 'APPROVED';
  loan.approvedAt = new Date();
  await loan.save();

  logger.info(`Loan approved: ${loanId}`);
  return toLoanWithDetails(loan);
};

export const disburseLoan = async (loanId: string): Promise<LoanWithDetails> => {
  // Sessions/transactions need a replica set; fall back on standalone mongod.
  const session = (await canUseMongoTransactions()) ? await mongoose.startSession() : null;
  const opts = session ? { session } : {};

  try {
    if (session) session.startTransaction();

    /*
     * Claim the loan atomically. A `findById` followed by `status !==
     * 'APPROVED'` leaves both of two concurrent disbursement calls holding a
     * doc that says APPROVED, and both would credit the account -- the loan
     * disbursed twice. Matching on the status inside the update means the
     * second call gets null back.
     */
    const loan = await Loan.findOneAndUpdate(
      { _id: loanId, status: 'APPROVED' },
      {
        $set: {
          status: 'DISBURSED',
          disbursedAt: new Date(),
          nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      { new: true, ...opts }
    );
    if (!loan) {
      const existing = await Loan.findById(loanId).setOptions(opts).select('status').lean();
      if (!existing) throw new NotFoundError('Loan');
      throw new ValidationError('Only approved loans can be disbursed');
    }

    /*
     * Atomic credit. The old `account.balance += principal; save()` read the
     * balance, added to it in memory and wrote the whole document back, so any
     * debit between the read and the write was overwritten -- money created
     * from nothing.
     */
    const account = await Account.findOneAndUpdate(
      { _id: loan.accountId, status: 'ACTIVE' },
      { $inc: { balance: loan.principalAmount } },
      { new: true, ...opts }
    );
    if (!account) {
      throw new ValidationError('Associated account is not active');
    }

    const ref = generateReference('LD');

    await Transaction.create([{
      accountId: account._id,
      transactionType: 'LOAN_DISBURSEMENT',
      amount: loan.principalAmount,
      balanceAfter: account.balance,
      description: 'Loan amount disbursed',
      status: 'COMPLETED',
      reference: ref,
    }], opts);

    if (session) await session.commitTransaction();

    logger.info(`Loan disbursed: ${loanId} - Amount: ${loan.principalAmount}`);
    return toLoanWithDetails(loan);
  } catch (error) {
    if (session && session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    if (session) await session.endSession();
  }
};

export const repayLoan = async (
  loanId: string,
  amount: number,
  fromAccountId?: string
): Promise<LoanWithDetails> => {
  /*
    The customer chooses the account they pay from.

    `fromAccountId` is optional: with it, the borrower debits whichever of *their
    own* accounts they nominate, which is how repayment works everywhere in
    retail banking — the loan sits on one account and the money usually lives in
    another. Without it the debit still comes from the loan's own account, so
    nothing that worked before stops working.

    The ownership check is the whole point of this parameter: the account must
    belong to the same customer as the loan. Otherwise it becomes "repay any
    customer's loan from any account", which is precisely the money-moving
    primitive the permission model exists to prevent. Staff never reach this path
    at all — the route is `loan:repay:own` with no `:any` form, because a bank
    does not pay a customer's debt for them.
  */
  let debitAccountId = fromAccountId ? String(fromAccountId) : undefined;

  // Sessions/transactions need a replica set; fall back on standalone mongod.
  const session = (await canUseMongoTransactions()) ? await mongoose.startSession() : null;
  const opts = session ? { session } : {};

  try {
    if (session) session.startTransaction();

    /*
     * The route schema rejects non-positive amounts, and the service re-checks
     * because it is also reachable from other services. A negative amount used to
     * sail through: `balance -= amount` became a credit and the outstanding
     * principal *grew* -- a repayment that minted money.
     */
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('Repayment amount must be positive');
    }
    amount = Math.round(amount * 100) / 100;

    const loan = await Loan.findById(loanId).setOptions(opts);
    if (!loan) {
      throw new NotFoundError('Loan');
    }

    if (loan.status !== 'DISBURSED') {
      throw new ValidationError('Only disbursed loans can be repaid');
    }

    if (amount > loan.outstandingAmount) {
      throw new ValidationError('Repayment exceeds outstanding amount');
    }

    if (debitAccountId) {
      if (!Types.ObjectId.isValid(debitAccountId)) {
        throw new ValidationError('That is not a valid account');
      }
      /*
        Same customer as the loan, or nothing.
        
        `Loan` holds an `accountId`, not a `customerId`, so the borrower is
        resolved through the loan's own account — the same shape
        `resolveTargetCustomer` uses elsewhere. Checked here rather than trusted
        from the client, because the client chooses this field, and without it
        the parameter would let a borrower repay from an account belonging to
        somebody else.
      */
      const loanAccount = await Account.findById(loan.accountId)
        .setOptions(opts)
        .select('customerId')
        .lean();
      if (!loanAccount) {
        throw new ValidationError('The account this loan was taken against no longer exists');
      }
      const owned = await Account.exists({
        _id: debitAccountId,
        customerId: loanAccount.customerId,
      });
      if (!owned) {
        throw new ForbiddenError('You can only repay from an account you hold');
      }
    } else {
      debitAccountId = String(loan.accountId);
    }

    const monthlyRate = loan.interestRate / 100 / 12;
    const interestPortion = Math.round(loan.outstandingAmount * monthlyRate * 100) / 100;
    const principalPortion = Math.round((amount - interestPortion) * 100) / 100;
    if (principalPortion < 0) {
      throw new ValidationError('Repayment does not cover the interest due');
    }

    /*
     * Debit atomically, guard in the filter. The old read-modify-write
     * (`balance -= amount; save()`) let two concurrent repayments both pass
     * the balance check on the same stale document, overdrawing the account.
     */
    const account = await Account.findOneAndUpdate(
      { _id: debitAccountId, status: 'ACTIVE', balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, ...opts }
    );
    if (!account) {
      const existing = await Account.findById(debitAccountId)
        .setOptions(opts)
        .select('status')
        .lean();
      if (!existing || existing.status !== 'ACTIVE') {
        // Names the account the customer actually chose, not "the associated
        // account" — they picked it from a list of their own, so the message
        // should read the same way.
        throw new ValidationError(
          `Account ${existing?.accountNumber ?? 'you chose'} is not active`
        );
      }
      throw new ValidationError(
        `Insufficient balance in ${existing.accountNumber} for this repayment`
      );
    }

    /*
     * Reduce the outstanding principal atomically too, guarded on enough
     * remaining debt. Two concurrent repayments used to each write
     * `outstanding - ownPortion` over a stale read, so only one reduction
     * survived while the account was debited twice.
     */
    const closesLoan = Math.round((loan.outstandingAmount - principalPortion) * 100) / 100 <= 0.01;
    // MongoDB rejects a document that $incs and $sets the same path, so the
    // closing payment takes a pure $set.
    const loanUpdate = closesLoan
      ? {
          $set: {
            outstandingAmount: 0,
            status: 'CLOSED',
            lastPaymentAt: new Date(),
            nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }
      : {
          $inc: { outstandingAmount: -principalPortion },
          $set: {
            lastPaymentAt: new Date(),
            nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        };
    const updatedLoan = await Loan.findOneAndUpdate(
      { _id: loan._id, status: 'DISBURSED', outstandingAmount: { $gte: principalPortion } },
      loanUpdate,
      { new: true, ...opts }
    );
    if (!updatedLoan) {
      // The loan moved under us (concurrent repayment or closure). Hand the
      // debit back so money and debt stay in step.
      await Account.updateOne({ _id: account._id }, { $inc: { balance: amount } }, opts);
      throw new ValidationError('The loan state changed while paying; please retry');
    }
    loan.outstandingAmount = updatedLoan.outstandingAmount;
    loan.status = updatedLoan.status;
    loan.lastPaymentAt = updatedLoan.lastPaymentAt;
    loan.nextDueDate = updatedLoan.nextDueDate;

    await LoanPayment.create([{
      loanId: loan._id,
      paymentAmount: amount,
      principalPortion: Math.max(0, principalPortion),
      interestPortion: Math.max(0, interestPortion),
      paymentDate: new Date(),
      status: 'COMPLETED',
      reference: generateReference('RP'),
    }], opts);

    await Transaction.create([{
      accountId: account._id,
      transactionType: 'LOAN_REPAYMENT',
      amount,
      balanceAfter: account.balance,
      description: 'Loan repayment',
      status: 'COMPLETED',
      reference: generateReference('LR'),
    }], opts);

    if (session) await session.commitTransaction();

    logger.info(`Loan repayment: ${loanId} - Amount: ${amount}`);
    return toLoanWithDetails(loan);
  } catch (error) {
    if (session && session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    if (session) await session.endSession();
  }
};

export const calculateLoanInterest = async (
  loanId: string,
  fromDate: Date,
  toDate: Date
): Promise<number> => {
  const loan = await Loan.findById(loanId);
  if (!loan) {
    throw new NotFoundError('Loan');
  }

  if (!loan.disbursedAt) {
    return 0;
  }

  const startDate = fromDate > loan.disbursedAt ? fromDate : loan.disbursedAt;
  if (toDate <= startDate) {
    return 0;
  }

  let balance = loan.principalAmount;
  let previousDate = startDate;
  let interest = 0;
  const dailyRate = loan.interestRate / 100 / 365;

  const payments = await LoanPayment.find({
    loanId: loan._id,
    paymentDate: { $gt: startDate, $lte: toDate },
    status: 'COMPLETED',
  })
    .sort({ paymentDate: 1, createdAt: 1 })
    .lean();

  for (const payment of payments) {
    const days = Math.ceil((payment.paymentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
    interest += balance * dailyRate * days;
    balance = Math.max(0, balance - payment.paymentAmount);
    previousDate = payment.paymentDate;
  }

  const finalDays = Math.ceil((toDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
  interest += balance * dailyRate * finalDays;

  return Math.round(interest * 100) / 100;
};

export const getLoanPayments = async (loanId: string): Promise<any[]> => {
  const payments = await LoanPayment.find({ loanId })
    .sort({ paymentDate: -1 })
    .lean();

  return payments;
};

export const getOverdueLoans = async (accountIds?: string[]): Promise<LoanWithDetails[]> => {
  const query: any = {
    status: 'DISBURSED',
    nextDueDate: { $lt: new Date() },
  };
  // Branch-scoped for the same reason as `getAllLoans`: an overdue list is a
  // collections list, and collections do not cross branches.
  if (accountIds) {
    if (accountIds.length === 0) return [];
    query.accountId = { $in: accountIds };
  }

  const loans = await Loan.find(query)
    .populate('accountId', 'accountNumber customerId')
    .lean();

  return loans.map(toLoanWithDetails);
};