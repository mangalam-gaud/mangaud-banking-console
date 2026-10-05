import { Response } from 'express';
import { Customer } from '../models/Customer';
import { Account } from '../models/Account';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import { branchScope, visibleAccountIds } from '../utils/ownership';
import { recordAudit } from '../services/auditService';
import { IApiResponse } from '@shared/types';
import { isValidPhone } from '../utils/validation';

/**
 * Counter customer lookup — the first thing a teller does.
 *
 * `customer:read:any` and `customer:update:any` were granted to five and two
 * roles respectively and had no route behind either of them. That is the worst
 * kind of gap: the matrix reads as though staff can look customers up, and in
 * practice the only way to do it was to open an account by number and read the
 * populated customer off it.
 *
 * Branch scoping applies here too, for the same reason it applies to accounts: a
 * teller at `BLR001` has no business reading the personal record of a customer
 * served by `BLR002`, and the account number is not a permission.
 */

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Only these fields ever leave the server for a customer search result. */
const toSummary = (doc: any) => ({
  id: String(doc._id),
  firstName: doc.firstName,
  lastName: doc.lastName,
  fullName: `${doc.firstName} ${doc.lastName}`,
  email: doc.email,
  phone: doc.phone,
  branchCode: doc.branchCode,
  kycStatus: doc.kycStatus,
  createdAt: doc.createdAt,
});

/**
 * GET /customers — search the counter book.
 *
 * A single `q` across name, email, phone and customer id. One box, because a
 * teller serving a queue does not know which of the four the customer will know
 * one of; four separate fields would make them guess.
 *
 * `limit` is capped at 50. This is a lookup aid, not an export, and an unbounded
 * result set on a PII collection is how a directory becomes a data-exfiltration
 * endpoint.
 */
export const searchCustomers = async (req: AuthRequest, res: Response): Promise<void> => {
  const q = String(req.query.q ?? '').trim();
  const limit = Math.min(Number(req.query.limit ?? 20) || 20, 50);

  if (q.length < 2) {
    throw new ValidationError('Enter at least two characters to search');
  }

  const scope = branchScope(req.user!);
  const filter: Record<string, unknown> = scope ? { branchCode: scope } : {};

  /*
    Build the `$or` clauses, skipping any that would be vacuous.

    The subtle one, and it shipped: a search term with no digits produced
    `{ phone: { $regex: '' } }` after stripping non-digits. An **empty regex
    matches every document**, so `?q=meera` returned the whole branch instead of
    the one matching customer — a scoped search quietly degraded into "list
    everything you can see", and the response looked like a correct 200. Caught
    by asking for a customer in another branch and being handed four.

    So: only add a clause when its pattern is non-empty. A vacuous clause is not
    a harmless no-op in MongoDB, it is a match-all.
  */
  const clauses: Record<string, unknown>[] = [];

  const asPhone = q.replace(/\D/g, '');
  if (asPhone.length >= 3) {
    // Enough digits to be a phone fragment rather than an accidental match.
    clauses.push(
      isValidPhone(asPhone)
        ? { phone: asPhone }
        : { phone: { $regex: escapeRegExp(asPhone), $options: 'i' } }
    );
  }

  clauses.push(
    { firstName: { $regex: escapeRegExp(q), $options: 'i' } },
    { lastName: { $regex: escapeRegExp(q), $options: 'i' } },
    { email: { $regex: escapeRegExp(q), $options: 'i' } }
  );
  if (Types_isValid(q)) clauses.push({ _id: q });

  const customers = await Customer.find({ $and: [filter, { $or: clauses }] })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const response: IApiResponse = {
    success: true,
    data: {
      customers: customers.map(toSummary),
      // Stated so the UI can explain an empty result instead of showing a blank
      // list: "no match" and "3 matches, all in another branch" look identical
      // otherwise, and the second is the answer to "why can't I find them?".
      scopedToBranch: scope ?? null,
    },
  };

  res.json(response);
};

/** GET /customers/:id — one customer, with their accounts. */
export const getCustomerDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  const { customerId } = req.params;
  if (!Types_isValid(customerId)) throw new ValidationError('Invalid customer id');

  const customer = await Customer.findById(customerId).lean();
  if (!customer) throw new NotFoundError('Customer');

  const scope = branchScope(req.user!);
  if (scope && String(customer.branchCode ?? '').toUpperCase() !== scope) {
    // 403 rather than 404: the caller is the wrong kind of operator for this
    // record, which is a fact about them rather than about the customer.
    throw new ForbiddenError(
      `That customer is served by another branch (${customer.branchCode ?? 'unknown'})`
    );
  }

  // Accounts come back through the same ownership helper as every other read, so
  // this endpoint cannot become a way around branch scoping.
  const allowed = new Set(
    (await visibleAccountIds(req.user!)).map((id) => String(id))
  );
  const accounts = await Account.find({
    customerId: customer._id,
    _id: { $in: [...allowed] },
  })
    .select('accountNumber accountType balance status currency branchCode openedAt')
    .sort({ createdAt: -1 })
    .lean();

  const response: IApiResponse = {
    success: true,
    data: {
      customer: toSummary(customer),
      accounts: accounts.map((a) => ({
        id: String(a._id),
        accountNumber: a.accountNumber,
        accountType: a.accountType,
        balance: a.balance,
        status: a.status,
        currency: a.currency,
        branchCode: a.branchCode,
        openedAt: a.openedAt,
      })),
    },
  };

  res.json(response);
};

/**
 * PATCH /customers/:id — manager and admin only.
 *
 * Address and phone are the two fields a branch can actually correct at the
 * counter. Name, email and KYC status are deliberately not editable here:
 * changing a customer's identity is a KYC event, and `kyc:review` is already the
 * permission that governs it. Letting `customer:update:any` rewrite
 * `kycStatus` would have handed every manager the ability to mark a customer
 * verified, which is exactly the control KYC sign-off exists to keep.
 */
export const updateCustomerByStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  const { customerId } = req.params;
  if (!Types_isValid(customerId)) throw new ValidationError('Invalid customer id');

  const customer = await Customer.findById(customerId);
  if (!customer) throw new NotFoundError('Customer');

  const scope = branchScope(req.user!);
  if (scope && String(customer.branchCode ?? '').toUpperCase() !== scope) {
    throw new ForbiddenError(
      `That customer is served by another branch (${customer.branchCode ?? 'unknown'})`
    );
  }

  const { address, phone } = req.body ?? {};
  if (address === undefined && phone === undefined) {
    throw new ValidationError('Nothing to update — supply address or phone');
  }
  if (address !== undefined) {
    if (typeof address !== 'string' || !address.trim()) {
      throw new ValidationError('Address cannot be empty');
    }
    customer.address = address.trim();
  }
  if (phone !== undefined) {
    // Stored through the schema's setter, so the same normalisation and
    // validation the registration path uses applies to a counter correction.
    customer.phone = phone;
  }

  await customer.save();

  await recordAudit(req, {
    action: 'CUSTOMER_UPDATED',
    entity: 'customer',
    entityId: customerId,
    message: `Updated ${customer.firstName} ${customer.lastName}`,
    metadata: { fields: Object.keys(req.body ?? {}) },
  });

  const response: IApiResponse = {
    success: true,
    message: 'Customer updated',
    data: toSummary(customer.toObject()),
  };

  res.json(response);
};

/** Minimal ObjectId check, kept local so this router needs no extra import. */
function Types_isValid(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}
