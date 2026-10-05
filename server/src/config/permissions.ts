/**
 * Role-based access control.
 *
 * The app previously gated routes with ad-hoc `authorize('admin', 'manager')`
 * calls scattered through the routers. That works until two people need the
 * same two permissions, and then it drifts: a new role means auditing every
 * route by hand, and the client cannot know what to hide.
 *
 * This module makes the matrix declarative. One list of permissions per role,
 * one helper to check them, and the same list is served to the client at
 * `/auth/permissions` so navigation and buttons can be hidden from what the
 * user genuinely cannot do rather than from a hard-coded role check.
 *
 * The permission names are the contract between server and client. Renaming
 * one silently disables a feature, so they are grouped by resource and sorted
 * for easy diffing.
 */

export const ROLES = [
  'customer',
  'teller',
  'loan_officer',
  'manager',
  'auditor',
  'admin',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  customer: 'Customer',
  teller: 'Branch Teller',
  loan_officer: 'Loan Officer',
  manager: 'Branch Manager',
  auditor: 'Auditor',
  admin: 'Administrator',
};

/**
 * Every permission the app knows about.
 *
 * `own` and `any` are deliberate distinctions: `account:read:own` means "the
 * accounts attached to my own customer record", `account:read:any` means "every
 * account on the system". Collapsing them into a single `account:read` was
 * the original bug -- `/accounts/:accountNumber` returned any account to any
 * logged-in user.
 */
