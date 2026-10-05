import { Response } from 'express';
import { User } from '../models/User';
import { Customer } from '../models/Customer';
import { Account } from '../models/Account';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import { branchScope } from '../utils/ownership';
import { recordAudit } from '../services/auditService';
import { revokeAllUserTokens } from '../services/authService';
import { ROLES, ROLE_LABELS, isStaffRole, type Role } from '../config/permissions';
import { IApiResponse } from '@shared/types';

/**
 * Back-office: staff accounts and branches.
 *
 * `user:manage` (admin only) and `branch:read:any` (every staff role) were both
 * granted with no route behind them. Those are the two grants most likely to be
 * assumed real — an admin reading the matrix would reasonably conclude staff
 * accounts were manageable — so leaving them unenforced was the most misleading
 * gap in the set.
 *
 * Guardrails on role changes, which is the part that matters:
 *
 *   - an admin cannot change their own role. Without this, demoting yourself is
 *     one click from locking yourself out of the only role that can undo it,
 *     and promoting yourself is a privilege-escalation footgun on a shared
 *     console;
 *   - head office (`HO`) is not a branch an operator can assign, because it is
 *     the unscoped role — handing it out should be a deliberate act, not a
 *     dropdown default;
 *   - every change revokes that user's sessions and is audited, because a role
 *     that changes while the old one's tokens still work is a role change that
 *     has not happened yet.
 */

/** Never expose these, in any listing. */
const toStaffView = (doc: any) => ({
  id: String(doc._id),
  email: doc.email,
  firstName: doc.firstName,
  lastName: doc.lastName,
  fullName: `${doc.firstName ?? ''} ${doc.lastName ?? ''}`.trim(),
  role: doc.role,
  roleLabel: ROLE_LABELS[doc.role as Role] ?? doc.role,
  branchCode: doc.branchCode,
  isActive: doc.isActive !== false,
  isEmailVerified: doc.isEmailVerified === true,
  lastLoginAt: doc.lastLoginAt,
  createdAt: doc.createdAt,
});

/**
 * GET /users — the staff directory.
 *
 * Admin only. A branch-scoped admin (there are none today: admin is head office)
 * would see their own branch; the code path exists so that adding one later
 * cannot silently become full-bank visibility.
 */
export const listStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  const scope = branchScope(req.user!);
  const filter = scope ? { branchCode: scope } : {};

  const users = await User.find(filter).sort({ createdAt: 1 }).lean();

  const response: IApiResponse = {
    success: true,
    data: {
      users: users.map(toStaffView),
      total: users.length,
      scopedToBranch: scope ?? null,
    },
  };

  res.json(response);
};

/** GET /users/:id — one staff record, without its password hash. */
export const getStaffMember = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await User.findById(req.params.userId).lean();
  if (!user) throw new NotFoundError('Staff member');

  const scope = branchScope(req.user!);
  if (scope && String(user.branchCode ?? '').toUpperCase() !== scope) {
    throw new ForbiddenError('That staff member belongs to another branch');
  }

  const response: IApiResponse = {
    success: true,
    data: toStaffView(user),
  };
  res.json(response);
};

/**
 * PATCH /users/:id — change a staff member's role, branch or active state.
 *
 * At least one of the three, because a PATCH that changes nothing and returns 200
 * is indistinguishable from one that worked.
 */
