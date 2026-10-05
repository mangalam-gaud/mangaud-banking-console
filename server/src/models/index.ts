import mongoose, { Document, Schema, Types } from 'mongoose';
import { ISavingsInterestPostingFields, IRefreshTokenFields } from '@shared/types';

export interface ISavingsInterestPostingDocument extends ISavingsInterestPostingFields, Document {}

const savingsInterestPostingSchema = new Schema<ISavingsInterestPostingDocument>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    fromDate: {
      type: Date,
      required: true,
    },
    toDate: {
      type: Date,
      required: true,
    },
    interestAmount: {
      type: Number,
      required: true,
      min: [0.01, 'Interest amount must be positive'],
      get: (v: number) => Math.round(v * 100) / 100,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    postedAt: {
      type: Date,
      default: Date.now,
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

savingsInterestPostingSchema.index({ accountId: 1, fromDate: 1, toDate: 1 }, { unique: true });
savingsInterestPostingSchema.index({ postedAt: -1 });

export const SavingsInterestPosting = mongoose.model<ISavingsInterestPostingDocument>(
  'SavingsInterestPosting',
  savingsInterestPostingSchema
);


export interface IRefreshTokenDocument extends IRefreshTokenFields, Document {}

const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// `userId` and `token` already carry `index: true` / `unique: true` on their
// fields, so re-declaring them here only produces a duplicate-index warning.
refreshTokenSchema.index({ userId: 1, expiresAt: -1 });

export const RefreshToken = mongoose.model<IRefreshTokenDocument>('RefreshToken', refreshTokenSchema);


// ---------------------------------------------------------------------------
// Password reset tokens
// ---------------------------------------------------------------------------

export interface IPasswordResetTokenDocument extends Document {
  userId: Types.ObjectId;
  jti: string;
  expiresAt: Date;
  createdAt?: Date;
}

/**
 * Server-side record of an issued password-reset token.
 *
 * The token itself is a JWT, which is verifiable but not revocable. Without a
 * row, a leaked token stayed replayable until it expired. Consuming the row in
 * `verifyResetToken` makes it genuinely single-use, and the TTL index clears
 * rows for tokens that are never redeemed.
 */
const passwordResetTokenSchema = new Schema<IPasswordResetTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Matches the `jti` claim inside the JWT. Unique so a mint can never
    // collide, and so lookup is a single indexed read.
    jti: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true }
);

export const PasswordResetToken = mongoose.model<IPasswordResetTokenDocument>(
  'PasswordResetToken',
  passwordResetTokenSchema
);