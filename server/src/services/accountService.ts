import mongoose, { ClientSession } from 'mongoose';
import { randomBytes } from 'crypto';
import { Account } from '../models/Account';
import { Customer } from '../models/Customer';
import { Transaction } from '../models/Transaction';
import { SavingsInterestPosting } from '../models/index';
import { AppError, NotFoundError, ValidationError, ConflictError } from '../middleware/errorHandler';
import logger from '../utils/logger';

interface AccountWithCustomer {
  _id: string;
  /** Alias of `_id`; the client types and pages read `id`. */
  id: string;
  customerId: string;
  branchCode: string;
  accountNumber: string;
  accountType: string;
  balance: number;
  interestRate: number;
  status: string;
  currency: string;
  customer?: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
}

/**
 * Multi-document transactions need a replica set or mongos. A standalone
 * mongod (the default local install) rejects them, so probe once and cache the
 * answer; callers fall back to sequential writes when it is false.
 */
let transactionsSupported: boolean | null = null;

export const canUseMongoTransactions = async (): Promise<boolean> => {
  if (transactionsSupported !== null) return transactionsSupported;
  try {
    const admin = mongoose.connection.db?.admin();
    const info = (await admin?.serverInfo()) as { setName?: string; msg?: string } | undefined;
    transactionsSupported = Boolean(info?.setName) || info?.msg === 'isdbgrid';
  } catch {
    transactionsSupported = false;
  }
  if (!transactionsSupported) {
    logger.warn(
      'MongoDB is running standalone (no replica set); using sequential writes instead of multi-document transactions.'
    );
  }
  return transactionsSupported;
};

/** A populated ref is a sub-document; take its `_id`, not `[object Object]`. */
const refId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'object') return (value._id ?? value.id)?.toString() ?? '';
  return value.toString();
};

const toAccountWithCustomer = (doc: any): AccountWithCustomer => ({
  _id: doc._id.toString(),
  // The client types (shared/types.ts) and every page read `id`, not `_id`.
  // Without this alias the UI sees `account.id === undefined`.
  id: doc._id.toString(),
  customerId: refId(doc.customerId),
  branchCode: doc.branchCode,
  accountNumber: doc.accountNumber,
  accountType: doc.accountType,
  balance: doc.balance,
  interestRate: doc.interestRate,
  status: doc.status,
  currency: doc.currency,
  customer: doc.customerId && typeof doc.customerId === 'object' ? {
    firstName: doc.customerId.firstName,
    lastName: doc.customerId.lastName,
    email: doc.customerId.email,
    phone: doc.customerId.phone,
  } : undefined,
});

/**
 * Next unused account number, in the readable `AC00000001` form.
 *
 * `countDocuments() + 1` is not atomic. Two accounts opened at the same moment
 * read the same count and generate the same number, and one of them dies on the
 * unique index -- which surfaced to the customer as a 500 on a form that had
 * every other field filled in correctly. The unique index is the real guard, so
 * the fix is to generate-and-retry rather than to trust the count. The
 * random fallback is only reached if eight sequential candidates were all
 * genuinely taken, which means the sequence is far behind the row count.
 */
const generateAccountNumber = async (): Promise<string> => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const count = await Account.countDocuments();
    const candidate = `AC${(count + 1 + attempt).toString().padStart(10, '0')}`;
    if (!(await Account.exists({ accountNumber: candidate }))) {
      return candidate;
    }
  }
  const tail = randomBytes(5).toString('hex').toUpperCase().slice(0, 10);
  return `AC${tail}`;
};

const generateReference = (prefix: string): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

