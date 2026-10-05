import mongoose from 'mongoose';
import { FixedDeposit, IFixedDepositDocument, rateForTerm, newDepositReference, PREMATURE_RATE } from '../models/FixedDeposit';
import { Account } from '../models/Account';
import { Customer } from '../models/Customer';
import { Transaction } from '../models/Transaction';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { canUseMongoTransactions } from './accountService';
import { generateReference } from '../utils/reference';
import logger from '../utils/logger';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Ceiling on a single fixed deposit: Rs 1 crore.
 *
 * The rejection message used to say "cannot exceed 1,00,00,000" (one lakh)
 * while the check was against ten million (one crore) -- the number the customer
 * was shown was a tenth of the real limit, so a deposit that was refused looked
 * arbitrary. The message is now derived from the constant so the two cannot
 * drift again.
 */
const MAX_DEPOSIT_PRINCIPAL = 10_000_000;

export interface DepositView {
  id: string;
  reference: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  maturityAmount: number;
  interestAmount: number;
  interestPayoutMode: 'MATURITY' | 'MONTHLY';
  status: string;
  openedAt: Date;
  maturesAt: Date;
  maturedAt?: Date;
  closedAt?: Date;
  daysToMaturity: number;
  isMatured: boolean;
  interestCredited?: number;
  penaltyAmount?: number;
  sourceAccount?: { accountNumber: string; accountType: string };
}

const refId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'object') return (value._id ?? value.id)?.toString() ?? '';
  return value.toString();
};

const toView = (doc: any): DepositView => {
  const account = doc.sourceAccountId && typeof doc.sourceAccountId === 'object' ? doc.sourceAccountId : null;
  return {
    id: String(doc._id),
    reference: doc.reference,
    principal: doc.principal,
    interestRate: doc.interestRate,
    termMonths: doc.termMonths,
    maturityAmount: doc.maturityAmount,
    interestAmount: doc.interestAmount,
    interestPayoutMode: doc.interestPayoutMode,
    status: doc.status,
    openedAt: doc.openedAt,
    maturesAt: doc.maturesAt,
    maturedAt: doc.maturedAt,
    closedAt: doc.closedAt,
    daysToMaturity: Math.ceil((new Date(doc.maturesAt).getTime() - Date.now()) / 86_400_000),
    isMatured: new Date(doc.maturesAt).getTime() <= Date.now() && doc.status === 'ACTIVE',
    interestCredited: doc.interestCredited,
    penaltyAmount: doc.penaltyAmount,
    sourceAccount: account
      ? { accountNumber: account.accountNumber, accountType: account.accountType }
      : undefined,
  };
};

/** Simple interest on a term deposit: P * r * t, with t in years. */
export const computeInterest = (
  principal: number,
  annualRate: number,
  termMonths: number
): number => round2((principal * (annualRate / 100) * termMonths) / 12);

/**
 * A rate quote. No money moves, so this is safe to call repeatedly while the
 * user types.
 *
 * Returns the full offer rather than just the arithmetic: the maturity date and
 * the tax note are the two things a customer actually needs before agreeing, and
 * leaving them out meant the UI's quote panel rendered blanks.
 */
export const quote = (principal: number, termMonths: number) => {
  const rate = rateForTerm(termMonths);
  const interest = computeInterest(principal, rate, termMonths);
  const maturityDate = new Date();
  maturityDate.setMonth(maturityDate.getMonth() + termMonths);

  return {
    principal: round2(principal),
    interestRate: rate,
    termMonths,
    interestAmount: round2(interest),
    maturityAmount: round2(principal + interest),
    maturityDate: maturityDate.toISOString(),
    // TDS is deducted on the interest, not the principal, and whether it
    // applies at all depends on the PAN on file. Stated plainly rather than as
    // a number: the slab rate is the customer's, not the bank's to quote.
    taxNote:
      'Interest is taxable. If your PAN is on file, TDS is deducted at your slab rate when the ' +
      'interest is credited, and you can claim it back while filing your return.',
  };
};

