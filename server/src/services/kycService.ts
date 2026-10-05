import mongoose, { Types } from 'mongoose';
import { KycSubmission, IKycSubmissionDocument, KycStatus } from '../models/KycSubmission';
import { Customer } from '../models/Customer';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../middleware/errorHandler';
import { generateReference } from '../utils/reference';
import { notify } from './notificationService';
import logger from '../utils/logger';

export interface KycView {
  id: string;
  reference: string;
  status: KycStatus;
  documents: Array<{
    type: string;
    /** Masked: a KYC number is identity data and is never echoed in full. */
    number?: string;
    issuedBy?: string;
    issuedOn?: Date;
    expiresOn?: Date;
    verified: boolean;
  }>;
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
  reviewedAt?: Date;
  reviewedByName?: string;
  decisionNotes?: string;
  rejectionReasons?: string[];
  riskLevel?: string;
  validUntil?: Date;
  /**
   * The customer this submission belongs to. Only populated by the review
   * queue, where the reviewer needs to know whose it is; the customer's own
   * read has no use for it and skips the join.
   */
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    kycStatus?: string;
  };
}

const maskNumber = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (value.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

const toView = (doc: any): KycView => ({
  id: String(doc._id),
  reference: doc.reference,
  status: doc.status,
  documents: (doc.documents || []).map((d: any) => ({
    type: d.type,
    number: maskNumber(d.number),
    issuedBy: d.issuedBy,
    issuedOn: d.issuedOn,
    expiresOn: d.expiresOn,
    verified: d.verified,
  })),
  declared: doc.declared,
  addressProofType: doc.addressProofType,
  selfieVerified: doc.selfieVerified,
  submittedAt: doc.submittedAt,
  reviewedAt: doc.reviewedAt,
  reviewedByName: doc.reviewedByName,
  decisionNotes: doc.decisionNotes,
  rejectionReasons: doc.rejectionReasons,
  riskLevel: doc.riskLevel,
  validUntil: doc.validUntil,
  // Only present when the query populated it. A reviewer cannot act on a row
  // that does not say who it is for, so the queue populates it; the customer's
  // own `/kyc` read does not need to and skips the join.
  customer:
    doc.customerId && typeof doc.customerId === 'object'
      ? {
          id: String(doc.customerId._id),
          firstName: doc.customerId.firstName,
          lastName: doc.customerId.lastName,
          email: doc.customerId.email,
          phone: doc.customerId.phone,
          kycStatus: doc.customerId.kycStatus,
        }
      : undefined,
});

/** Keep the Customer's denormalised status in step with the latest submission. */
const syncCustomerStatus = async (customerId: string, status: string) => {
  const mapped = status === 'VERIFIED' ? 'verified' : status === 'REJECTED' ? 'rejected' : 'pending';
  await Customer.updateOne({ _id: customerId }, { $set: { kycStatus: mapped } });
};

export const submitKyc = async (
  customerId: string,
  userId: string,
  input: {
    fullName: string;
    dateOfBirth: string;
    address: string;
    occupation: string;
    annualIncome?: number;
    sourceOfFunds: string;
    politicallyExposed?: boolean;
    addressProofType?: string;
    selfieVerified?: boolean;
    documents: Array<{
      type: string;
      number?: string;
      issuedBy?: string;
      issuedOn?: string;
      expiresOn?: string;
    }>;
  }
): Promise<KycView> => {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new NotFoundError('Customer profile');

  // A pending submission blocks a new one, so the reviewer is not looking at
  // two conflicting sets of documents.
  const open = await KycSubmission.findOne({
    customerId,
    status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
  });
  if (open) {
    throw new ConflictError(
      'You already have a submission awaiting review. We will contact you if anything is missing.'
    );
  }

  if (!input.fullName?.trim()) throw new ValidationError('Full name is required');
  if (!input.address?.trim()) throw new ValidationError('Address is required');
  if (!input.occupation?.trim()) throw new ValidationError('Occupation is required');
  if (!input.sourceOfFunds?.trim()) {
    throw new ValidationError('Tell us where your money comes from');
  }
  if (!Array.isArray(input.documents) || input.documents.length < 2) {
    throw new ValidationError('Attach at least two identity documents (for example Aadhaar and PAN)');
  }

  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime())) throw new ValidationError('Invalid date of birth');
  if (dob.getTime() > Date.now()) throw new ValidationError('Date of birth cannot be in the future');
  const age = (Date.now() - dob.getTime()) / (365.25 * 86_400_000);
  if (age < 18) throw new ValidationError('You must be 18 or older to hold an account');

  const submission = await KycSubmission.create({
    reference: generateReference('KYC'),
    customerId,
    userId,
    status: 'SUBMITTED',
    documents: input.documents.map((doc) => ({
      type: doc.type,
      number: doc.number?.trim().toUpperCase(),
      issuedBy: doc.issuedBy?.trim(),
      issuedOn: doc.issuedOn ? new Date(doc.issuedOn) : undefined,
      expiresOn: doc.expiresOn ? new Date(doc.expiresOn) : undefined,
      verified: false,
    })),
    declared: {
      fullName: input.fullName.trim(),
      dateOfBirth: dob,
      address: input.address.trim(),
      occupation: input.occupation.trim(),
      annualIncome: input.annualIncome,
      sourceOfFunds: input.sourceOfFunds.trim(),
      politicallyExposed: !!input.politicallyExposed,
    },
    addressProofType: input.addressProofType?.trim(),
    selfieVerified: !!input.selfieVerified,
    submittedAt: new Date(),
  });

  await syncCustomerStatus(customerId, 'SUBMITTED');

  logger.info(`KYC submitted: ${submission.reference} for customer ${customerId}`);
  return toView(submission.toObject({ virtuals: true }));
};

