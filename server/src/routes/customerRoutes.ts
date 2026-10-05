import { Router } from 'express';
import { searchCustomers, getCustomerDetail, updateCustomerByStaff } from '../controllers/customerController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { customersQuerySchema, customerIdParamSchema, updateCustomerSchema } from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

/**
 * Counter customer lookup.
 *
 * Backed by `customer:read:any`, which five roles hold and which had no route
 * behind it until now — the matrix claimed a capability the API did not have.
 *
 * Scope is enforced in the controller by `branchScope`, not here: a permission
 * answers "may this role look customers up at all", and the branch answers
 * "which ones". Both are needed, and putting the branch in the route would mean
 * reading a per-request value inside a static middleware.
 */
router.get(
  '/',
  requirePermission('customer:read:any'),
  validateQuery(customersQuerySchema),
  asyncHandler(searchCustomers)
);
router.get(
  '/:customerId',
  requirePermission('customer:read:any'),
  validateParams(customerIdParamSchema),
  asyncHandler(getCustomerDetail)
);

/**
 * Manager and admin only. Deliberately narrower than `customer:update:any`
 * implies — address and phone only, because identity fields are KYC events and
 * `kyc:review` is the permission that governs those.
 */
router.patch(
  '/:customerId',
  requirePermission('customer:update:any'),
  validateParams(customerIdParamSchema),
  validateBody(updateCustomerSchema),
  asyncHandler(updateCustomerByStaff)
);

export default router;