export const openDeposit = async (
  customerId: string,
  userId: string,
  input: { sourceAccountId: string; principal: number; termMonths: number; interestPayoutMode?: 'MATURITY' | 'MONTHLY' }
): Promise<DepositView> => {
  const principal = round2(input.principal);

  if (!Number.isFinite(principal) || principal < 1000) {
    throw new ValidationError('Minimum fixed deposit is ₹1,000');
  }
if (principal > MAX_DEPOSIT_PRINCIPAL) {
      throw new ValidationError(
        `A single fixed deposit cannot exceed Rs ${MAX_DEPOSIT_PRINCIPAL.toLocaleString('en-IN')}`
      );
  }

  const [customer, account] = await Promise.all([
    Customer.findById(customerId),
    Account.findOne({ _id: input.sourceAccountId, customerId }),
  ]);
  if (!account) throw new NotFoundError('Source account');
  if (account.status !== 'ACTIVE') {
    throw new ValidationError(`Your account is ${account.status.toLowerCase()}`);
  }
  if (account.balance < principal) {
    throw new ValidationError(
      `Insufficient balance. Available: ₹${account.balance.toLocaleString('en-IN')}`
    );
  }

  // `quote()` is the single source of the rate arithmetic, so the numbers the
  // customer was shown and the numbers written to the ledger cannot drift.
  const { interestRate, interestAmount, maturityAmount } = quote(principal, input.termMonths);
  const openedAt = new Date();
  const maturesAt = new Date(openedAt);
  maturesAt.setMonth(maturesAt.getMonth() + input.termMonths);

  const session = (await canUseMongoTransactions()) ? await mongoose.startSession() : null;
  const opts = session ? { session } : {};

  try {
    if (session) session.startTransaction();

    /*
     * Atomic debit with the sufficiency guard inside the update filter. The
     * previous version re-read the account into `locked` "to be safe", checked
     * `locked.balance`, then wrote the stale first read back with
     * `account.save()` -- the exact lost-update shape `payBeneficiary` had:
     * two concurrent deposits both passed the check and both debited. Here the
     * check and the write are one indivisible operation.
     */
    const debited = await Account.findOneAndUpdate(
      { _id: account._id, status: 'ACTIVE', balance: { $gte: principal } },
      { $inc: { balance: -principal } },
      { new: true, ...opts }
    );
    if (!debited) throw new ValidationError('Insufficient balance');

    // The principal leaving the account is a real ledger movement, so it gets a
    // transaction row. The interest is booked separately when it is credited.
    await Transaction.create(
      [
        {
          accountId: account._id,
          transactionType: 'DEPOSIT',
          amount: principal,
          balanceAfter: debited.balance,
          description: `Fixed deposit opened for ${input.termMonths} months at ${interestRate}%`,
          status: 'COMPLETED',
          reference: generateReference('FDX'),
          metadata: { kind: 'fixed_deposit_principal', termMonths: input.termMonths, rate: interestRate },
        },
      ],
      opts
    );

    const deposit = await FixedDeposit.create(
      [
        {
          reference: newDepositReference(),
          customerId: customer!._id,
          userId,
          sourceAccountId: account._id,
          principal,
          interestRate,
          termMonths: input.termMonths,
          maturityAmount,
          interestAmount,
          interestPayoutMode: input.interestPayoutMode ?? 'MATURITY',
          status: 'ACTIVE',
          openedAt,
          maturesAt,
        },
      ],
      opts
    );

    if (session) await session.commitTransaction();

    logger.info(
      `Fixed deposit ${deposit[0].reference}: ₹${principal} for ${input.termMonths}m at ${interestRate}%`
    );
    return toView(deposit[0].toObject({ virtuals: true }));
  } catch (error) {
    if (session && session.inTransaction()) await session.abortTransaction();
    throw error;
  } finally {
    if (session) await session.endSession();
  }
};

const loadOwned = async (depositId: string, customerId: string): Promise<IFixedDepositDocument> => {
  const deposit = await FixedDeposit.findById(depositId).populate('sourceAccountId', 'accountNumber accountType currency');
  if (!deposit) throw new NotFoundError('Fixed deposit');
  if (!deposit.customerId.equals(customerId)) {
    throw new NotFoundError('Fixed deposit');
  }
  return deposit;
};

export const getDepositsForCustomer = async (customerId: string): Promise<DepositView[]> => {
  const deposits = await FixedDeposit.find({ customerId })
    .populate('sourceAccountId', 'accountNumber accountType currency')
    .sort({ status: 1, maturesAt: 1 })
    .lean({ virtuals: true });
  return deposits.map(toView);
};

