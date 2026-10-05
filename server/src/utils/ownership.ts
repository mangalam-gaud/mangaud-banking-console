import { Customer, ICustomerDocument } from '../models/Customer';
import { Account } from '../models/Account';
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { IUserDocument } from '../models/User';
import { isStaffRole } from '../config/permissions';
import { Types } from 'mongoose';

/**
 * Resolve the Customer record behind the authenticated user.
 *
 * Every customer-facing feature (cards, payees, statements, payments) hangs off
 * the Customer, not the User, so this is the single place that bridges the two.
 *
 * Staff accounts deliberately have no Customer record. A 403 is the right
 * answer for them, not a 404: the resource is not "missing", the caller simply
 * has no customer of their own. Returning "Customer profile not found" made a
 * correct route guard look like a missing endpoint.
 */
export const getCustomerForUser = async (userId: string): Promise<ICustomerDocument> => {
  const customer = await Customer.findOne({ userId });
  if (!customer) {
    throw new ForbiddenError(
      'This section is for customer accounts. You are signed in as bank staff.'
    );
  }
  return customer;
};

/** Same, for a request that is already authenticated. */
export const getCustomerFromRequest = async (req: AuthRequest): Promise<ICustomerDocument> =>
  getCustomerForUser(req.user!._id.toString());

/**
 * Resolve the Customer a staff-initiated action is aimed at.
 *
 * `getCustomerFromRequest` is correct for a customer acting on their own data,
 * and wrong for staff: they have no Customer record, so every `*:any` action that
 * needs one -- paying on a customer's behalf, crediting their account,
 * generating their statement -- answered 403 for the exact roles the permission
 * matrix grants that capability to. The result is a matrix full of `:any`
 * permissions that cannot be exercised by anyone.
 *
 * So: a customer always resolves to their own record, whatever they ask for. A
 * staff caller must name a `customerId`, and must hold the `:any` permission at
 * the route. There is deliberately no "default to the first customer" path --
 * that would let a teller act on an arbitrary account by omitting a field.
 */
export const resolveTargetCustomer = async (
  req: AuthRequest,
  customerId?: string
): Promise<ICustomerDocument> => {
  if (!isStaffRole(req.user?.role)) {
    return getCustomerForUser(req.user!._id.toString());
  }

  if (!customerId) {
    throw new ValidationError('customerId is required for this action');
  }

  if (!Types.ObjectId.isValid(customerId)) {
    throw new ValidationError('customerId is not a valid id');
  }

  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new NotFoundError('Customer');
  }
  return customer;
};

/**
 * The account ids the caller is allowed to see transactions for.
 *
 * A customer gets their own accounts; staff get every account *in their branch*.
 *
 * This is one of only two places branch scoping is enforced (the other is
 * `loadAccountForUser`), and both are chokepoints rather than per-route checks
 * on purpose. Transaction and statement reads are *queries* — there is no single
 * resource whose ownership can be tested — so the scope has to be pushed into the
 * filter itself. Scattering it across controllers is how it ends up applied to
 * one endpoint and forgotten on the next.
 *
 * Head office (`branchCode === 'HO'`) is deliberately unscoped, and so is admin.
 * A head-office operator with no branch of their own is the one role that must
 * see across the bank; that is the entire point of the code, and collapsing it
 * into "every staff member sees everything" is what made `BLR001` meaningless.
 *
 * An empty array is returned rather than a permissive "no filter" when the caller
 * can see nothing, so the result is an empty page rather than everything.
 */
export const visibleAccountIds = async (user: IUserDocument): Promise<Types.ObjectId[]> => {
  if (isStaffRole(user.role)) {
    const scope = branchScope(user);
    const filter = scope ? { branchCode: scope } : {};
    const all = await Account.find(filter, '_id').lean();
    return all.map((a) => a._id);
  }

  const customer = await Customer.findOne({ userId: user._id }, '_id').lean();
  if (!customer) return [];

  const owned = await Account.find({ customerId: customer._id }, '_id').lean();
  return owned.map((a) => a._id);
};

/**
 * The branch a staff member is confined to, or `null` for full visibility.
 *
 * `null` means "no restriction" and is the value every unscoped path already
 * understood, so this is additive: until now every staff role resolved to `null`
 * here and saw the whole bank.
 */
export const branchScope = (user: IUserDocument): string | null => {
  if (!isStaffRole(user.role)) return null;
  if (user.role === 'admin') return null;
  const branch = (user.branchCode ?? '').trim().toUpperCase();
  // Head office is not a branch. A staff record with a missing or 'HO' branch is
  // treated as head office rather than as "matches nothing", so a data gap
  // cannot silently lock an operator out of their own work.
  if (!branch || branch === 'HO') return null;
  return branch;
};

/**
 * Load an account, asserting the caller is allowed to see it.
 *
 * A customer may only read their own account. Staff may read accounts **in their
 * own branch** — the second of the two branch-scoping chokepoints.
 *
 * The history: without any check here, `GET /accounts/:accountNumber` and the
 * balance endpoint were world-readable to any logged-in user — passing someone
 * else's account number was enough to read their balance. The first fix granted
 * every staff role full-bank visibility, which is correct for a single-branch
 * system and wrong the moment a teller at `BLR001` can read a `BLR002`
 * customer's balance. That is what `branchScope` now prevents.
 *
 * Note what branch scoping is *not*: it is not a substitute for the `:any`
 * permission at the route. A teller with `account:read:any` confined to BLR001
 * can read every account in BLR001 and none outside it; a role without the
 * permission reads nothing regardless of branch.
 */
export const loadAccountForUser = async (
  accountNumber: string,
  user: IUserDocument
): Promise<any> => {
  const account = await Account.findOne({ accountNumber: accountNumber.toUpperCase() })
    .populate('customerId', 'firstName lastName email phone kycStatus branchCode')
    .lean();

  if (!account) {
    throw new NotFoundError('Account');
  }

  // Every staff role, not just admin and manager. A teller working a counter has
  // to be able to look up any customer's balance, and a loan officer has to see
  // what a borrower owes -- within their branch. What they may *change* is a
  // separate permission, enforced at the route.
  if (isStaffRole(user.role)) {
    const scope = branchScope(user);
    if (scope) {
      const owner = account.customerId as any;
      const ownerBranch =
        owner && typeof owner === 'object' ? String(owner.branchCode ?? '') : '';
      const accountBranch = String((account as any).branchCode ?? ownerBranch ?? '');
      if (accountBranch.toUpperCase() !== scope) {
        /*
         * 403, not 404. The account exists; it is simply outside this operator's
         * branch, which is a statement about the caller rather than about the
         * resource. A 404 here would also make a genuine cross-branch lookup
         * indistinguishable from a typo, which is worse for the person trying to
         * serve a customer.
         */
        throw new ForbiddenError(
          `That account is served by another branch (${accountBranch || 'unknown'})`
        );
      }
    }
    return account;
  }

  // `account` is a populated lean doc, so customerId may be a sub-document or a
  // bare id depending on whether the ref resolved.
  const populated = account.customerId as any;
  const ownerId =
    populated && typeof populated === 'object' ? String(populated._id) : String(populated);

  // The customer record is keyed by userId, so compare in that space.
  const owns = await Customer.exists({ _id: ownerId, userId: user._id });
  if (!owns) {
    throw new ForbiddenError('You do not have access to this account');
  }

  return account;
};