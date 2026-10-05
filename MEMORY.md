# MEMORY — MANGAUD Banking Console

## Project

MERN banking app at `C:\Users\mangl\OneDrive\Documents\ADP\Banking`.
- API: `http://localhost:5000/api/v1`
- App: `http://localhost:3000`
- DB: `mangaud` on `mongodb://localhost:27017`

## CRITICAL environment gotcha

Every shell call is a **fresh PowerShell process** — `cd` never persists.
Always use the `workdir` parameter on the shell tool, never `cd` + `&&`
(PowerShell here also rejects `&&`).

## Stack decisions (locked)

- **CRA, not Vite.** Vite is fully removed. `react-scripts` on port 3000,
  `"proxy": "http://localhost:5000"` forwards `/api`.
- Client env is `REACT_APP_API_URL=/api/v1` (relative → uses the proxy,
  avoids CORS entirely).
- `CLIENT_URL=http://localhost:3000` in `server/.env` and root `.env`.
- Tailwind is required by CRA: `client/tailwind.config.js` +
  `client/postcss.config.js`.
- **All client imports are relative.** CRA's ModuleScopePlugin rejects imports
  outside `client/src`, and CRA ignores tsconfig `paths`.
- **Types are duplicated per package, on purpose.** The server's `rootDir` is
  `server/src` (so `tsc` rejects repo-root files) and CRA rejects outside-src
  imports. So: `server/src/types/index.ts` and `client/src/types/index.ts`.
  `shared/types.ts` at the root is a reference copy only. Keep in sync by hand.
- Server imports types via the `@shared/types` path alias → `server/src/types/index.ts`.
- Server `types/index.ts` has two layers: API/JSON shapes, plus `*Fields`
  interfaces for the Mongoose document shape (ObjectIds, real `Date`s).
- MongoDB runs standalone (no replica set), so multi-document transactions
  are unavailable. `canUseMongoTransactions()` in `accountService.ts` probes
  once and callers fall back to sequential writes.

## Verified working

All re-verified after the RBAC and banking-features pass, against a fresh seed:

- `npm run typecheck` → 0 errors (server + client) + Tailwind colour check clean
- `npm run build` → compiles clean (408 kB JS / 11.5 kB CSS gzip)
- **129-check API smoke suite** → all passing, and it cleans up after itself
- **104-check RBAC suite** → all passing, all six roles, incl. tenant isolation
- `npm run db:seed` → 13 users, 8 customers, 12 accounts, 553 transactions,
  5 loans, 10 cards, 23 beneficiaries, 11 fixed deposits, 9 standing
  instructions, 13 nominees, 8 KYC submissions, 8 statements, 17 collections
  and no Mongoose index warnings
- Browser sweep: 22 pages × 3 viewports × 2 themes = 132 captures, zero console
  errors, zero exceptions, zero unexpected redirects

### Verification tooling

| What | Where |
|---|---|
| Unit suite (37 checks, no DB) | `server/src/tests/unit.test.ts` via `npm test` |
| Money-integrity suite (9 checks, real DB, opt-in) | `server/src/tests/money-integrity.test.ts` via `npm run test:money` |
| API smoke suite (129 checks) | `C:\Users\mangl\AppData\Local\Temp\opencode\smoke.mjs` |
| RBAC matrix check (104 checks) | `C:\Users\mangl\AppData\Local\Temp\opencode\rbac-check.mjs` |
| Correctness-pass suite (33 checks) | `C:\Users\mangl\AppData\Local\Temp\opencode\smoke-fixes.mjs` |
| Concurrent-debit race check | `C:\Users\mangl\AppData\Local\Temp\opencode\concurrency-check.mjs` |
| Concurrency-pass suite (11 checks, live API) | `C:\Users\mangl\AppData\Local\Temp\opencode\verify-fixes.mjs`, `verify-races.mjs` |
| Colour-utility lint | `client/scripts/check-tokens.mjs` |
| PWA state probe (SW + manifest) | `client/scripts/pwa-check.mjs` |
| Production preview server | `client/scripts/preview.mjs` |
| Screenshot + console-error sweep | `client/scripts/shots.mjs` |
| PWA icon generation | `client/scripts/make-icons.mjs` |

Both API suites need the server running. `shots.mjs` needs the client too, and
takes `--vp desktop,tablet,mobile`, `--theme light,dark` and a page name to
narrow the run. Neither API suite should be run while the server is restarting —
a mid-run reload shows up as spurious 500s and redirect-to-login failures.

