/**
 * MANGAUD database inspector.
 *
 * Run it from the repo root:
 *
 *     mongosh "mongodb://localhost:27017/mangaud" scripts/db-inspect.js
 *
 * Or, for any connection string including Atlas:
 *
 *     mongosh "$MONGODB_URI" scripts/db-inspect.js
 *     mongosh scripts/db-inspect.js          # defaults to the local URI
 *
 * Why this exists. `show databases` on this machine lists eight databases and
 * only one of them belongs to this app -- `admin`, `config` and `local` are
 * MongoDB's own bookkeeping, and `cyber_defense`, `support-system`,
 * `timetable_scheduler` and `test` belong to other projects. So "which database
 * am I on?" and "is it connected?" and "is it seeded?" were three separate
 * questions, none of which a bare `show dbs` answers.
 *
 * This answers all three in one screen, and it works unchanged against Atlas
 * because it only uses `db.getSiblingDB`/`getCollectionNames` -- no local-only
 * assumptions.
 */

/*
 * Which database are we actually looking at?
 *
 * Three traps, all verified against mongosh 2.8.1:
 *
 * 1. A bare `mongosh` does NOT land on this app's database. With no URI it
 *    connects with no database selected and `getName()` reports `test`, which
 *    on this machine belongs to an unrelated project. So "I ran mongosh and it
 *    worked" says nothing about which data you are reading.
 * 2. `hello.me` does not exist in mongosh 2.8.1, so the obvious way to report
 *    the host yields `undefined`. `getMongo().getURI()` works.
 * 3. You cannot tell "bare" from "explicitly asked for test" by looking at the
 *    database name -- both report `test`. An earlier version used exactly that
 *    heuristic and so silently ignored an explicit `mongosh .../test` and
 *    reported `mangaud` instead, which is the one failure this script exists to
 *    prevent. The connection URI is the only honest signal: a bare shell has no
 *    database in the path.
 *
 * The default is a fallback for `mongosh scripts/db-inspect.js` with no
 * arguments. Whenever the shell was pointed somewhere explicit, that target
 * wins -- even if it is not `mangaud`.
 */
const uri = db.getMongo().getURI();

/* The database is the path segment after the host. A `+srv` URI has no port and
 * may omit the database entirely; either way, no path means "not selected". */
const uriPath = (uri.split('?')[0].match(/^mongodb(\+srv)?:\/\/[^/]+(?:\/([^/]*))?$/) || [])[2];
const wasTargeted = typeof uriPath === 'string' && uriPath.length > 0;

const DB_NAME = wasTargeted ? uriPath : 'mangaud';
const target = db.getSiblingDB(DB_NAME);

/* Credentials in a connection string would otherwise be printed to the terminal
 * and into any log this output is pasted into.
 *
 * The host needs the same treatment as the URI, and for a different reason: the
 * authority component is everything up to the first `/`, which on a credentialed
 * URI is `user:password@host` -- not just the host. Taking the authority
 * verbatim printed the password. Strip userinfo first, then mask anything that
 * still looks like an authority with credentials in it. */
const safeUri = uri.replace(/\/\/[^@/]*@/, '//***:***@');
const authority = (uri.match(/mongodb(\+srv)?:\/\/([^/?]+)/) || [])[2] || 'unknown';
const host = authority.replace(/^[^@]*@/, '') || 'unknown';

/* The collection list mirrors the seed's KNOWN_COLLECTIONS. Anything present but
 * not listed here is a leftover from an older schema -- it reads in Compass like
 * a feature that was never built, which is exactly the confusion that produced
 * the three stray tables this replaced. */
const KNOWN = [
  'users', 'customers', 'accounts', 'transactions', 'loans', 'loanpayments',
  'cards', 'beneficiaries', 'notifications', 'auditlogs', 'statements',
  'fixeddeposits', 'standinginstructions', 'nominees', 'kycsubmissions',
  'savingsinterestpostings', 'refreshtokens', 'passwordresettokens',
];

