import mongoose from 'mongoose';
import { Account } from '../models/Account';
import { Customer } from '../models/Customer';
import { Beneficiary } from '../models/Beneficiary';
import { Transaction } from '../models/Transaction';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../middleware/errorHandler';
import { generateReference } from '../utils/reference';
import { canUseMongoTransactions } from './accountService';
import { recordBeneficiaryTransfer, getTodayTransferTotal } from './beneficiaryService';
import { notifyCredit, notifyDebit } from './notificationService';
import logger from '../utils/logger';

/** Ceiling on a single outward payment or counter credit (Rs 1 crore). */
const MAX_SINGLE_PAYMENT = 10_000_000;
const MAX_INCOMING_CREDIT = 10_000_000;

export interface PaymentResult {
  reference: string;
  amount: number;
  sourceAccount: {
    id: string;
    accountNumber: string;
    balance: number;
  };
  beneficiary: {
    id: string;
    name: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    upiId?: string;
  };
  channel: 'NEFT' | 'IMPS' | 'RTGS' | 'UPI';
  settledAt: Date;
  estimatedArrival: string;
}

/**
 * Choose a payment rail.
 *
 * These are simulated, but the thresholds match the real NEFT/IMPS/RTGS
 * cut-offs so the UI exercises meaningfully different cases.
 */
export const chooseChannel = (amount: number): PaymentResult['channel'] => {
  if (amount <= 100000) return 'IMPS';
  if (amount <= 2000000) return 'NEFT';
  return 'RTGS';
};

const arrivalText = (channel: PaymentResult['channel']): string => {
  switch (channel) {
    case 'UPI':
    case 'IMPS':
      return 'Instant (within seconds)';
    case 'NEFT':
      return 'Same working day (typically 2 hours)';
    case 'RTGS':
      return 'Same working day (must be before 3:30 PM)';
  }
};

/**
 * Send money to a saved beneficiary.
 *
 * This is a simulated outward payment: the money leaves the caller's account
 * and a TRANSFER_OUT row records it, but no external bank is involved. The
 * double-entry ledger of the original app only models transfers between
 * accounts held here.
 */
