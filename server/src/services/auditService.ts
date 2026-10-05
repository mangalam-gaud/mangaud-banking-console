import { AuditLog } from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

/** Keys that must never reach the audit collection, even if passed in metadata. */
const REDACTED_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'pin',
  'cvv',
  'otp',
  'secret',
]);

const scrub = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : scrub(val, depth + 1);
    }
    return out;
  }
  return value;
};

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string;
  status?: 'SUCCESS' | 'FAILURE';
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record an entry in the immutable audit trail.
 *
 * Always resolves — a logging failure must never break the request that
 * triggered it. Failures are surfaced through the application log instead.
 */
export const recordAudit = async (req: AuthRequest, input: AuditInput): Promise<void> => {
  try {
    const actorId = req.user?._id;
    await AuditLog.create({
      actorId,
      actorEmail: req.user?.email?.toLowerCase(),
      actorRole: req.user?.role,
      action: input.action.toUpperCase(),
      entity: input.entity.toLowerCase(),
      entityId: input.entityId,
      status: input.status || 'SUCCESS',
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 250),
      metadata: input.metadata ? (scrub(input.metadata) as Record<string, unknown>) : undefined,
      message: input.message,
    });
  } catch (error) {
    logger.error('Failed to write audit log entry:', {
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/** Record a failed authentication attempt, where there may be no `req.user`. */
export const recordAuthFailure = async (
  req: AuthRequest,
  email: string,
  reason: string
): Promise<void> => {
  try {
    await AuditLog.create({
      actorEmail: email.toLowerCase(),
      actorRole: 'unknown',
      action: 'LOGIN_FAILED',
      entity: 'auth',
      status: 'FAILURE',
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 250),
      message: reason,
    });
  } catch (error) {
    logger.error('Failed to write auth audit entry:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getAuditLog = async (
  options: {
    page?: number;
    limit?: number;
    actorId?: string;
    entity?: string;
    action?: string;
    status?: string;
    fromDate?: Date;
    toDate?: Date;
  } = {}
): Promise<{ entries: any[]; total: number; totalPages: number }> => {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));

  const query: Record<string, unknown> = {};
  if (options.actorId) query.actorId = options.actorId;
  if (options.entity) query.entity = options.entity;
  if (options.action) query.action = options.action.toUpperCase();
  if (options.status) query.status = options.status;
  if (options.fromDate || options.toDate) {
    query.createdAt = {
      ...(options.fromDate ? { $gte: options.fromDate } : {}),
      ...(options.toDate ? { $lte: options.toDate } : {}),
    };
  }

  const [entries, total] = await Promise.all([
    AuditLog.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(query),
  ]);

  return { entries, total, totalPages: Math.ceil(total / limit) };
};

/** Distinct action names, for populating the admin filter dropdown. */
export const getAuditActions = async (): Promise<string[]> =>
  AuditLog.distinct('action');

export default { recordAudit, recordAuthFailure, getAuditLog, getAuditActions };