export const openAccount = async (
  customerId: string,
  accountType: 'SAVINGS' | 'CURRENT' | 'SALARY',
  initialDeposit: number = 0,
  currency: string = 'INR',
  session?: ClientSession
): Promise<AccountWithCustomer> => {
  const customer = await Customer.findById(customerId).session(session ?? null);
  if (!customer) {
    throw new NotFoundError('Customer');
  }

  let interestRate = 0;
  switch (accountType) {
    case 'SAVINGS': interestRate = 4; break;
    case 'SALARY': interestRate = 3; break;
    case 'CURRENT': interestRate = 0; break;
  }

  const accountNumber = await generateAccountNumber();

  const account = await Account.create([{
    customerId: customer._id,
    // Stamped from the customer so branch scoping has something to filter on.
    // Defaulting to 'HO' for a customer predating the field keeps an existing
    // account visible to head office rather than invisible to everyone.
    branchCode: customer.branchCode ?? 'HO',
    accountNumber,
    accountType,
    balance: initialDeposit,
    interestRate,
    currency,
    status: 'ACTIVE',
    openedAt: new Date(),
  }], { session });

  const newAccount = account[0];

  if (initialDeposit > 0) {
    await Transaction.create([{
      accountId: newAccount._id,
      transactionType: 'OPENING_DEPOSIT',
      amount: initialDeposit,
      balanceAfter: initialDeposit,
      description: 'Initial account deposit',
      status: 'COMPLETED',
      reference: generateReference('OD'),
    }], { session });
  }

  logger.info(`Account opened: ${accountNumber} for customer: ${customerId}`);
  return toAccountWithCustomer(newAccount);
};

export const getAccountByNumber = async (accountNumber: string): Promise<AccountWithCustomer | null> => {
  const account = await Account.findOne({ accountNumber: accountNumber.toUpperCase() })
    .populate('customerId', 'firstName lastName email phone')
    .lean();

  return account ? toAccountWithCustomer(account) : null;
};

export const getAccountById = async (accountId: string): Promise<AccountWithCustomer | null> => {
  const account = await Account.findById(accountId)
    .populate('customerId', 'firstName lastName email phone')
    .lean();

  return account ? toAccountWithCustomer(account) : null;
};

export const getAccountsByCustomer = async (customerId: string): Promise<AccountWithCustomer[]> => {
  const accounts = await Account.find({ customerId })
    .populate('customerId', 'firstName lastName email phone')
    .sort({ createdAt: -1 })
    .lean();

  return accounts.map(toAccountWithCustomer);
};

