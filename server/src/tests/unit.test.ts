import { describe, it, expect } from 'vitest';
import { chooseChannel } from '../services/paymentService';
import { expiryToMs } from '../services/authService';
import { rateForTerm, DEPOSIT_RATE_CARD, PREMATURE_RATE } from '../models/FixedDeposit';
import { quote, computeInterest } from '../services/depositService';
import {
  transferSchema,
  depositSchema,
  standingInstructionSchema,
  nomineeSchema,
  mongoIdSchema,
} from '../validators/schemas';

/*
 * Unit tests for the pure logic that the HTTP suites cannot reach cheaply.
 *
 * Deliberately no database and no supertest: `npm test` must run with nothing
 * else up, so it can be the first thing you run after a clone. Anything that
 * needs Mongo belongs in the API smoke suite, which runs against a live server.
 *
 * The cases below are chosen because each one is a rule that was wrong at some
 * point and could plausibly be wrong again:
 *   - the rail thresholds, which decide how money is described as moving;
 *   - the `dayOfMonth <= 28` cap, where accepting 29-31 means an instruction
 *     that silently never fires in February;
 *   - the 100% nomination sum, where floating point makes `0.1 + 0.2 !== 0.3`;
 *   - the schemas on the money endpoints, where a negative amount once
 *     *subtracted* from a balance.
 */

const envelope = (bodyValue: unknown) => ({ body: bodyValue, query: {}, params: {} });

describe('payment rail selection', () => {
  it('routes small amounts through IMPS', () => {
    expect(chooseChannel(1)).toBe('IMPS');
    expect(chooseChannel(100000)).toBe('IMPS');
  });

  it('routes mid amounts through NEFT', () => {
    expect(chooseChannel(100000.01)).toBe('NEFT');
    expect(chooseChannel(2000000)).toBe('NEFT');
  });

  it('routes large amounts through RTGS', () => {
    expect(chooseChannel(2000000.01)).toBe('RTGS');
  });
});

describe('expiryToMs', () => {
  it('converts each supported unit', () => {
    expect(expiryToMs('30s')).toBe(30_000);
    expect(expiryToMs('15m')).toBe(900_000);
    expect(expiryToMs('2h')).toBe(7_200_000);
    expect(expiryToMs('7d')).toBe(604_800_000);
  });

  it('falls back to 15 minutes on anything unparseable', () => {
    expect(expiryToMs('')).toBe(900_000);
    expect(expiryToMs('soon')).toBe(900_000);
  });
});

describe('fixed deposit rate card', () => {
  it('peaks at 18 months', () => {
    const rates = Object.values(DEPOSIT_RATE_CARD);
    expect(Math.max(...rates)).toBe(DEPOSIT_RATE_CARD[18]);
  });

  it('has a rate for every published term', () => {
    for (const term of [3, 6, 9, 12, 18, 24, 36, 60]) {
      expect(rateForTerm(term)).toBeGreaterThan(PREMATURE_RATE);
    }
  });

  it('falls back for an unpublished term rather than returning undefined', () => {
    expect(Number.isFinite(rateForTerm(7))).toBe(true);
  });
});

describe('deposit interest', () => {
  it('computes simple interest over whole months', () => {
    // 100,000 at 7.4% for 12 months = 7,400
    expect(computeInterest(100000, 7.4, 12)).toBe(7400);
  });

  it('is proportional to the term', () => {
    expect(computeInterest(100000, 7.4, 6)).toBe(3700);
    expect(computeInterest(100000, 7.4, 18)).toBe(11100);
  });
});

