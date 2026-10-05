import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A generated, immutable account statement.
 *
 * Rows are snapshotted at generation time rather than re-read from
 * `transactions` on download. Money records must not be able to change
 * underneath a document a customer has already been given.
 */
export interface IStatementDocument extends Document {
  statementNumber: string;
  accountId: Types.ObjectId;
  accountNumber: string;
  customerId: Types.ObjectId;
  userId: Types.ObjectId;
  fromDate: Date;
  toDate: Date;
  periodLabel: string;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
  rows: Array<{
    date: Date;
    reference: string;
    description: string;
    type: string;
    debit: number;
    credit: number;
    balance: number;
  }>;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const statementRowSchema = new Schema(
  {
    date: { type: Date, required: true },
    reference: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    balance: { type: Number, required: true },
  },
  { _id: false }
);

const statementSchema = new Schema<IStatementDocument>(
  {
    statementNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    accountNumber: { type: String, required: true, trim: true, index: true },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    periodLabel: { type: String, required: true, trim: true },
    openingBalance: { type: Number, required: true },
    closingBalance: { type: Number, required: true },
    totalCredits: { type: Number, default: 0, min: 0 },
    totalDebits: { type: Number, default: 0, min: 0 },
    transactionCount: { type: Number, default: 0, min: 0 },
    rows: { type: [statementRowSchema], default: [] },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

statementSchema.index({ customerId: 1, generatedAt: -1 });
statementSchema.index({ accountId: 1, fromDate: -1, toDate: -1 });

export const Statement = mongoose.model<IStatementDocument>('Statement', statementSchema);

export default Statement;
