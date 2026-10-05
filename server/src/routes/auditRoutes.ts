import { Router } from 'express';
import {
  listAuditLog,
  listActions,
  mySecurityLog,
  activeSessions,
  revokeSession,
  revokeAllSessions,
} from '../controllers/auditController';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireAnyPermission } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

// The customer's own history comes before the staff-only catch-alls.
//
// `mySecurityLog` filters by `actorId`, so it is "who signed in on this
// account" rather than a privileged read of the bank's ledger. Staff are
// included on purpose: an employee should be able to see their own login history
// without also being handed the whole audit trail, which is why the gate accepts
// either form of the permission.
router.get(
  '/security',
  requireAnyPermission('audit:read:own', 'audit:read:any'),
  asyncHandler(mySecurityLog)
);
router.get('/sessions', requirePermission('session:manage:own'), asyncHandler(activeSessions));
router.delete('/sessions', requirePermission('session:manage:own'), asyncHandler(revokeAllSessions));
router.delete(
  '/sessions/:sessionId',
  requirePermission('session:manage:own'),
  asyncHandler(revokeSession)
);

// The full ledger is an `audit:read:any` capability, which the `auditor` role
// holds and `teller`/`loan_officer` do not -- an auditor who could not read the
// log they are meant to check would be pointless.
router.get('/', requirePermission('audit:read:any'), asyncHandler(listAuditLog));
router.get('/actions', requirePermission('audit:read:any'), asyncHandler(listActions));

export default router;
