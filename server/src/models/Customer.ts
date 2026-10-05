import mongoose, { Document, Schema, Types } from 'mongoose';
import { ICustomerFields } from '@shared/types';
import { normalisePhone, isValidPhone, phoneMessage } from '../utils/validation';

export interface ICustomerDocument extends ICustomerFields, Document {}

const customerSchema = new Schema<ICustomerDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      set: normalisePhone,
      validate: {
        validator: isValidPhone,
        message: phoneMessage,
      },
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: [250, 'Address cannot exceed 250 characters'],
    },
    dateOfBirth: {
      type: Date,
    },
    kycStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    kycDocuments: [{
      type: String,
      trim: true,
    }],
    /**
     * Branch this customer is served by.
     *
     * Added with branch scoping rather than with the `User.branchCode` it
     * originally shipped alongside, because a staff member's branch does not
     * tell you which customers they may see. `HO` is head office and is not
     * scoped.
     */
    branchCode: {
      type: String,
      required: [true, 'Branch is required'],
      trim: true,
      uppercase: true,
      default: 'HO',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// `userId` and `email` already carry `unique: true`, which creates the index.
customerSchema.index({ phone: 1 });
customerSchema.index({ kycStatus: 1 });

customerSchema.virtual('fullName').get(function (this: ICustomerDocument) {
  return `${this.firstName} ${this.lastName}`;
});

export const Customer = mongoose.model<ICustomerDocument>('Customer', customerSchema);
export default Customer;