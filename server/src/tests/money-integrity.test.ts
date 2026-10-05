import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Account } from '../models/Account';
import { Customer } from '../models/Customer';
import { Beneficiary } from '../models/Beneficiary';
import { Loan } from '../models/Loan';
import { FixedDeposit } from '../models/FixedDeposit';
import { Transaction } from '../models/Transaction';
import {
  payBeneficiary,
  reversePayment,
} from '../services/paymentService';
import { disburseLoan, repayLoan } from '../services/loanService';
import { openDeposit, closeDepositEarly, matureDeposit } from '../services/depositService';
import { getTodayTransferTotal } from '../services/beneficiaryService';

/*
 * Money-integrity regression suite.
 *
 * Every test here exists because the code it covers was wrong and the wrongness
 * was silent. They share one theme: a check performed by *reading* a document and
 * then *writing* it back is not a check. Under concurrency, two callers both read
 * the same value, both pass, and both write -- which for money means a payment
 * reversed twice, a loan disbursed twice, a deposit paid out twice, or a
 * repayment that mints money when its amount is negative.
 *
 * Why this file is separate from `unit.test.ts`: those tests are pure logic and
 * run with nothing else up (`npm test` is the first thing you run after a clone).
 * A concurrency test cannot prove anything without a real database, because the
 * whole point is what two writes do to the same document. So this suite connects
 * to Mongo, builds its own customer/accounts, asserts, and deletes everything it
 * made.
 *
 * It is opt-in via `RUN_MONEY_TESTS=1` in `server/.env` (so the flag works the
 * same on Windows as anywhere else, where `FOO=1 npm test` is not portable):
 *
 *     npm run test:money
 *
 * With the flag absent every test here is skipped, so plain `npm test` stays
 * fast and database-free. Run it against a dev database, never production: it
 * writes and hard-deletes real rows, because these are fixtures rather than
 * customer records.
 */

dotenv.config({ path: '.env' });
const ENABLED = process.env.RUN_MONEY_TESTS === '1';

/*
 * Connect at module scope, before `describe` decides whether to run.
 *
 * A suite-level `beforeAll` has no access to the test context in Vitest, so
 * `skip()` is not available there -- the skip decision has to be made while the
 * file is being collected, which top-level await allows.
 *
 * Failing softly matters for a reason beyond politeness: `start.bat --verify`
 * runs the tests *before* its own MongoDB check, so a hard failure here would
 * tell the user their tests are broken when the real fault is a stopped
 * service. Skipping with the reason printed keeps the fault where it belongs.
 */
const MONGO_URI = (process.env.MONGODB_URI_TEST ?? process.env.MONGODB_URI) as string;
let dbReady = false;
if (ENABLED) {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 4000 });
    dbReady = true;
  } catch (error) {
    console.warn(
      `[money-integrity] skipped: cannot reach ${MONGO_URI} (${
        error instanceof Error ? error.message : String(error)
      })`
    );
  }
}

const describeMoney = ENABLED && dbReady ? describe : describe.skip;

const suffix = () => Math.random().toString(36).slice(2, 10);
let customerId: string;
let userId: string;
let accountId: string;
let beneficiaryId: string;
let userDocId: string;

