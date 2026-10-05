import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote, UserPlus, ArrowLeftRight, BadgeCheck, Landmark, PiggyBank,
  Snowflake, AlertTriangle, ClipboardCheck, Wallet, ShieldAlert, Building2,
  Users, UserCog, Activity, FileWarning,
} from 'lucide-react';
import { api } from '../../services/api';
import { StatTile } from '../../components/ui';
import { usePermissions } from '../../store/permissionStore';
import { Dashboard as CustomerDashboard } from '../Dashboard';
import { Panel, WorkItem, ActionTile, Nothing, Fact, ScopeNote } from './shared';
import { formatCurrency, formatDate } from '../../utils/format';

/**
 * Staff dashboards — one per role, each shaped around that role's actual day.
 *
 * The principle these share: **the bank is the servant, the customer is the
 * account holder.** A teller at a counter serves a customer standing in front of
 * them; an officer underwrites; a manager signs. None of that is "reporting", so
 * none of these screens is a dashboard of charts. Each one answers the only
 * question that matters at the start of a shift — *what is waiting for me?* —
 * and every row is a link into the workflow that resolves it.
 *
 * Everything on screen is branch-scoped by the server. Each dashboard says so,
 * because a scoped view that does not announce its scope is indistinguishable
 * from the whole bank, and the person operating inside the limit should be able
 * to see it.
 */

/* ------------------------------------------------------------------ teller */

function TellerDashboard() {
  const { branchCode } = usePermissions();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.getAllAccounts({ limit: 50 }).catch(() => null),
      api.getAllCards({ limit: 50 }).catch(() => null),
    ]).then(([a, c]) => {
      setAccounts(a?.data?.accounts ?? []);
      setCards(c?.data?.cards ?? []);
    });
  }, []);

  const frozen = accounts.filter((a) => a.status === 'FROZEN');
  const dormant = accounts.filter((a) => a.status === 'DORMANT');
  const active = accounts.filter((a) => a.status === 'ACTIVE');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Counter</h1>
        <p className="mt-1 text-sm text-muted">
          Cash and customer service for branch {branchCode}. You can look up any customer in
          your branch and handle cash; credit approval and account freezes sit with the manager.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Active accounts" value={active.length} hint="in your branch" />
        <StatTile label="On hold" value={frozen.length} hint="frozen — manager to lift" tone={frozen.length ? 'warning' : 'neutral'} />
        <StatTile label="Dormant" value={dormant.length} hint="no activity" tone={dormant.length ? 'warning' : 'neutral'} />
      </div>

      <section aria-labelledby="counter-actions">
        <h2 id="counter-actions" className="eyebrow mb-3">Counter actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ActionTile to="/accounts/open" icon={UserPlus} label="Open an account" hint="For a walk-in customer. Starts at zero balance." />
          <ActionTile to="/accounts" icon={Banknote} label="Cash deposit / withdrawal" hint="Counter operations are recorded against the customer." />
          <ActionTile to="/customers" icon={Users} label="Find a customer" hint="Search your branch by name, phone or email." />
          <ActionTile to="/cards" icon={Landmark} label="Issue or freeze a card" hint="You cannot cancel a card or change its limits." />
          <ActionTile to="/transactions" icon={ArrowLeftRight} label="Verify a transaction" hint="Trace a credit or debit on any branch account." />
          <ActionTile to="/statements" icon={BadgeCheck} label="Print a statement" hint="For a customer at the counter." />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Accounts needing attention"
          subtitle="Frozen and dormant accounts in your branch"
          to="/accounts"
        >
          {frozen.length + dormant.length === 0 ? (
            <Nothing>Every account in {branchCode} is active.</Nothing>
          ) : (
            <>
              {frozen.map((a) => (
                <WorkItem
                  key={a.id}
                  to={`/accounts/${a.accountNumber}`}
                  title={`${a.accountType} · ${a.accountNumber}`}
                  meta="Frozen — a manager lifts the hold"
                  right={formatCurrency(a.balance)}
                  tone="warning"
                />
              ))}
              {dormant.map((a) => (
                <WorkItem
                  key={a.id}
                  to={`/accounts/${a.accountNumber}`}
                  title={`${a.accountType} · ${a.accountNumber}`}
                  meta="Dormant"
                  right={formatCurrency(a.balance)}
                />
              ))}
            </>
          )}
        </Panel>

        <Panel title="Cards in your branch" subtitle="Issued, active and frozen" to="/cards">
          {cards.length === 0 ? (
            <Nothing>No cards are issued in {branchCode}.</Nothing>
          ) : (
            <>
              {cards.slice(0, 6).map((c) => (
                <WorkItem
                  key={c.id}
                  to="/cards"
                  title={c.maskedNumber ?? c.cardNumber}
                  meta={`${c.cardholderName ?? 'Cardholder'} · ${c.status}`}
                  tone={c.status === 'FROZEN' ? 'warning' : 'neutral'}
                />
              ))}
            </>
          )}
        </Panel>
      </div>

      <ScopeNote>
        You are seeing branch {branchCode} only. Another branch's customers and accounts are
        not returned to your search or your lists — asking for one is refused rather than
        quietly hidden.
      </ScopeNote>
    </div>
  );
}