## Demo logins

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@mangaud.demo` | `Admin@123` |
| Branch Manager | `manager@mangaud.demo` | `Manager@123` |
| Branch Teller | `teller@mangaud.demo` | `Teller@123` |
| Loan Officer | `loanofficer@mangaud.demo` | `Officer@123` |
| Auditor | `auditor@mangaud.demo` | `Auditor@123` |
| Customer | `aarav.sharma@mangaud.demo` | `Customer@123` |
| Customer | `priya.nair@mangaud.demo` | `Customer@123` |
| Customer | `rohan.patel@mangaud.demo` | `Customer@123` |
| Customer | `ananya.iyer@mangaud.demo` | `Customer@123` |

Staff carry a `branchCode` (`BLR001`, or `HO` for head office).

## Access control

- `server/src/config/permissions.ts` is the single source of truth — ~60
  permissions, six roles, a per-role map.
- `server/src/middleware/rbac.ts` — `requirePermission` (must hold **all**),
  `requireAnyPermission` (must hold **at least one** — this is the one for the
  `own`/`any` pairs), `requireRole`, `requireStaff`.
- Permissions answer "may this role do this at all". They do **not** answer
  "is this your record" — that is per-resource and lives in
  `server/src/utils/ownership.ts` (`loadAccountForUser`, `getCustomerForUser`,
  `visibleAccountIds`).
- `GET /auth/permissions` serves the signed-in user's list to the client, which
  stores it in `permissionStore`. The client never keeps its own role table.

**The `own`/`any` trap:** passing both forms of a pair to `requirePermission`
means "must hold both", which locks out everyone including admins. That bug
shipped once and was caught by the RBAC suite.

## Background jobs

`server/src/jobs/scheduler.ts` — maturities and standing instructions, every
5 minutes and once on boot. Maturities run first so a deposit paying out today
can fund an instruction due the same day. Both are idempotent. The timer is
`unref`'d and the process has a SIGINT/SIGTERM handler, so `tsx watch` restarts
do not leave a sweep running against a closing process.

## Running and hosting locally

| | Command | Port |
|---|---|---|
| Everything, opens a browser | `start.bat` | 5000 / 3000 |
| Same, production build + PWA | `start.bat production` | 5000 / 3000 |
| Dev (loopback + LAN) | `npm run dev:lan` | 5000 / 3000 |
| Production preview, advanced | `npm run preview` | 5000 / 8080 |

**Both launcher modes serve on 3000 and nothing uses 8080.** An earlier version
put the production build on 8080; that was dropped. When two things want the same
port the launcher stops the old process rather than changing ports, so the
bookmarked URL never moves. `start.bat` frees 5000/3000 first, starts MongoDB,
seeds, brings up the API and the client, polls until each actually answers,
opens the browser, and prints the LAN address and the demo logins. Logs go to
`%TEMP%\mangaud-logs\`. The servers outlive the window —
`taskkill /f /im node.exe` stops them.

Freeing the ports first is not cosmetic: a previous run leaves node holding them,
and the new server then dies with `EADDRINUSE` while the *old* one keeps serving
stale code, which looks exactly like "my changes did not apply".

**The trap in `start.bat` worth remembering.** The script originally did
`set "PORT=3000"` to build the URL it prints. `start` hands a script's entire
environment to every child it spawns, so the **API** inherited `PORT=3000` — and
dotenv *does not* override a variable that already exists, so the API ignored its
own `.env` (`PORT=5000`), bound 3000 instead of 5000, and the script sat in its
readiness poll waiting for a server that was never going to arrive. Two lessons:
a launcher's own variable names are environment variables in every process it
starts, so anything a child reads (`PORT`, `HOST`, `NODE_ENV`, `MONGODB_URI`)
must be named something the child cannot collide with; and set the child's
variables explicitly on its command line rather than relying on inheritance.
Now `WEBPORT`/`APIPORT`, with `set PORT=…&&` on each `start`.

Two more hardening lessons from actually running it:

- **`tsx watch` is `npm run dev`, and a watcher whose worker has died stays
  alive.** The launcher then sat polling a port nothing would ever answer while
  a "running" process existed and the log stayed empty. Step 0 now also sweeps
  any `node` process whose command line mentions this repo, and every failure
  path prints the last 15 lines of the relevant log rather than only naming a
  file. A launcher that says "see the log" without showing it has moved the
  problem, not solved it.
- **`preview.mjs` already binds `0.0.0.0`** (`PREVIEW_HOST` defaults to it), so
  plain `npm run preview` is phone-reachable. I briefly documented the opposite.
  Verified rather than assumed, which is the only reason it was caught.

This machine's LAN address is **192.168.137.145** (Wi-Fi). Watch out: the
interface list also shows a `172.21.x.x` address, which is a virtual
(Hyper-V/WSL) adapter and is not reachable from a phone — I spent a debugging
detour assuming it was the Wi-Fi address. `ipconfig` on the adapter that carries
the default gateway is the reliable source.

Things that bite when testing from a phone:

- **`CLIENT_URL` must list the LAN origin.** It is comma-separated. A phone that
  loads the page and then gets no data is almost always this: the preflight is
  refused because the origin is not on the list. The API logs
  `Blocked cross-origin request from …` with the allowed values, which is the
  fastest way to confirm.
- **Windows Firewall drops inbound connections.** A timeout (not a connection
  refused) means the firewall, not the app. Both servers already bind `0.0.0.0`,
  so binding is never the cause.
- **The service worker only registers in a production build.** The install card
  appears in dev (Chrome does fire `beforeinstallprompt` on a second
  navigation) but the worker behind it is absent, so the install does nothing
  useful. Test the PWA on `npm run preview`.
- **Chrome does not fire `beforeinstallprompt` headlessly**, so
  `npm run check:pwa` always reports `installPromptFired: false`. That is a
  headless limitation, not a finding. Verify the prompt in a real browser.

## `server/.env.example` was part of the problem

Rewritten. It shipped `MONGODB_URI=.../banking` — the exact footgun removed from
the config — and `CLIENT_URL=http://localhost:5173`, a Vite port this CRA app
never serves. Since `requireInProduction` tells the user to copy that file to
`.env`, following the advice would have produced a wrong database *and* a CORS
allowlist matching nothing. An example file is not documentation, it is a
default that people ship; it has to be correct or it is a trap. It now also
carries the two variables that had been missing entirely
(`RATE_LIMIT_MAX_AUTH_REQUESTS`, `TRUST_PROXY_HOPS`) and a comment explaining
why `TRUST_PROXY_HOPS=0` matters — setting it to 1 with no proxy in front lets
any client forge `X-Forwarded-For` and walk past the rate limiter.

## Database: which is mine, and what was actually broken

`show databases` on this machine lists eight databases and only one of them
belongs to this app:

| Database | Belongs to |
|---|---|
| `mangaud` | **this app** |
| `admin`, `config`, `local` | MongoDB's own bookkeeping |
| `cyber_defense`, `support-system`, `timetable_scheduler`, `test` | other projects on this machine |

That is a shared local MongoDB, which is normal. "Is the connection broken?"
was really "which of these is mine?" — so `/ready` now answers it directly:

```json
{"success":true,"database":{"connected":true,"state":1,"name":"mangaud","host":"localhost"}}
```

and the startup line names it too: `MongoDB connected: localhost/mangaud`.

Four real defects were behind the worry, none of them the connection itself:

1. **`MONGODB_URI` fell back to `mongodb://localhost:27017/banking`.** The worst
   possible default: if `.env` fails to load, the app does not crash — it quietly
   creates an *empty* database called `banking` and serves a login page with no
   demo data. The symptom ("my accounts are gone") points nowhere near the
   cause. The fallback is now `mangaud`, and in production there is no fallback
   at all: `requireInProduction` throws naming the variable. Same treatment for
   the JWT secrets, which defaulted to `default-access-secret-change-me`.
2. **A hand-maintained `isConnected` flag that could only go one way.** Set true
   on connect, false on `disconnected` — and nothing ever set it true again. The
   driver reconnects by itself after a transient blip, so from then on the app
   reported "not connected" while the database was perfectly healthy. Deleted;
   the truth is `mongoose.connection.readyState`.
3. **`utils/database.ts` registered its own SIGINT/SIGTERM handlers that called
   `process.exit(0)`.** It is loaded before `index.ts` registers its shutdown, so
   its handler fired first and the process exited before the graceful path could
   stop the scheduler, drain the HTTP server or close the database — a hard exit
   wearing a graceful costume. Shutdown now belongs solely to `index.ts`, which
   stops the scheduler, drains HTTP, closes Mongo, then exits.
4. **`serverSelectionTimeoutMS` was already 5s**, which is what `start.bat` polls
   against — commented as such so nobody "helpfully" raises it to the driver's
   30s default and makes the launcher wait half a minute before explaining
   itself.

The lesson across all four: state that is cached by hand needs invalidation, and
a default that points somewhere plausible is worse than no default at all,
because it fails silently and the evidence points away from the cause.

## UI problems found by looking at screenshots

Screenshots surface layout faults that no type-check or API test will. All of
these were found that way:

1. **The dashboard had a screenful of dead space.** `grid lg:grid-cols-3` with a
   two-row accounts card in the 2/3 column and a six-row activity list in the
   1/3 column — the columns ended hundreds of pixels apart. Fixed by putting the
   *long* list in the wide slot and stacking the short cards (`Your accounts`,
   `Alerts`) in the narrow one. General rule: **the long element gets the wide
   column**, so whichever column is short is the one with room to spare.
2. **The sidebar stopped halfway down a long page.** It was `fixed` +
   `h-screen`, which is viewport height, not document height, so below the fold
   the content had bare page background beside it — very visible in dark mode.
   Fixed by making the app shell a flex row and the sidebar `lg:sticky
   lg:top-0` from `lg` up (still an overlay drawer below that).
3. **Money was abbreviated to `-₹7.19K` and `₹1.88 L`** next to a total balance
   shown to the paisa. Abbreviating belongs in a chart label or a narrow cell,
   never beside an exact total. `formatCompactCurrency` still exists for those.