export const payBeneficiary = async (
  customerId: string,
  userId: string,
  params: {
    sourceAccountId: string;
    beneficiaryId: string;
    amount: number;
    note?: string;
  }
): Promise<PaymentResult> => {
  const amount = Math.round(params.amount * 100) / 100;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('Amount must be greater than zero');
  }
  if (amount > MAX_SINGLE_PAYMENT) {
    throw new ValidationError(
      `A single payment cannot exceed Rs ${MAX_SINGLE_PAYMENT.toLocaleString('en-IN')}`
    );
  }

  const [customer, sourceAccount, beneficiary] = await Promise.all([
    Customer.findById(customerId),
    Account.findOne({ _id: params.sourceAccountId, customerId }),
    Beneficiary.findOne({ _id: params.beneficiaryId, customerId }),
  ]);

  if (!sourceAccount) throw new NotFoundError('Source account');
  if (!beneficiary) throw new NotFoundError('Beneficiary');
  if (beneficiary.status !== 'ACTIVE') {
    throw new ValidationError('This beneficiary has been removed');
  }
  if (sourceAccount.status !== 'ACTIVE') {
    throw new ValidationError(`Your account is ${sourceAccount.status.toLowerCase()}`);
  }
  if (sourceAccount.balance < amount) {
    throw new ValidationError(
      `Insufficient balance. Available: ₹${sourceAccount.balance.toLocaleString('en-IN')}`
    );
  }

  const channel = chooseChannel(amount);
  const reference = generateReference('PAY');

  // Fast-path rejection on the per-payee daily cap, before any money moves.
  // This check alone is *not* concurrency-safe: two simultaneous payments both
  // read the same pre-payment total and both pass. The authoritative check
  // runs after the debit + ledger row, below, and undoes the payment if the
  // cap was crossed in the meantime.
  const spentToday = await getTodayTransferTotal(String(beneficiary._id));
  if (spentToday + amount > beneficiary.dailyLimit) {
    throw new ValidationError(
      `This payment exceeds the ₹${beneficiary.dailyLimit.toLocaleString('en-IN')} daily limit set for ${beneficiary.name}`
    );
  }

  const session = (await canUseMongoTransactions()) ? await mongoose.startSession() : null;
  const opts = session ? { session } : {};

  try {
    if (session) session.startTransaction();

    /*
     * Debit atomically, with the sufficiency guard in the update filter.
     *
     * The previous version loaded the account, then re-read it into `locked`
     * "so a concurrent debit can't overdraw" -- but only used `locked` for the
     * check and then wrote back to the stale `sourceAccount` document. Two
     * concurrent payments both passed the check and both debited, so the
     * account could be driven negative. Folding the guard into a single
     * findOneAndUpdate makes check and write one indivisible operation, and it
     * holds on standalone mongod where no session exists.
     */
    const debited = await Account.findOneAndUpdate(
      { _id: sourceAccount._id, status: 'ACTIVE', balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, ...opts }
    );
    if (!debited) {
      throw new ValidationError('Insufficient balance');
    }

    const openingBalance = Math.round((debited.balance + amount) * 100) / 100;

    const [paymentTxn] = await Transaction.create(
      [
        {
          accountId: debited._id,
          transactionType: 'TRANSFER_OUT',
          amount,
          balanceAfter: debited.balance,
          beneficiaryId: beneficiary._id,
          counterparty: {
            name: beneficiary.accountHolderName,
            accountNumber: beneficiary.accountNumber,
            ifsc: beneficiary.ifsc,
            bankName: beneficiary.bankName,
            upiId: beneficiary.upiId,
          },
          description: params.note?.trim()
            ? `Paid to ${beneficiary.accountHolderName} — ${params.note.trim()}`
            : `Paid to ${beneficiary.accountHolderName}`,
          status: 'COMPLETED',
          reference,
          metadata: { channel, rail: 'external', openingBalance },
        },
      ],
      opts
    );

    /*
     * Authoritative daily-cap check, now that this payment is in the ledger.
     * Aggregating COMPLETED rows counts this payment *and* any concurrent one
     * that has already committed, so the loser of a two-payment race sees the
     * real total. Inside a multi-document transaction the throw aborts and
     * nothing happened; on standalone mongod the debit is real, so it is
     * refunded and the ledger row marked FAILED before throwing.
     */
    const totalAfter = await getTodayTransferTotal(String(beneficiary._id), session);
    if (totalAfter > beneficiary.dailyLimit) {
      if (!session) {
        await Account.updateOne({ _id: debited._id }, { $inc: { balance: amount } });
        await Transaction.updateOne(
          { _id: paymentTxn._id },
          {
            $set: {
              status: 'FAILED',
              'metadata.failedReason': `Exceeded the daily limit for ${beneficiary.name}`,
            },
          }
        );
      }
      throw new ValidationError(
        `This payment exceeds the ₹${beneficiary.dailyLimit.toLocaleString('en-IN')} daily limit set for ${beneficiary.name}`
      );
    }

    if (session) await session.commitTransaction();

    sourceAccount.balance = debited.balance;
  } catch (error) {
    if (session && session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    if (session) await session.endSession();
  }

  // Side effects run only after the money has actually moved.
  await recordBeneficiaryTransfer(String(beneficiary._id), amount);
  await notifyDebit({
    userId,
    customerId,
    amount,
    accountNumber: sourceAccount.accountNumber,
    reference,
    counterparty: beneficiary.accountHolderName,
  });

  logger.info(
    `Payment ${reference}: ${sourceAccount.accountNumber} -> ${beneficiary.maskedAccountNumber} ${amount} (${channel})`
  );

  return {
    reference,
    amount,
    sourceAccount: {
      id: String(sourceAccount._id),
      accountNumber: sourceAccount.accountNumber,
      balance: sourceAccount.balance,
    },
    beneficiary: {
      id: String(beneficiary._id),
      name: beneficiary.name,
      accountNumber: beneficiary.accountNumber,
      ifsc: beneficiary.ifsc,
      bankName: beneficiary.bankName,
      upiId: beneficiary.upiId,
    },
    channel,
    settledAt: new Date(),
    estimatedArrival: arrivalText(channel),
  };
};