/* ----------------------------------------------------------- loan officer */

function LoanOfficerDashboard() {
  const { branchCode } = usePermissions();
  const [loans, setLoans] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.getAllLoans({ limit: 50 }).catch(() => null),
      api.getOverdueLoans().catch(() => null),
    ]).then(([l, o]) => {
      setLoans(l?.data?.loans ?? []);
      setOverdue(o?.data?.loans ?? []);
    });
  }, []);

  const pending = loans.filter((l) => l.status === 'APPLIED');
  const approved = loans.filter((l) => l.status === 'APPROVED');
  const disbursed = loans.filter((l) => l.status === 'DISBURSED');
  const outstanding = disbursed.reduce((sum, l) => sum + (l.outstandingAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Underwriting</h1>
        <p className="mt-1 text-sm text-muted">
          Assess and approve credit for branch {branchCode}. Disbursement is deliberately not
          yours — a manager releases the funds, so no single person can originate, approve and
          pay out the same loan.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Awaiting approval" value={pending.length} tone={pending.length ? 'warning' : 'positive'} hint="your queue" />
        <StatTile label="Approved, awaiting disbursal" value={approved.length} hint="manager signs these off" />
        <StatTile label="Live book" value={disbursed.length} hint="disbursed and repaying" />
        <StatTile label="Outstanding" value={formatCurrency(outstanding)} hint="principal to recover" tone="brass" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Applications to assess"
          subtitle="Oldest first — a customer is waiting on each of these"
          to="/loans"
        >
          {pending.length === 0 ? (
            <Nothing>Nothing waiting. Your queue is clear.</Nothing>
          ) : (
            pending.slice(0, 6).map((l) => (
              <WorkItem
                key={l.id}
                to="/loans"
                title={`Applied ${formatDate(l.appliedAt)}`}
                meta={`${l.termMonths} months at ${l.interestRate}%`}
                right={formatCurrency(l.principalAmount)}
              />
            ))
          )}
        </Panel>

        <Panel
          title="Overdue in your branch"
          subtitle="Past the due date — collections follow, not approval"
          to="/loans"
        >
          {overdue.length === 0 ? (
            <Nothing>No overdue accounts in {branchCode}.</Nothing>
          ) : (
            overdue.slice(0, 6).map((l) => (
              <WorkItem
                key={l.id}
                to="/loans"
                title={`Due ${formatDate(l.nextDueDate)}`}
                meta={`${l.account?.accountNumber ?? ''}`}
                right={formatCurrency(l.outstandingAmount)}
                tone="danger"
              />
            ))
          )}
        </Panel>
      </div>

      <ScopeNote>
        The loan book, balances and customer records are limited to branch {branchCode}. You
        hold no cash-handling permission: deposits, withdrawals and payouts are the counter's
        and the manager's.
      </ScopeNote>
    </div>
  );
}

/* -------------------------------------------------------------- manager */