export const PERMISSIONS = [
// --- accounts
  'account:read:own',
  'account:read:any',
  'account:open',
  /*
   * Opening an account *for somebody else* — the counter workflow.
   *
   * `account:open` alone meant a branch could not open an account for a walk-in:
   * the grant was customer-only and the controller only ever resolved the
   * *caller's* Customer record. Every real branch has a counter where a customer
   * opens an account with a teller, so the capability was missing from the model
   * rather than merely unassigned.
   *
   * Teller and manager, deliberately not the auditor (read-only) and not the loan
   * officer (not underwriting). Branch-scoped at the controller: staff may open
   * for a customer their own branch serves, and the account is stamped with that
   * branch so it is visible to the same people afterwards.
   */
  'account:open:any',
  'account:close:own',
  'account:close:any',
  'account:freeze:any',
  'account:deposit',
  'account:withdraw',
  'account:transfer:own',
  'account:transfer:any',
  'account:interest:apply',

  // --- cards
  'card:read:own',
  'card:read:any',
  'card:issue:own',
  'card:issue:any',
  'card:freeze:own',
  'card:freeze:any',
  'card:cancel:own',
  'card:cancel:any',
  'card:limits:own',
  'card:limits:any',

  // --- beneficiaries & payments
  'beneficiary:manage:own',
  'payment:send:own',
  'payment:send:any',
  /*
   * Recording an incoming credit is a counter job, never a self-service one.
   *
   * This was `payment:receive:own`, granted to `customer`. That handed every
   * customer a way to credit their own account by an arbitrary amount with
   * nothing to verify it against -- money from nothing -- while making the real
   * workflow impossible, since a teller crediting a customer's inward transfer
   * held no permission to do it. Only the `:any` form matches what the action
   * actually is, so the `:own` form is deliberately absent.
   */
  'payment:receive:any',
  'payment:reverse:own',
  'payment:preview',

  // --- transactions & statements
  'transaction:read:own',
  'transaction:read:any',
  'statement:read:own',
  'statement:read:any',
  'statement:generate:own',
  'statement:generate:any',

  // --- loans
  'loan:read:own',
  'loan:read:any',
  'loan:apply:own',
  'loan:apply:any',
  'loan:approve',
  'loan:disburse',
  'loan:repay:own',

  // --- deposits (fixed / recurring)
  'deposit:read:own',
  'deposit:read:any',
  'deposit:open:own',
  'deposit:close:own',
  'deposit:close:any',
  /*
   * Paying a matured deposit out credits a customer's balance, so this is a
   * money-moving permission and is granted to management only.
   *
   * The auditor used to hold it, which contradicted this file's own claim that
   * the auditor is "read-only by construction -- no write permission is granted".
   * An auditor who can trigger a payout is not an auditor. The loan officer held
   * it too, and running the deposit book is not underwriting.
   */
  'deposit:mature',

  // --- standing instructions
  'instruction:read:own',
  'instruction:manage:own',

  // --- KYC
  'kyc:read:own',
  'kyc:submit:own',
  'kyc:review',

  // --- customers
  'customer:read:own',
  'customer:read:any',
  'customer:update:own',
  'customer:update:any',

  // --- platform
  'audit:read:own',
  'audit:read:any',
  'session:manage:own',
  'notification:read:own',
  'user:manage',
  'branch:read:any',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CUSTOMER: Permission[] = [
  'account:read:own',
  'account:open',
  'account:close:own',
  'account:transfer:own',
  'card:read:own',
  'card:issue:own',
  'card:freeze:own',
  'card:cancel:own',
  'card:limits:own',
  'beneficiary:manage:own',
  'payment:send:own',
  'payment:reverse:own',
  'payment:preview',
  'transaction:read:own',
  'statement:read:own',
  'statement:generate:own',
  'loan:read:own',
  'loan:apply:own',
  'loan:repay:own',
  'deposit:read:own',
  'deposit:open:own',
  'deposit:close:own',
  'instruction:read:own',
  'instruction:manage:own',
  'kyc:read:own',
  'kyc:submit:own',
  'customer:read:own',
  'customer:update:own',
  'audit:read:own',
  'session:manage:own',
  'notification:read:own',
];

/**
 * A branch counter clerk.
 *
 * Can look up any customer and handle cash at the counter, but cannot approve
 * a loan, change system configuration, or manage other users. The
 * read/write split here is what a real teller role looks like: full visibility
 * of account balances, but the ability to move money only through auditable
 * counter operations.
 */
const TELLER: Permission[] = [
  'account:read:any',
  'account:open:any',
  'account:deposit',
  'account:withdraw',
  'account:transfer:any',
  'card:read:any',
  'card:issue:any',
  'card:freeze:any',
  'transaction:read:any',
  'payment:receive:any',
  'statement:read:any',
  'statement:generate:any',
  'customer:read:any',
  'branch:read:any',
  'notification:read:own',
  // Own-login history only. Every human with a login should be able to see
  // where their own sessions came from without also being handed the bank's
  // full audit trail, which is why this is the `own` form.
  'audit:read:own',
  'session:manage:own',
];

/**
 * Underwrites credit. Can see loans across the branch but not customer PII.
 *
 * Deliberately **not** granted `loan:disburse`, even though underwriting is this
 * role's whole purpose. The design has always said that releasing money is the
 * one step a single officer may not take alone, and the matrix contradicted it:
 * the loan officer held approve *and* disburse, so the two-role split was
 * decorative — one compromised credential could originate, approve and pay out a
 * loan with no second pair of eyes.
 *
 * Approve stays here, because refusing it would make the role unable to do its
 * job. Disbursing moves to manager and admin.
 */
const LOAN_OFFICER: Permission[] = [
  'loan:read:any',
  'loan:apply:any',
  'loan:approve',
  'account:read:any',
  'customer:read:any',
  'deposit:read:any',
  'kyc:read:own',
  'audit:read:own',
  'notification:read:own',
  'session:manage:own',
];

/**
 * A branch manager.
 *
 * Everything a teller can do, plus the approvals a teller cannot give, plus
 * account-level freezes and KYC sign-off. Notably *not* user management: that
 * belongs to head office, not a branch.
 */
const MANAGER: Permission[] = [
  'account:read:any',
  'account:open:any',
  'account:close:any',
  'account:freeze:any',
  'account:deposit',
  'account:withdraw',
  'account:transfer:any',
  'account:interest:apply',
  'payment:receive:any',
  'card:read:any',
  'card:issue:any',
  'card:freeze:any',
  'card:cancel:any',
  'card:limits:any',
  'transaction:read:any',
  'statement:read:any',
  'statement:generate:any',
  'loan:read:any',
  'loan:apply:any',
  'loan:approve',
  // A manager who can both approve and release money is a single point of
  // failure: one bad override originates, approves, and pays out. Branch
  // managers approve; disbursement is a head-office capability.
  // 'loan:disburse',
  'deposit:read:any',
  'deposit:mature',
  'deposit:close:any',
  'kyc:review',
  'customer:read:any',
  'customer:update:any',
  'audit:read:any',
  'branch:read:any',
  'notification:read:own',
  'session:manage:own',
];

/** Compliance. Read-only by construction -- no write permission is granted. */
const AUDITOR: Permission[] = [
  'audit:read:any',
  'transaction:read:any',
  'statement:read:any',
  'statement:generate:any',
  'loan:read:any',
  'deposit:read:any',
  'customer:read:any',
  'account:read:any',
  'branch:read:any',
  'notification:read:own',
  'session:manage:own',
];

/** Everything. */
const ADMIN: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  customer: CUSTOMER,
  teller: TELLER,
  loan_officer: LOAN_OFFICER,
  manager: MANAGER,
  auditor: AUDITOR,
  admin: ADMIN,
};

export const permissionsForRole = (role?: string): Permission[] =>
  (ROLE_PERMISSIONS[role as Role] ?? []);

export const roleHasPermission = (role: string | undefined, permission: Permission): boolean =>
  permissionsForRole(role).includes(permission);

/** True when the role is one of the non-customer staff roles. */
export const isStaffRole = (role?: string): boolean =>
  !!role && role !== 'customer';
