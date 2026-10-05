import { Response } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { AuthRequest } from '../middleware/auth';
import { IApiResponse } from '@shared/types';
import * as auditService from '../services/auditService';
import { RefreshToken } from '../models';

export const listAuditLog = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = 1, limit = 50, entity, action, status, fromDate, toDate, actorId } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  const result = await auditService.getAuditLog({
    page: pageNum,
    limit: limitNum,
    entity: entity as string,
    action: action as string,
    status: status as string,
    actorId: actorId as string,
    fromDate: fromDate ? new Date(fromDate as string) : undefined,
    toDate: toDate ? new Date(toDate as string) : undefined,
  });

  const response: IApiResponse = {
    success: true,
    // Alias `_id` to `id`, as every other list endpoint does. Without it the
    // client's `key={entry.id}` was `key={undefined}`, which made React warn
    // about a missing key on every row.
    data: {
      entries: result.entries.map((entry: any) => ({
        ...entry,
        id: String(entry._id),
      })),
    },
    meta: { page: pageNum, limit: limitNum, total: result.total, totalPages: result.totalPages },
  };
  res.json(response);
};

export const listActions = async (req: AuthRequest, res: Response): Promise<void> => {
  const actions = await auditService.getAuditActions();
  const response: IApiResponse = { success: true, data: { actions } };
  res.json(response);
};

/**
 * The signed-in user's own security history.
 *
 * Deliberately excludes the `ip`/`userAgent` fields and any metadata that
 * another customer's data could be inferred from -- a customer sees what they
 * did, not the full system log.
 */
export const mySecurityLog = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = 1, limit = 25 } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  const result = await auditService.getAuditLog({
    actorId: req.user!._id.toString(),
    page: pageNum,
    limit: limitNum,
  });

  const entries = result.entries.map((entry: any) => ({
    id: String(entry._id),
    action: entry.action,
    entity: entry.entity,
    // The customer's own reference (a payment reference, a statement number)
    // is not sensitive, and without it the history cannot be tied back to
    // anything they can see.
    entityId: entry.entityId,
    status: entry.status,
    message: entry.message,
    createdAt: entry.createdAt,
  }));

  const response: IApiResponse = {
    success: true,
    data: { entries },
    meta: { page: pageNum, limit: limitNum, total: result.total, totalPages: result.totalPages },
  };
  res.json(response);
};

/** Active sessions, i.e. refresh tokens that have not yet expired. */
export const activeSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  // The current session is identified by the `sid` claim in the access token,
  // not by comparing tokens: `req.token` is the access token while the stored
  // rows hold refresh tokens, so those can never be equal.
  let currentSid: string | undefined;
  if (req.token) {
    try {
      currentSid = (jwt.verify(req.token, config.jwt.accessSecret) as { sid?: string }).sid;
    } catch {
      currentSid = undefined;
    }
  }

  const sessions = await RefreshToken.find({ userId: req.user!._id })
    .select('token createdAt expiresAt')
    .sort({ createdAt: -1 })
    .lean<any[]>();

  const response: IApiResponse = {
    success: true,
    data: {
      sessions: sessions.map((s) => ({
        id: String(s._id),
        // `fingerprint` is also the only part of the token ever exposed.
        // Show only a fingerprint -- never enough to replay the token.
        fingerprint: String(s.token).slice(0, 8),
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        current: !!currentSid && String(s._id) === currentSid,
      })),
    },
  };
  res.json(response);
};

export const revokeSession = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await RefreshToken.deleteOne({
    _id: req.params.sessionId,
    userId: req.user!._id,
  });

  if (!result.deletedCount) {
    const response: IApiResponse = { success: false, error: 'Session not found' };
    res.status(404).json(response);
    return;
  }

  await auditService.recordAudit(req, {
    action: 'SESSION_REVOKED',
    entity: 'session',
    entityId: req.params.sessionId,
    message: 'Signed out a device',
  });

  const response: IApiResponse = { success: true, message: 'Session revoked' };
  res.json(response);
};

/** Sign out everywhere: drop every refresh token for this user. */
export const revokeAllSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await RefreshToken.deleteMany({ userId: req.user!._id });

  await auditService.recordAudit(req, {
    action: 'ALL_SESSIONS_REVOKED',
    entity: 'session',
    message: `Signed out of ${result.deletedCount || 0} device(s)`,
  });

  const response: IApiResponse = {
    success: true,
    message: 'Signed out of all devices',
    data: { revoked: result.deletedCount || 0 },
  };
  res.json(response);
};
