import { Router } from 'express';
import { listStaff, getStaffMember, updateStaffMember, listBranches } from '../controllers/adminController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateParams } from '../middleware/validation';
import { userIdParamSchema, updateStaffSchema } from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

/**
 * Back-office routes: the staff directory and the branch book.
 *
 * Two different permissions on purpose, because they answer different questions:
 *
 *   `branch:read:any` — every staff role. Seeing which branches exist and how
 *   many accounts each holds is directory information. The response carries
 *   counts and codes only; no customer, account number or per-branch balance
 *   leaves this endpoint to branch-level staff, so it cannot be used to work
 *   around branch scoping.
 *
 *   `user:manage` — admin only. Changing who can do what is head office's
 *   authority, and a branch manager editing staff would be a privilege-escalation
 *   path out of their own branch.
 */
router.get('/branches', requirePermission('branch:read:any'), asyncHandler(listBranches));

router.get('/users', requirePermission('user:manage'), asyncHandler(listStaff));
router.get(
  '/users/:userId',
  requirePermission('user:manage'),
  validateParams(userIdParamSchema),
  asyncHandler(getStaffMember)
);
router.patch(
  '/users/:userId',
  requirePermission('user:manage'),
  validateParams(userIdParamSchema),
  validateBody(updateStaffSchema),
  asyncHandler(updateStaffMember)
);

export default router;