function ManagerDashboard() {
  const { branchCode, isStaff } = usePermissions();
  const [kyc, setKyc] = useState<{ submissions: any[]; counts: Record<string, number> } | null>(null);
  const [loans, setLoans] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.getKycQueue().catch(() => null),
      api.getAllLoans({ limit: 50 }).catch(() => null),
      api.getBranches().catch(() => null),
      api.getAllAccounts({ limit: 100 }).catch(() => null),
    ]).then(([k, l, b, a]) => {
      setKyc(k?.data ?? null);
      setLoans(l?.data?.loans ?? []);
      setBranches(b?.data?.branches ?? []);
      setAccounts(a?.data?.accounts ?? []);
    });
  }, []);

  const awaitingDisbursal = loans.filter((l) => l.status === 'APPROVED');
  const kycPending = kyc?.submissions?.filter((s: any) => s.status === 'SUBMITTED' || s.status === 'UNDER_REVIEW') ?? [];
  const frozen = accounts.filter((a) => a.status === 'FROZEN');
  const headOffice = !isStaff || branchCode === 'HO';
  const branchBalance = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Branch manager</h1>
        <p className="mt-1 text-sm text-muted">
          The approvals a teller cannot give, inside branch {branchCode}
          {headOffice ? ', with head-office visibility across every branch' : ''}. Staff accounts
          are head office's responsibility, not the branch's.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Loans to disburse" value={awaitingDisbursal.length} tone={awaitingDisbursal.length ? 'warning' : 'positive'} hint="approved, awaiting funds" />
        <StatTile label="KYC awaiting sign-off" value={kycPending.length} tone={kycPending.length ? 'warning' : 'positive'} />
        <StatTile label="Frozen accounts" value={frozen.length} tone={frozen.length ? 'warning' : 'neutral'} hint="holds you placed or inherited" />
        <StatTile label="Branch balance" value={formatCurrency(branchBalance)} tone="brass" hint="accounts in scope" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Ready to disburse"
          subtitle="Approved by an officer — releasing the funds is yours"
          to="/loans"
        >
          {awaitingDisbursal.length === 0 ? (
            <Nothing>No approved loan is waiting for funds.</Nothing>
          ) : (
            awaitingDisbursal.slice(0, 6).map((l) => (
              <WorkItem
                key={l.id}
                to="/loans"
                title={`Approved ${formatDate(l.approvedAt ?? l.appliedAt)}`}
                meta={`${l.termMonths} months at ${l.interestRate}%`}
                right={formatCurrency(l.principalAmount)}
              />
            ))
          )}
        </Panel>

        <Panel
          title="KYC sign-off"
          subtitle="Regulatory: a customer cannot be verified by the person who onboarded them alone"
          to="/kyc-queue"
        >
          {kycPending.length === 0 ? (
            <Nothing>Nothing waiting for sign-off.</Nothing>
          ) : (
            kycPending.slice(0, 6).map((s: any) => (
              <WorkItem
                key={s.id ?? s._id}
                to="/kyc-queue"
                title={`${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || 'Submission'}
                meta={s.riskLevel ? `Risk: ${s.riskLevel}` : 'Awaiting decision'}
                right={s.pepFlag ? 'PEP' : undefined}
                tone={s.pepFlag ? 'danger' : 'neutral'}
              />
            ))
          )}
        </Panel>
      </div>

      {headOffice && branches.length > 0 ? (
        <Panel title="Branch book" subtitle="Accounts and staff per branch" to="/accounts">
          {branches.map((b) => (
            <WorkItem
              key={b.code}
              to="/accounts"
              title={b.code === 'HO' ? 'Head office' : `Branch ${b.code}`}
              meta={`${b.accounts} accounts · ${b.staff} staff`}
              right={typeof b.totalBalance === 'number' ? formatCurrency(b.totalBalance) : undefined}
            />
          ))}
        </Panel>
      ) : null}

      <ScopeNote>
        {headOffice
          ? 'Head office is unscoped, so every branch is visible here. Branch totals are shown because head office is entitled to them; a branch-level login sees neither other branches nor their balances.'
          : `You are seeing branch ${branchCode} only. Staff roles and branches outside it are not returned to you.`}
      </ScopeNote>
    </div>
  );
}

/* -------------------------------------------------------------- auditor */

function AuditorDashboard() {
  const { branchCode } = usePermissions();
  const [audit, setAudit] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.getAuditLog({ limit: 25 }).catch(() => null),
      api.getAllAccounts({ limit: 100 }).catch(() => null),
      api.getBranches().catch(() => null),
    ]).then(([a, ac, b]) => {
      setAudit(a?.data?.entries ?? []);
      setAccounts(ac?.data?.accounts ?? []);
      setBranches(b?.data?.branches ?? []);
    });
  }, []);

  const frozen = accounts.filter((a) => a.status === 'FROZEN');
  const closed = accounts.filter((a) => a.status === 'CLOSED');
  const totalAccounts = branches.reduce((sum, b) => sum + (b.accounts ?? 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Audit &amp; compliance</h1>
        <p className="mt-1 text-sm text-muted">
          Read the whole bank, change none of it. Every write permission is withheld from this
          role — including the maturity sweep, which pays money out and therefore belongs to
          management.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Accounts in scope" value={totalAccounts || accounts.length} hint="across every branch" />
        <StatTile label="Frozen" value={frozen.length} tone={frozen.length ? 'warning' : 'neutral'} hint="holds placed by staff" />
        <StatTile label="Closed" value={closed.length} hint="irreversible" />
        <StatTile label="Branches" value={branches.length} hint="directory visible" tone="brass" />
      </div>

      <Panel
        title="Recent audit trail"
        subtitle="Immutable. Every entry names the role that produced it, and the address it came from."
        to="/audit"
      >
        {audit.length === 0 ? (
          <Nothing>No entries in the recent window.</Nothing>
        ) : (
          audit.slice(0, 10).map((entry, i) => (
            <WorkItem
              key={entry.id ?? entry._id ?? i}
              to="/audit"
              title={entry.action ?? 'Action'}
              meta={`${entry.actorEmail ?? entry.actor ?? 'system'} · ${formatDate(entry.createdAt)}`}
              tone={entry.status === 'FAILURE' ? 'danger' : 'neutral'}
            />
          ))
        )}
      </Panel>

      <ScopeNote>
        You hold read-only across every branch, and the trail records who read what. Your own
        login history is under Security; the bank's full trail is here.
      </ScopeNote>
    </div>
  );
}

/* ---------------------------------------------------------------- admin */

function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [ready, setReady] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.getStaff().catch(() => null),
      api.getBranches().catch(() => null),
      fetch('/api/v1/ready').then((r) => r.json()).catch(() => null),
    ]).then(([u, b, r]) => {
      setUsers(u?.data?.users ?? []);
      setBranches(b?.data?.branches ?? []);
      setReady(r?.data ?? null);
    });
  }, []);

  const staff = users.filter((u) => u.role !== 'customer');
  const inactive = users.filter((u) => u.isActive === false);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Head office</h1>
        <p className="mt-1 text-sm text-muted">
          Staff accounts, branch structure and system health. The only role that can grant
          administrator access — and it cannot change its own role, so a console cannot lock
          itself out.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Staff" value={staff.length} hint="with a bank role" />
        <StatTile label="Branches" value={branches.length} hint="in the directory" tone="brass" />
        <StatTile label="Deactivated" value={inactive.length} tone={inactive.length ? 'warning' : 'positive'} hint="sessions revoked" />
        <StatTile
          label="Database"
          value={ready?.database?.name ?? '—'}
          hint={ready?.database?.connected ? 'connected' : 'unknown'}
          tone={ready?.database?.connected ? 'positive' : 'danger'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Staff accounts" subtitle="Role and branch assignment" to="/profile">
          {staff.length === 0 ? (
            <Nothing>No staff records returned.</Nothing>
          ) : (
            staff.map((u) => (
              <WorkItem
                key={u.id}
                title={u.fullName || u.email}
                meta={`${u.roleLabel ?? u.role} · ${u.branchCode}`}
                right={u.isActive === false ? 'inactive' : undefined}
                tone={u.isActive === false ? 'danger' : 'neutral'}
              />
            ))
          )}
        </Panel>

        <Panel title="Branch structure" subtitle="Accounts and staff per branch">
          {branches.map((b) => (
            <WorkItem
              key={b.code}
              title={b.code === 'HO' ? 'Head office' : `Branch ${b.code}`}
              meta={`${b.accounts} accounts · ${b.staff} staff`}
              right={typeof b.totalBalance === 'number' ? formatCurrency(b.totalBalance) : undefined}
            />
          ))}
        </Panel>
      </div>

      <ScopeNote>
        Administrator is unscoped by design — it is the role that administers. Every change you
        make to a staff record revokes that person's sessions, and every change is written to
        the audit trail.
      </ScopeNote>
    </div>
  );
}

/* ------------------------------------------------------------ dispatcher */

/**
 * One dashboard per role.
 *
 * A single route with six faces rather than six routes, so there is exactly one
 * home for a signed-in user and no possibility of a link pointing at a dashboard
 * that role cannot open. The dispatcher is permission-driven, never role-driven:
 * the same list the sidebar and the route guards use decides what renders, so all
 * three agree by construction.
 */
export function RoleDashboard() {
  const { isStaff, can, isResolved } = usePermissions();

  if (!isResolved) {
    return (
      <div className="py-16 text-center text-sm text-muted">Loading your workspace…</div>
    );
  }

  // The customer is the primary actor: they hold the accounts, choose the
  // products and initiate everything. Staff dashboards are for serving them.
  if (!isStaff) return <CustomerDashboard />;
  if (can('user:manage')) return <AdminDashboard />;
  if (can('kyc:review')) return <ManagerDashboard />;
  if (can('loan:approve')) return <LoanOfficerDashboard />;
  if (can('account:deposit')) return <TellerDashboard />;
  return <AuditorDashboard />;
}


export default RoleDashboard;
