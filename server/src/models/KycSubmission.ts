import mongoose, { Document, Schema, Types } from 'mongoose';

export type KycStatus = 'NOT_STARTED' | 'SUBMITTED' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type KycDocumentType =
  | 'AADHAAR'
  | 'PAN'
  | 'PASSPORT'
  | 'DRIVING_LICENCE'
  | 'VOTER_ID'
  | 'SELFIE'
  | 'ADDRESS_PROOF'
  | 'INCOME_PROOF';

/**
 * A KYC submission and its review.
 *
 * KYC status lives on the Customer for a fast read, but the *evidence* lives
 * here: one row per submission, so a rejected attempt and the re-review that
 * followed are both auditable. The review fields are set by a branch manager
 * and stamped with their identity -- an untraceable approval is not an
 * approval.
 */
export interface IKycSubmissionDocument extends Document {
  reference: string;
  customerId: Types.ObjectId;
  userId: Types.ObjectId;
  status: KycStatus;
  /** Document types supplied, with the masked reference number for each. */
  documents: Array<{
    type: KycDocumentType;
    number?: string;
    issuedBy?: string;
    issuedOn?: Date;
    expiresOn?: Date;
    verified: boolean;
  }>;
  /** Self-declared profile data, kept separate from the Customer record so a
   *  rejection does not leave half-applied changes. */
  declared: {
    fullName: string;
    dateOfBirth: Date;
    address: string;
    occupation: string;
    annualIncome?: number;
    sourceOfFunds: string;
    politicallyExposed: boolean;
  };
  addressProofType?: string;
  selfieVerified: boolean;
  submittedAt: Date;

  // --- review
  reviewedBy?: Types.ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
  decisionNotes?: string;
  rejectionReasons?: string[];
  riskLevel?: RiskLevel;
  /** Periodic re-verification, e.g. 2 years after approval. */
  validUntil?: Date;
  expiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const kycDocumentSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID',
        'SELFIE', 'ADDRESS_PROOF', 'INCOME_PROOF',
      ],
      required: true,
    },
    number: { type: String, trim: true, uppercase: true, maxlength: 30 },
    issuedBy: { type: String, trim: true, maxlength: 60 },
    issuedOn: { type: Date },
    expiresOn: { type: Date },
    verified: { type: Boolean, default: false },
  },
  { _id: false }
);

const kycSubmissionSchema = new Schema<IKycSubmissionDocument>(
  {
    reference: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['NOT_STARTED', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'],
      default: 'SUBMITTED',
      index: true,
    },
    documents: { type: [kycDocumentSchema], default: [] },
    declared: {
      fullName: { type: String, required: true, trim: true },
      dateOfBirth: { type: Date, required: true },
      address: { type: String, required: true, trim: true, maxlength: 250 },
      occupation: { type: String, required: true, trim: true, maxlength: 60 },
      annualIncome: { type: Number, min: 0 },
      sourceOfFunds: { type: String, required: true, trim: true, maxlength: 120 },
      politicallyExposed: { type: Boolean, default: false },
    },
    addressProofType: { type: String, trim: true },
    selfieVerified: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now, index: true },

    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String, trim: true },
    reviewedAt: { type: Date },
    decisionNotes: { type: String, trim: true, maxlength: 500 },
    rejectionReasons: { type: [String] },
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'] },
    validUntil: { type: Date },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

kycSubmissionSchema.index({ customerId: 1, createdAt: -1 });
// The review queue: pending submissions, oldest first.
kycSubmissionSchema.index({ status: 1, submittedAt: 1 });

export const KycSubmission = mongoose.model<IKycSubmissionDocument>(
  'KycSubmission',
  kycSubmissionSchema
);

export default KycSubmission;