export const getKycHistory = async (customerId: string): Promise<KycView[]> => {
  const submissions = await KycSubmission.find({ customerId })
    .sort({ createdAt: -1 })
    .lean({ virtuals: true });
  return submissions.map(toView);
};

export const getLatestKyc = async (customerId: string): Promise<KycView | null> => {
  const submission = await KycSubmission.findOne({ customerId })
    .sort({ createdAt: -1 })
    .lean({ virtuals: true });
  return submission ? toView(submission) : null;
};

/** The staff review queue. */
export const getReviewQueue = async (options: {
  page?: number;
  limit?: number;
  status?: string;
} = {}): Promise<{ submissions: KycView[]; total: number; totalPages: number }> => {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  const query: Record<string, unknown> = {};
  if (options.status) query.status = options.status;
  else query.status = { $in: ['SUBMITTED', 'UNDER_REVIEW'] };

  const [docs, total] = await Promise.all([
    KycSubmission.find(query)
      .sort({ submittedAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      // The reviewer needs to know whose submission this is, and how to reach
      // them if a document is unreadable.
      .populate('customerId', 'firstName lastName email phone kycStatus')
      .lean({ virtuals: true }),
    KycSubmission.countDocuments(query),
  ]);

  return { submissions: docs.map(toView), total, totalPages: Math.ceil(total / limit) };
};

/**
 * How many submissions sit in each state.
 *
 * Returned alongside the queue so a reviewer can see "3 waiting" without
 * clicking through every tab to find out. One aggregate query rather than five
 * `countDocuments` calls.
 */
/*
 * Counts keyed by the *real* `KycStatus` values.
 *
 * `DRAFT` and `EXPIRED` were listed here as zero-buckets but neither is in the
 * status enum, so they were keys the client could render a tab for and that no
 * document could ever satisfy -- a tab that could only ever be empty. `NOT_STARTED`
 * is in the enum but has no row either, since a submission is never stored in
 * that state, so it is seeded here for the same reason.
 *
 * `UNDER_REVIEW` is in the enum and is seeded, but nothing ever assigns it: the
 * service only writes SUBMITTED, VERIFIED and REJECTED. The seed script creates
 * one so the queue can be seen with a row in that state. It is kept because it
 * is a legitimate enum member and the review queue filters on it, not because
 * the running app can reach it.
 */
const QUEUE_STATUSES = [
  'NOT_STARTED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
] as const;

export const getQueueCounts = async (): Promise<Record<string, number>> => {
  const rows = await KycSubmission.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const counts = Object.fromEntries(QUEUE_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const row of rows) {
    if (row._id in counts) counts[row._id] = row.count;
  }
  return counts;
};

const loadForReview = async (id: string): Promise<IKycSubmissionDocument> => {
  const submission = await KycSubmission.findById(id);
  if (!submission) throw new NotFoundError('KYC submission');
  if (['VERIFIED', 'REJECTED'].includes(submission.status)) {
    throw new ConflictError(`This submission has already been ${submission.status.toLowerCase()}`);
  }
  return submission;
};

export const approveKyc = async (
  id: string,
  reviewer: { id: string; name: string },
  input: { notes?: string; riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' }
): Promise<KycView> => {
  const submission = await loadForReview(id);

  submission.status = 'VERIFIED';
  submission.reviewedBy = new Types.ObjectId(reviewer.id);
  submission.reviewedByName = reviewer.name;
  submission.reviewedAt = new Date();
  submission.decisionNotes = input.notes?.trim();
  submission.riskLevel = input.riskLevel ?? 'LOW';
  // Standard periodic re-verification window.
  submission.validUntil = new Date();
  submission.validUntil.setFullYear(submission.validUntil.getFullYear() + 2);
  submission.documents.forEach((doc) => {
    doc.verified = true;
  });
  await submission.save();

  await syncCustomerStatus(String(submission.customerId), 'VERIFIED');

  await notify({
    userId: String(submission.userId),
    customerId: String(submission.customerId),
    category: 'account',
    title: 'KYC verified',
    body: 'Your identity check is complete. All account limits are now available.',
    link: '/kyc',
    priority: 'high',
    referenceId: `kyc-approved:${String(submission._id)}`,
  });

  logger.info(`KYC approved: ${submission.reference} by ${reviewer.name}`);
  return toView(submission.toObject({ virtuals: true }));
};

export const rejectKyc = async (
  id: string,
  reviewer: { id: string; name: string },
  input: { reasons: string[]; notes?: string }
): Promise<KycView> => {
  const submission = await loadForReview(id);

  if (!Array.isArray(input.reasons) || input.reasons.length === 0) {
    throw new ValidationError('Give at least one reason so the customer knows what to fix');
  }

  submission.status = 'REJECTED';
  submission.reviewedBy = new Types.ObjectId(reviewer.id);
  submission.reviewedByName = reviewer.name;
  submission.reviewedAt = new Date();
  submission.decisionNotes = input.notes?.trim();
  submission.rejectionReasons = input.reasons;
  submission.riskLevel = 'MEDIUM';
  await submission.save();

  await syncCustomerStatus(String(submission.customerId), 'REJECTED');

  await notify({
    userId: String(submission.userId),
    customerId: String(submission.customerId),
    category: 'account',
    title: 'KYC needs attention',
    body: input.reasons.join(' · '),
    link: '/kyc',
    priority: 'high',
    referenceId: `kyc-rejected:${String(submission._id)}`,
  });

  logger.info(`KYC rejected: ${submission.reference} by ${reviewer.name}`);
  return toView(submission.toObject({ virtuals: true }));
};

export const getKycById = async (id: string, customerId?: string): Promise<KycView> => {
  const submission = await KycSubmission.findById(id);
  if (!submission) throw new NotFoundError('KYC submission');
  // Staff may read any; a customer only their own.
  if (customerId && String(submission.customerId) !== customerId) {
    throw new ForbiddenError('You do not have access to this submission');
  }
  return toView(submission.toObject({ virtuals: true }));
};

export default {
  submitKyc,
  getKycHistory,
  getLatestKyc,
  getReviewQueue,
  approveKyc,
  rejectKyc,
  getKycById,
};
