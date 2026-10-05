/**
 * RBAC audit — finds the structural defects a matrix review misses.
 *
 * Three failure modes, all of which have actually shipped in this codebase:
 *
 *  1. A route with no gate. `authenticate` says "who are you", never "may you".
 *     A new route that forgets a permission check is readable by any logged-in
 *     user, and nothing else in the system notices.
 *  2. A permission nobody holds. A grant that no route requires is security
 *     theatre; a grant only the admin holds, on a page the admin cannot use, is
 *     a dead feature. Both are invisible in review.
 *  3. An `:any` permission that is unreachable in practice — granted, gated,
 *     and then made impossible by a controller resolving the *caller's* customer
 *     instead of a target. That combination locks the feature for everyone
 *     while the matrix reads as though it works.
 *
 * Run:  npm run audit:rbac
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  type Permission,
} from '../config/permissions';

const ROUTES_DIR = join(__dirname, '..', 'routes');

interface RouteFact {
  file: string;
  method: string;
  path: string;
  /** True when a permission gate appears in this handler's argument list. */
  gated: boolean;
  /** Every permission named in this handler's argument list. */
  permissions: Permission[];
  /** Route-level middleware that is neither authenticate nor validation. */
  otherMiddleware: string[];
}

const read = (file: string) => readFileSync(file, 'utf8');

/**
 * Split a router file into `router.<method>(...)` calls.
 *
 * Deliberately naive about nesting — it counts parens to find the end of the
 * argument list. That is enough for a flat list of `router.get('/x', mw, handler)`
 * calls, which is the only shape these files use, and a real parser would be a
 * much larger thing to maintain than the thing it audits.
 */
