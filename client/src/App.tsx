import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { MainLayout } from './components/layout/MainLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { useAuth } from './hooks/useAuth';
import { useAuthStore } from './store/authStore';
import { Button } from './components/ui';

import { RoleDashboard } from './pages/dashboards/RoleDashboard';
import { QuickAccess } from './pages/QuickAccess';
import { Customers } from './pages/Customers';
import { OpenAccount } from './pages/OpenAccount';
import { AccountDetail } from './pages/AccountDetail';
import { AllAccounts } from './pages/AllAccounts';
import { Transactions } from './pages/Transactions';
import { Payments } from './pages/Payments';
import { Cards } from './pages/Cards';
import { Beneficiaries } from './pages/Beneficiaries';
import { Loans } from './pages/Loans';
import { Deposits } from './pages/Deposits';
import { StandingInstructions } from './pages/StandingInstructions';
import { Nominees } from './pages/Nominees';
import { Kyc } from './pages/Kyc';
import { KycQueue } from './pages/KycQueue';
import { Statements } from './pages/Statements';
import { Notifications } from './pages/Notifications';
import { Security } from './pages/Security';
import { Audit } from './pages/Audit';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { NotFound } from './pages/NotFound';
import { usePermissions, usePermissionLoader } from './store/permissionStore';

function FullPageSpinner() {
  return (
    <div className="min-h-screen bg-background grid place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full border-2 border-brass-200 border-t-brass-600 animate-spin"
          role="status"
          aria-label="Loading"
        />
        <p className="text-sm text-muted">Loading your accounts…</p>
      </div>
    </div>
  );
}

/**
 * Shown instead of the spinner when the session check could not reach the API.
 *
 * A spinner that never resolves is the worst possible answer to "the page
 * won't load" - it asserts that something is still coming. Saying the server is
 * unreachable, and offering a retry, turns an unnerving silence into an
 * instruction.
 */
function BootFailure({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background grid place-items-center px-4">
      <div className="max-w-md text-center flex flex-col items-center gap-4">
        <span className="grid place-items-center h-12 w-12 rounded-full bg-danger-50 border border-danger-100 text-danger-600">
          <WifiOff className="w-6 h-6" aria-hidden="true" />
        </span>
        <h1 className="font-display text-xl font-bold text-text">Cannot reach the server</h1>
        <p className="text-sm text-muted leading-relaxed">{message}</p>
        <div className="flex items-center gap-2.5">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button variant="ghost" onClick={() => window.location.assign('/login')}>
            Go to sign in
          </Button>
        </div>
        <p className="text-xs text-muted/80">
          The API runs on port 5000. Start it with <code>start.bat</code>, or check{' '}
          <code>%TEMP%\mangaud-logs\api.log</code>.
        </p>
      </div>
    </div>
  );
}

