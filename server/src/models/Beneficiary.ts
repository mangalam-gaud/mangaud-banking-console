import mongoose, { Document, Schema, Types } from 'mongoose';

/** A saved transfer destination ("payee") owned by a customer. */
export interface IBeneficiaryDocument extends Document {
  customerId: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  accountHolderName: string;
  accountType: 'SAVINGS' | 'CURRENT' | 'SALARY';
  upiId?: string;
  mobile?: string;
  email?: string;
  nickname?: string;
  isFavourite: boolean;
  dailyLimit: number;
  transferredTotal: number;
  transferCount: number;
  lastTransferredAt?: Date;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  /** Schema virtual. */
  maskedAccountNumber: string;
}

const beneficiarySchema = new Schema<IBeneficiaryDocument>(
  {
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
    name: { type: String, required: true, trim: true },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    ifsc: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{4}0[A-Z0-9]{6}$/,
    },
    bankName: { type: String, required: true, trim: true },
    accountHolderName: { type: String, required: true, trim: true },
    accountType: {
      type: String,
      enum: ['SAVINGS', 'CURRENT', 'SALARY'],
      default: 'SAVINGS',
    },
    upiId: { type: String, trim: true, lowercase: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    nickname: { type: String, trim: true },
    isFavourite: { type: Boolean, default: false },
    dailyLimit: { type: Number, default: 100000, min: 0 },
    transferredTotal: { type: Number, default: 0, min: 0 },
    transferCount: { type: Number, default: 0, min: 0 },
    lastTransferredAt: { type: Date },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One payee per account number per customer.
beneficiarySchema.index(
  { customerId: 1, accountNumber: 1 },
  { unique: true }
);
beneficiarySchema.index({ customerId: 1, isFavourite: -1, createdAt: -1 });

beneficiarySchema.virtual('maskedAccountNumber').get(function (this: IBeneficiaryDocument) {
  return `•••• ${this.accountNumber.slice(-4)}`;
});

export const Beneficiary = mongoose.model<IBeneficiaryDocument>(
  'Beneficiary',
  beneficiarySchema
);

export default Beneficiary;