4. **The ledger table printed the date twice** — `30 Sept 2026, 08:39 pm` and,
   under it, `in 7h`. Now: `Today` + time for today's rows, a plain date
   otherwise. A statement shows the date, not how long ago you were.
5. **A whole column of "—" (Related account) and twenty identical COMPLETED
   badges.** Both columns are now conditional on the page actually needing
   them, so they reappear the moment a row does. Worth keeping as a rule: *a
   column that says nothing on every row is noise pretending to be information.*
6. **The install card covered the dashboard's Alerts panel** — a ~140px card
   pinned bottom-right. Now one compact row with an always-visible dismiss.
7. Account numbers were printed in full in the ledger while masked everywhere
   else; now masked consistently.
8. **The ledger was unreadable on a phone.** An eight-column table inside
   `overflow-x-auto` is *technically* responsive: it never breaks the layout.
   It is also useless — on a 390px screen it showed the date and the type and
   pushed the **amount**, the one column anyone opens a bank statement for, off
   the right edge behind an unlabelled horizontal swipe. `overflow-x-auto` hides
   a layout failure rather than fixing one. Below `md` the rows now render as a
   stacked list with the amount on the right; the table takes over from `md` up.
   Both read the same array so they cannot disagree. Same fix applied to the
   staff `AllAccounts` page, where the balance was column four of eight.

   **When to look for this:** any page whose real content sits in a column
   after the third. Horizontal scroll is not a responsive strategy for tabular
   data a person has to *read*.

9. **Two accessibility defects in the sidebar, both invisible to a screenshot.**
   `aria-hidden={!isOpen}` — but from `lg` up the sidebar is a permanent part
   of the layout while `navOpen` stays `false`, so the whole primary
   navigation was marked hidden from screen readers on *desktop*: visible to
   everyone, present to no one. Now keyed off the same `useMediaQuery` the
   layout uses. Separately, `-translate-x-full` moves the closed mobile drawer
   off-screen but leaves it in the tab order, so keyboard users tabbed into an
   invisible menu; `invisible` is now transitioned alongside the transform,
   which takes it out of both the focus ring and the a11y tree.

   The lesson: `aria-hidden` must be answered by "is this on screen?", never by
   "is this component's local toggle set?". A responsive layout has two states
   and one boolean cannot describe both.

## Key files

- `start.bat` — boots MongoDB, seeds, starts API + client, waits for both
- `diagnose.bat` — checks mongo, ports, env, deps, runs both typechecks
- `server/src/config/permissions.ts` — the RBAC matrix
- `server/src/middleware/rbac.ts` — the gates
- `server/src/utils/ownership.ts` — per-resource tenant checks
- `server/src/jobs/scheduler.ts` — the recurring sweeps
- `client/src/store/permissionStore.ts` — server-sourced permission list
- `client/src/hooks/useTheme.ts` — light/dark, persisted to `localStorage`
- `client/src/services/tokenStorage.ts` — single owner of the token keys
- `client/src/services/api.ts` — axios client, 401 → refresh → replay
- `client/src/store/authStore.ts`, `accountStore.ts` — zustand stores
- `client/src/hooks/useAuth.tsx` — AuthProvider, one-shot session init
- `client/src/components/three/AuthScene.tsx` — Three.js auth backdrop
- `client/src/components/layout/{AuthLayout,ThemeToggle}.tsx` — auth shell, theme switch
- `server/src/middleware/validation.ts` — envelope-aware zod middleware
- `server/src/index.ts` — app wiring, two-tier rate limiting, graceful shutdown
- `server/src/services/{account,loan,transaction,auth,card,payment,statement,notification,audit,deposit,instruction,nominee,kyc}Service.ts`
- `server/src/scripts/seed.ts`

## Bugs already fixed (do not regress)

1. Token key mismatch (`auth-storage` vs flat keys) → tokenStorage.ts
2. `validateBody` not unwrapping the zod envelope → rewrote validation.ts
3. 401 refresh loop (527 requests) → clearAuth now removes `auth-storage`
4. Global 100 req/15min rate limit → split tiers (6000 general / 50 auth)
5. `startSession()` on standalone mongod → canUseMongoTransactions() probe
6. Identical refresh JWTs colliding on unique index → added `jti`
7. Loan ownership compared accountId to customer._id → resolve via account
8. `/transactions`, `/accounts/all`, `/loans/all` returned bare arrays
9. `pages/*.tsx` used `../../utils` (escapes src/)
10. 8 hook files had JSX but `.ts` extensions
11. `refreshUser` read store token (null on reload) → read tokenStorage
12. Mojibake `â€"` in Transactions/Statements
13. `/audit` returned `_id` not `id` → `key={undefined}` React warnings
14. `/register` crashed on mount (`getPasswordStrength` read `.length` of undefined)
15. Staff had no Customer profile, so every customer page 404'd → route guards
16. **Tenant isolation:** `/accounts/:n`, `/balance`, deposit, withdraw,
    transfer, interest and close were all readable by any logged-in user →
    `loadAccountForUser` on every one
17. **`/transactions` had no user scoping at all** — any token could dump the
    whole bank's ledger → `visibleAccountIds` pushed into the filter, and the
    intersection taken on a caller-supplied `accountId` (the union would have
    handed back exactly what it was trying to prevent)
18. **`requirePermission('a:own','a:any')` required both** → added
    `requireAnyPermission`
19. A teller holding `card:freeze:any` still could not freeze a customer's
    card, because the controller resolved the *caller's* customer → resolve
    the card's owner for staff; notify the owner, not the employee
20. Soft-deleted payees stayed in `getBeneficiaries` → filter `status: 'ACTIVE'`
21. `PATCH /standing-instructions` silently ignored `dayOfMonth` (route accepted
    it, service dropped it, returned 200) → accepted and validated 1–28
22. `GET /banking/deposits/quote` read `req.body`, which a GET never has → 400
    to every caller including the app's own quote box
23. **`Account.formattedBalance` threw on partially populated sub-documents** —
    `populate('...', 'accountNumber')` has no `currency`, and Mongoose runs
    virtuals on it during `toObject`, so a display field 500'd the request
24. `/auth/permissions` omitted `isStaff` / `branchCode` / `roleLabel`
25. Soft-deleted payees were still returned by `getBeneficiaries` → filter
    `status: 'ACTIVE'` (the payment path already refused them, so this was a
    broken-list bug, not a money leak)
26. `GET /banking/deposits/quote` read `req.body`; a GET has no body, so it
    400'd every caller including the app's own quote box
27. `quote()` returned `{rate, interest, maturityAmount}` but the UI and the
    test read `interestRate` / `interestAmount` / `maturityDate` / `taxNote` —
    the quote panel rendered blanks
28. **The KYC queue never populated the customer**, so every row showed `—` for
    email and phone and a reviewer had no way to act
29. **The KYC queue's "Waiting" tab sent `status=PENDING`**, which is not a
    `KycStatus`, so the tab silently matched nothing. Tab ids are now the real
    status values