/** Create a funded account for the fixture customer. */
const makeAccount = async (balance: number, accountType: 'SAVINGS' | 'CURRENT' = 'SAVINGS') =>
  Account.create({
    customerId,
    accountNumber: `T${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    accountType,
    balance,
    interestRate: 4,
    status: 'ACTIVE',
    currency: 'INR',
  });

const balanceOf = async (id: string) => (await Account.findById(id).select('balance').lean())!.balance;

beforeAll(async () => {
  if (!dbReady) return;

  // Customer.userId is required and unique, so the fixture needs a real User.
  const { User } = await import('../models/User');
  const user = await User.create({
    email: `mi-${suffix()}@test.local`,
    password: 'MoneyIntegrity@123',
    firstName: 'Money',
    lastName: 'Integrity',
    phone: '+919000000000',
    role: 'customer',
  });
  userDocId = String(user._id);

  const customer = await Customer.create({
    userId: userDocId,
    firstName: 'Money',
    lastName: 'Integrity',
    email: `mi-${suffix()}@test.local`,
    phone: '+919000000000',
    address: '1 Test Street',
    kycStatus: 'verified',
  });
  customerId = String(customer._id);
  userId = String(user._id);

  const account = await makeAccount(100_000);
  accountId = String(account._id);

  const beneficiary = await Beneficiary.create({
    customerId,
    userId,
    name: 'Race Payee',
    accountNumber: '9988776655',
    ifsc: 'HDFC0001234',
    bankName: 'HDFC Bank',
    accountHolderName: 'Race Payee',
    dailyLimit: 100_000,
    transferredTotal: 0,
    transferCount: 0,
    status: 'ACTIVE',
  });
  beneficiaryId = String(beneficiary._id);
}, 30_000);

afterAll(async () => {
  if (!dbReady) return;
  await Transaction.deleteMany({ accountId: { $in: (await Account.find({ customerId }).select('_id')).map(a => a._id) } });
  await Loan.deleteMany({ accountId: (await Account.find({ customerId }).select('_id')).map(a => a._id) });
  await FixedDeposit.deleteMany({ customerId });
  await Beneficiary.deleteMany({ customerId });
  await Account.deleteMany({ customerId });
  await Customer.deleteMany({ _id: customerId });
  await (await import('../models/User')).User.deleteMany({ _id: userDocId });
  await mongoose.disconnect();
}, 30_000);

describeMoney('payment reversal', () => {
  it('credits the account exactly once under concurrent reversals', async () => {
    const account = await makeAccount(10_000);
    const before = account.balance;

    const payment = await payBeneficiary(customerId, userId, {
      sourceAccountId: String(account._id),
      beneficiaryId,
      amount: 2_000,
      note: 'reversal race',
    });

    const afterPay = await balanceOf(String(account._id));
    expect(afterPay).toBe(before - 2_000);

    // Four simultaneous reversals of one payment. The status flip is what makes
    // exactly one of them win: the others match no COMPLETED row.
    const txnId = String((await Transaction.findOne({ reference: payment.reference }))!._id);
    const results = await Promise.allSettled(
      [1, 2, 3, 4].map(() => reversePayment(customerId, userId, txnId, 'race'))
    );
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(3);

    // One reversal refunds exactly what was taken out.
    expect(await balanceOf(String(account._id))).toBe(before);
  }, 30_000);

  it('refuses a second, serial reversal of the same payment', async () => {
    const account = await makeAccount(10_000);
    const payment = await payBeneficiary(customerId, userId, {
      sourceAccountId: String(account._id),
      beneficiaryId,
      amount: 500,
    });
    const txn = await Transaction.findOne({ reference: payment.reference });

    await reversePayment(customerId, userId, String(txn!._id), 'first');
    await expect(reversePayment(customerId, userId, String(txn!._id), 'second')).rejects.toThrow();
    expect(await balanceOf(String(account._id))).toBe(10_000);
  }, 30_000);
});

describeMoney('payment daily cap', () => {
  it("actually counts today's payments for the payee", async () => {
    // This is the regression that mattered most: the aggregation matched the
    // ObjectId ref against a bare string, so the sum was always 0 and the cap
    // was never enforced. If this returns 0 for a payment that demonstrably
    // happened, the cast is broken again.
    const account = await makeAccount(50_000);
    const payee = await Beneficiary.create({
      customerId, userId, name: 'Cap Probe', accountNumber: '9111222233',
      ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountHolderName: 'Cap Probe',
      dailyLimit: 100_000, transferredTotal: 0, transferCount: 0, status: 'ACTIVE',
    });

    await payBeneficiary(customerId, userId, {
      sourceAccountId: String(account._id),
      beneficiaryId: String(payee._id),
      amount: 3_000,
    });

    const spent = await getTodayTransferTotal(String(payee._id));
    expect(spent).toBe(3_000);
  }, 30_000);

  it("refuses a payment that crosses the payee's daily limit", async () => {
    const account = await makeAccount(50_000);
    const payee = await Beneficiary.create({
      customerId, userId, name: 'Small Cap', accountNumber: '9444555666',
      ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountHolderName: 'Small Cap',
      dailyLimit: 1_000, transferredTotal: 0, transferCount: 0, status: 'ACTIVE',
    });

    await expect(
      payBeneficiary(customerId, userId, {
        sourceAccountId: String(account._id),
        beneficiaryId: String(payee._id),
        amount: 5_000,
      })
    ).rejects.toThrow(/daily limit/i);
  }, 30_000);
});

describeMoney('loan disbursement', () => {
  it('credits the account once under concurrent disbursements', async () => {
    const account = await makeAccount(0);
    const loan = await Loan.create({
      accountId: account._id,
      principalAmount: 50_000,
      interestRate: 10,
      termMonths: 12,
      outstandingAmount: 50_000,
      status: 'APPROVED',
      appliedAt: new Date(),
    });

    const results = await Promise.allSettled([1, 2, 3, 4].map(() => disburseLoan(String(loan._id))));
    const ok = results.filter(r => r.status === 'fulfilled');

    expect(ok.length).toBe(1);
    // The whole principal once, not four times.
    expect(await balanceOf(String(account._id))).toBe(50_000);
    expect((await Loan.findById(loan._id).lean())!.status).toBe('DISBURSED');
  }, 30_000);
});

describeMoney('loan repayment', () => {
  it('refuses a negative repayment instead of crediting the account', async () => {
    const account = await makeAccount(20_000);
    const loan = await Loan.create({
      accountId: account._id,
      principalAmount: 10_000,
      interestRate: 12,
      termMonths: 12,
      outstandingAmount: 10_000,
      status: 'DISBURSED',
      appliedAt: new Date(),
      disbursedAt: new Date(),
    });

    await expect(repayLoan(String(loan._id), -500)).rejects.toThrow();
    expect(await balanceOf(String(account._id))).toBe(20_000);
    expect((await Loan.findById(loan._id).lean())!.outstandingAmount).toBe(10_000);
  }, 30_000);

  it('never overdraws the account under concurrent repayments', async () => {
    const account = await makeAccount(1_000);
    const loan = await Loan.create({
      accountId: account._id,
      principalAmount: 10_000,
      interestRate: 12,
      termMonths: 12,
      outstandingAmount: 10_000,
      status: 'DISBURSED',
      appliedAt: new Date(),
      disbursedAt: new Date(),
    });

    // Eight repayments of 500 against a balance that covers exactly two.
    await Promise.allSettled([1, 2, 3, 4, 5, 6, 7, 8].map(() => repayLoan(String(loan._id), 500)));

    const balance = await balanceOf(String(account._id));
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(balance).toBe(0);
  }, 30_000);
});

describeMoney('fixed deposits', () => {
  it('pays out once under concurrent early closures', async () => {
    const account = await makeAccount(60_000);
    const deposit = await openDeposit(customerId, userId, {
      sourceAccountId: String(account._id),
      principal: 10_000,
      termMonths: 12,
    });
    const afterOpen = await balanceOf(String(account._id));
    expect(afterOpen).toBe(50_000);

    const results = await Promise.allSettled(
      [1, 2, 3, 4].map(() => closeDepositEarly(deposit.id, customerId, 'race'))
    );
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1);

    // Paid once: principal plus penalty-rate interest, not four times.
    const afterClose = await balanceOf(String(account._id));
    expect(afterClose).toBeLessThan(50_000 + 40_000);
    expect(afterClose).toBeGreaterThan(50_000);
  }, 30_000);

  it('pays out once when maturity and early close race each other', async () => {
    const account = await makeAccount(60_000);
    const deposit = await openDeposit(customerId, userId, {
      sourceAccountId: String(account._id),
      principal: 10_000,
      termMonths: 12,
    });

    // Backdate maturity so the sweep is allowed to pay it.
    await FixedDeposit.updateOne({ _id: deposit.id }, { $set: { maturesAt: new Date(Date.now() - 1000) } });

    const results = await Promise.allSettled([
      matureDeposit(deposit.id),
      closeDepositEarly(deposit.id, customerId, 'racing the sweep'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1);
  }, 30_000);
});