export const getDepositById = async (depositId: string, customerId: string): Promise<DepositView> =>
  toView((await loadOwned(depositId, customerId)).toObject({ virtuals: true }));

/**
 * Credit a deposit that has reached maturity.
 *
 * Called by the maturity sweep and by the manual "mature now" action. The
 * principal goes back to the originating account along with the interest, in
 * one TRANSFER-like credit, and the deposit is closed so it cannot be claimed
 * twice.
 */
export const matureDeposit = async (depositId: string): Promise<DepositView> => {
  /*
   * Claim the deposit atomically. The sweep runs every five minutes and the
   * manual "mature now" button hits the same path, so a `findById` read of
   * `status: 'ACTIVE'` could be seen by both -- and the customer paid the
   * maturity amount twice. Matching on the status inside the update means the
   * second caller gets null and is told the deposit already matured.
   */
  const deposit = await FixedDeposit.findOneAndUpdate(
    { _id: depositId, status: 'ACTIVE', maturesAt: { $lte: new Date() } },
    { $set: { status: 'MATURED', maturedAt: new Date() } },
    { new: true }
  );
  if (!deposit) {
    const existing = await FixedDeposit.findById(depositId).select('status maturesAt').lean();
    if (!existing) throw new NotFoundError('Fixed deposit');
    if (existing.status !== 'ACTIVE') {
      throw new ValidationError(`This deposit is already ${existing.status.toLowerCase().replace('_', ' ')}`);
    }
    throw new ValidationError('This deposit has not reached its maturity date yet');
  }

  // Atomic credit: a $inc, not a read-modify-write on a stale document, so a
  // debit landing at the same moment is not silently overwritten.
  const account = await Account.findOneAndUpdate(
    { _id: deposit.sourceAccountId },
    { $inc: { balance: deposit.maturityAmount } },
    { new: true }
  );
  if (!account) {
    // The source account vanished mid-claim -- release the deposit so the
    // sweep can try again instead of losing the payout.
    await FixedDeposit.updateOne(
      { _id: deposit._id, status: 'MATURED' },
      { $set: { status: 'ACTIVE' }, $unset: { maturedAt: '' } }
    );
    throw new NotFoundError('Source account');
  }

  const payout = deposit.maturityAmount;

  await Transaction.create({
    accountId: account._id,
    transactionType: 'INTEREST',
    amount: payout,
    balanceAfter: account.balance,
    description: `Fixed deposit ${deposit.reference} matured — principal plus interest`,
    status: 'COMPLETED',
    reference: generateReference('FDM'),
    metadata: { fixedDeposit: deposit.reference, principal: deposit.principal, interest: deposit.interestAmount },
  });

  deposit.interestCredited = deposit.interestAmount;
  await deposit.save();

  logger.info(`Fixed deposit matured: ${deposit.reference}, ₹${payout} credited to ${account.accountNumber}`);
  return toView(deposit.toObject({ virtuals: true }));
};

