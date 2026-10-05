import { Router } from 'express';
import { pay, previewPayment, recordIncoming, reversePayment } from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { validateBody, validateParams } from '../middleware/validation';
import { transactionIdParamSchema } from '../validators/schemas';
import {
  payBeneficiarySchema,
  paymentPreviewSchema,
  recordIncomingSchema,
  reversePaymentSchema,
} from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

/**
 * Moving money is the capability a bank guards most carefully.
 *
 * `:any` forms exist for the counter actions a teller genuinely performs --
 * sending money out of a customer's account (`payment:send:any`) and crediting
 * one when funds arrive (`payment:receive:any`). The controllers resolve the
 * target customer from the request body for staff, because a teller has no
 * Customer record of their own.
 *
 * Two things deliberately do not get a `:any` form. **Reversal** stays
 * account-holder only: nobody but the person who paid can undo a payment.
 * **Incoming credit** is `:any` rather than `:own` -- it was `payment:receive:own`
 * and customers held it, which let any customer credit their own account by an
 * arbitrary amount with nothing to check it against. Counter-only removes the
 * hole and matches how the workflow actually runs.
 *
 * Every route validates its body. The payment routes previously ran unvalidated,
 * so the amount reaching the service was whatever the client sent.
 */
router.post(
  '/preview',
  requirePermission('payment:preview'),
  validateBody(paymentPreviewSchema),
  asyncHandler(previewPayment)
);
router.post(
  '/',
  requireAnyPermission('payment:send:own', 'payment:send:any'),
  validateBody(payBeneficiarySchema),
  asyncHandler(pay)
);
router.post(
  '/incoming',
  requirePermission('payment:receive:any'),
  validateBody(recordIncomingSchema),
  asyncHandler(recordIncoming)
);
router.post(
  '/:transactionId/reverse',
  requirePermission('payment:reverse:own'),
  validateParams(transactionIdParamSchema),
  validateBody(reversePaymentSchema),
  asyncHandler(reversePayment)
);

export default router;
