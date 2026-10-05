import { Router } from 'express';
import {
  quoteDeposit,
  listDeposits,
  openDeposit,
  getDeposit,
  closeDeposit,
  runMaturities,
  listInstructions,
  createInstruction,
  updateInstruction,
  pauseInstruction,
  resumeInstruction,
  cancelInstruction,
  runInstructionNow,
  runMyDueInstructions,
  listNominees,
  registerNominees,
  cancelNominees,
  myKyc,
  submitKyc,
  kycQueue,
  reviewKyc,
} from '../controllers/bankingController';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireAnyPermission, requireStaff } from '../middleware/rbac';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import {
  depositQuoteSchema,
  openDepositSchema,
  closeDepositSchema,
  standingInstructionSchema,
  updateInstructionSchema,
  nomineeSchema,
  depositIdParamSchema,
  instructionIdParamSchema,
  kycIdParamSchema,
} from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

/*
 * All customer sections below hang off a `Customer` record, which staff do not
 * have, so they are gated on the `:own` form and are reachable by customers
 * only. That is deliberate and matches the sidebar's `customerOnly` flag: the
 * alternative -- granting staff the `:own` form -- is what produces a nav full of
 * links that can only 403.
 */

// --- fixed deposits (customer) ------------------------------------------
router.get(
  '/deposits/quote',
  requirePermission('deposit:read:own'),
  validateQuery(depositQuoteSchema),
  asyncHandler(quoteDeposit)
);
/*
 * Deposit list and open.
 *
 * `requireAnyPermission('deposit:read:own', 'deposit:read:any')` — not
 * `deposit:read:own` alone. Four staff roles hold the `:any` grant and every one
 * of them was refused: the route demanded `:own`, which they do not hold, so the
 * permission matrix and the route disagreed and the feature was customer-only in
 * practice. The coarse gate asks "may this role see deposits at all"; the
 * controller then answers "whose", via `resolveTargetCustomer`.
 */
router.get(
  '/deposits',
  requireAnyPermission('deposit:read:own', 'deposit:read:any'),
  asyncHandler(listDeposits)
);
router.post(
  '/deposits',
  requirePermission('deposit:open:own'),
  validateBody(openDepositSchema),
  asyncHandler(openDeposit)
);
router.get(
  '/deposits/:depositId',
  requirePermission('deposit:read:own'),
  validateParams(depositIdParamSchema),
  asyncHandler(getDeposit)
);
router.post(
  '/deposits/:depositId/close',
  requireAnyPermission('deposit:close:own', 'deposit:close:any'),
  validateParams(depositIdParamSchema),
  validateBody(closeDepositSchema),
  asyncHandler(closeDeposit)
);

// --- standing instructions (customer) ------------------------------------
router.get('/standing-instructions', requirePermission('instruction:read:own'), asyncHandler(listInstructions));
router.post(
  '/standing-instructions',
  requirePermission('instruction:manage:own'),
  validateBody(standingInstructionSchema),
  asyncHandler(createInstruction)
);
router.post('/standing-instructions/run-due', requirePermission('instruction:manage:own'), asyncHandler(runMyDueInstructions));
router.patch(
  '/standing-instructions/:instructionId',
  requirePermission('instruction:manage:own'),
  validateParams(instructionIdParamSchema),
  validateBody(updateInstructionSchema),
  asyncHandler(updateInstruction)
);
router.post(
  '/standing-instructions/:instructionId/pause',
  requirePermission('instruction:manage:own'),
  validateParams(instructionIdParamSchema),
  asyncHandler(pauseInstruction)
);
router.post(
  '/standing-instructions/:instructionId/resume',
  requirePermission('instruction:manage:own'),
  validateParams(instructionIdParamSchema),
  asyncHandler(resumeInstruction)
);
router.post(
  '/standing-instructions/:instructionId/run',
  requirePermission('instruction:manage:own'),
  validateParams(instructionIdParamSchema),
  asyncHandler(runInstructionNow)
);
router.delete(
  '/standing-instructions/:instructionId',
  requirePermission('instruction:manage:own'),
  validateParams(instructionIdParamSchema),
  asyncHandler(cancelInstruction)
);

// --- nominees (customer) -----------------------------------------------
router.get('/nominees', requirePermission('customer:read:own'), asyncHandler(listNominees));
router.post(
  '/nominees',
  requirePermission('customer:update:own'),
  validateBody(nomineeSchema),
  asyncHandler(registerNominees)
);
router.delete('/nominees', requirePermission('customer:update:own'), asyncHandler(cancelNominees));

// --- KYC (customer) -----------------------------------------------------
router.get('/kyc', requirePermission('kyc:read:own'), asyncHandler(myKyc));
router.post('/kyc', requirePermission('kyc:submit:own'), asyncHandler(submitKyc));

// --- staff -------------------------------------------------------------
// The review queue and the maturity sweep are staff surfaces; both are gated on
// the specific permission rather than "is staff", so a future role can be
// granted one without the other.
router.get('/kyc/queue', requirePermission('kyc:review'), asyncHandler(kycQueue));
router.post(
  '/kyc/:kycId/review',
  requirePermission('kyc:review'),
  validateParams(kycIdParamSchema),
  asyncHandler(reviewKyc)
);
/*
 * Run the maturity sweep by hand.
 *
 * Gated on `deposit:mature`, the permission that actually describes the action,
 * rather than `deposit:read:any`, which it also required before. Reading
 * deposits is not authority to pay them out: this endpoint credits balances, so
 * it belongs to the same permission as the scheduled sweep it triggers, and the
 * auditor's copy of that grant has been removed for exactly that reason.
 */
router.post(
  '/admin/run-maturities',
  requirePermission('deposit:mature'),
  asyncHandler(runMaturities)
);

export default router;