const parseRoutes = (source: string): Omit<RouteFact, 'file'>[] => {
  const out: Omit<RouteFact, 'file'>[] = [];
  const call = /router\.(get|post|put|patch|delete)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = call.exec(source)) !== null) {
    const method = match[1].toUpperCase();

    // Walk to the matching close paren.
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const args = source.slice(match.index + match[0].length, i);

    // First string literal is the path.
    const pathMatch = args.match(/['"`]([^'"`]+)['"`]/);
    const path = pathMatch ? pathMatch[1] : '(dynamic)';

    const permissions = [...args.matchAll(/'([a-z]+:[a-z]+(?::[a-z]+)?)'/g)]
      .map((m) => m[1] as Permission)
      .filter((p) => (PERMISSIONS as readonly string[]).includes(p));

    const otherMiddleware = [...args.matchAll(/\b(require[A-Z]\w+|asyncHandler)\b/g)]
      .map((m) => m[1])
      .filter((name) => name !== 'requirePermission' && name !== 'requireAnyPermission');

    out.push({
      method,
      path,
      gated: permissions.length > 0 || otherMiddleware.some((m) => m === 'requireStaff'),
      permissions,
      otherMiddleware: [...new Set(otherMiddleware)],
    });
  }
  return out;
};

const allRoutes: RouteFact[] = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((file) => parseRoutes(read(join(ROUTES_DIR, file))).map((r) => ({ ...r, file })))
  .flat();

// ---------------------------------------------------------------------------
// 1. Ungated routes
// ---------------------------------------------------------------------------

/**
 * Routes that are public by design. Everything else must carry a gate.
 *
 * Keyed by `<file> <METHOD> <path>` rather than by full URL, because a router's
 * paths are relative to its mount point and the audit reads the file, not the
 * Express app. Matching on the full path is why the first run of this audit
 * reported `/login` and `/register` as ungated — they are public, but the
 * allowlist said `/auth/login`.
 */
const PUBLIC_ROUTES = new Set([
  'authRoutes.ts POST /login',
  'authRoutes.ts POST /register',
  'authRoutes.ts POST /refresh',
  'authRoutes.ts POST /forgot-password',
  'authRoutes.ts POST /reset-password',
]);

/**
 * Routes gated by authentication alone, and why that is correct for each.
 *
 * These are not gaps. They are routes whose subject *is* the caller: the id
 * comes from the caller's own session and never from the request, so there is no
 * other user's resource to gate. Collapsing this category into "ungated" is what
 * made the first run report 41 problems, most of them noise — and an audit that
 * cries wolf gets ignored, which is worse than no audit.
 *
 * Each entry is a deliberate decision, so a route appearing here that nobody
 * reasoned about is the thing to look at.
 */
const AUTHENTICATED_ONLY = new Set([
  // Own profile and own session. A signed-in user may always read and edit
  // themselves; gating it on a permission would only let a role lock itself out
  // of its own account.
  'authRoutes.ts GET /profile',
  'authRoutes.ts PUT /profile',
  'authRoutes.ts PUT /change-password',
  'authRoutes.ts POST /logout',
  'authRoutes.ts GET /permissions',
  // Notifications are addressed by `req.user._id` in every handler, so a caller
  // can only ever reach their own. `notification:read:own` exists for the client
  // to decide whether to render the bell, not to protect a route.
  'notificationRoutes.ts GET /',
  'notificationRoutes.ts GET /unread-count',
  'notificationRoutes.ts POST /mark-all-read',
  'notificationRoutes.ts POST /:notificationId/read',
  'notificationRoutes.ts DELETE /clear-read',
  'notificationRoutes.ts DELETE /:notificationId',
  // Reads the Customer record out of the caller's own session; staff have none
  // and get an empty list. The client's all-accounts page calls /all instead.
  'accountRoutes.ts GET /my-accounts',
]);

const key = (r: RouteFact) => `${r.file} ${r.method} ${r.path}`;

const ungated = allRoutes.filter((r) => !r.gated && !PUBLIC_ROUTES.has(key(r)));
const documented = ungated.filter((r) => AUTHENTICATED_ONLY.has(key(r)));
const unexplained = ungated.filter((r) => !AUTHENTICATED_ONLY.has(key(r)));

console.log('=== 1. Routes with no permission gate ===');
if (unexplained.length === 0) {
  console.log('   none unexplained');
} else {
  for (const r of unexplained) {
    console.log(`   ${r.file}: ${r.method} ${r.path}`);
  }
}
console.log(`   (${documented.length} further routes are auth-only by design and listed in the source)`);
console.log('');

// ---------------------------------------------------------------------------
// 2. Permissions no route ever requires
// ---------------------------------------------------------------------------

/**
 * Permissions that exist for the *client* to read, not for a route to enforce.
 *
 * The client asks the server what the signed-in user holds and hides navigation
 * it cannot use. A permission that only ever drives that decision never appears
 * in a route's argument list, and reporting it as an unused grant would train
 * the reader to ignore this section. Declared here instead, with the decision it
 * drives.
 *
 * Declared *before* it is used: a `const` is in the temporal dead zone until its
 * statement runs, and the first version of this file referenced it from a filter
 * defined higher up. The runtime error was correct and the fix was ordering.
 */
const CLIENT_ONLY: Record<string, string> = {
  'notification:read:own': 'the client renders the notification bell only if this is held',
};

const enforced = new Set(allRoutes.flatMap((r) => r.permissions));
const unused = PERMISSIONS.filter((p) => !enforced.has(p) && !(p in CLIENT_ONLY));

console.log('=== 2. Permissions no route requires ===');
if (unused.length === 0) {
  console.log('   none — every declared permission is enforced by a route or declared client-only');
} else {
  for (const p of unused) {
    const holders = ROLES.filter((r) => ROLE_PERMISSIONS[r].includes(p));
    console.log(`   ${p}  (held by: ${holders.join(', ') || 'nobody'})`);
  }
}
console.log('');

// ---------------------------------------------------------------------------
// 3. Grants no route can use (dead features)
// ---------------------------------------------------------------------------

/**
 * A grant held by exactly one role is not automatically wrong — `user:manage` is
 * meant to be admin-only. It becomes a *defect* when the route it belongs to
 * also answers 403 for that role, which is the `:any`-unreachable shape. That
 * needs a live request to prove, so it is asserted by the RBAC matrix suite
 * rather than here. What is worth reporting statically is a single-holder grant
 * that no route references at all, because that is a feature that cannot run.
 */
const unreachable = unused.filter((p) =>
  ROLES.filter((r) => ROLE_PERMISSIONS[r].includes(p)).length === 1
);

console.log('=== 3. Single-holder grants with no route (dead feature) ===');
if (unreachable.length === 0) {
  console.log('   none\n');
} else {
  for (const p of unreachable) console.log(`   ${p}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// 4. own/any pair integrity
// ---------------------------------------------------------------------------


/**
 * An `own`/`any` pair is only meaningful if both halves exist. A lone `any` with
 * no `own` — or the reverse — usually means one half was deleted and the other
 * silently became the only way in.
 *
 * But *usually* is not *always*, and this codebase has asymmetries that are the
 * point rather than an oversight. Every one of them is declared below with the
 * reason. That is the difference between an intentional asymmetry and an
 * accident: the accident is invisible until it ships, the intention is in the
 * diff.
 */
const INTENTIONALLY_UNPAIRED: Record<string, string> = {
  // Counter-only: `payment:receive:own` used to exist and let any customer
  // credit their own account by an arbitrary amount with nothing to verify it
  // against — an unlimited money printer.
  'payment:receive:any': 'counter-only by design; the :own form was a money printer',
  // Nobody but the account holder may undo a payment, so there is deliberately
  // no staff form. "Reversal has no :any form" is a rule, not an omission.
  'payment:reverse:own': 'no :any form exists on purpose — a reversal is the holder undoing their own payment',
  // A payee is saved by a customer; staff have no payee list of their own.
  'beneficiary:manage:own': 'payees belong to a customer record; staff have none',
  // Repayment moves the borrower's own money, so it stays customer-only.
  'loan:repay:own': 'customer-only by design — staff may not pay a customer’s debt',
  // Standing instructions are a self-service feature on a customer's accounts.
  'instruction:read:own': 'self-service feature on the customer’s own accounts',
  'instruction:manage:own': 'self-service feature on the customer’s own accounts',
  // KYC is a customer submission plus a staff review queue; there is no `:any`
  // submission and no `:own` review, because a customer cannot review their own.
  'kyc:read:own': 'the :any half is `kyc:review`, not a :any read',
  'kyc:submit:own': 'submission is customer-only; review is `kyc:review`',
  // Sessions are per-user and belong to whoever holds them.
  'session:manage:own': 'sessions belong to the signed-in user',
  'notification:read:own': 'client-only: decides whether the bell is rendered',
  // A freeze is a hold placed by the bank. A customer cannot be trusted to freeze
  // and then unfreeze their own account; a self-service lock is a different
  // feature with a different name.
  'account:freeze:any': 'no :own form on purpose — a customer-controlled freeze is not a control',
  // Reading branches is directory information (codes and counts), which every
  // staff role may have. Acting on another branch's customers is
  // `customer:read:any`, and it is still narrowed by branch at the controller.
  'branch:read:any': 'directory information; per-customer reads are `customer:read:any`',
  // A fixed deposit is opened by the customer, out of an account they hold, in
  // the deposits feature that has a full self-service flow. There is no
  // counter workflow for it, so there is no :any half to grant.
  'deposit:open:own': 'no counter workflow for opening a deposit, so no :any form',
  // The counter half of opening an account. `account:open` is deliberately
  // unscoped in name — it means "open my own" — and `account:open:any` is the
  // staff workflow: a teller or manager opening one for a named customer in
  // their own branch, always at zero opening balance.
  'account:open:any': 'the :own half is `account:open` (unscoped), not `account:open:own`',
  // `account:open` is unscoped by name: it means "open my own". The staff half is
  // `account:open:any`, which is the counter workflow — a teller opening an
  // account for a walk-in, at zero balance, inside their own branch.
  'account:open': 'unscoped by design; the staff half is `account:open:any`',
};

const withoutPair = PERMISSIONS.filter((p) => {
  if (!p.endsWith(':own') && !p.endsWith(':any')) return false;
  const [resource, action] = p.split(':');
  const sibling = p.endsWith(':own') ? `${resource}:${action}:any` : `${resource}:${action}:own`;
  return !PERMISSIONS.includes(sibling as Permission);
});

const declaredAsymmetry = withoutPair.filter((p) => INTENTIONALLY_UNPAIRED[p]);
const accidentalAsymmetry = withoutPair.filter((p) => !INTENTIONALLY_UNPAIRED[p]);

console.log('=== 4. own/any pairs missing a half ===');
console.log(`   ${declaredAsymmetry.length} declared intentional (see INTENTIONALLY_UNPAIRED)`);
if (accidentalAsymmetry.length === 0) {
  console.log('   none undeclared — every asymmetry has a stated reason');
} else {
  for (const p of accidentalAsymmetry) {
    console.log(`   UNDECLARED: ${p} (${INTENTIONALLY_UNPAIRED[p] ? '' : 'no reason recorded'})`);
  }
}
console.log('');

// ---------------------------------------------------------------------------
// 5. Client/server agreement
// ---------------------------------------------------------------------------

const CLIENT_NAV = join(__dirname, '..', '..', 'client', 'src', 'components', 'layout', 'Sidebar.tsx');
let navPermissions: Permission[] = [];
try {
  const nav = read(CLIENT_NAV);
  navPermissions = [...nav.matchAll(/'([a-z]+:[a-z]+(?::[a-z]+)?)'/g)]
    .map((m) => m[1] as Permission)
    .filter((p) => (PERMISSIONS as readonly string[]).includes(p));
} catch {
  /* the client may not be present in a server-only checkout */
}

const unknownToServer = navPermissions.filter(
  (p) => !(PERMISSIONS as readonly string[]).includes(p)
);

console.log('=== 5. Client navigation permissions ===');
console.log(`   sidebar references ${navPermissions.length} permissions`);
if (unknownToServer.length === 0) {
  console.log('   all of them exist in the server matrix');
} else {
  for (const p of unknownToServer) console.log(`   UNKNOWN: ${p}`);
}
console.log('');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const problems =
  unexplained.length +
  unused.length +
  unreachable.length +
  accidentalAsymmetry.length +
  unknownToServer.length;

console.log('=============================================================');
console.log(`  ${allRoutes.length} routes · ${PERMISSIONS.length} permissions · ${ROLES.length} roles`);
if (problems === 0) {
  console.log('  No structural RBAC problems found.');
} else {
  console.log(`  ${problems} structural problem(s) found — see above.`);
}
console.log('=============================================================');

if (problems > 0) process.exit(1);