/** Guards an authenticated layout route: renders <Outlet /> or redirects. */
function ProtectedRoute() {
  const { isAuthenticated, isBootstrapping, sessionError } = useAuth();
  const location = useLocation();

  if (sessionError) return <BootFailure message={sessionError} />;
  if (isBootstrapping) return <FullPageSpinner />;

  // Remember where they were headed, so signing in returns them there rather
  // than dumping them on the dashboard.
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

/** Guards a layout route: renders <Outlet /> for signed-out users. */
function PublicRoute() {
  const { isAuthenticated, isBootstrapping, sessionError } = useAuth();

  if (sessionError) return <BootFailure message={sessionError} />;
  if (isBootstrapping) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}

/**
 * Restricts a route to callers holding *any* of the listed permissions.
 *
 * Permission-based rather than role-based on purpose. A `teller` and an
 * `auditor` are both staff but have almost nothing in common; a role check
 * either lumps them together or grows a `switch` that drifts from the server's
 * matrix. This reads the same list the API enforces, so the guard and the route
 * can never disagree about who belongs here.
 *
 * Renders nothing while the list is still loading, so a deep link does not get
 * bounced before the permissions are known.
 */
function RequirePermission({ anyOf }: { anyOf: string[] }) {
  const { canAny, isResolved } = usePermissions();

  if (!isResolved) return <FullPageSpinner />;
  if (!canAny(...anyOf)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

/**
 * Restricts a route to customers.
 *
 * Almost everything hangs off a `Customer` record, which only exists for
 * customer accounts. Staff opening /cards or /payments got a 403 from every API
 * call, which reads as a broken app rather than a wrong address. Staff are sent
 * to the dashboard, which is a working screen for every role.
 */
function CustomerRoute() {
  const { user } = useAuthStore();
  if (user && user.role !== 'customer') {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

/** Restores the saved scroll offset on browser back/forward. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

/**
 * The front door.
 *
 * Signed in, everyone lands on their own dashboard. This used to send staff to
 * the KYC queue and -- because only a manager holds `kyc:review` -- everyone
 * else to the **audit log**. So a teller and a loan officer opened their day on a
 * read-only compliance screen: the most sensitive screen in the bank, holding
 * none of the tools for the job they were there to do. It was not a missing
 * feature so much as a missing destination.
 *
 * `/dashboard` is now a dispatcher (see `pages/dashboards/RoleDashboard.tsx`) that
 * renders the right screen per role, so there is one home for every signed-in
 * user and no link that can point at a dashboard the viewer cannot open.
 *
 * Signed out, this shows the quick-access hub instead of bouncing straight to a
 * login form. `isBootstrapping` is checked before either branch on purpose: it is
 * the one window where `isAuthenticated` is still false while a real session is
 * being restored from storage, and rendering the hub then would flash a
 * signed-out page at somebody who is signed in.
 */
function FrontDoor() {
  const { isAuthenticated, isBootstrapping, sessionError } = useAuth();

  if (sessionError) return <BootFailure message={sessionError} />;
  if (isBootstrapping) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <QuickAccess />;
}

function App() {
  // One capability fetch per session, shared by the guards, the sidebar and any
  // component that hides a control behind `can(...)`.
  usePermissionLoader();

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<FrontDoor />} />

        {/* Public: each auth screen is a route element so PublicRoute and
            AuthLayout can each render an <Outlet />. Passing them as children
            would nest a <Routes> tree inside a route element. */}
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<AuthLayout><Login /></AuthLayout>} />
          <Route path="/register" element={<AuthLayout><Register /></AuthLayout>} />
          <Route path="/forgot-password" element={<AuthLayout><ForgotPassword /></AuthLayout>} />
          <Route path="/reset-password" element={<AuthLayout><ResetPassword /></AuthLayout>} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            {/*
              Permission-gated. Each guard reads the same list the API
              enforces, so the route and the endpoint can never disagree.
            */}
            <Route element={<RequirePermission anyOf={['audit:read:any']} />}>
              <Route path="/audit" element={<Audit />} />
            </Route>
            <Route element={<RequirePermission anyOf={['kyc:review']} />}>
              <Route path="/kyc-queue" element={<KycQueue />} />
            </Route>
            <Route element={<RequirePermission anyOf={['customer:read:any']} />}>
              <Route path="/customers" element={<Customers />} />
            </Route>

            {/*
              Open an account — two callers, one page.

              A customer opens their own (`account:open`). A teller or manager
              holding `account:open:any` opens one at the counter for a named
              customer their branch serves, and the page swaps the deposit box
              for a customer lookup. It sits *outside* `CustomerRoute` because
              that guard redirects every staff member to the dashboard, which
              would make the counter workflow unreachable in the UI even though
              the API supports it.

              The server route mirrors this with
              `requireAnyPermission('account:open', 'account:open:any')`.
            */}
            <Route
              element={<RequirePermission anyOf={['account:open', 'account:open:any']} />}
            >
              <Route path="/accounts/open" element={<OpenAccount />} />
            </Route>

            {/*
              Works for customers and for staff who hold the `:any` form —
              a teller looking up any customer's ledger, a manager issuing a
              statement. The page reads `own` or `any` from the same response,
              so one implementation serves both without a staff variant.
            */}
            <Route
              element={<RequirePermission anyOf={['account:read:own', 'account:read:any']} />}
            >
              <Route path="/accounts" element={<AllAccounts />} />
              {/* One account. Was rendering <OpenAccount />, so clicking an
                  account on the dashboard asked the customer to open a new one. */}
              <Route path="/accounts/:accountNumber" element={<AccountDetail />} />
            </Route>
            <Route
              element={
                <RequirePermission anyOf={['transaction:read:own', 'transaction:read:any']} />
              }
            >
              <Route path="/transactions" element={<Transactions />} />
            </Route>
            <Route
              element={<RequirePermission anyOf={['statement:read:own', 'statement:read:any']} />}
            >
              <Route path="/statements" element={<Statements />} />
            </Route>
            <Route element={<RequirePermission anyOf={['card:read:own', 'card:read:any']} />}>
              <Route path="/cards" element={<Cards />} />
            </Route>
            <Route element={<RequirePermission anyOf={['notification:read:own']} />}>
              <Route path="/notifications" element={<Notifications />} />
            </Route>

            {/*
              The dashboard is NOT under `CustomerRoute`, and that is load-bearing.

              It was, and for a staff role that produced an empty page with no
              error: `CustomerRoute` redirects staff to `/dashboard`, the
              dashboard rendered inside `CustomerRoute`, so the redirect fired
              again on every render. React gives up on the cycle and paints
              nothing — a blank outlet, no exception, no console message. The
              customer worked because no redirect ever fired for them, which is
              why it looked like "the dashboard is customer-only" rather than a
              loop.

              Now the route is unguarded by role and the *dispatcher* decides
              what to show, which is the whole point of having six dashboards.
            */}
            <Route path="/dashboard" element={<RoleDashboard />} />

            {/*
              Loans are shared: a customer reads their own book, and a branch
              officer or manager reads the branch queue. The page itself picks
              the view from the permissions the client already holds.
            */}
            <Route element={<RequirePermission anyOf={['loan:read:own', 'loan:read:any']} />}>
              <Route path="/loans" element={<Loans />} />
            </Route>

            {/*
              Customer-only. These hang off a `Customer` record, which staff do
              not have, so a `*:own` permission is necessary but not sufficient
              for staff — hence the extra role guard on top of the permission.
            */}
            <Route element={<CustomerRoute />}>
              <Route path="/payments" element={<Payments />} />
              <Route path="/beneficiaries" element={<Beneficiaries />} />
              <Route path="/deposits" element={<Deposits />} />
              <Route path="/standing-instructions" element={<StandingInstructions />} />
              <Route path="/nominees" element={<Nominees />} />
              <Route path="/kyc" element={<Kyc />} />
            </Route>

            {/* Shared by every role, so they live outside the customer guard. */}
            <Route path="/security" element={<Security />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;