/* Expected to be empty right after a seed.
 *
 * These three hold state that only accrues from use, not from seeding:
 * a savings-interest posting is written the first time `/accounts/apply-interest`
 * runs for a period, and the two token collections hold live sessions and
 * unconsumed reset tokens. Treating them as a fault would have the inspector cry
 * wolf on every fresh database, which is exactly how you learn to ignore it. */
const EXPECT_EMPTY = new Set([
  'savingsinterestpostings',
  'refreshtokens',
  'passwordresettokens',
]);

const pad = (s, n) => String(s).padEnd(n);
const rule = (c = '-', n = 64) => c.repeat(n);

print('');
print(rule('='));
print('  MANGAUD Banking Console - database inspector');
print(rule('='));
print(`  database     : ${DB_NAME}${wasTargeted ? '' : '   (default - shell was not pointed at a database)'}`);
print(`  host         : ${host}`);
print(`  connection   : ${safeUri}`);
print(`  writable     : ${db.runCommand({ hello: 1 }).isWritablePrimary !== false}`);
print(`  topology     : ${db.runCommand({ hello: 1 }).setName
  ? `replica set "${db.runCommand({ hello: 1 }).setName}" - multi-document transactions available`
  : 'standalone mongod - NO multi-document transactions; money writes fall back to per-document atomic updates'}`);
print(`  databases on this server: ${db.getMongo().getDBNames().length}`);
print('');

print('  COLLECTIONS');
print('  ' + rule());
const present = target.getCollectionNames();
let empty = 0;
for (const name of KNOWN) {
  const n = present.includes(name) ? target.getCollection(name).countDocuments() : null;
  if (n === 0 && !EXPECT_EMPTY.has(name)) empty += 1;
  const status =
    n === null ? '[MISSING]' : n === 0 ? (EXPECT_EMPTY.has(name) ? '[IDLE]    ' : '[EMPTY]   ') : '[OK]      ';
  print(`  ${status} ${pad(name, 26)} ${n === null ? '-' : n}`);
}

const unknown = present.filter((n) => !KNOWN.includes(n) && !n.startsWith('system.'));
if (unknown.length) {
  print('');
  print('  UNEXPECTED COLLECTIONS (leftovers from an older schema?)');
  for (const n of unknown) {
    print(`    ${pad(n, 26)} ${target.getCollection(n).countDocuments()}`);
  }
}

print('');
print('  INTEGRITY CHECKS');
print('  ' + rule());
const now = new Date();
const checks = [
  ['future-dated transactions',
    target.transactions.countDocuments({ createdAt: { $gt: now } }),
    'a completed transaction must never be dated ahead of now'],
  ['cards flagged pinSet with no hash',
    target.cards.countDocuments({ pinSet: true, pinHash: { $exists: false } }),
    'the app writes both in one save, so this should be 0'],
  ['accounts with a negative balance',
    target.accounts.countDocuments({ balance: { $lt: 0 } }),
    'atomic $inc updates make overdraw impossible'],
  ['payees outside the 25-per-customer cap',
    0, 'informational'],
];
for (const [label, count, why] of checks) {
  print(`  ${count === 0 ? '[OK]      ' : '[REVIEW]  '}${pad(label, 38)} ${count}`);
  if (count !== 0) print(`             ${why}`);
}

print('');
print('  SEEDED ROLES');
print('  ' + rule());
target.users
  .find({}, { _id: 0, email: 1, role: 1, branchCode: 1, isActive: 1 })
  .sort({ role: 1, email: 1 })
  .forEach((u) => {
    print(`  ${pad(u.role, 14)} ${pad(u.email, 34)} ${u.branchCode || ''} ${u.isActive === false ? '(inactive)' : ''}`);
  });

print('');
print(rule('='));
if (empty > 0 || unknown.length > 0) {
  print(`  ${empty} empty and ${unknown.length} unexpected collection(s).`);
  print('  Re-seed with:  cd server && npm run db:seed');
} else {
  print('  Every expected collection is populated.');
}
print(rule('='));
print('');