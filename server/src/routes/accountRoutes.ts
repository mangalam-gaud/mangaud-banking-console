import { Router } from 'express';
import {
  createAccount, getAccount, getMyAccounts, getAllAccountsController, deposit,
  withdraw, transfer, checkBalance, calculateInterest, applyInterest, closeAccountController,
  setAccountFrozenController,
} from '../controllers/accountController';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireAnyPermission } from '../middleware/rbac';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import {
  accountNumberParamSchema,
  accountsQuerySchema,
  openAccountSchema,
  depositSchema,
  withdrawSchema,
  transferSchema,
  calculateInterestSchema,
  freezeAccountSchema,
} from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);

/**
 * Static segments are declared before the `:accountNumber` catch-all,
 * otherwise Express reads "/all" as an account number.
 *
 * `requireAnyPermission(…:own, …:any)` is the coarse gate: "may this role touch
 * accounts at all". The fine-grained "is this *your* account" question is
 * answered in the controller by `loadAccountForUser`, which distinguishes the
 * two. Both are needed -- a permission check alone let any logged-in user read
 * any account number, which is the bug this split was written to prevent.
 *
 * Every money-moving route carries a body schema. They were previously
 * unvalidated, which is how `POST /accounts/deposit` came to accept
 * `{ "amount": -5000 }` and *subtract* from the balance while writing a DEPOSIT
 * row for the absolute value. The schema is the first line of defence; the
 * service re-checks, because a service is callable from the scheduler and from
 * other services as well as from HTTP.
 *
 * `/my-accounts` is the one route gated by authentication alone. It reads the
 * customer record out of the caller's own session and can only ever return that
 * customer's accounts, so a permission gate would add a second answer to a
 * question the ownership check already answers. Staff have no Customer record and
 * get an empty list — which is why the client's all-accounts page branches on
 * `isStaff` and calls `/all` instead.
 */
router.get('/my-accounts', asyncHandler(getMyAccounts));
router.get(
  '/all',
  requirePermission('account:read:any'),
  validateQuery(accountsQuerySchema),
  asyncHandler(getAllAccountsController)
);
/*
 * Open an account.
 *
 * Two callers, one route:
 *   - a customer, opening their own (`account:open`), optionally with an opening
 *     deposit out of money they already hold;
 *   - a teller or manager, opening one at the counter for a named customer
 *     (`account:open:any`), which must start at zero balance.
 *
 * `requireAnyPermission`, because requiring both would lock out everyone —
 * including admin, who holds both.
 */
router.post(
  '/',
  requireAnyPermission('account:open', 'account:open:any'),
  validateBody(openAccountSchema),
  asyncHandler(createAccount)
);
router.post(
  '/deposit',
  requirePermission('account:deposit'),
  validateBody(depositSchema),
  asyncHandler(deposit)
);
router.post(
  '/withdraw',
  requirePermission('account:withdraw'),
  validateBody(withdrawSchema),
  asyncHandler(withdraw)
);
router.post(
  '/transfer',
  requireAnyPermission('account:transfer:own', 'account:transfer:any'),
  validateBody(transferSchema),
  asyncHandler(transfer)
);
router.post(
  '/calculate-interest',
  requireAnyPermission('account:read:own', 'account:read:any'),
  validateBody(calculateInterestSchema),
  asyncHandler(calculateInterest)
);
router.post(
  '/apply-interest',
  requirePermission('account:interest:apply'),
  validateBody(calculateInterestSchema),
  asyncHandler(applyInterest)
);

router.get(
  '/:accountNumber',
  requireAnyPermission('account:read:own', 'account:read:any'),
  validateParams(accountNumberParamSchema),
  asyncHandler(getAccount)
);
router.get(
  '/:accountNumber/balance',
  requireAnyPermission('account:read:own', 'account:read:any'),
  validateParams(accountNumberParamSchema),
  asyncHandler(checkBalance)
);
router.delete(
  '/:accountNumber',
  requireAnyPermission('account:close:own', 'account:close:any'),
  validateParams(accountNumberParamSchema),
  asyncHandler(closeAccountController)
);

/*
 * Freeze / unfreeze — `account:freeze:any`, manager and admin only.
 *
 * No `:own` form on purpose. A customer cannot be trusted to place a hold on
 * their own account and then lift it; a "freeze" a customer controls is a
 * self-service lock, which is a different feature with a different name. The
 * grant previously existed with no route behind it, so nothing enforced it and
 * nothing used it.
 */
router.post(
  '/:accountNumber/freeze',
  requirePermission('account:freeze:any'),
  validateParams(accountNumberParamSchema),
  validateBody(freezeAccountSchema),
  asyncHandler(setAccountFrozenController)
);

export default router;