import mongoose, { Document, Schema, Types } from 'mongoose';
import { ILoanFields, ILoanPaymentFields } from '@shared/types';

export interface ILoanDocument extends ILoanFields, Document {}

const loanSchema = new Schema<ILoanDocument>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    principalAmount: {
      type: Number,
      required: [true, 'Principal amount is required'],
      min: [0.01, 'Principal amount must be positive'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    interestRate: {
      type: Number,
      required: [true, 'Interest rate is required'],
      min: [0, 'Interest rate cannot be negative'],
      max: [100, 'Interest rate cannot exceed 100%'],
    },
    termMonths: {
      type: Number,
      required: [true, 'Term in months is required'],
      min: [1, 'Term must be at least 1 month'],
      max: [360, 'Term cannot exceed 360 months'],
    },
    outstandingAmount: {
      type: Number,
      required: true,
      min: [0, 'Outstanding amount cannot be negative'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    status: {
      type: String,
      enum: ['APPLIED', 'APPROVED', 'DISBURSED', 'CLOSED', 'REJECTED'],
      default: 'APPLIED',
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: {
      type: Date,
    },
    disbursedAt: {
      type: Date,
    },
    lastPaymentAt: {
      type: Date,
    },
    emiAmount: {
      type: Number,
      min: [0, 'EMI amount cannot be negative'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    nextDueDate: {
      type: Date,
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

loanSchema.index({ accountId: 1, status: 1 });
loanSchema.index({ status: 1 });
loanSchema.index({ nextDueDate: 1 });

loanSchema.virtual('payments', {
  ref: 'LoanPayment',
  localField: '_id',
  foreignField: 'loanId',
});

loanSchema.virtual('totalPaid').get(function (this: ILoanDocument) {
  return this.principalAmount - this.outstandingAmount;
});

loanSchema.virtual('progressPercentage').get(function (this: ILoanDocument) {
  if (this.principalAmount === 0) return 0;
  return Math.round(((this.principalAmount - this.outstandingAmount) / this.principalAmount) * 100);
});

loanSchema.pre('save', function (this: ILoanDocument, next) {
  if (this.isNew || this.isModified('principalAmount') || this.isModified('interestRate') || this.isModified('termMonths')) {
    if (this.status === 'DISBURSED' || this.status === 'APPROVED') {
      const monthlyRate = this.interestRate / 100 / 12;
      if (monthlyRate > 0) {
        this.emiAmount = Math.round(
          (this.principalAmount * monthlyRate * Math.pow(1 + monthlyRate, this.termMonths)) /
          (Math.pow(1 + monthlyRate, this.termMonths) - 1) * 100
        ) / 100;
      } else {
        this.emiAmount = Math.round(this.principalAmount / this.termMonths * 100) / 100;
      }
    }
  }
  next();
});

export const Loan = mongoose.model<ILoanDocument>('Loan', loanSchema);


export interface ILoanPaymentDocument extends ILoanPaymentFields, Document {}

const loanPaymentSchema = new Schema<ILoanPaymentDocument>(
  {
    loanId: {
      type: Schema.Types.ObjectId,
      ref: 'Loan',
      required: true,
      index: true,
    },
    paymentAmount: {
      type: Number,
      required: true,
      min: [0.01, 'Payment amount must be positive'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    principalPortion: {
      type: Number,
      required: true,
      min: [0, 'Principal portion cannot be negative'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    interestPortion: {
      type: Number,
      required: true,
      min: [0, 'Interest portion cannot be negative'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'COMPLETED',
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
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

// `reference` is already indexed by its `unique: true`.
loanPaymentSchema.index({ loanId: 1, paymentDate: -1 });

export const LoanPayment = mongoose.model<ILoanPaymentDocument>('LoanPayment', loanPaymentSchema);