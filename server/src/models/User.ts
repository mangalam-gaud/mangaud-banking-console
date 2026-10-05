import mongoose, { Document, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import config from '../config';
import { IUserFields } from '@shared/types';
import { normalisePhone, isValidPhone, phoneMessage } from '../utils/validation';

export interface IUserDocument extends IUserFields, Document {}

const userSchema = new Schema<IUserDocument>(
  {
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
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      // Must stay in sync with `ROLES` in `config/permissions.ts`, which is the
      // source of truth for what each role is allowed to do.
      type: String,
      enum: ['customer', 'teller', 'loan_officer', 'manager', 'auditor', 'admin'],
      default: 'customer',
      index: true,
    },
    /**
     * Branch this member of staff belongs to. A teller or manager should only
     * see customers of their own branch; 'HO' is head office and sees all.
     */
    branchCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'HO',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// `email` is already indexed by its `unique: true`; re-declaring it makes
// Mongoose warn about a duplicate index on every startup.
userSchema.index({ phone: 1 });

userSchema.virtual('fullName').get(function (this: IUserDocument) {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, config.bcryptRounds);
  next();
});

userSchema.methods.comparePassword = async function (this: IUserDocument, candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUserDocument>('User', userSchema);
export default User;