/**
 * Money received from an external source, recorded at the counter.
 *
 * Caller-gated rather than customer-gated: this permission is
 * `payment:receive:any`, so only staff reach this. Previously it was
 * `payment:receive:own` and customers held it, which meant any customer could
 * post an arbitrary credit to their own account with no counterparty to check it
 * against -- an unlimited money printer. The ceiling below is defence in depth,
 * not the primary control.
 */
export const recordIncoming = async (
  customerId: string,
  userId: string,
  params: { accountId: string; amount: number; from: string; reference?: string; note?: string }
): Promise<{ account: any; transaction: any }> => {
  const amount = Math.round(params.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('Amount must be greater than zero');
  }
  if (amount > MAX_INCOMING_CREDIT) {
    throw new ValidationError(
      `A single incoming credit cannot exceed Rs ${MAX_INCOMING_CREDIT.toLocaleString('en-IN')}`
    );
  }

  const account = await Account.findOne({ _id: params.accountId, customerId });
  if (!account) throw new NotFoundError('Account');
  if (account.status !== 'ACTIVE') {
    throw new ValidationError(`Account is ${account.status.toLowerCase()}`);
  }

  const reference = params.reference?.trim().toUpperCase() || generateReference('IN');

  /*
   * Atomic credit, and the single-use guard is the unique index on
   * `Transaction.reference`: a caller-supplied reference that has already been
   * recorded fails here rather than paying twice. That is what makes this the
   * one replay-safe path in the payments code -- `payBeneficiary` mints a fresh
   * random reference per call, so a retried request there does double-pay.
   */
  const credited = await Account.findOneAndUpdate(
    { _id: account._id, status: 'ACTIVE' },
    { $inc: { balance: amount } },
    { new: true }
  );
  if (!credited) throw new ValidationError('Account is not active');

  let transaction;
  try {
    transaction = await Transaction.create({
      accountId: credited._id,
      transactionType: 'DEPOSIT',
      amount,
      balanceAfter: credited.balance,
      counterparty: { name: params.from },
      description: params.note?.trim() || `Received from ${params.from}`,
      status: 'COMPLETED',
      reference,
    });
  } catch (error) {
    /*
     * The ledger row is the thing that must not be duplicated, so a duplicate
     * reference is rejected rather than silently accepted. Undo the credit
     * before rethrowing, otherwise a retry would keep adding money and only
     * ever fail on the write that reports it.
     */
    if ((error as { code?: number })?.code === 11000) {
      await Account.updateOne({ _id: credited._id }, { $inc: { balance: -amount } });
      throw new ConflictError(
        `Reference ${reference} has already been recorded; the credit was not applied twice`
      );
    }
    await Account.updateOne({ _id: credited._id }, { $inc: { balance: -amount } });
    throw error;
  }

  await notifyCredit({
    userId,
    customerId,
    amount,
    accountNumber: credited.accountNumber,
    reference,
    counterparty: params.from,
  });

  return {
    account: {
      id: String(credited._id),
      accountNumber: credited.accountNumber,
      balance: credited.balance,
    },
    transaction: {
      id: String(transaction._id),
      reference: transaction.reference,
      amount: transaction.amount,
      balanceAfter: transaction.balanceAfter,
    },
  };
};

