import { Router } from 'express';
import {
  listStatements,
  generateStatement,
  getStatement,
  downloadStatementCsv,
} from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission } from '../middleware/rbac';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import {
  statementIdParamSchema,
  statementListQuerySchema,
  generateStatementSchema,
} from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

/**
 * A statement is a frozen snapshot, so `statement:read:*` covers both the list
 * and the CSV download -- there is no separate export permission, and adding one
 * would only create a way to read the same data through a different door.
 *
 * These routes are reachable by staff, and the controllers resolve the subject
 * differently on purpose. `listStatements` and `generateStatement` need a
 * customer up front and take one from `?customerId=` / `body.customerId` for
 * staff. `getStatement` and the download do not: the statement id already
 * identifies its owner, so they read it off the document. Without that
 * distinction every one of these 403'd for all five staff roles -- they have no
 * Customer record of their own to compare against -- while the sidebar linked
 * them and the matrix granted them `statement:read:any`.
 */
router.get(
  '/',
  requireAnyPermission('statement:read:own', 'statement:read:any'),
  validateQuery(statementListQuerySchema),
  asyncHandler(listStatements)
);
router.post(
  '/generate',
  requireAnyPermission('statement:generate:own', 'statement:generate:any'),
  validateBody(generateStatementSchema),
  asyncHandler(generateStatement)
);
router.get(
  '/:statementId',
  requireAnyPermission('statement:read:own', 'statement:read:any'),
  validateParams(statementIdParamSchema),
  asyncHandler(getStatement)
);
router.get(
  '/:statementId/download',
  requireAnyPermission('statement:read:own', 'statement:read:any'),
  validateParams(statementIdParamSchema),
  asyncHandler(downloadStatementCsv)
);

export default router;
