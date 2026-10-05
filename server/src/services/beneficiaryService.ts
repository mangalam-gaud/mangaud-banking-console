import mongoose from 'mongoose';
import { Beneficiary, IBeneficiaryDocument } from '../models/Beneficiary';
import { Account } from '../models/Account';
import { Customer } from '../models/Customer';
import { Transaction } from '../models/Transaction';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import { generateReference } from '../utils/reference';
import logger from '../utils/logger';

export interface BeneficiaryView {
  _id: string;
  id: string;
  name: string;
  accountNumber: string;
  maskedAccountNumber: string;
  ifsc: string;
  bankName: string;
  accountHolderName: string;
  accountType: string;
  upiId?: string;
  mobile?: string;
  email?: string;
  nickname?: string;
  isFavourite: boolean;
  dailyLimit: number;
  transferredTotal: number;
  transferCount: number;
  lastTransferredAt?: Date;
  status: string;
  createdAt: Date;
}

const toBeneficiaryView = (doc: any): BeneficiaryView => {
  const number = String(doc.accountNumber);
  return {
    _id: String(doc._id),
    id: String(doc._id),
    name: doc.name,
    accountNumber: number,
    maskedAccountNumber: `•••• ${number.slice(-4)}`,
    ifsc: doc.ifsc,
    bankName: doc.bankName,
    accountHolderName: doc.accountHolderName,
    accountType: doc.accountType,
    upiId: doc.upiId,
    mobile: doc.mobile,
    email: doc.email,
    nickname: doc.nickname,
    isFavourite: doc.isFavourite,
    dailyLimit: doc.dailyLimit,
    transferredTotal: doc.transferredTotal,
    transferCount: doc.transferCount,
    lastTransferredAt: doc.lastTransferredAt,
    status: doc.status,
    createdAt: doc.createdAt,
  };
};

const MAX_BENEFICIARIES = 25;

export const addBeneficiary = async (
  customerId: string,
  userId: string,
  input: {
    name: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    accountHolderName: string;
    accountType?: 'SAVINGS' | 'CURRENT' | 'SALARY';
    upiId?: string;
    mobile?: string;
    email?: string;
    nickname?: string;
  }
): Promise<BeneficiaryView> => {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new NotFoundError('Customer');

  const accountNumber = input.accountNumber.trim().toUpperCase();
  const ifsc = input.ifsc.trim().toUpperCase();

  if (!/^\d{9,18}$/.test(accountNumber)) {
    throw new ValidationError('Account number must be 9 to 18 digits');
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    throw new ValidationError('IFSC must look like HDFC0001234');
  }

  /*
   * A payee may not be the customer's own account. This used to query
   * `Customer.exists({ ..., 'banking.accountNumber' })` -- a path that does not
   * exist on the Customer model, so the guard matched nothing and everyone
   * could add their own account as a payee. Accounts live in their own
   * collection; that is where the check has to go.
   */
  const ownAccount = await Account.exists({ customerId, accountNumber });
  if (ownAccount) {
    throw new ValidationError('You cannot add your own account as a beneficiary');
  }

  const existingCount = await Beneficiary.countDocuments({ customerId, status: 'ACTIVE' });
  if (existingCount >= MAX_BENEFICIARIES) {
    throw new ValidationError(`You can save up to ${MAX_BENEFICIARIES} beneficiaries`);
  }

  const duplicate = await Beneficiary.findOne({ customerId, accountNumber });
  if (duplicate) {
    throw new ValidationError('This account is already in your beneficiary list');
  }

  const beneficiary = await Beneficiary.create({
    customerId: customer._id,
    userId,
    name: input.name.trim(),
    accountNumber,
    ifsc,
    bankName: input.bankName.trim(),
    accountHolderName: input.accountHolderName.trim(),
    accountType: input.accountType || 'SAVINGS',
    upiId: input.upiId?.trim().toLowerCase(),
    mobile: input.mobile?.trim(),
    email: input.email?.trim().toLowerCase(),
    nickname: input.nickname?.trim(),
    isFavourite: false,
    dailyLimit: 100000,
    transferredTotal: 0,
    transferCount: 0,
    status: 'ACTIVE',
  });

  logger.info(`Beneficiary added for customer ${customerId}: ${beneficiary.maskedAccountNumber}`);
  return toBeneficiaryView(beneficiary.toObject({ virtuals: true }));
};

export const getBeneficiaries = async (customerId: string): Promise<BeneficiaryView[]> => {
  // Filtered to ACTIVE. Removal is a soft delete (`status: 'INACTIVE'`) because
  // the row has to survive in transaction history. `payBeneficiary` already
  // refuses an inactive payee, so this is not a money leak -- but without the
  // filter a deleted payee kept showing in the list and only failed when the
  // customer tried to use it, which reads as a broken app rather than a removed
  // payee.
  const beneficiaries = await Beneficiary.find({ customerId, status: 'ACTIVE' })
    .sort({ isFavourite: -1, createdAt: -1 })
    .lean({ virtuals: true });

  return beneficiaries.map(toBeneficiaryView);
};