30. **The admin's sidebar was full of dead links.** Admin holds every `*:own`
    permission, but staff have no `Customer` record, so each of those pages
    403'd. Fixed with a `customerOnly` flag on nav items plus a second rule:
    holding a `*:own` permission is necessary but not sufficient for staff.
    `/accounts`, `/transactions`, `/statements` and `/cards` moved out of the
    customer route guard because they genuinely work for staff via `:any`

    **Corrected 2026-10:** `/statements` did *not* work for staff. The nav and
    the route guard were fixed but the controller still resolved the caller's
    Customer, so every staff role 403'd on a page it linked. See bug #55. The
    lesson generalises: moving a route out of the guard is only half the fix —
    the handler has to be able to answer a staff request at all.
31. The nominee cancel button used the *create form's* selected account, so it
    could cancel a different account's nomination than the one clicked
32. The nominees page read a nested `nominee.account.accountNumber` the server
    never sends (it returns a flat `accountNumber`) → rendered "Account Unlinked"
33. The seed generated `ACTIVE` deposits whose maturity date had already
    passed, so the scheduler swept them to `MATURED` within five minutes of
    boot and every "active deposits" tile read zero against a visible list
34. `client/scripts/shots.mjs` dropped its page filter when `--theme` was
    absent: `indexOf` returns -1, and `-1 + 1` ate the first positional argument
35. **Two concurrent `shots.mjs` runs fight over the same debug port** and
    produce nonsense (one reported a redirect to `/register`). Never run two at
    once, and never while restarting the servers — a mid-run reload looks like a
    wall of 500s
36. `canAny()` with an empty list returned `false`, so every *unrestricted* nav
    item was filtered out and then re-appended by the fill-to-four padding.
    "Home" ended up last in the mobile bar. An empty list means "no permission
    required"
37. `toView` for standing instructions omitted `cancelledAt`, `pausedAt` and
    `pauseReason`, and returned the payee under `destination` where the client
    read `beneficiary` — so cancelled rows said "Cancelled —" and every row said
    "to a payee"
38. The KYC queue and the standalone page had different response shapes
    (`{submissions}` vs `{latest, history}`) and the client assumed one
39. **The log was unreadable on Windows.** A redirected stdout is written in the
    OEM codepage, so `₹`, `—` and `••••` came out as `?`. The logger now
    transliterates before writing: `₹`→`Rs `, `—`→`-`, `•`→`*`
40. Every 4xx was logged at `error` **with a full stack trace**. A teller
    reaching for a permission they lack is the system working, not a defect —
    one refused request produced forty lines and buried real faults. Now: 5xx
    gets a stack at `error`, 4xx gets one line at `warn`
41. **`bg-ink text-white` is the wrong way to write an inverted surface.**
    `ink` follows the theme, so in dark mode that pairing is white on
    near-white. It had shipped in four places (the active `Tabs` chip, the
    header avatar, the PWA dismiss button, the ErrorBoundary stack trace) plus
    the notifications filter chip. The correct form is `bg-text text-card`,
    which inverts by construction — the same convention `.btn-primary` uses
42. `maskedAccountNumber` is a Beneficiary *virtual*, and `lean({virtuals:true})`
    applies virtuals to the queried document but not to populated
    sub-documents, so the standing-instruction list read "HDFC Bank · undefined".
    Computed the mask from `accountNumber` instead
43. The seed never dropped collections left over from earlier schemas, so
    `empdetail`, `reviews` and `scans` sat in the database as three empty tables
    that read like missing features. Dropped against an explicit
    `KNOWN_COLLECTIONS` set
44. Mongoose logged "Duplicate schema index" on every boot: `Nominee` declared
    `index: true` on `customerId` and `accountId` *and* an explicit
    `schema.index()` for the same single field. Removed the inline form for
    those two, kept it for `userId`

## Bugs fixed in the 2026-10 correctness pass

Found by reading the whole codebase rather than by running it — typecheck and the
colour lint were both already clean. Each is verified by the suites at the end of
this section.

45. **`logout` never revoked the session** — `authController.ts` called
    `revokeRefreshToken(req.token)`, but `req.token` is the *access* token and
    the stored rows hold *refresh* tokens, so `deleteOne({token})` matched
    nothing. Signing out cleared the cookie while the session stayed valid
    server-side for another 7–30 days. Now resolves the `sid` claim from the
    access token, with the refresh cookie as a fallback.
46. **Card PINs were never stored** — `Card.pinHash` was on the TypeScript
    interface but had no path in the schema. Mongoose runs `strict: true`, so
    every `card.pinHash = …` was dropped on save: `setCardPin` returned success
    and set `pinSet: true` while persisting nothing. `seed.ts` had the same
    problem. Added the path, `select: false`.
47. **`payBeneficiary` had a lost-update race** — it re-read the account into
    `locked` "so a concurrent debit can't overdraw", then used `locked` only for
    the check and wrote back to the stale `sourceAccount`. Two concurrent
    payments both passed and both debited. Replaced with one
    `findOneAndUpdate` carrying `balance: { $gte: amount }` in the filter, so
    check and write are indivisible. Holds on standalone mongod.
48. **`transferFunds` documented a lock that did not exist** — the fallback
    comment claimed "guarded by an in-process lock"; there was no lock. Both
    legs are now atomic `$inc`s. The honest limit: each leg is atomic, the *pair*
    is not, without a replica set. Say so rather than implying otherwise.
49. **Customers could mint unlimited money** — `payment:receive:own` was granted
    to *customer*, and `recordIncoming` had no amount cap, no daily cap and no
    counterparty to check against. Any signed-in customer could POST
    `{accountId, amount: 10000000}` and the balance was real. It is now
    `payment:receive:any` — counter-only — which also unblocks the real
    workflow, since a teller recording an inward transfer previously had no
    permission to do it.
50. **Negative deposit** — `/accounts/deposit` had no body schema, so
    `{ "amount": -5000 }` subtracted from the balance while writing a `DEPOSIT`
    ledger row for `Math.abs(-5000)`. The only check, `newBalance < 0`, never
    fires on an account with money in it. Four account money routes had no
    schema at all; eight schemas were written and unused. All wired up.
51. **Password change left attackers logged in** — `changePassword` and
    `resetPassword` never called `revokeAllUserTokens`, which existed and had no
    caller. Both now revoke every session.
52. **Password reset tokens were replayable** — a bare JWT with a 1h expiry and
    no server-side record. Now backed by a `PasswordResetToken` collection with a
    TTL index, consumed on use.
53. **JWT algorithms were not pinned** — `jwt.verify(token, secret)` with no
    `algorithms` option, in `auth.ts` and three places in `authService.ts`.
54. **`applySavingsInterest` could double-post** — the unique index on
    `{accountId, fromDate, toDate}` existed to prevent exactly that and nothing
    ever wrote to the collection, so the guard was decorative. The row is now
    claimed before the credit.
55. **`/statements` 403'd for every staff role** while the sidebar linked it and
    the route guard admitted it. `listStatements`/`generateStatement` resolved
    the *caller's* Customer, which staff do not have. **This made bug #30's fix
    wrong**: that entry claims statements "genuinely work for staff via `:any`",
    which was never true. `resolveTargetCustomer(req, customerId)` now takes the
    subject from the query/body for staff.
56. **`/accounts` was empty for teller, loan officer and auditor** —
    `AllAccounts.tsx` branched on `role === 'admin' || 'manager'`, so the other
    three staff roles called `getMyAccounts()`, which returns `[]` for anyone
    without a Customer record. All three hold `account:read:any`. Now branches on
    `isStaff`.
