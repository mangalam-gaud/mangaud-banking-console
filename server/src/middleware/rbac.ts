import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Permission, permissionsForRole, isStaffRole } from '../config/permissions';
import { ForbiddenError, UnauthorizedError } from './errorHandler';

/**
 * Gates a route on one or more permissions that must *all* be held.
 *
 * `requirePermission('kyc:review')` states the thing being protected, so a
 * route's requirement is readable from its own definition and two roles can
 * share a capability without duplicating the check.
 *
 * For an `own`/`any` pair use `requireAnyPermission` instead. Passing both to
 * `requirePermission` means "the user must hold both", which is almost never
 * what was meant and silently locks everyone out.
 */
export const requirePermission = (...required: Permission[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    const held = permissionsForRole(req.user.role);
    const missing = required.filter((permission) => !held.includes(permission));

    if (missing.length > 0) {
      // The message names the missing permission rather than the role, so a
      // user reporting "I can't do X" points straight at the cause.
      next(
        new ForbiddenError(
          `Your role (${req.user.role}) is not allowed to ${describe(missing[0])}`
        )
      );
      return;
    }

    next();
  };
};

/**
 * Gates a route on holding *at least one* of the given permissions.
 *
 * This is the right gate for the pervasive `own` / `any` split: a customer has
 * `account:read:own` and a manager has `account:read:any`, and both must be
 * able to open an account page -- they just see a different set of accounts.
 * The fine-grained decision about *which* accounts is made in the controller.
 *
 * An empty list means "no permission required", matching `requirePermission`.
 * The previous version treated it as a denial, and then crashed on the way to
 * building the error message: `[].some()` is false, so it called
 * `describe(undefined)`, which did `permission.split(':')` on undefined and threw
 * a TypeError -- a 500 rather than the 403 it was trying to produce. Only
 * reachable today by spreading a variable into the call, which is exactly the
 * mistake that would reach it first.
 */
export const requireAnyPermission = (...anyOf: Permission[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (anyOf.length === 0) {
      next();
      return;
    }

    const held = permissionsForRole(req.user.role);
    if (!anyOf.some((permission) => held.includes(permission))) {
      next(
        new ForbiddenError(
          `Your role (${req.user.role}) is not allowed to ${describe(anyOf[0])}`
        )
      );
      return;
    }

    next();
  };
};

/** Turn `loan:approve` into "approve loans", for error messages. */
export const requireStaff = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }
  if (!isStaffRole(req.user.role)) {
    next(new ForbiddenError('This area is for bank staff only'));
    return;
  }
  next();
};

/** Turn `loan:approve` into "approve loans", for error messages. */
const describe = (permission: Permission): string => {
  const [resource, action, scope] = permission.split(':');
  const what: Record<string, string> = {
    read: `view ${resource}s`,
    write: `change ${resource}s`,
    create: `create ${resource}s`,
    open: `open ${resource}s`,
    close: `close ${resource}s`,
    freeze: `freeze ${resource}s`,
    cancel: `cancel ${resource}s`,
    deposit: 'process deposits',
    withdraw: 'process withdrawals',
    transfer: 'transfer funds',
    send: 'send payments',
    receive: 'record incoming payments',
    reverse: 'reverse payments',
    preview: 'preview payments',
    apply: `apply for ${resource}s`,
    approve: `approve ${resource}s`,
    disburse: `disburse ${resource}s`,
    repay: `make ${resource} repayments`,
    issue: `issue ${resource}s`,
    manage: `manage ${resource}s`,
    submit: `submit ${resource}`,
    review: `review ${resource}s`,
    generate: `generate ${resource}s`,
    update: `update ${resource}s`,
    reveal: `reveal full ${resource} numbers`,
    limits: `change ${resource} limits`,
  };

  const phrase = what[action] ?? `${action} ${resource}s`;
  return scope === 'own' ? `${phrase} you own` : scope === 'any' ? `${phrase} for any customer` : phrase;
};

export type { Request };
