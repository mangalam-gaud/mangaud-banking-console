import mongoose, { Document, Schema, Types } from 'mongoose';
import { ITransactionFields } from '@shared/types';

export interface ITransactionDocument extends ITransactionFields, Document {}

const transactionSchema = new Schema<ITransactionDocument>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: [
        'OPENING_DEPOSIT',
        'DEPOSIT',
        'WITHDRAWAL',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'LOAN_DISBURSEMENT',
        'LOAN_REPAYMENT',
        'INTEREST',
        'BALANCE_ADJUSTMENT',
      ],
      required: [true, 'Transaction type is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be positive'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: [0, 'Balance after cannot be negative'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    relatedAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      index: true,
    },
    /**
     * Set when the money went to a saved payee rather than another account
     * held by this bank. External transfers have no `relatedAccountId`,
     * because the destination lives outside the ledger.
     */
    beneficiaryId: {
      type: Schema.Types.ObjectId,
      ref: 'Beneficiary',
      index: true,
    },
    /** Snapshot of the counterparty, so history survives payee deletion. */
    counterparty: {
      name: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifsc: { type: String, trim: true },
      bankName: { type: String, trim: true },
      upiId: { type: String, trim: true },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [400, 'Description cannot exceed 400 characters'],
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'],
      default: 'COMPLETED',
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
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

// `reference` is already indexed by its `unique: true`; `relatedAccountId` by
// its own `index: true`.
transactionSchema.index({ accountId: 1, createdAt: -1 });
transactionSchema.index({ transactionType: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ beneficiaryId: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });

export const Transaction = mongoose.model<ITransactionDocument>('Transaction', transactionSchema);
export default Transaction;