/**
 * Reverse a completed payment. Only payments made in the last 24 hours can be
 * reversed, which mirrors how long most UPI chargebacks stay open.
 */
export const reversePayment = async (
  customerId: string,
  userId: string,
  transactionId: string,
  reason?: string
): Promise<{ transaction: any; account: any }> => {
  /*
   * Claim the payment first, atomically. Two concurrent reversals both used to
   * read `status: 'COMPLETED'` and both credited the account -- a double
   * refund. Flipping the status in the same update that matches on it means the
   * second caller matches nothing and is told the payment was already
   * reversed.
   */
  const transaction = await Transaction.findOneAndUpdate(
    { _id: transactionId, transactionType: 'TRANSFER_OUT', status: 'COMPLETED' },
    {
      $set: {
        status: 'REVERSED',
        'metadata.reversedAt': new Date().toISOString(),
        'metadata.reversalReason': reason?.trim() || 'Reversed by customer',
      },
    },
    { new: true }
  );

  if (!transaction) {
    const existing = await Transaction.findById(transactionId).select('status').lean();
    if (!existing || existing.status === 'REVERSED') {
      throw new NotFoundError('Payment');
    }
    throw new ValidationError('This payment cannot be reversed');
  }

  const account = await Account.findOne({ _id: transaction.accountId, customerId })
    .select('customerId')
    .lean();
  if (!account) {
    // Not the caller's payment -- hand the claim back so the owner can still
    // reverse it, then refuse.
    await Transaction.updateOne(
      { _id: transaction._id, status: 'REVERSED' },
      { $set: { status: 'COMPLETED' }, $unset: { 'metadata.reversedAt': '', 'metadata.reversalReason': '' } }
    );
    throw new ForbiddenError('You do not have access to this payment');
  }

  const ageMs = Date.now() - new Date(transaction.createdAt).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    await Transaction.updateOne(
      { _id: transaction._id, status: 'REVERSED' },
      { $set: { status: 'COMPLETED' }, $unset: { 'metadata.reversedAt': '', 'metadata.reversalReason': '' } }
    );
    throw new ValidationError('Only payments made in the last 24 hours can be reversed');
  }

  /*
   * A reversal *credits* the account, so there is no floor to guard against.
   * An earlier version refused when `balance < amount`, which meant a customer
   * who had spent the money since could never reverse the payment at all.
   *
   * The credit is a single $inc rather than a read-modify-write on the loaded
   * document: the old code saved a stale `account` object, so a debit that
   * landed between the load and the save was silently overwritten.
   */
  const credited = await Account.findOneAndUpdate(
    { _id: transaction.accountId, customerId },
    { $inc: { balance: transaction.amount } },
    { new: true }
  );
  if (!credited) throw new NotFoundError('Account');

  await Transaction.create({
    accountId: credited._id,
    transactionType: 'BALANCE_ADJUSTMENT',
    amount: transaction.amount,
    balanceAfter: credited.balance,
    description: `Reversal of ${transaction.reference}`,
    status: 'COMPLETED',
    reference: generateReference('REV'),
    metadata: { reversesReference: transaction.reference },
  });

  await notifyCredit({
    userId,
    customerId,
    amount: transaction.amount,
    accountNumber: credited.accountNumber,
    reference: transaction.reference,
    counterparty: 'Reversal',
  });

  return {
    transaction: { id: String(transaction._id), reference: transaction.reference, status: 'REVERSED' },
    account: { id: String(credited._id), balance: credited.balance },
  };
};

/** True when a given transaction can still be reversed by this customer. */
export const isReversible = (transaction: any): boolean => {
  if (transaction.transactionType !== 'TRANSFER_OUT') return false;
  if (transaction.status !== 'COMPLETED') return false;
  return Date.now() - new Date(transaction.createdAt).getTime() <= 24 * 60 * 60 * 1000;
};

export { AppError };
export default { payBeneficiary, recordIncoming, reversePayment, isReversible, chooseChannel };