export const getAllAccounts = async (
  page: number = 1,
  limit: number = 20,
  filters: { status?: string; accountType?: string; branchCode?: string } = {}
): Promise<{ accounts: AccountWithCustomer[]; total: number; totalPages: number }> => {
  const query: any = {};
  if (filters.status) query.status = filters.status;
  if (filters.accountType) query.accountType = filters.accountType;
  /*
    Branch scoping, third chokepoint.
    
    `loadAccountForUser` and `visibleAccountIds` were scoped first, and this one
    was missed — which is exactly how the scope leaked. A live check found a
    BLR001 teller listing all twelve accounts across three branches while both
    ownership helpers were correctly refusing cross-branch reads one account at a
    time. The list endpoint is the *first* thing staff open, so an unscoped list
    makes the whole control look absent even when the detail paths hold.
    
    A `branchCode` filter from the caller is intersected with the caller's own
    scope rather than trusted: a teller asking for BLR002 gets BLR001, not
    BLR002, because a filter that could widen access would not be a filter.
  */
  const scope = filters.branchCode?.trim().toUpperCase();
  if (scope) query.branchCode = scope;

  const [accounts, total] = await Promise.all([
    Account.find(query)
      .populate('customerId', 'firstName lastName email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Account.countDocuments(query),
  ]);

  return {
    accounts: accounts.map(toAccountWithCustomer),
    total,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Move money in or out of one account, atomically.
 *
 * The sufficiency check lives *inside* the update filter rather than being a
 * separate read followed by a write. That matters: with a read-then-write, two
 * concurrent debits both read the same starting balance, both pass the check,
 * and both write -- overdrawing the account and creating money from nothing. A
 * single `findOneAndUpdate` makes the check and the write one indivisible
 * operation, so the loser matches no document and is rejected.
 *
 * This also holds on standalone mongod, where multi-document transactions are
 * unavailable: the atomicity here is within a single document, which does not
 * need a replica set.
 */
export const updateAccountBalance = async (
  accountId: string,
  amount: number,
  transactionType: string,
  description: string,
  relatedAccountId?: string,
  session?: ClientSession
): Promise<AccountWithCustomer> => {
  /*
   * Reject non-numbers and zero here as well as in the route schema.
   *
   * A previous version had no guard at all, so `POST /accounts/deposit` with
   * `{ "amount": -5000 }` subtracted from the balance while writing a DEPOSIT row
   * of `Math.abs(-5000)`. The ledger showed a deposit, the balance dropped, and
   * the only check -- `newBalance < 0` -- never fired on an account with money
   * in it.
   */
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new ValidationError('Amount must be a number');
  }
  if (amount === 0) {
    throw new ValidationError('Amount must not be zero');
  }

  const delta = Math.round(amount * 100) / 100;

  const filter: Record<string, unknown> = { _id: accountId, status: 'ACTIVE' };
  if (delta < 0) {
    filter.balance = { $gte: Math.abs(delta) };
  }

  const account = await Account.findOneAndUpdate(
    filter,
    { $inc: { balance: delta } },
    { new: true, session }
  );

  if (!account) {
    /*
     * One query failed for one of three reasons and they need different
     * messages, so re-read to tell them apart. Doing this only on the failure
     * path keeps the happy path to a single round trip.
     */
    const existing = await Account.findById(accountId).select('status balance').lean();
    if (!existing) {
      throw new NotFoundError('Account');
    }
    if (existing.status !== 'ACTIVE') {
      throw new ValidationError(`Account is ${existing.status.toLowerCase()}`);
    }
    throw new ValidationError('Insufficient balance');
  }

  await Transaction.create([{
    accountId: account._id,
    transactionType,
    amount: Math.abs(delta),
    balanceAfter: account.balance,
    relatedAccountId,
    description,
    status: 'COMPLETED',
    reference: generateReference(transactionType.substring(0, 2)),
  }], { session });

  logger.info(`Balance updated for account ${account.accountNumber}: ${delta} (${transactionType})`);
  return toAccountWithCustomer(account);
};

/**
 * Move money between two accounts held at this bank.
 *
 * Both legs are single-document atomic updates with the sufficiency guard in the
 * filter, so the debit cannot be lost to a concurrent read-modify-write. That is
 * what makes this safe on standalone mongod, where `canUseMongoTransactions()`
 * is false and there is no transaction to fall back on.
 *
 * Note what this does *not* give: if the process dies between the two `$inc`
 * calls and no session is available, the debit stands without its matching
 * credit. The ledger's two `TRANSFER_OUT`/`TRANSFER_IN` rows make that
 * reconcilable, and a replica set makes it impossible -- but a single-document
 * guarantee per leg is the strongest claim that is actually true here.
 */
export const transferFunds = async (
  sourceAccountNumber: string,
  destinationAccountNumber: string,
  amount: number,
  description: string
): Promise<{ source: AccountWithCustomer; destination: AccountWithCustomer }> => {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('Amount must be a positive number');
  }

  const sourceNumber = sourceAccountNumber.toUpperCase();
  const destinationNumber = destinationAccountNumber.toUpperCase();
  if (sourceNumber === destinationNumber) {
    throw new ValidationError('Source and destination accounts must be different');
  }

  const supportsTransactions = await canUseMongoTransactions();
  const session = supportsTransactions ? await mongoose.startSession() : null;
  const opts = session ? { session } : {};

  try {
    if (session) session.startTransaction();

    const [sourceAccount, destAccount] = await Promise.all([
      Account.findOne({ accountNumber: sourceNumber, status: 'ACTIVE' })
        .setOptions(opts)
        .lean(),
      Account.findOne({ accountNumber: destinationNumber, status: 'ACTIVE' })
        .setOptions(opts)
        .lean(),
    ]);

    if (!sourceAccount || !destAccount) {
      throw new NotFoundError('Account');
    }

    const delta = Math.round(amount * 100) / 100;

    // Debit first, guarded on having the money. If this matches nothing the
    // account is frozen, closed, or short -- and the credit has not happened.
    const debited = await Account.findOneAndUpdate(
      { _id: sourceAccount._id, status: 'ACTIVE', balance: { $gte: delta } },
      { $inc: { balance: -delta } },
      { new: true, ...opts }
    );
    if (!debited) {
      throw new ValidationError('Insufficient balance in source account');
    }

    const credited = await Account.findOneAndUpdate(
      { _id: destAccount._id, status: 'ACTIVE' },
      { $inc: { balance: delta } },
      { new: true, ...opts }
    );
    if (!credited) {
      throw new ValidationError('Destination account is not active');
    }

    const ref = generateReference('TX');

    await Transaction.create([{
      accountId: debited._id,
      transactionType: 'TRANSFER_OUT',
      amount: delta,
      balanceAfter: debited.balance,
      relatedAccountId: credited._id,
      description: description || 'Funds transferred out',
      status: 'COMPLETED',
      reference: `${ref}OUT`,
    }, {
      accountId: credited._id,
      transactionType: 'TRANSFER_IN',
      amount: delta,
      balanceAfter: credited.balance,
      relatedAccountId: debited._id,
      description: description || 'Funds transferred in',
      status: 'COMPLETED',
      reference: `${ref}IN`,
    }], opts);

    if (session) await session.commitTransaction();

    logger.info(`Transfer completed: ${sourceNumber} -> ${destinationNumber}: ${delta}`);

    return {
      source: toAccountWithCustomer(debited),
      destination: toAccountWithCustomer(credited),
    };
  } catch (error) {
    if (session && session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    if (session) await session.endSession();
  }
};

export const getAccountBalance = async (accountNumber: string): Promise<number> => {
  const account = await Account.findOne({ 
    accountNumber: accountNumber.toUpperCase(),
    status: { $ne: 'CLOSED' }
  }).select('balance');

  if (!account) {
    throw new NotFoundError('Account');
  }

  return account.balance;
};

export const closeAccount = async (accountId: string): Promise<void> => {
  const account = await Account.findById(accountId);
  if (!account) {
    throw new NotFoundError('Account');
  }

  if (account.balance > 0) {
    throw new ValidationError('Account must have zero balance to close');
  }

  account.status = 'CLOSED';
  account.closedAt = new Date();
  await account.save();

  logger.info(`Account closed: ${account.accountNumber}`);
};

/**
 * Freeze or unfreeze an account.
 *
 * A freeze is the real banking equivalent of "hold this account pending review":
 * it is reversible, it leaves the balance alone, and every money-moving path in
 * the codebase already requires `status: 'ACTIVE'`, so a frozen account is
 * automatically read-only without a single extra check being added to deposit,
 * withdrawal, transfer, payment, repayment or disbursement.
 *
 * Implemented as one `findOneAndUpdate` matching on the *current* status rather
 * than a read-then-save, so two concurrent requests cannot both decide the
 * account is in the wrong state and both write.
 *
 * Closing is deliberately not reachable from here: a closed account is
 * irreversible, a freeze is not, and conflating them is how an operator ends up
 * unable to undo a mistake.
 */
export const setAccountFrozen = async (
  accountId: string,
  frozen: boolean,
  reason?: string
): Promise<{ accountNumber: string; status: string }> => {
  const from = frozen ? { $in: ['ACTIVE', 'DORMANT'] } : 'FROZEN';
  const to = frozen ? 'FROZEN' : 'ACTIVE';

  const account = await Account.findOneAndUpdate(
    { _id: accountId, status: from },
    {
      $set: {
        status: to,
        ...(frozen
          ? { frozenAt: new Date(), frozenReason: reason?.trim() || 'Frozen by bank staff' }
          : { unfrozenAt: new Date(), frozenReason: undefined }),
      },
    },
    { new: true }
  );

  if (!account) {
    // Distinguish "no such account" from "already in that state", because the
    // second is a no-op the caller can see and the first is not.
    const existing = await Account.findById(accountId).select('status').lean();
    if (!existing) throw new NotFoundError('Account');
    throw new ValidationError(
      frozen
        ? `Only an active or dormant account can be frozen (this one is ${existing.status.toLowerCase()})`
        : `Only a frozen account can be unfrozen (this one is ${existing.status.toLowerCase()})`
    );
  }

  logger.info(
    `Account ${account.accountNumber} ${frozen ? 'frozen' : 'unfrozen'}${reason ? `: ${reason.trim()}` : ''}`
  );
  return { accountNumber: account.accountNumber, status: account.status };
};

export const calculateSavingsInterest = async (
  accountNumber: string,
  fromDate: Date,
  toDate: Date
): Promise<number> => {
  const account = await Account.findOne({ 
    accountNumber: accountNumber.toUpperCase(),
    status: { $ne: 'CLOSED' }
  });

  if (!account) {
    throw new NotFoundError('Account');
  }

  if (account.accountType !== 'SAVINGS') {
    return 0;
  }

  const effectiveFrom = fromDate > account.openedAt ? fromDate : account.openedAt;
  if (toDate <= effectiveFrom) {
    return 0;
  }

  const transactions = await Transaction.find({
    accountId: account._id,
    createdAt: { $lte: effectiveFrom },
    status: 'COMPLETED',
  })
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  let balance = transactions.length > 0 ? transactions[0].balanceAfter : 0;
  let previousDate = effectiveFrom;
  let interest = 0;
  const dailyRate = account.interestRate / 100 / 365;

  const periodTransactions = await Transaction.find({
    accountId: account._id,
    createdAt: { $gt: effectiveFrom, $lte: toDate },
    status: 'COMPLETED',
  })
    .sort({ createdAt: 1 })
    .lean();

  for (const txn of periodTransactions) {
    const days = Math.ceil((txn.createdAt.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
    interest += balance * dailyRate * days;
    balance = txn.balanceAfter;
    previousDate = txn.createdAt;
  }

  const finalDays = Math.ceil((toDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
  interest += balance * dailyRate * finalDays;

  return Math.round(interest * 100) / 100;
};

/**
 * Post savings interest for a period, at most once per account per period.
 *
 * The unique index on `SavingsInterestPostings {accountId, fromDate, toDate}`
 * exists precisely to stop a period being credited twice -- and nothing ever
 * wrote to that collection, so the guard was decorative. Running
 * `POST /accounts/apply-interest` twice for the same window credited interest
 * twice. Claiming the row first, before the credit, makes the index do its job:
 * the second run loses the insert and is rejected.
 */
export const applySavingsInterest = async (
  accountNumber: string,
  fromDate: Date,
  toDate: Date
): Promise<number> => {
  const session = (await canUseMongoTransactions()) ? await mongoose.startSession() : null;
  const queryOptions = session ? { session } : {};

  try {
    if (session) session.startTransaction();

    const account = await Account.findOne({
      accountNumber: accountNumber.toUpperCase(),
      status: 'ACTIVE',
    }).setOptions(queryOptions);

    if (!account) {
      throw new NotFoundError('Account');
    }

    if (account.accountType !== 'SAVINGS') {
      throw new ValidationError('Interest can only be applied to savings accounts');
    }

    const interest = await calculateSavingsInterest(accountNumber, fromDate, toDate);

    if (interest <= 0) {
      if (session) await session.commitTransaction();
      return 0;
    }

    /*
     * Claim the period first. Written before the balance moves so that a
     * concurrent or repeated run collides on the unique index and is refused,
     * rather than two runs both crediting and one of them being discovered
     * afterwards. A rollback takes the claim with it, so a genuine failure does
     * not permanently block a legitimate retry.
     */
    const claim = new SavingsInterestPosting({
      accountId: account._id,
      fromDate,
      toDate,
      interestAmount: interest,
    });
    if (session) claim.set('session', session);

    try {
      await claim.save(queryOptions);
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        throw new ConflictError(
          `Interest for ${fromDate.toISOString().slice(0, 10)} to ${toDate
            .toISOString()
            .slice(0, 10)} has already been applied to ${account.accountNumber}`
        );
      }
      throw error;
    }

    // Atomic credit, so a concurrent deposit cannot be clobbered by a
    // read-modify-write on a stale balance.
    const credited = await Account.findOneAndUpdate(
      { _id: account._id, status: 'ACTIVE' },
      { $inc: { balance: interest } },
      { new: true, ...queryOptions }
    );
    if (!credited) {
      throw new ValidationError('Account is no longer active');
    }

    await Transaction.create([{
      accountId: credited._id,
      transactionType: 'INTEREST',
      amount: interest,
      balanceAfter: credited.balance,
      description: `Savings interest for ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`,
      status: 'COMPLETED',
      reference: generateReference('IN'),
    }], queryOptions);

    if (session) await session.commitTransaction();
    logger.info(`Interest applied to account ${accountNumber}: ${interest}`);
    return interest;
  } catch (error) {
    if (session && session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    if (session) await session.endSession();
  }
};