describe('quote', () => {
  it('returns the field names the UI reads', () => {
    // The quote panel rendered blanks because the service returned
    // `rate`/`interest`/`maturityAmount` while the client read
    // `interestRate`/`interestAmount`/`maturityDate`/`taxNote`.
    const result = quote(100000, 12);
    expect(result).toHaveProperty('interestRate');
    expect(result).toHaveProperty('interestAmount');
    expect(result).toHaveProperty('maturityAmount');
    expect(result).toHaveProperty('maturityDate');
    expect(result).toHaveProperty('taxNote');
  });

  it('keeps the arithmetic self-consistent', () => {
    const result = quote(250000, 24);
    expect(result.maturityAmount).toBe(
      Math.round((250000 + result.interestAmount) * 100) / 100
    );
    expect(result.interestRate).toBe(rateForTerm(24));
  });

  it('places maturity in the future', () => {
    expect(new Date(quote(100000, 3).maturityDate).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('transferSchema', () => {
  const valid = {
    sourceAccountNumber: 'AC00000001',
    destinationAccountNumber: 'AC00000002',
    amount: 500,
  };

  it('accepts a well-formed transfer', () => {
    expect(transferSchema.safeParse({ body: valid, query: {}, params: {} }).success).toBe(true);
  });

  it('rejects a transfer to the same account', () => {
    const result = transferSchema.safeParse({
      body: { ...valid, destinationAccountNumber: 'AC00000001' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it.each([0, -1, -5000])('rejects amount %s', (amount) => {
    const result = transferSchema.safeParse({
      body: { ...valid, amount },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric amount', () => {
    // The negative-deposit bug: an unvalidated body meant `amount` could be
    // whatever the client sent, including a negative number.
    const result = transferSchema.safeParse({
      body: { ...valid, amount: '-5000' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('depositSchema', () => {
  it('rejects a negative deposit outright', () => {
    // This is the exact input that used to subtract from the balance while
    // writing a DEPOSIT ledger row for the absolute value.
    expect(
      depositSchema.safeParse(envelope({ accountNumber: 'AC00000001', amount: -5000 })).success
    ).toBe(false);
  });

  it('rejects a zero deposit', () => {
    expect(
      depositSchema.safeParse(envelope({ accountNumber: 'AC00000001', amount: 0 })).success
    ).toBe(false);
  });
});

describe('standingInstructionSchema day-of-month cap', () => {
  const base = {
    sourceAccountId: '507f1f77bcf86cd799439011',
    beneficiaryId: '507f1f77bcf86cd799439012',
    amount: 2000,
    frequency: 'MONTHLY',
    startDate: '2026-01-01T00:00:00.000Z',
  };

  it.each([1, 15, 28])('accepts day %i', (dayOfMonth) => {
    expect(
      standingInstructionSchema.safeParse(envelope({ ...base, dayOfMonth })).success
    ).toBe(true);
  });

  // 29-31 would be accepted by a naive schema and then silently never fire in
  // February, because `setMonth` on 31 January lands on 2 or 3 March.
  it.each([29, 30, 31])('rejects day %i', (dayOfMonth) => {
    expect(
      standingInstructionSchema.safeParse(envelope({ ...base, dayOfMonth })).success
    ).toBe(false);
  });
});

describe('nomineeSchema', () => {
  const nominee = (sharePercentage: number) => ({
    name: 'Asha Sharma',
    relationship: 'Spouse',
    dateOfBirth: '1988-04-12',
    mobile: '+919812345678',
    sharePercentage,
  });

  it('requires at least one nominee', () => {
    expect(
      nomineeSchema.safeParse(envelope({ accountId: '507f1f77bcf86cd799439011', nominees: [] })).success
    ).toBe(false);
  });

  it('caps the set at four', () => {
    const five = Array.from({ length: 5 }, () => nominee(20));
    expect(
      nomineeSchema.safeParse(envelope({ accountId: '507f1f77bcf86cd799439011', nominees: five })).success
    ).toBe(false);
  });

  it.each([0, 101])('rejects a share of %i%%', (sharePercentage) => {
    expect(
      nomineeSchema.safeParse(envelope({ accountId: '507f1f77bcf86cd799439011', nominees: [nominee(sharePercentage)] })).success
    ).toBe(false);
  });
});

describe('mongoIdSchema', () => {
  it('accepts a 24-character hex string', () => {
    expect(mongoIdSchema.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
  });

  // An unvalidated `customerId` reached `Customer.findById(undefined)`.
  it.each(['', 'abc', 'not-an-id', '123', '507f1f77bcf86cd79943901z'])(
    'rejects %s',
    (value) => {
      expect(mongoIdSchema.safeParse(value).success).toBe(false);
    }
  );
});