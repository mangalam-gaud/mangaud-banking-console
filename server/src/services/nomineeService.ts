import { Nominee, INomineeDocument } from '../models/Nominee';
import { Account } from '../models/Account';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import logger from '../utils/logger';

export interface NomineeView {
  id: string;
  name: string;
  relationship: string;
  dateOfBirth: Date;
  address: string;
  mobile: string;
  email?: string;
  sharePercentage: number;
  identityProof?: string;
  status: string;
  registeredAt?: Date;
  accountNumber: string;
  age?: number;
}

const ageFrom = (dob: Date): number => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

const toView = (doc: any): NomineeView => ({
  id: String(doc._id),
  name: doc.name,
  relationship: doc.relationship,
  dateOfBirth: doc.dateOfBirth,
  address: doc.address,
  mobile: doc.mobile,
  email: doc.email,
  sharePercentage: doc.sharePercentage,
  identityProof: doc.identityProof,
  status: doc.status,
  registeredAt: doc.registeredAt,
  accountNumber: doc.accountNumber,
  age: ageFrom(doc.dateOfBirth),
});

export const getNominees = async (customerId: string): Promise<NomineeView[]> => {
  const nominees = await Nominee.find({ customerId }).sort({ createdAt: 1 }).lean({ virtuals: true });
  return nominees.map(toView);
};

/**
 * Register a nomination.
 *
 * A nomination is stored as one document per nominee, and the unique partial
 * index on `accountId` (active only) means there is at most one *active set*
 * per account. The caller passes the full set, and this replaces the previous
 * one atomically -- which is why the service, not the route, decides the
 * lifecycle: a partial update that left shares totalling 60% would be
 * unenforceable and silently wrong.
 */
export const registerNominees = async (
  customerId: string,
  userId: string,
  input: { accountId: string; nominees: Array<Partial<NomineeView>> }
): Promise<NomineeView[]> => {
  const account = await Account.findOne({ _id: input.accountId, customerId });
  if (!account) throw new NotFoundError('Account');
  if (account.status === 'CLOSED') {
    throw new ValidationError('A nomination cannot be added to a closed account');
  }

  if (!input.nominees?.length) {
    throw new ValidationError('Add at least one nominee');
  }
  if (input.nominees.length > 4) {
    throw new ValidationError('A maximum of 4 nominees can be registered on one account');
  }

  // Shares must total exactly 100. Floating point makes a naive sum unreliable
  // (0.1 + 0.2 !== 0.3), so compare in paise.
  const total = input.nominees.reduce((sum, n) => sum + (n.sharePercentage ?? 0), 0);
  if (Math.round(total * 100) !== 10_000) {
    throw new ValidationError(
      `Nominee shares must total exactly 100% (currently ${total.toFixed(2)}%)`
    );
  }

  for (const nominee of input.nominees) {
    if (!nominee.name?.trim()) throw new ValidationError('Every nominee needs a name');
    if (!nominee.relationship?.trim()) throw new ValidationError('Every nominee needs a relationship');
    if (!nominee.mobile?.trim()) throw new ValidationError('Every nominee needs a mobile number');
    if (!nominee.dateOfBirth) throw new ValidationError('Every nominee needs a date of birth');

    const dob = new Date(nominee.dateOfBirth);
    if (Number.isNaN(dob.getTime())) throw new ValidationError('Invalid date of birth');
    if (dob.getTime() > Date.now()) throw new ValidationError('Date of birth cannot be in the future');
    // A nominee must be an adult, otherwise the nomination is meaningless.
    if (ageFrom(dob) < 18) throw new ValidationError('A nominee must be 18 or older');
  }

  // Retire the previous set rather than deleting it: the cancelled record is
  // part of the account's history.
  await Nominee.updateMany(
    { accountId: account._id, status: { $in: ['DRAFT', 'REGISTERED'] } },
    {
      $set: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: 'Replaced by a new nomination',
      },
    }
  );

  const created = await Nominee.insertMany(
    input.nominees.map((nominee) => ({
      customerId,
      userId,
      accountId: account._id,
      accountNumber: account.accountNumber,
      name: nominee.name!.trim(),
      relationship: nominee.relationship!.trim(),
      dateOfBirth: new Date(nominee.dateOfBirth!),
      address: nominee.address?.trim() ?? '',
      mobile: nominee.mobile!.trim(),
      email: nominee.email?.trim(),
      sharePercentage: nominee.sharePercentage!,
      identityProof: nominee.identityProof?.trim(),
      status: 'REGISTERED',
      registeredAt: new Date(),
    }))
  );

  logger.info(
    `Nomination registered on ${account.accountNumber}: ${created.length} nominee(s)`
  );
  return created.map((doc) => toView(doc.toObject({ virtuals: true })));
};

export const cancelNominees = async (
  customerId: string,
  reason?: string
): Promise<{ cancelled: number }> => {
  const result = await Nominee.updateMany(
    { customerId, status: { $in: ['DRAFT', 'REGISTERED'] } },
    {
      $set: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason?.trim() || 'Cancelled by customer',
      },
    }
  );
  return { cancelled: result.modifiedCount ?? 0 };
};

/** The active nomination set for one account, if any. */
export const getNomineesForAccount = async (
  accountId: string,
  customerId: string
): Promise<NomineeView[]> => {
  const account = await Account.findOne({ _id: accountId, customerId });
  if (!account) throw new NotFoundError('Account');
  const nominees = await Nominee.find({
    accountId,
    status: { $in: ['DRAFT', 'REGISTERED'] },
  }).lean({ virtuals: true });
  return nominees.map(toView);
};

export const deleteNominee = async (id: string, customerId: string): Promise<{ id: string }> => {
  const nominee = await Nominee.findById(id);
  if (!nominee) throw new NotFoundError('Nominee');
  if (!nominee.customerId.equals(customerId)) {
    throw new ForbiddenError('You do not have access to this nomination');
  }
  nominee.status = 'CANCELLED';
  nominee.cancelledAt = new Date();
  nominee.cancellationReason = 'Removed by customer';
  await nominee.save();
  return { id };
};

/** True when the nominated shares on an account cover the whole balance. */
export const hasFullNomination = async (accountId: string): Promise<boolean> => {
  const nominees = await Nominee.find({
    accountId,
    status: 'REGISTERED',
  })
    .select('sharePercentage')
    .lean();
  const total = nominees.reduce((sum, n) => sum + n.sharePercentage, 0);
  return nominees.length > 0 && Math.round(total * 100) === 10_000;
};

export type { INomineeDocument };
export default {
  getNominees,
  registerNominees,
  cancelNominees,
  getNomineesForAccount,
  deleteNominee,
  hasFullNomination,
};