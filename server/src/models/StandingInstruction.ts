import mongoose, { Document, Schema, Types } from 'mongoose';
import { generateReference } from '../utils/reference';

/**
 * A standing instruction: a recurring debit that runs without the customer
 * doing anything on the due date.
 *
 * The single most-requested thing retail customers ask for after a transfer, so
 * it is modelled explicitly rather than as a loop over transactions. The
 * stored `nextRunDate` is advanced one period at a time and is the only thing
 * the sweep job reads, so a missed run does not silently skip a month.
 */
export interface IStandingInstructionDocument extends Document {
  reference: string;
  customerId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Account debited on each run. */
  sourceAccountId: Types.ObjectId;
  /**
   * Where the money goes. A payee is preferred; an internal account is the
   * alternative. Exactly one is set, and the service layer enforces it.
   */
  beneficiaryId?: Types.ObjectId;
  destinationAccountId?: Types.ObjectId;
  /** Human label, e.g. "Rent to landlord". */
  nickname: string;
  amount: number;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  /** Day of month 1-28 for monthly+, or 1-7 for weekly. */
  dayOfMonth: number;
  startDate: Date;
  endDate?: Date;
  nextRunDate: Date;
  /** Zero would run forever; null means "until cancelled". */
  remainingRuns?: number;
  runsCompleted: number;
  totalDebited: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  lastRunAt?: Date;
  lastFailureReason?: string;
  /** Consecutive failures; the sweep auto-pauses after a few. */
  failureCount: number;
  pausedAt?: Date;
  pauseReason?: string;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const standingInstructionSchema = new Schema<IStandingInstructionDocument>(
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
    beneficiaryId: { type: Schema.Types.ObjectId, ref: 'Beneficiary', index: true },
    destinationAccountId: { type: Schema.Types.ObjectId, ref: 'Account', index: true },
    nickname: { type: String, required: true, trim: true, maxlength: 60 },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Amount must be greater than zero'],
      get: (v: number) => Math.round(v * 100) / 100,
    },
    frequency: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
      required: true,
      index: true,
    },
    dayOfMonth: { type: Number, required: true, min: 1, max: 28 },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    nextRunDate: { type: Date, required: true, index: true },
    remainingRuns: { type: Number, min: 0 },
    runsCompleted: { type: Number, default: 0, min: 0 },
    totalDebited: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED'],
      default: 'ACTIVE',
      index: true,
    },
    lastRunAt: { type: Date },
    lastFailureReason: { type: String },
    failureCount: { type: Number, default: 0, min: 0 },
    pausedAt: { type: Date },
    pauseReason: { type: String },
    cancelledAt: { type: Date },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// The sweep reads due instructions oldest-first; this index is the whole query.
standingInstructionSchema.index({ status: 1, nextRunDate: 1 });
standingInstructionSchema.index({ customerId: 1, status: 1 });

/** "Monthly on the 5th", "Weekly on Tuesday". */
standingInstructionSchema.virtual('scheduleLabel').get(function (this: IStandingInstructionDocument) {
  const weekday = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
    this.dayOfMonth - 1
  ];
  switch (this.frequency) {
    case 'DAILY':
      return 'Every day';
    case 'WEEKLY':
      return `Weekly on ${weekday}`;
    case 'MONTHLY':
      return `Monthly on the ${this.dayOfMonth}${ordinal(this.dayOfMonth)}`;
    case 'QUARTERLY':
      return `Quarterly on the ${this.dayOfMonth}${ordinal(this.dayOfMonth)}`;
    case 'YEARLY':
      return `Yearly on the ${this.dayOfMonth}${ordinal(this.dayOfMonth)}`;
  }
});

const ordinal = (n: number): string => {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

export const StandingInstruction = mongoose.model<IStandingInstructionDocument>(
  'StandingInstruction',
  standingInstructionSchema
);

export const newInstructionReference = (): string => generateReference('SI');

/** Advance a date by one period, clamping to the 28th to stay valid. */
export const advance = (from: Date, frequency: string): Date => {
  const next = new Date(from.getTime());
  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  // `setMonth` overflows (31 Jan + 1 month = 3 Mar), so clamp back to the
  // 28th, which `dayOfMonth` already restricts us to.
  if (next.getDate() > 28) next.setDate(28);
  return next;
};

export default StandingInstruction;
