import { Router } from 'express';
import {
  listBeneficiaries,
  addBeneficiary,
  getBeneficiary,
  updateBeneficiary,
  removeBeneficiary,
} from '../controllers/beneficiaryController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';
import { validateBody, validateParams } from '../middleware/validation';
import { addBeneficiarySchema, updateBeneficiarySchema, beneficiaryIdParamSchema } from '../validators/schemas';

const router = Router();

router.use(authenticate);

/**
 * A saved payee is a customer-owned record, and the only bank employee who may
 * add one is a `teller` acting at the counter -- which is why the matrix gives
 * them `beneficiary:manage:own` rather than a `:any` variant. Staff have no
 * Customer record, so `getCustomerForUser` answers 403 for them; that is
 * intentional rather than a gap to be filled with a staff override.
 */
router.get('/', requirePermission('beneficiary:manage:own'), asyncHandler(listBeneficiaries));
router.post('/', requirePermission('beneficiary:manage:own'), validateBody(addBeneficiarySchema), asyncHandler(addBeneficiary));
router.get(
  '/:beneficiaryId',
  requirePermission('beneficiary:manage:own'),
  validateParams(beneficiaryIdParamSchema),
  asyncHandler(getBeneficiary)
);
router.patch(
  '/:beneficiaryId',
  requirePermission('beneficiary:manage:own'),
  validateParams(beneficiaryIdParamSchema),
  validateBody(updateBeneficiarySchema),
  asyncHandler(updateBeneficiary)
);
router.delete(
  '/:beneficiaryId',
  requirePermission('beneficiary:manage:own'),
  validateParams(beneficiaryIdParamSchema),
  asyncHandler(removeBeneficiary)
);

export default router;