export const updateStaffMember = async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { role, branchCode, isActive } = req.body ?? {};

  if (role === undefined && branchCode === undefined && isActive === undefined) {
    throw new ValidationError('Nothing to update — supply role, branchCode or isActive');
  }

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('Staff member');

  // Self-edit is refused outright, and not just for `role`: an admin who
  // deactivates themselves cannot log back in to undo it, and one who moves
  // themselves to another branch loses visibility of the accounts they were
  // administering.
  if (String(user._id) === String(req.user!._id)) {
    throw new ValidationError('You cannot change your own role, branch or active state');
  }

  if (role !== undefined) {
    if (!ROLES.includes(role)) {
      throw new ValidationError(`Unknown role "${role}". Expected one of: ${ROLES.join(', ')}`);
    }
    // Never hand out the unscoped role through a dropdown. Promotion to admin is
    // deliberately not something this endpoint can do.
    if (role === 'admin' && req.user!.role !== 'admin') {
      throw new ForbiddenError('Only an administrator can grant administrator access');
    }
    user.role = role;
  }

  if (branchCode !== undefined) {
    const code = String(branchCode).trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(code)) {
      throw new ValidationError('Branch code must be 2-10 letters or digits');
    }
    if (code === 'HO' && String(user.branchCode ?? '').toUpperCase() !== 'HO') {
      throw new ForbiddenError('Moving a staff member to head office requires an administrator');
    }
    user.branchCode = code;
  }

  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      throw new ValidationError('isActive must be true or false');
    }
    user.isActive = isActive;
  }

  await user.save();

  /*
   * Revoke sessions on any change to authority.
   *
   * An access token carries its role, and it is valid for up to 15 minutes, so
   * without this a demoted loan officer keeps approving loans until their token
   * expires. A permission change that leaves the old capability live for a
   * quarter of an hour is not a permission change.
   */
  await revokeAllUserTokens(String(user._id));

  await recordAudit(req, {
    action: 'STAFF_UPDATED',
    entity: 'user',
    entityId: String(user._id),
    message: `Updated staff ${user.email}`,
    metadata: {
      role: user.role,
      branchCode: user.branchCode,
      isActive: user.isActive !== false,
      sessionsRevoked: true,
    },
  });

  const response: IApiResponse = {
    success: true,
    message: 'Staff member updated. Their sessions have been signed out.',
    data: toStaffView(user.toObject()),
  };
  res.json(response);
};

/**
 * GET /branches — the branch book, with live counts.
 *
 * `branch:read:any` is held by every staff role, and this is what makes that
 * grant mean something: a teller can see which branches exist and how big they
 * are without being able to see another branch's customers, because the response
 * carries counts and codes, never a name, an account number or a balance.
 *
 * That distinction is the point. An aggregate that reveals only totals is a
 * directory; one that reveals per-branch PII would be the very leak branch
 * scoping exists to prevent.
 */
export const listBranches = async (req: AuthRequest, res: Response): Promise<void> => {
  const [rows, customerCount] = await Promise.all([
    Account.aggregate<{ _id: string; accounts: number; balance: number }>([
      { $group: { _id: '$branchCode', accounts: { $sum: 1 }, balance: { $sum: '$balance' } } },
      { $sort: { _id: 1 } },
    ]),
    Customer.countDocuments({}),
  ]);

  const staffCounts = await User.aggregate<{ _id: string; staff: number }>([
    { $match: { role: { $ne: 'customer' } } },
    { $group: { _id: '$branchCode', staff: { $sum: 1 } } },
  ]);
  const staffBy = new Map(staffCounts.map((s) => [String(s._id), s.staff]));

  const scope = branchScope(req.user!);
  const branches = rows.map((r) => ({
    code: String(r._id ?? 'HO'),
    accounts: r.accounts,
    // A balance total across a whole branch is commercially sensitive and is NOT
    // returned to branch-level staff; only head office sees the total.
    ...(scope ? {} : { totalBalance: Math.round(r.balance * 100) / 100 }),
    staff: staffBy.get(String(r._id ?? 'HO')) ?? 0,
  }));

  // Ensure head office appears even with no accounts, so the list is a branch
  // directory rather than a list of wherever money happens to be.
  if (!branches.some((b) => b.code === 'HO')) {
    branches.unshift({
      code: 'HO',
      accounts: 0,
      staff: staffBy.get('HO') ?? 0,
      ...(scope ? {} : { totalBalance: 0 }),
    });
  }

  const response: IApiResponse = {
    success: true,
    data: {
      branches,
      customers: customerCount,
      scopedToBranch: scope ?? null,
    },
  };

  res.json(response);
};

/** Exported for the tests: is this role a staff role at all? */
export { isStaffRole };
