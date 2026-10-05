import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { IApiResponse } from '@shared/types';
import * as notificationService from '../services/notificationService';
import * as statementService from '../services/statementService';
import * as auditService from '../services/auditService';
import { getCustomerForUser, resolveTargetCustomer } from '../utils/ownership';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';
import { isStaffRole } from '../config/permissions';

export const listNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = 1, limit = 20, category, unreadOnly } = req.query;

  const result = await notificationService.getNotifications(req.user!._id.toString(), {
    page: parseInt(page as string, 10),
    limit: parseInt(limit as string, 10),
    category: category as string,
    unreadOnly: unreadOnly === 'true',
  });

  const response: IApiResponse = {
    success: true,
    data: { notifications: result.notifications },
    meta: {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      total: result.total,
      totalPages: result.totalPages,
      unreadCount: result.unreadCount,
    },
  };
  res.json(response);
};

export const unreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
  const count = await notificationService.getUnreadCount(req.user!._id.toString());
  const response: IApiResponse = { success: true, data: { count } };
  res.json(response);
};

export const markRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const notification = await notificationService.markRead(
    req.user!._id.toString(),
    req.params.notificationId
  );
  const count = await notificationService.getUnreadCount(req.user!._id.toString());

  const response: IApiResponse = { success: true, data: { notification, unreadCount: count } };
  res.json(response);
};

export const markAllRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await notificationService.markAllRead(req.user!._id.toString());
  const response: IApiResponse = { success: true, data: { ...result, unreadCount: 0 } };
  res.json(response);
};

export const removeNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  await notificationService.removeNotification(
    req.user!._id.toString(),
    req.params.notificationId
  );
  const response: IApiResponse = { success: true, message: 'Notification removed' };
  res.json(response);
};

export const clearRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await notificationService.clearRead(req.user!._id.toString());
  const response: IApiResponse = { success: true, data: result };
  res.json(response);
};

// ------------------------------------------------------------------ statements
//
// These four handlers are the ones every staff role was being 403'd on.
//
// `listStatements`/`generateStatement` used `getCustomerFromRequest`, which
// throws for anyone without a Customer record -- and staff have none. Yet the
// matrix grants `statement:read:any` / `statement:generate:any` to teller,
// manager, auditor and admin, the sidebar linked them, and the route guard
// admitted them. So every staff user had a Statements entry that could only
// fail. `resolveTargetCustomer` takes the customer from `?customerId=` for
// staff, which makes the `:any` permissions real; `getStatement` and the CSV
// download read the owner off the statement itself, since the id already
// identifies it.

export const listStatements = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await resolveTargetCustomer(req, req.query.customerId as string | undefined);
  const { page = 1, limit = 20, accountId } = req.query;

  const result = await statementService.getStatements(customer._id.toString(), {
    page: parseInt(page as string, 10),
    limit: parseInt(limit as string, 10),
    accountId: accountId as string,
  });

  const response: IApiResponse = {
    success: true,
    data: { statements: result.statements },
    meta: {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      total: result.total,
      totalPages: result.totalPages,
    },
  };
  res.json(response);
};

export const generateStatement = async (req: AuthRequest, res: Response): Promise<void> => {
  const customer = await resolveTargetCustomer(req, req.body.customerId);
  const { accountId, fromDate, toDate } = req.body;

  if (!accountId || !fromDate || !toDate) {
    throw new ValidationError('Account, start date and end date are all required');
  }

  const { statement, rows } = await statementService.generateStatement(
    customer._id.toString(),
    req.user!._id.toString(),
    accountId,
    new Date(fromDate),
    new Date(toDate)
  );

  await auditService.recordAudit(req, {
    action: 'STATEMENT_GENERATED',
    entity: 'statement',
    entityId: statement.statementNumber,
    message: `Statement for ${statement.periodLabel}`,
  });

  const response: IApiResponse = {
    success: true,
    message: 'Statement generated',
    data: { statement, rows },
  };
  res.status(201).json(response);
};

/**
 * Read or download one statement.
 *
 * The statement id identifies its owner, so this resolves the customer from the
 * document rather than from the caller. A customer still only ever sees their
 * own (the service compares `statement.customerId`), while staff holding
 * `statement:read:any` can fetch any by id.
 */
const resolveStatementCustomer = async (
  req: AuthRequest,
  statementId: string
): Promise<string> => {
  const statement = await statementService.getStatementSummary(statementId);
  if (!statement) {
    throw new NotFoundError('Statement');
  }

  if (!isStaffRole(req.user!.role)) {
    const own = await getCustomerForUser(req.user!._id.toString());
    return own._id.toString();
  }

  return statement.customerId;
};

export const getStatement = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await resolveStatementCustomer(req, req.params.statementId);
  const result = await statementService.getStatementById(
    req.params.statementId,
    customerId
  );

  const response: IApiResponse = { success: true, data: result };
  res.json(response);
};

/** CSV download. Sent as a file rather than JSON so the browser saves it. */
export const downloadStatementCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  const customerId = await resolveStatementCustomer(req, req.params.statementId);
  const { statement, rows } = await statementService.getStatementById(
    req.params.statementId,
    customerId
  );

  const csv = statementService.statementToCsv(statement, rows);
  const filename = `${statement.accountNumber}-${statement.statementNumber}.csv`;

  await auditService.recordAudit(req, {
    action: 'STATEMENT_DOWNLOADED',
    entity: 'statement',
    entityId: statement.statementNumber,
    message: `Downloaded statement ${statement.statementNumber}`,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${csv}`);
};