/** Sweep every deposit whose maturity date has passed. */
export const processMaturities = async (): Promise<{ matured: number; failed: number }> => {
  const due = await FixedDeposit.find({ status: 'ACTIVE', maturesAt: { $lte: new Date() } })
    .select('_id')
    .lean();

  let matured = 0;
  let failed = 0;

  for (const doc of due) {
    try {
      await matureDeposit(String(doc._id));
      matured++;
    } catch (error) {
      failed++;
      logger.error('Fixed deposit maturity failed:', {
        id: String(doc._id),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (matured > 0) logger.info(`Maturity sweep: ${matured} matured, ${failed} failed`);
  return { matured, failed };
};

/**
 * Close a deposit before maturity.
 *
 * The customer keeps the principal but is paid the *bank rate* rather than
 * the term rate they were offered, and the penalty is the difference. This is
 * standard retail behaviour and is why a long-term deposit is not free to break.
 */
export const closeDepositEarly = async (
  depositId: string,
  customerId: string,
  reason?: string
): Promise<DepositView> => {
  const deposit = await loadOwned(depositId, customerId);
  if (deposit.status !== 'ACTIVE') {
    throw new ValidationError('Only an active deposit can be closed early');
  }
  if (deposit.maturesAt.getTime() <= Date.now()) {
    throw new ValidationError('This deposit has already matured — it will pay out on its own');
  }

  const account = await Account.findById(deposit.sourceAccountId);
  if (!account) throw new NotFoundError('Source account');

  // Interest for the period actually held, at the penalty rate.
  const daysHeld = Math.max(
    1,
    Math.ceil((Date.now() - deposit.openedAt.getTime()) / 86_400_000)
  );
  const yearsHeld = daysHeld / 365;
  const earnedInterest = round2(deposit.principal * (PREMATURE_RATE / 100) * yearsHeld);
  const payable = round2(deposit.principal + earnedInterest);
  const penalty = round2(deposit.interestAmount - earnedInterest);

  /*
   * Claim the deposit before the money moves, atomically. Without this, the
   * maturity sweep could pay the full maturity amount at the same moment the
   * customer closed early -- the deposit paid out twice.
   */
  deposit.status = 'PREMATURELY_CLOSED';
  deposit.closedAt = new Date();
  deposit.interestCredited = earnedInterest;
  deposit.penaltyRate = PREMATURE_RATE;
  deposit.penaltyAmount = penalty > 0 ? penalty : 0;
  deposit.prematureReason = reason?.trim() || 'Closed by customer';
  const claimed = await FixedDeposit.findOneAndUpdate(
    { _id: deposit._id, status: 'ACTIVE', maturesAt: { $gt: new Date() } },
    {
      $set: {
        status: 'PREMATURELY_CLOSED',
        closedAt: deposit.closedAt,
        interestCredited: earnedInterest,
        penaltyRate: PREMATURE_RATE,
        penaltyAmount: deposit.penaltyAmount,
        prematureReason: deposit.prematureReason,
      },
    },
    { new: true }
  );
  if (!claimed) {
    const current = await FixedDeposit.findById(deposit._id).select('status maturesAt').lean();
    if (current?.status === 'ACTIVE' && current.maturesAt.getTime() <= Date.now()) {
      throw new ValidationError('This deposit has already matured — it will pay out on its own');
    }
    throw new ValidationError(
      `This deposit is already ${(current?.status ?? 'closed').toLowerCase().replace('_', ' ')}`
    );
  }

  // Atomic credit: not a read-modify-write on a stale document.
  const credited = await Account.findOneAndUpdate(
    { _id: account._id },
    { $inc: { balance: payable } },
    { new: true }
  );
  if (!credited) {
    await FixedDeposit.updateOne(
      { _id: deposit._id, status: 'PREMATURELY_CLOSED' },
      { $set: { status: 'ACTIVE' }, $unset: { closedAt: '', interestCredited: '', penaltyRate: '', penaltyAmount: '', prematureReason: '' } }
    );
    throw new NotFoundError('Source account');
  }

  await Transaction.create({
    accountId: account._id,
    transactionType: 'INTEREST',
    amount: payable,
    balanceAfter: credited.balance,
    description: `Fixed deposit ${deposit.reference} closed early — principal plus ${PREMATURE_RATE}% for ${daysHeld} days`,
    status: 'COMPLETED',
    reference: generateReference('FDC'),
    metadata: { fixedDeposit: deposit.reference, penalty, daysHeld },
  });

  logger.info(`Fixed deposit ${deposit.reference} closed early with a ₹${penalty} penalty`);
  return toView(deposit.toObject({ virtuals: true }));
};

/** Aggregate figures for the dashboard. */
export const getDepositSummary = async (customerId: string) => {
  const deposits = await FixedDeposit.find({ customerId, status: 'ACTIVE' })
    .select('principal interestAmount maturityAmount maturesAt')
    .lean();

  const active = deposits.length;
  const invested = round2(deposits.reduce((sum, d) => sum + d.principal, 0));
  const expectedInterest = round2(deposits.reduce((sum, d) => sum + d.interestAmount, 0));
  const maturingSoon = deposits.filter(
    (d) => d.maturesAt.getTime() - Date.now() < 30 * 86_400_000
  ).length;

  return { active, invested, expectedInterest, maturingSoon };
};

export { refId };
export default {
  quote,
  computeInterest,
  openDeposit,
  getDepositsForCustomer,
  getDepositById,
  matureDeposit,
  processMaturities,
  closeDepositEarly,
  getDepositSummary,
};
