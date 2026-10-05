import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  permissionsForRole,
  roleHasPermission,
  isStaffRole,
  type Role,
} from '../config/permissions';

/**
 * The RBAC matrix, asserted.
 *
 * These are pure-logic tests over the permission table, with no database and no
 * server, so they run in the same second as everything else in `npm test`. They
 * exist because the matrix is a document that six roles and ~60 routes depend on,
 * and every way it can be wrong is silent:
 *
 *   - a grant that leaks (auditor holding a money-moving permission, which it
 *     did: `deposit:mature`);
 *   - a capability nobody holds, which locks a feature for everyone while the
 *     matrix reads as though it works (three `:any` permissions were in exactly
 *     that state);
 *   - an `own`/`any` pair broken in one direction, so a page opens for one role
 *     and 403s for another for no visible reason;
 *   - a role with no path to the feature it is named for.
 *
 * The live behaviour — does a BLR001 teller actually see four accounts and not
 * twelve — cannot be asserted here and is covered by the API sweep instead. This
 * file locks the *table*; that one locks the *effect*.
 */

describe('role table integrity', () => {
  it('has a label for every role', () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role], `no label for ${role}`).toBeTruthy();
    }
  });

  it('grants every role at least one permission', () => {
    // A role with an empty set is indistinguishable from a typo'd role name at
    // runtime: every request 403s and nothing says why.
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role].length, `${role} holds nothing`).toBeGreaterThan(0);
    }
  });

  it('grants admin exactly the full permission list', () => {
    expect(new Set(ROLE_PERMISSIONS.admin)).toEqual(new Set(PERMISSIONS));
  });

  it('declares no permission outside the master list', () => {
    for (const role of ROLES) {
      for (const held of ROLE_PERMISSIONS[role]) {
        expect(
          (PERMISSIONS as readonly string[]).includes(held),
          `${role} holds undeclared permission ${held}`
        ).toBe(true);
      }
    }
  });

  it('grants no permission twice to the same role', () => {
    for (const role of ROLES) {
      const held = ROLE_PERMISSIONS[role];
      expect(new Set(held).size, `${role} has a duplicate grant`).toBe(held.length);
    }
  });

  it('returns an empty list for an unknown role rather than everything', () => {
    // The failure this prevents: a typo'd or unmapped role silently inheriting
    // a broad set because the lookup fell through to a permissive default.
    expect(permissionsForRole('superuser')).toEqual([]);
    expect(permissionsForRole(undefined)).toEqual([]);
    expect(roleHasPermission('superuser', 'user:manage')).toBe(false);
  });
});

describe('customer role', () => {
  const held = (p: string) => roleHasPermission('customer', p as never);

  it('can act on its own records', () => {
    for (const p of [
      'account:read:own', 'account:open', 'account:transfer:own',
      'card:read:own', 'card:issue:own',
      'beneficiary:manage:own', 'payment:send:own', 'payment:reverse:own',
      'loan:apply:own', 'loan:repay:own', 'deposit:open:own',
      'instruction:manage:own', 'kyc:submit:own', 'statement:generate:own',
    ]) {
      expect(held(p), `customer should hold ${p}`).toBe(true);
    }
  });

  it('holds no :any permission at all', () => {
    // The single most important assertion in this file. Every `:any` grant is
    // "somebody else's data", and a customer holding one is a cross-tenant read
    // waiting to happen.
    const anyHeld = ROLE_PERMISSIONS.customer.filter((p) => p.endsWith(':any'));
    expect(anyHeld, `customer holds ${anyHeld.join(', ')}`).toEqual([]);
  });

  it('cannot mint money by crediting its own account', () => {
    // `payment:receive:own` used to be granted here, which let any signed-in
    // customer POST an arbitrary credit with nothing to verify it against.
    expect(held('payment:receive:any')).toBe(false);
    expect(held('payment:receive:own')).toBe(false);
  });

  it('holds no staff or back-office permission', () => {
    for (const p of [
      'kyc:review', 'loan:approve', 'loan:disburse', 'user:manage',
      'audit:read:any', 'customer:read:any', 'branch:read:any',
      'deposit:mature', 'account:freeze:any',
    ]) {
      expect(held(p), `customer must not hold ${p}`).toBe(false);
    }
  });
});