const loadOwned = async (beneficiaryId: string, customerId: string): Promise<IBeneficiaryDocument> => {
  const beneficiary = await Beneficiary.findById(beneficiaryId);
  if (!beneficiary) throw new NotFoundError('Beneficiary');
  if (!beneficiary.customerId.equals(customerId)) {
    throw new ForbiddenError('You do not have access to this beneficiary');
  }
  return beneficiary;
};

export const getBeneficiaryById = async (
  beneficiaryId: string,
  customerId: string
): Promise<BeneficiaryView> => {
  const beneficiary = await loadOwned(beneficiaryId, customerId);
  return toBeneficiaryView(beneficiary.toObject({ virtuals: true }));
};

export const updateBeneficiary = async (
  beneficiaryId: string,
  customerId: string,
  patch: Partial<{
    name: string;
    nickname: string;
    isFavourite: boolean;
    dailyLimit: number;
    status: 'ACTIVE' | 'INACTIVE';
    upiId: string;
    mobile: string;
    email: string;
  }>
): Promise<BeneficiaryView> => {
  const beneficiary = await loadOwned(beneficiaryId, customerId);

  if (patch.name !== undefined) beneficiary.name = patch.name.trim();
  if (patch.nickname !== undefined) beneficiary.nickname = patch.nickname.trim();
  if (patch.upiId !== undefined) beneficiary.upiId = patch.upiId.trim().toLowerCase();
  if (patch.mobile !== undefined) beneficiary.mobile = patch.mobile.trim();
  if (patch.email !== undefined) beneficiary.email = patch.email.trim().toLowerCase();
  if (patch.status !== undefined) beneficiary.status = patch.status;

  if (patch.dailyLimit !== undefined) {
    if (patch.dailyLimit < 0) throw new ValidationError('Daily limit cannot be negative');
    beneficiary.dailyLimit = patch.dailyLimit;
  }

  // Only one favourite at a time keeps the "pay" screen unambiguous.
  if (patch.isFavourite === true) {
    await Beneficiary.updateMany(
      { customerId, _id: { $ne: beneficiary._id } },
      { $set: { isFavourite: false } }
    );
    beneficiary.isFavourite = true;
  } else if (patch.isFavourite === false) {
    beneficiary.isFavourite = false;
  }

  await beneficiary.save();
  return toBeneficiaryView(beneficiary.toObject({ virtuals: true }));
};

export const deleteBeneficiary = async (
  beneficiaryId: string,
  customerId: string
): Promise<{ id: string; reference: string }> => {
  const beneficiary = await loadOwned(beneficiaryId, customerId);
  const id = String(beneficiary._id);
  // Soft delete: the payee must keep existing in history rows.
  beneficiary.status = 'INACTIVE';
  beneficiary.isFavourite = false;
  await beneficiary.save();

  logger.info(`Beneficiary removed: ${beneficiary.maskedAccountNumber}`);
  return { id, reference: generateReference('BEN') };
};

/** Called after a successful transfer so the payee shows recent activity. */
export const recordBeneficiaryTransfer = async (
  beneficiaryId: string,
  amount: number
): Promise<void> => {
  await Beneficiary.updateOne(
    { _id: beneficiaryId },
    {
      $inc: { transferredTotal: amount, transferCount: 1 },
      $set: { lastTransferredAt: new Date() },
    }
  );
};

/** Sum transferred today, used to enforce the per-payee daily cap. */
export const getTodayTransferTotal = async (
  beneficiaryId: string,
  session?: mongoose.ClientSession | null
): Promise<number> => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const pipeline = Transaction.aggregate<{ total: number }>([
    {
      $match: {
        /*
         * Aggregation pipelines do not cast types the way `find()` does.
         * Matching the ObjectId ref against a bare string matched zero rows --
         * so the daily cap used to read 0 no matter how much had been paid and
         * was never actually enforced.
         */
        beneficiaryId: new mongoose.Types.ObjectId(beneficiaryId),
        transactionType: 'TRANSFER_OUT',
        status: 'COMPLETED',
        createdAt: { $gte: startOfDay },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  // A caller inside a multi-document transaction must read its own uncommitted
  // ledger row, or the daily-cap check cannot see the payment it just wrote.
  if (session) pipeline.session(session);

  const result = await pipeline;
  return result[0]?.total ?? 0;
};

export default {
  addBeneficiary,
  getBeneficiaries,
  getBeneficiaryById,
  updateBeneficiary,
  deleteBeneficiary,
  recordBeneficiaryTransfer,
  getTodayTransferTotal,
};
