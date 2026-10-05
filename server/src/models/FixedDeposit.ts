import mongoose, { Document, Schema, Types } from 'mongoose';
import { generateReference } from '../utils/reference';

/**
 * A fixed (term) deposit.
 *
 * Unlike a savings account, money placed here is locked until maturity. The
 * interest is credited on the due date, not compounded into the balance, and
 * premature closure is allowed but penalised -- both are how retail term
 * deposits actually behave, and both are enforced in the service layer.
 */
export interface IFixedDepositDocument extends Document {
  reference: string;
  customerId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Which account the money is debited from and returned to. */
  sourceAccountId: Types.ObjectId;
  principal: number;
  interestRate: number;
  termMonths: number;
  /** principal + interest, rounded at creation. */
  maturityAmount: number;
  interestAmount: number;
  /** Simple interest; term deposits do not compound within a term. */
  interestPayoutMode: 'MATURITY' | 'MONTHLY';
  status: 'ACTIVE' | 'MATURED' | 'PREMATURELY_CLOSED';
  openedAt: Date;
  maturesAt: Date;
  maturedAt?: Date;
  closedAt?: Date;
  /** Interest actually credited, which differs from `interestAmount` on
   *  premature closure because the penalty shortens the term. */
  interestCredited?: number;
  /** Rate actually applied on a premature closure (bank rate, not the term
   *  rate). Kept for the statement and for audit. */
  penaltyRate?: number;
  penaltyAmount?: number;
  prematureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const fixedDepositSchema = new Schema<IFixedDepositDocument>(
  {
    reference: { type: String, required: true, unique: true, index: true, trim: true, uppercase: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    principal: {
      type: Number,
      required: true,
      min: [1000, 'Minimum fixed deposit is ₹1,000'],
      get: (v: number) => Math.round(v * 100) / 100,
    },
    interestRate: {
      type: Number,
      required: true,
      min: [0.01, 'Interest rate must be positive'],
      get: (v: number) => Math.round(v * 100) / 100,
    },
    termMonths: {
      type: Number,
      required: true,
      enum: {
        values: [3, 6, 9, 12, 18, 24, 36, 60],
        message: 'Term must be 3, 6, 9, 12, 18, 24, 36 or 60 months',
      },
    },
    maturityAmount: { type: Number, required: true, min: 0 },
    interestAmount: { type: Number, required: true, min: 0 },
    interestPayoutMode: {
      type: String,
      enum: ['MATURITY', 'MONTHLY'],
      default: 'MATURITY',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'MATURED', 'PREMATURELY_CLOSED'],
      default: 'ACTIVE',
      index: true,
    },
    openedAt: { type: Date, required: true, default: Date.now },
    maturesAt: { type: Date, required: true, index: true },
    maturedAt: { type: Date },
    closedAt: { type: Date },
    interestCredited: { type: Number, min: 0 },
    penaltyRate: { type: Number, min: 0 },
    penaltyAmount: { type: Number, min: 0 },
    prematureReason: { type: String, trim: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

fixedDepositSchema.index({ customerId: 1, status: 1, maturesAt: 1 });
// A sweep for maturity processing; also bounds the "active deposits" lookup.
fixedDepositSchema.index({ status: 1, maturesAt: 1 });

/** Whole days until maturity; negative once overdue. */
fixedDepositSchema.virtual('daysToMaturity').get(function (this: IFixedDepositDocument) {
  return Math.ceil((this.maturesAt.getTime() - Date.now()) / 86_400_000);
});

fixedDepositSchema.virtual('isMatured').get(function (this: IFixedDepositDocument) {
  return this.maturesAt.getTime() <= Date.now() && this.status === 'ACTIVE';
});

export const FixedDeposit = mongoose.model<IFixedDepositDocument>('FixedDeposit', fixedDepositSchema);

/**
 * The rate card, as a function of term.
 *
 * Longer deposits pay better, which is how every retail term-deposit product
 * is priced. Rates are percentages per annum.
 */
export const DEPOSIT_RATE_CARD: Record<number, number> = {
  3: 6.5,
  6: 6.9,
  9: 7.1,
  12: 7.4,
  18: 7.6,
  24: 7.25,
  36: 7.0,
  60: 6.8,
};

/** What a premature closure pays instead of the term rate. */
export const PREMATURE_RATE = 5.5;

export const rateForTerm = (termMonths: number): number =>
  DEPOSIT_RATE_CARD[termMonths] ?? 6.5;

export const newDepositReference = (): string => generateReference('FD');

export default FixedDeposit;