57. **`loan:apply:any` was unusable** — `applyForLoan` compared the account
    against the *caller's* Customer unconditionally, so manager and loan officer
    got "Account does not belong to you". The customer branch is now conditional
    on `!isStaffRole`.
58. **`payment:send:any` was unusable** — same shape, via
    `getCustomerFromRequest`. Admin was the only holder, and admin is precisely
    the role the staff check blocks.
59. **`GET /notifications/read-all` ran `listNotifications`** — the path promised
    to mark everything read. Removed rather than aliased.
60. **`/accounts/:accountNumber` rendered `OpenAccount`** — clicking an account
    on the dashboard asked the customer to open a *new* account. Added
    `pages/AccountDetail.tsx`.
61. **`getQueueCounts` seeded non-existent statuses** — `DRAFT` and `EXPIRED` are
    not in the `KycStatus` enum, so they were count keys no document could ever
    satisfy. Now derived from the enum.
62. **The deposit ceiling message was 10x wrong** — capped at `10_000_000` (one
    crore) while telling the customer "₹1,00,00,000" (one lakh).
63. **`requireAnyPermission()` with an empty list returned 500** — `[].some()` is
    false, so it built the error message from `undefined` and `describe` did
    `permission.split(':')` on it. Now an empty list means "no permission
    required", matching `requirePermission`.
64. **Settings page was nine inert controls** — push/email/SMS notifications,
    2FA, language, export and delete-account were local `useState` that reset on
    reload. A user who turned off email notifications was entitled to believe
    they had. Replaced with what actually works.
65. **`generateAccountNumber` was a `countDocuments` race** — two concurrent
    opens produced the same number and one died on the unique index, which
    surfaced as a 500 on a correctly-filled form. Now generate-and-retry.
66. **The self-payee guard could never fire** — `beneficiaryService` queried
    `'banking.accountNumber'`, a path that does not exist on `Customer`.
67. **Token cookies ignored config** — `setTokenCookies` hard-coded 15 minutes
    and 7 days while the JWT durations came from config, so changing
    `JWT_ACCESS_EXPIRY` silently desynchronised them.
68. **`idParamSchema` was misnamed** — it validated `params.loanId`, so reusing it
    on any other `:id` route 400'd. Replaced with a `pathParam()` factory.
69. **`OfflineBanner` was imported and never rendered.**
70. **`Button.asChild` was declared and never implemented** — removed, with a
    note that a `<button>` cannot contain an `<a>`.

## The RBAC pass: branch scoping, dead grants, and an audit that fails the build

Three things were wrong with access control, and only one of them was visible by
reading the matrix.

### Branch scoping was not merely unimplemented — it was impossible

`User.branchCode` existed, and MEMORY recorded "BLR001 means nothing yet" as a
known gap. The reason went unrecorded: **nothing else had a branch.** `Customer`
and `Account` had no branch field at all, so "a teller sees only their own
branch" had nothing to filter on. A member of staff's branch says where *they*
work; it says nothing about which customers they may read.

Added `branchCode` to `Customer` and to `Account` (denormalised from the customer
at open time, so the hot path filters one indexed field instead of joining), and
then enforced it in **five** places — three of which were missed on the first
attempt and only found by a live check:

| Chokepoint | Serves |
|---|---|
| `loadAccountForUser` | one account by number |
| `visibleAccountIds` | ledger and statement queries |
| `getAllAccounts` | `/accounts/all` |
| `getAllLoans` / `getOverdueLoans` | the loan book, scoped by account id |
| `getAllCards` | the card list, scoped by account id |

`HO` (head office) and `admin` are unscoped. That is the entire point of the
code: a head-office operator with no branch of their own is the role that must
see across the bank.

**The leak that proved it was needed:** with the first two chokepoints in place,
a `BLR001` teller still listed **all twelve** accounts across three branches,
because `/accounts/all` queries directly. Both ownership helpers were correctly
refusing cross-branch reads *one account at a time* — so the controls that
existed looked fine while the page staff open first showed everything. Branch
scope belongs where records are read, not route by route.

The seed now spreads customers across `BLR001` / `BLR002` / `HO` on purpose. With
every customer in one branch, isolation is indistinguishable from the
"staff see everything" behaviour it replaced, and the feature would be untestable.

### Dead grants: nine permissions no route enforced

A grant nothing requires is not a control. Each of these read as a working
capability in the matrix and did nothing:

| Permission | Resolution |
|---|---|
| `account:freeze:any` | **built the endpoint.** `POST /accounts/:n/freeze`, manager/admin, audited, branch-scoped, and reversible — a hold, not a closure |
| `customer:read:any` | **built `GET /customers`** — the counter search a teller needs, across name, phone, email and id, one box, capped at 50 |
| `customer:update:any` | **built `PATCH /customers/:id`** — address and phone only |
| `user:manage` | **built `/admin/users`** — list and change role/branch/active, admin only |
| `branch:read:any` | **built `GET /admin/branches`** — codes and counts, every staff role |
| `deposit:open:any`, `settings:manage` | **deleted.** No feature exists; a permission for one is security theatre |
| `notification:read:own` | declared client-only — it decides whether the bell renders |

### The audit script

`npm run audit:rbac` (server, ~340 lines) parses the route table and reports five
categories: routes with no gate, permissions no route enforces, single-holder
grants with no route, `own`/`any` asymmetries, and client/server name drift.

First run: **41 findings**. Now: **0**, across 102 routes and 61 permissions.

Most of the first 41 were noise, and fixing the audit mattered as much as fixing
the code:

