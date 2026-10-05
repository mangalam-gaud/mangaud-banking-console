import mongoose, { Document, Schema, Types } from 'mongoose';
import { IAccountFields } from '@shared/types';

export interface IAccountDocument extends IAccountFields, Document {}

const accountSchema = new Schema<IAccountDocument>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    /**
     * Denormalised from the owning customer when the account is opened.
     *
     * Branch scoping is the reason: `visibleAccountIds` runs on every ledger and
     * statement read, and joining through Customer to learn the branch on each of
     * those would put a second query on the hot path. The customer stays the
     * source of truth; this copy exists to be indexed and filtered.
     *
     * Backfilled by the seed and `migrate`, and defaulted here so an account
     * created before this field existed is head-office rather than unscoped.
     */
    branchCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: 'HO',
      index: true,
    },
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    accountType: {
      type: String,
      enum: ['SAVINGS', 'CURRENT', 'SALARY'],
      required: [true, 'Account type is required'],
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Balance cannot be negative'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    interestRate: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Interest rate cannot be negative'],
      max: [100, 'Interest rate cannot exceed 100%'],
    },
    status: {
      type: String,
      // FROZEN was added so an account can be held without closing it, the way
      // a real bank suspends an account pending review. All money-moving code
      // already checks for exactly 'ACTIVE', so a frozen account is
      // automatically read-only.
      enum: ['ACTIVE', 'FROZEN', 'BLOCKED', 'CLOSED', 'DORMANT'],
      default: 'ACTIVE',
      index: true,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    openedAt: {
      type: Date,
      default: Date.now,
    },
    closedAt: {
      type: Date,
    },
    /*
      Freeze bookkeeping.

      A freeze is a hold, not a closure: reversible, balance untouched, and every
      money-moving path already refuses anything not `ACTIVE`. Recording *when*
      and *why* is what makes it auditable — "the account is frozen" is an
      answer a customer can be given, "it was frozen on the 12th because a
      mandate was pending" is the one a regulator would ask for.
    */
    frozenAt: {
      type: Date,
    },
    unfrozenAt: {
      type: Date,
    },
    frozenReason: {
      type: String,
      trim: true,
      maxlength: [200, 'Freeze reason cannot exceed 200 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      getters: true,
    },
    toObject: {
      virtuals: true,
      getters: true,
    },
  }
);

// `accountNumber` is already indexed by its `unique: true`.
accountSchema.index({ customerId: 1, status: 1 });
accountSchema.index({ accountType: 1 });

accountSchema.virtual('formattedBalance').get(function (this: IAccountDocument) {
  // Falls back to INR when the code is missing, which happens whenever the
  // document was partially populated -- `populate('...', 'accountNumber
  // accountType')` yields a sub-document with no `currency`, and Mongoose runs
  // every virtual on it during `toObject`. Without the fallback that turned a
  // display-only field into a 500 on whatever request happened to populate it.
  // INR is the only currency this bank operates in, so the fallback is exact
  // rather than a guess.
  const currency = this.currency || 'INR';
  return this.balance.toLocaleString('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
});

accountSchema.pre('validate', function (this: IAccountDocument, next) {
  if (this.accountType === 'SAVINGS' && this.interestRate === 0) {
    this.interestRate = 4;
  } else if (this.accountType === 'SALARY' && this.interestRate === 0) {
    this.interestRate = 3;
  } else if (this.accountType === 'CURRENT' && this.interestRate === 0) {
    this.interestRate = 0;
  }
  next();
});

export const Account = mongoose.model<IAccountDocument>('Account', accountSchema);
export default Account;