import { Router } from 'express';
import {
  applyForLoan,
  getLoan,
  getMyLoans,
  getAllLoansController,
  approveLoanController,
  disburseLoanController,
  repayLoanController,
  calculateLoanInterestController,
  getLoanPaymentsController,
  getOverdueLoansController,
} from '../controllers/loanController';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireAnyPermission } from '../middleware/rbac';
import { validateBody, validateParams } from '../middleware/validation';
import {
  applyLoanSchema,
  repayLoanSchema,
  calculateLoanInterestSchema,
  loanIdParamSchema,
} from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

/**
 * Static segments before `/:loanId`, otherwise "all" reads as a loan id.
 *
 * The underwriting split is deliberate: a `loan_officer` reads and approves,
 * but only a `manager` or `admin` disburses. Money leaving the bank is the one
 * step a loan officer cannot take alone -- that separation is the whole point of
 * having two roles instead of one.
 */
router.post(
  '/',
  requireAnyPermission('loan:apply:own', 'loan:apply:any'),
  validateBody(applyLoanSchema),
  asyncHandler(applyForLoan)
);
router.get('/my-loans', requirePermission('loan:read:own'), asyncHandler(getMyLoans));
router.get('/overdue', requirePermission('loan:read:any'), asyncHandler(getOverdueLoansController));
router.get('/all', requirePermission('loan:read:any'), asyncHandler(getAllLoansController));
router.get(
  '/calculate-interest',
  requireAnyPermission('loan:read:own', 'loan:read:any'),
  validateBody(calculateLoanInterestSchema),
  asyncHandler(calculateLoanInterestController)
);
router.get(
  '/:loanId',
  requireAnyPermission('loan:read:own', 'loan:read:any'),
  validateParams(loanIdParamSchema),
  asyncHandler(getLoan)
);
router.get(
  '/:loanId/payments',
  requireAnyPermission('loan:read:own', 'loan:read:any'),
  validateParams(loanIdParamSchema),
  asyncHandler(getLoanPaymentsController)
);
router.post(
  '/:loanId/approve',
  requirePermission('loan:approve'),
  validateParams(loanIdParamSchema),
  asyncHandler(approveLoanController)
);
router.post(
  '/:loanId/disburse',
  requirePermission('loan:disburse'),
  validateParams(loanIdParamSchema),
  asyncHandler(disburseLoanController)
);
// Repayment moves the borrower's own money, so it stays a customer-only action
// rather than something staff may trigger on someone's account.
router.post(
  '/:loanId/repay',
  requirePermission('loan:repay:own'),
  validateParams(loanIdParamSchema),
  validateBody(repayLoanSchema),
  asyncHandler(repayLoanController)
);

export default router;