- Routes that are **auth-only by design** (12 of them — notifications are
  addressed by the caller's own id, so a gate adds nothing) were indistinguishable
  from real gaps. They are now an explicit, reasoned allowlist. An audit that
  cries wolf gets ignored, which is worse than no audit.
- `own`/`any` asymmetries flagged 13 **deliberate** ones (`payment:receive:any` has
  no `:own` because the `:own` form was a money printer). Every asymmetry is now
  declared with its reason, so an accident is distinguishable from a decision.
- The allowlist was keyed on full URLs while the parser reads files, so `/login`
  was reported as ungated. Keyed on `file METHOD path` instead.

**Static analysis could not see branch scoping at all** — it lives in controllers
and chokepoints, not the route table. The two bugs it missed were found by a live
sweep (`%TEMP%\opencode\verify-rbac.mjs`, 34 checks).

### Two real bugs the sweep caught that nothing else did

1. **A search term with no digits matched every customer in the branch.**
   `{ phone: { $regex: '' } }` — an empty regex matches every document, so
   `?q=meera` returned all four `BLR001` customers with a correct-looking 200.
   Found by asking for a customer in another branch and being handed four.
   A vacuous `$or` clause is not a no-op in MongoDB; it is a match-all.
2. **`loan_officer` held both `loan:approve` and `loan:disburse`** while the
   design had always said releasing money is the one step a single officer may
   not take alone. One compromised credential could originate, approve and pay
   out a loan. Disbursement is now manager/admin only.

### A staff lockout that matched bug #55 exactly

`GET /banking/deposits` required `deposit:read:own` **and** resolved the
*caller's* Customer record — so `manager`, `loan_officer` and `auditor`, all of
whom hold `deposit:read:any`, were refused. The grant was dead and the feature
was customer-only despite the matrix. Now `requireAnyPermission('…:own',
'…:any')` plus `resolveTargetCustomer`, which is the same fix MEMORY records for
statements.

### Landing page

`/` is now a public landing page when signed out, and `/landing` is its
permanent address. It carries a **role explorer**: pick one of the six roles and
see what it can and cannot do, derived from the real matrix rather than
marketing copy — a page that advertises a capability the API refuses is how a demo
starts lying. The trade-off is recorded in the file: this is the one permission
list duplicated client-side, and it cannot ask the server because there is no
visitor to ask about yet.

**The trap, cost one probe:** `/` originally gated on `isResolved` before
deciding, and the permission fetch only runs for a signed-in user — so every
signed-out visitor sat on a spinner forever. The gate belongs to the *redirect*,
not to the page.

## Bugs fixed in the concurrency pass

Found by reading the money paths rather than running them; typecheck, the colour
lint and the whole live API surface were already clean. One theme runs through
all of them: **a check performed by reading a document and then writing it back
is not a check.** Two concurrent callers both read the same value, both pass,
and both write. `payBeneficiary` had already been fixed for exactly this (bug
#47); the same mistake survived in five other money paths, and each is now an
atomic claim or an atomic `$inc`.

71. **A payment could be reversed twice, paying the customer back double.**
    `reversePayment` read the row with `status: 'COMPLETED'`, then set
    `REVERSED` and saved. Two simultaneous reversals both passed the read and
    both credited the account. The status flip is now the *claim* —
    `findOneAndUpdate({status:'COMPLETED'}, {$set:{status:'REVERSED'}})` — so
    the loser matches nothing. A caller who fails the ownership or 24-hour check
    hands the claim back rather than leaving the payment frozen.

72. **The reversal credit was a read-modify-write.** `account.balance += amount;
    save()` wrote a stale document back, so any debit landing between the load
    and the save was silently overwritten — money created from nothing. Now a
    single `$inc`. The old code also refused to reverse when
    `balance < transaction.amount`; a reversal *credits* the account, so it
    cannot go negative, and that check only stopped legitimate reversals of a
    payment whose money the customer had since spent.

73. **The per-payee daily cap was never enforced.** `getTodayTransferTotal`
    matched `beneficiaryId` against a bare string in an aggregation `$match`,
    and aggregation pipelines do not cast the way `find()` does — so the sum was
    always `0` and any amount passed. Wrapped in `new mongoose.Types.ObjectId`.
    The comment above the call claimed it "holds even across concurrent
    payments"; it did not hold *at all*, let alone concurrently.

74. **The daily cap could still be raced.** Two simultaneous payments both read
    the same pre-payment total. There is now an authoritative check *after* the
    debit and the ledger row, inside the same flow: if the post-payment total
    exceeds the cap, the payment is undone (refunded and marked `FAILED` on
    standalone mongod, or rolled back by the abort inside a transaction). The
    pre-check stays as the fast path that produces the error before any money
    moves.

75. **A loan could be disbursed twice.** `disburseLoan` read `APPROVED`, then
    saved `DISBURSED` — and did `account.balance += principal; save()`. Both
    the double-credit and a concurrent deposit being clobbered by the stale
    write were possible. The loan is now claimed by its status, and the account
    credited with `$inc`.

76. **A negative loan repayment minted money.** The route schema rejected
    negative amounts, but the service did not — and a service is also called
    from other services, not only over HTTP. `amount <= 0` used to turn
    `balance -= amount` into a *credit* and to grow `outstandingAmount`. Now
    validated in the service, alongside a guard that the payment actually covers
    the interest due.

77. **Two concurrent repayments lost a principal reduction.** Each computed
    `outstanding - ownPortion` from a stale read and wrote it back, so the
    account was debited twice while only one reduction survived — the bank
    quietly lost the difference. The outstanding amount is now decremented with
    `$inc` under an `outstandingAmount >= portion` guard, and a repayment that
    cannot claim the loan refunds the debit.

78. **A fixed deposit could pay out twice.** `matureDeposit` read `ACTIVE`, and
    the sweep runs every five minutes against the same path the manual "mature
    now" button uses — so the sweep and the customer could both pay out.
    Closing early had the same shape plus the `account.balance = ... ; save()`
    read-modify-write, and could collide with the maturity sweep paying the full
    maturity amount while the customer was closing early. All three flows now
    claim the deposit atomically before the money moves, and credit with `$inc`.
    `openDeposit` had the identical stale-write bug: it re-read the account into
    `locked` "to be safe", checked `locked.balance`, then wrote the *stale*
    first read back — the same mistake `payBeneficiary` had been fixed for in
    #47.

79. **The self-payee guard queried a path that does not exist.** `addBeneficiary`
    asked `Customer.exists({ 'banking.accountNumber': n })`. There is no
    `banking` sub-document on `Customer` — accounts are their own collection —
    so the guard matched nothing and every customer could add their own account
    as a payee. Now checks `Account.exists({ customerId, accountNumber })`.
    **Note:** bug #66 below claims this was already fixed; the code says
    otherwise, and the code is what was verified.

### The "stuck on loading" report, and what it actually was

Symptom: the page sat blank/"loading" and never came up. Reported twice, with
"10 to 30 minutes" attached.

**It was never the API, the proxy, or a React hang.** Each was measured:

| Check | Result |
|---|---|
| `GET :5000/api/v1/ready` | 200, Mongo connected, `mangaud` |
| `GET :3000/api/v1/ready` through the CRA proxy | 200, `X-Powered-By: Express` |
| `/static/js/bundle.js` | 200, 6.7 MB, compiles clean |
| CDP `Runtime.evaluate` on the page | responds in **6-33ms** — main thread never blocked |
| DOM at steady state | `readyState: complete`, `#root` populated, **zero console exceptions** |

The real cause is one line of `client/public/index.html`:

```html
<div id="root"></div>
```

It is empty in the served HTML. So between first paint and React's first render
the page shows **nothing**, and that render cannot happen until a 6.7 MB bundle
has downloaded — which in dev means waiting for webpack to finish compiling. On a
cold compile, measured at **~10s warm** on this machine, that is minutes: the
repository lives under OneDrive and webpack watches every file in it.

A blank page for that long does not read as "loading". It reads as a broken app.

**Fix:** a branded boot splash in the served HTML, styled inline so it paints
before any JavaScript, themed via the same `.dark` class the pre-paint script
sets. `index.tsx` removes it on a double `requestAnimationFrame` (once React has
actually painted) and on an **8-second failsafe timer** — if the bundle throws
while evaluating, none of the app code runs, the ErrorBoundary cannot help
(it catches render errors, not a module that never evaluated), and without the
failsafe the splash would cover a blank page forever. Verified by CDP: splash
visible and correctly themed at +150ms, gone with the app mounted at +800ms.

Two traps hit while diagnosing this, both of which produced convincing wrong
answers:

- **`Invoke-WebRequest` reported the proxied `/ready` as 404** when `curl`
  reported 200. The app's own `useAuth.tsx` documents this shape: behind the dev
  proxy a refused connection comes back as **404 for GET** and **500 for POST**,
  because the proxy answers, not the API. Trusting the PowerShell probe would
  have sent the whole investigation at the proxy. **Use `curl` for this.**
- **`node scripts/shots.mjs` reported `CDP timeout: Runtime.evaluate`** on every
  page. Not a freeze — the shared debug port on 9222 had three stale targets
  open, two of them `/login` and one an unrelated browsing session, and the
  script attached to a wedged one. MEMORY already warns that two runs fight over
  that port; this is the same failure wearing a different hat. A single-purpose
  probe that opens its **own** target is the reliable instrument.

**The lesson worth keeping:** a blank first paint is a defect, not a cosmetic
one. It converts every slow compile, every cold cache and every transient API
hiccup into "the app is broken", and it cost two wrong diagnoses before the
actual cause took ten seconds to confirm.

## Depth pass: elevation, figures, and the 3D backdrop

`client/src/index.css`, `tailwind.config.js`, `components/ui/Card.tsx`,
`pages/Dashboard.tsx`, `components/three/AuthScene.tsx`.

The system was already strong (Swiss/minimal banking, IBM Plex Sans + JetBrains
Mono, brass accent, documented contrast ratios). The complaint was aimed at a
broken render, so the work was depth and correctness, not a new identity.

- **Elevation is now two-layer** (a tight contact shadow plus a wide ambient
  one) rather than one blurred layer. A single layer reads as a smudge on the
  page; two read as a physical object. Four levels, unchanged in count — a dense
  dashboard that shadows everything reads as noise.
- **A lit top edge** (`--edge-light`, inverted for dark mode) on every surface.
  A hairline of white just inside the top border is what sells a raised plane;
  a border alone reads as a drawn rectangle no matter how good the shadow is.
- **`.card-lift`**: a 2px lift with the shadow deepening in step, disabled under
  `prefers-reduced-motion`. Two pixels on purpose — the failure mode of depth in
  a financial console is a floating toy, where the eye is reading columns and
  cannot locate a row that moved. Transform is limited to `transform` and
  `box-shadow`, never layout properties.
- **Figure classes** (`.figure`, `.figure-md`, `.figure-sm`) carry the optical
  corrections: negative tracking to close the gaps between digits at display
  size, and **600 rather than 700** — bold at 34px thickens strokes until the
  counters in 0/6/8 begin to close. The dashboard hero was `font-bold` at 34px.
- **`rounded-[--radius]` was invalid Tailwind in 7 places** and silently
  dropped: the dashboard hero panel and six loading skeletons rendered with
  square corners while every other surface was 8px. Arbitrary values need
  `var()` — `rounded-[--radius]` resolves to nothing, with no error anywhere.
  Invisible in review, obvious on screen, and it landed on *skeletons*, so it
  made the loading states look broken too.
- **Fonts**: `index.html` requested **Fraunces and Outfit**, which nothing draws
  with (`font-display` maps to IBM Plex Sans) — a render-blocking request for
  unused families. Now IBM Plex + JetBrains only, moved from a CSS `@import`
  (discovered a full round trip late) to a `<link>` in the head.
- **The 3D backdrop now respects the user**: `frameloop` is `'never'` when the
  document is hidden and `'demand'` under `prefers-reduced-motion`, instead of
  `'always'` forever. The scene is still there; it just stops moving and stops
  holding the GPU.

## Regression coverage for the concurrency pass

`server/src/tests/money-integrity.test.ts` — 9 tests, opt-in, real database:

```
# server/.env
RUN_MONEY_TESTS=1

npm run test:money
```

It builds its own customer and accounts, asserts, and deletes everything it made.
It runs against `MONGODB_URI_TEST` (`mangaud_test`), not the demo database, so a
mistaken run cannot damage demo data. With the flag absent every test is skipped,
so plain `npm test` stays pure-logic and fast — that is why this file is separate
from `unit.test.ts` rather than inside it.

Each test asserts the *outcome* under concurrency, not the implementation: four
simultaneous reversals must produce one credit, eight simultaneous repayments
must never overdraw, a maturity and an early close racing must pay once.

**The tests were checked for sensitivity, not just for passing.** Re-introducing
the string-vs-ObjectId bug from #73 immediately failed the daily-cap test, which
is the only way to know a regression test can still fail. Worth repeating for any
future fix in this area: a test that has never failed is not a regression test.

`client/src/design-system/` (four files, ~1,800 lines, plus a generator whose own
dark-mode block emitted variables it never defined), `components/ui/Select.tsx`
(a pre-token duplicate), `Drawer`, `DataRow`, `TabsGroup`, `CardAccent`, seven
composite `Skeleton*` variants, six unused breakpoint hooks, and the
`useLocalStorage` / `useInfiniteScroll` / `useIntersectionObserver` /
`useOptimisticUpdate` / `useVirtualList` / `useWebSocket` / `useAdvancedCache`
families. Server side: `authorize`, `optionalAuth`, `requireRole`,
`requireOwnOrAny`, and the unused `validate` variant.

`useDebounce` was kept and *used* — `Payments` and `Deposits` had each grown their
own copy of the same 300ms behaviour, which is why the hook shipped unused. That
is the better resolution of "unused hook": find the duplicate, not the caller.

### The two npm scripts that did not work

`npm run lint` mapped to `eslint src/**/*.ts` with **eslint not installed and no
config in the repo** — it always failed. Removed rather than made green by adding
a config nobody had chosen.

`npm test` mapped to `vitest run` with **zero test files**, so it exited 1 on "no
test files found". Now there is a real suite: `server/src/tests/unit.test.ts`,
37 checks, no database and no server required.

### Verification after this pass

- `npm run typecheck` — clean (server + client + colour lint)
- `npm run build` — clean (411 kB JS / 11 kB CSS gzip)
- `npm test` — **37 passed**
- Live API, 33 checks — all passing, including: negative and zero deposits
  rejected; customers refused `payment:receive`; staff statements work with a
  named customer and explain themselves without one; all three staff roles list
  all accounts; teller refused `loan:apply` while loan officer and manager are
  allowed; the same interest period cannot be posted twice; logout invalidates the
  refresh token; a card PIN persists and its hash is never returned; the reset
  token works once and cannot be replayed.
- Live concurrency, 5 checks — 8 simultaneous payments of half the balance plus
  one, against a balance covering exactly one: **1 succeeded, 7 refused,
  balance never negative, debited total matched the success count exactly.**
- `pinHash` confirmed present in Mongo (`scrypt$…`, 104 chars) — it was absent
  from every card before.

The suite that covers this pass is `smoke-fixes.mjs` and `concurrency-check.mjs`,
both in `%TEMP%\opencode\`. They are deliberately narrow — they assert the
specific behaviours that were wrong, not the whole API surface. Move them into
`server/src/tests/` when the API suites move in.

## Things that look wrong but are not

- **Staff get 403, not 404, on customer-only endpoints.** They have no
  Customer record; the resource is not missing, the caller is the wrong kind of
  user. A 404 made a correct guard look like a missing endpoint.
- **Staff see all cards and the whole ledger** via `GET /cards` and
  `GET /transactions`. That is what `card:read:any` / `transaction:read:any`
  are for. A customer always gets only their own.
- **A staff caller who omits `customerId` gets 400, not an empty page.**
  `resolveTargetCustomer` requires staff to name their target deliberately.
  Defaulting to the first customer would let a teller act on an arbitrary
  account by leaving a field out.
- **Statements for staff need a `customerId`; `GET /statements/:id` does not.**
  The list needs a subject before it can ask for anything; a single statement
  already identifies its owner, so the controller reads it off the document.
- **`GET /transactions` returns 200 for a foreign `accountId`**, with no rows.
  It is a list endpoint; the answer is "nothing you may see", not an error.
- **A customer has `card:read:own` but not `account:read:any`**, so they see
  their own cards but not the bank-wide card list. Correct.
- **The global rate limit is 6000/15min.** High on purpose — a dashboard fires
  six requests, and a low global cap made a normal session exhaust it.
- **The seed leaves some standing instructions already due**, so the scheduler
  has something to do on boot. That is the feature working, not a bug — but it
  does mean the instruction list changes shortly after seeding.
- **Rejected requests log at `warn` with no stack.** A 403 is the access-control
  layer doing its job, not a fault. If you are debugging and cannot see why a
  request was refused, the message says which permission was missing and which
  role held it.
- **The server log is ASCII-only.** `₹` becomes `Rs `, `—` becomes `-`, `•`
  becomes `*`. That is the logger transliterating for Windows consoles, not
  mojibake.

## Starting and stopping

| | Command |
|---|---|
| Start (dev, hot reload) | `start.bat` |
| Start (production build + PWA) | `start.bat production` |
| Start without wiping the database | `start.bat --no-seed` |
| Start after a verification pass | `npm run db:seed` restores pristine demo data |
| **Stop** | **`stop.bat`** |
| Stop, including MongoDB | `stop.bat --mongo` |

**`stop.bat` exists because the instruction it replaced was dangerous.**
`taskkill /f /im node.exe` kills every Node process on the machine. Measured on
this box while it was running: **42 node processes**, of which **6** belonged to
this project — the rest were other projects' dev servers and the editor's MCP
agents, *including the tooling running the session that invoked it*. It also
reads like it is scoped to this app, which is what makes it dangerous rather than
merely rude.

So `stop.bat` is scoped three ways: port holders on 3000/5000/8080, node
processes whose command line is inside this repository, and then it **re-checks
and reports** anything still listening — a stop that cannot fail is a stop you
cannot trust.

It leaves **MongoDB running by default**, because MongoDB here is shared:
`show databases` lists data for several other projects, and stopping the service
takes every one of them down. `--mongo` is opt-in for that reason.

The real work lives in `scripts/stop.ps1`, invoked with `powershell -File`. The
obvious batch version — nested `FOR` over ports calling a PowerShell one-liner
inside a parenthesised block — dies with *"was unexpected at this time"*, because
nested `FOR` loops that reuse a variable name break cmd's parser outright.
`-File` also avoids splicing a path into a quoted command line, which is what
breaks on a profile folder containing a space (OneDrive puts those under
`C:\Users\First Last\`).

**Known rough edge, stated rather than hidden:** killing the server processes
makes their `npm run` parents exit on their own, but that is not instantaneous.
Immediately after a stop, an orphaned watcher can still be visible for a second
or two. It exits; it does not survive the stop.

## Running the verification suites

- Never run two `shots.mjs` runs at once — they share a browser debug port.
- `shots.mjs` also misreports against a busy debug port: with stale targets
  already open on 9222 it reports `CDP timeout: Runtime.evaluate` on every page,
  which looks exactly like a frozen app and is not one. Check the port before
  trusting a `harness failure`, or use a single-purpose probe that opens its own
  target.
- A single CDP timeout no longer aborts the run: each page is wrapped, and a hang
  is recorded as a `harness failure` for that one page. The previous version
  rejected out of the loop and discarded every capture already taken.
- Never run the API suites while `tsx watch` is restarting — the reload shows up
  as spurious 500s and redirect-to-login failures, which is a false alarm.
- The smoke suite creates a payee, an instruction and a deposit, then removes
  all three. Its own leftover records are named like real ones ("Society
  maintenance", not "Smoke rent") so a failed cleanup is still obvious in the
  UI without making the demo data look like a test.

## The two halves of an access check

Getting this right took several passes, so the rule is written down:

1. **The permission gate** (`requirePermission` / `requireAnyPermission`) answers
   "may this role do this kind of thing at all"?
2. **The ownership check** (`loadAccountForUser`, `getCustomerForUser`,
   `visibleAccountIds`) answers "is this *my* record"?

Neither alone is sufficient, and the failure mode of each is different:

- Skipping (1) means a teller can read a customer's KYC queue.
- Skipping (2) means any logged-in user can read any account number.

A `*:own` permission is *necessary but not sufficient* for staff. Staff have no
`Customer` record, so a page that reads one 403s for them however many `*:own`
permissions their role holds — and `admin` holds all of them. The client nav and
the route guards therefore need a `customerOnly` concept on top of the
permission list.

Four places in the client apply this, and all four had to be fixed separately
before the nav stopped lying: `Sidebar` (desktop drawer), `MainLayout`'s
`QUICK_LINKS` (mobile bottom bar), the route tree in `App.tsx`, and
`HomeRedirect`. A hardcoded list in any one of them is a dead link waiting to
happen.

## Quarantined

`client/_wip-unfinished/` — 12 unparseable, unimported components
(analytics, livechat, portfolio, collaboration, feature-flags, realtime,
charts, animations, notifications, loans/LoanCalculator, dashboard/*).
CRA type-checks all of `src/`, so they live outside it. README explains restore.

## Design direction

"Financial ledger" — warm paper `#FAF7F2`, deep ink `#0E1726`, brass accent
`#D97706` / `#F5B841`. Fraunces (display serif), Outfit (UI sans), JetBrains
Mono (tabular figures for money). Deliberately not generic fintech purple.

Dark mode is a `.dark` class on `<html>`, not `prefers-color-scheme`, so an
explicit toggle can win in both directions. Tokens are CSS custom properties
re-pointed by `.dark`; Tailwind colour utilities read them, so no component
knows which theme is active. A blocking inline script in `index.html` applies
the stored choice before first paint.

Every Tailwind colour ramp carries a `DEFAULT` key — without one, the `/opacity`
modifier is not generated and `border-brass/40` silently fails to resolve inside
`@apply`. `client/scripts/check-tokens.mjs` enforces it.

**Inverted surfaces use `bg-text text-card`, never `bg-ink text-white`.** `ink`
is theme-following, so the old spelling became white-on-white in dark mode. The
semantic slots invert by construction, which is why `.btn-primary` in
`index.css` is written that way and hand-written components should match.
`check-tokens` cannot catch this — both spellings resolve, they just resolve to
the wrong colours.

## Current state

Complete and verified. Six roles with a permission matrix exercised end to end
by a 104-check suite; banking features (fixed deposits, standing instructions,
nominees, KYC) built server- and client-side, seeded, and covered by a
129-check smoke suite; a background scheduler for maturities and due
instructions; dark mode with a toggle in the header and on the auth screens; a
permission-driven nav that offers no dead links for any role; and a 132-capture
browser sweep with no console errors.

Re-seed with `npm run db:seed` after a verification run — the suites mutate dev
data by design, and removal is a soft delete.
