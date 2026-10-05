import { Router } from 'express';
import {
  getTransactions,
  getTransactionById,
  getMiniStatement,
  getAccountTransactionSummary,
  getTransactionStats,
} from '../services/transactionService';
import { authenticate } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/rbac';
import { validateParams, validateQuery } from '../middleware/validation';
import {
  statementQuerySchema,
  transactionIdParamSchema,
  accountNumberParamSchema,
} from '../validators/schemas';
import { asyncHandler } from '../middleware/errorHandler';
import { IApiResponse } from '@shared/types';

const router = Router();

router.use(authenticate);

/**
 * Every route here is a *query* over the ledger rather than a single resource,
 * so the tenant boundary lives in the service (`visibleAccountIds`) rather than
 * in a per-resource ownership check. The route gates only decide whether the
 * caller may read the ledger at all.
 *
 * Handlers are typed as `AuthRequest` because the scoping needs `req.user`, and
 * an inline `Request` does not carry it. `authenticate` above has already
 * guaranteed it is set.
 */
router.get(
  '/',
  requireAnyPermission('transaction:read:own', 'transaction:read:any'),
  validateQuery(statementQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await getTransactions(req.query as any, (req as AuthRequest).user!);
    const response: IApiResponse = {
      success: true,
      // Wrapped in `{ transactions }` to match the shape declared on
      // `ApiResponse` in shared/types and read by api.getTransactions() in the
      // client. Returning a bare array made the client read `.transactions` off
      // an array and always come up undefined.
      data: { transactions: result.transactions },
      meta: {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 10,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
    res.json(response);
  })
);

// Bank-wide aggregates are an `transaction:read:any` capability.
router.get(
  '/stats',
  requirePermission('transaction:read:any'),
  asyncHandler(async (req, res) => {
    const stats = await getTransactionStats();
    const response: IApiResponse = {
      success: true,
      data: stats,
    };
    res.json(response);
  })
);

router.get(
  '/statement/:accountNumber',
  requireAnyPermission('transaction:read:own', 'transaction:read:any'),
  validateParams(accountNumberParamSchema),
  asyncHandler(async (req, res) => {
    const transactions = await getMiniStatement(
      req.params.accountNumber,
      10,
      (req as AuthRequest).user!
    );
    const response: IApiResponse = {
      success: true,
      data: { transactions },
    };
    res.json(response);
  })
);

router.get(
  '/summary/:accountId',
  requireAnyPermission('transaction:read:own', 'transaction:read:any'),
  asyncHandler(async (req, res) => {
    const summary = await getAccountTransactionSummary(
      req.params.accountId,
      (req as AuthRequest).user!
    );
    const response: IApiResponse = {
      success: true,
      data: summary,
    };
    res.json(response);
  })
);

router.get(
  '/:transactionId',
  requireAnyPermission('transaction:read:own', 'transaction:read:any'),
  validateParams(transactionIdParamSchema),
  asyncHandler(async (req, res) => {
    const transaction = await getTransactionById(
      req.params.transactionId,
      (req as AuthRequest).user!
    );
    if (!transaction) {
      const response: IApiResponse = {
        success: false,
        error: 'Transaction not found',
      };
      res.status(404).json(response);
      return;
    }
    const response: IApiResponse = {
      success: true,
      data: { transaction },
    };
    res.json(response);
  })
);

export default router;