describe('auditor role', () => {
  it('is read-only: no permission that can move money or change state', () => {
    // The auditor description says "read-only by construction -- no write
    // permission is granted". It was not true: `deposit:mature` pays matured
    // deposits out, and the auditor held it.
    const forbidden = [
      'account:deposit', 'account:withdraw', 'account:transfer:any',
      'account:freeze:any', 'account:close:any', 'account:interest:apply',
      'payment:receive:any', 'card:issue:any', 'card:freeze:any',
      'card:cancel:any', 'loan:approve', 'loan:disburse', 'loan:apply:any',
      'deposit:mature', 'deposit:close:any', 'deposit:open:own',
      'kyc:review', 'customer:update:any', 'user:manage',
    ];
    for (const p of forbidden) {
      expect(
        roleHasPermission('auditor', p as never),
        `auditor must not hold ${p}`
      ).toBe(false);
    }
  });

  it('can read the audit trail and the books', () => {
    for (const p of [
      'audit:read:any', 'transaction:read:any', 'account:read:any',
      'loan:read:any', 'statement:read:any', 'customer:read:any',
    ]) {
      expect(roleHasPermission('auditor', p as never), `auditor should hold ${p}`).toBe(true);
    }
  });
});

describe('separation of duties', () => {
  it('separates loan approval from disbursement', () => {
    // Releasing money is the step that must not be taken alone. The loan officer
    // originates and approves — that is the role's purpose — but must not pay
    // out, or one compromised credential could do all three with no second pair
    // of eyes. The matrix granted both for a while, which made the documented
    // two-role split decorative.
    expect(roleHasPermission('loan_officer', 'loan:approve')).toBe(true);
    expect(roleHasPermission('loan_officer', 'loan:disburse')).toBe(false);

    for (const role of ['teller', 'auditor', 'customer'] as Role[]) {
      expect(roleHasPermission(role, 'loan:approve'), `${role} can approve`).toBe(false);
      expect(roleHasPermission(role, 'loan:disburse'), `${role} can disburse`).toBe(false);
    }
    // Manager approves but must not release money alone; that capability sits
    // with HQ (admin holds the full permission set, including disburse).
    expect(roleHasPermission('manager', 'loan:approve')).toBe(true);
    expect(roleHasPermission('manager', 'loan:disburse')).toBe(false);
    expect(roleHasPermission('admin', 'loan:disburse')).toBe(true);
  });

  it('a teller cannot freeze, cancel or re-limit a card', () => {
    // A teller can issue and freeze at the counter, but not change the terms of
    // an instrument. Deliberate, and it is the kind of asymmetry that decays
    // silently, so it is asserted.
    expect(roleHasPermission('teller', 'card:issue:any')).toBe(true);
    expect(roleHasPermission('teller', 'card:freeze:any')).toBe(true);
    expect(roleHasPermission('teller', 'card:cancel:any')).toBe(false);
    expect(roleHasPermission('teller', 'card:limits:any')).toBe(false);
    expect(roleHasPermission('teller', 'account:freeze:any')).toBe(false);
  });

  it('only manager and admin hold user:manage', () => {
    const holders = ROLES.filter((r) => roleHasPermission(r, 'user:manage'));
    expect(holders).toEqual(['admin']);
  });

  it('only manager and admin can sign off KYC', () => {
    const holders = ROLES.filter((r) => roleHasPermission(r, 'kyc:review'));
    expect(holders.sort()).toEqual(['admin', 'manager']);
  });

  it('a customer cannot read the audit log of the bank', () => {
    expect(roleHasPermission('customer', 'audit:read:any')).toBe(false);
    // ...but can see where their own sessions came from.
    expect(roleHasPermission('customer', 'audit:read:own')).toBe(true);
  });
});

describe('staff scope', () => {
  it('treats every non-customer role as staff', () => {
    expect(isStaffRole('customer')).toBe(false);
    for (const role of ['teller', 'loan_officer', 'manager', 'auditor', 'admin'] as Role[]) {
      expect(isStaffRole(role), `${role} should be staff`).toBe(true);
    }
    expect(isStaffRole(undefined)).toBe(false);
  });

  it('gives every staff role a way to look up customers', () => {
    // Counter staff cannot serve anyone they cannot find.
    for (const role of ['teller', 'loan_officer', 'manager', 'auditor', 'admin'] as Role[]) {
      expect(
        roleHasPermission(role, 'customer:read:any'),
        `${role} cannot search the customer book`
      ).toBe(true);
    }
  });
});
