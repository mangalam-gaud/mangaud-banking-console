import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wallet,
  Landmark,
  TrendingUp,
  Briefcase,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  CreditCard,
  Users,
  Bell,
  Plus,
  RefreshCw,
  ChevronRight,
  Calendar,
  ShieldCheck,
  TrendingDown,
  Wallet as WalletIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency, formatRelativeTime, isCredit, getTransactionTypeLabel, maskAccountNumber } from '../utils/format';
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  StatusBadge,
  Skeleton,
  EmptyState,
} from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { useAccountStore } from '../store/accountStore';
import { api } from '../services/api';
import { Account, CardSummary, AppNotification } from '../types';
import { cn } from '../utils/cn';

const ACCOUNT_ICON: Record<string, typeof Wallet> = {
  SAVINGS: Wallet,
  CURRENT: Briefcase,
  SALARY: TrendingUp,
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const { accounts, transactions, loans, fetchAccounts, fetchTransactions, fetchLoans } = useAccountStore();

  const [cardSummary, setCardSummary] = useState<CardSummary | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [summaryRes, notifRes] = await Promise.all([
        api.getCardSummary().catch(() => null),
        api.getNotifications({ limit: 4 }).catch(() => null),
      ]);
      setCardSummary(summaryRes?.data?.summary ?? null);
      setNotifications(notifRes?.data?.notifications ?? []);
    } catch {
      /* the dashboard is still useful without these panels */
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchAccounts();
    fetchTransactions({ limit: 8 });
    fetchLoans();
    load();
  }, [isAuthenticated, fetchAccounts, fetchTransactions, fetchLoans, load]);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchAccounts(), fetchTransactions({ limit: 8 }), fetchLoans(), load()]);
      toast.success('Up to date');
    } catch {
      toast.error('Could not refresh');
    } finally {
      setRefreshing(false);
    }
  };

  const stats = useMemo(() => {
    const open = accounts.filter((a) => a.status === 'ACTIVE');
    const totalBalance = open.reduce((sum, a) => sum + a.balance, 0);
    const activeLoans = loans.filter((l) => l.status === 'DISBURSED');
    const outstanding = activeLoans.reduce((sum, l) => sum + (l.outstandingAmount ?? 0), 0);
    const nextEmi = activeLoans
      .filter((l) => l.nextDueDate)
      .sort((a, b) => new Date(a.nextDueDate!).getTime() - new Date(b.nextDueDate!).getTime())[0];

    // Money in vs out over the recent transaction window.
    let inflow = 0;
    let outflow = 0;
    for (const t of transactions) {
      if (t.status !== 'COMPLETED') continue;
      if (isCredit(t.transactionType)) inflow += t.amount;
      else outflow += t.amount;
    }

    return { open, totalBalance, activeLoans, outstanding, nextEmi, inflow, outflow };
  }, [accounts, loans, transactions]);

  if (!isAuthenticated) return null;

  const recent = transactions.slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        title={`${greeting()}, ${user?.firstName ?? 'there'}`}
        description="Here's where your money stands today."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />}
              onClick={refreshAll}
              isLoading={refreshing}
            >
              Refresh
            </Button>
            <Button
              variant="brass"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => navigate('/accounts/open')}
            >
              New account
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------- hero row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Total balance, on the dark brand panel. */}
        <CardAccentPanel
          total={stats.totalBalance}
          accountCount={stats.open.length}
          inflow={stats.inflow}
          outflow={stats.outflow}
        />

        <Card className="card-lift p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Loan outstanding</p>
              <p className="figure-md mt-2 text-text">{formatCurrency(stats.outstanding)}</p>
              <p className="mt-2 text-xs text-muted">
                across {stats.activeLoans.length}{' '}
                {stats.activeLoans.length === 1 ? 'loan' : 'loans'}
              </p>
            </div>
            <span className="grid place-items-center h-10 w-10 shrink-0 rounded-xl bg-brass-50 border border-brass-100 text-brass-700">
              <Landmark className="w-5 h-5" aria-hidden="true" />
            </span>
          </div>

          {stats.nextEmi ? (
            <div className="mt-4 pt-3.5 border-t border-border">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                  Next EMI
                </span>
                <span className="font-mono text-text">{formatCurrency(stats.nextEmi.emiAmount ?? 0)}</span>
              </div>
              <p className="text-[0.6875rem] text-muted mt-1">
                due {formatRelativeTime(stats.nextEmi.nextDueDate)}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 -ml-3"
                onClick={() => navigate('/loans')}
              >
                Review loans <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className="card-lift p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Card spend</p>
              <p className="figure-md mt-2 text-text">{formatCurrency(cardSummary?.monthlySpend ?? 0)}</p>
              <p className="mt-2 text-xs text-muted">
                {formatCurrency(cardSummary?.monthlyAvailable ?? 0)} of limit still available
              </p>
            </div>
            <span className="grid place-items-center h-10 w-10 shrink-0 rounded-xl bg-primary-50 border border-primary-100 text-primary-600">
              <CreditCard className="w-5 h-5" aria-hidden="true" />
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs">
            <Badge variant="neutral" size="sm">
              {cardSummary?.active ?? 0} active
            </Badge>
            {cardSummary?.frozen ? (
              <Badge variant="warning" size="sm">
                {cardSummary.frozen} frozen
              </Badge>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto -mr-2"
              onClick={() => navigate('/cards')}
            >
              Manage
            </Button>
          </div>
        </Card>
      </div>

      {/*
        Two columns, with the *long* list taking the wide slot.

        The previous arrangement put a two-row accounts card in the 2/3 column
        and a six-row activity list in the 1/3 column. The columns are wildly
        different heights, so the left one ended several hundred pixels above the
        right and left a screenful of empty page. Putting the long list wide and
        stacking the short cards in the narrow column means whichever column is
        shorter is the one with room to spare, and the gap closes up.
      */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* ------------------------------------------- activity (the long one) */}
        <div className="lg:col-span-2 space-y-5 order-2 lg:order-1">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
              <CardTitle className="text-base">Recent activity</CardTitle>
              <Link
                to="/transactions"
                className="text-xs font-medium text-brass-700 hover:text-brass-800"
              >
                All
              </Link>
            </CardHeader>

            {recent.length === 0 ? (
              <p className="px-5 sm:px-6 pb-6 text-sm text-muted">No transactions yet.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {recent.map((t) => {
                  const credit = isCredit(t.transactionType);
                  return (
                    <li key={t.id} className="px-5 sm:px-6 py-3 flex items-center gap-3">
                      <span
                        className={cn(
                          'grid place-items-center h-8 w-8 shrink-0 rounded-lg border',
                          credit
                            ? 'bg-success-50 border-success-100 text-success-600'
                            : 'bg-brass-50 border-brass-100 text-brass-700'
                        )}
                      >
                        {credit ? (
                          <ArrowDownLeft className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text truncate">
                          {t.description || getTransactionTypeLabel(t.transactionType)}
                        </p>
                        <p className="text-[0.6875rem] text-muted mt-0.5 truncate">
                          {getTransactionTypeLabel(t.transactionType)} ·{' '}
                          {formatRelativeTime(t.createdAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'font-mono text-sm shrink-0 tnum',
                          credit ? 'text-success-700' : 'text-ink-soft'
                        )}
                      >
                        {/*
                          Exact figures, not `-7.19K`. The sign is carried by the
                          arrow and the colour, so a leading minus on top of a
                          red arrow is a double negative; and abbreviating money
                          to three significant digits is not something a
                          statement is allowed to do. A lakh-scale amount still
                          fits — this is a two-column layout with room for it.
                        */}
                        {credit ? '+' : '−'}
                        {formatCurrency(t.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Quick actions, full width under the list they shortcut to. */}
          <Card className="p-4">
            <p className="eyebrow mb-3">Quick actions</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { to: '/payments', label: 'Send money', Icon: ArrowUpRight },
                { to: '/beneficiaries', label: 'Payees', Icon: Users },
                { to: '/statements', label: 'Statements', Icon: WalletIcon },
                { to: '/security', label: 'Security', Icon: ShieldCheck },
              ].map(({ to, label, Icon }) => (
                <button
                  key={to}
                  onClick={() => navigate(to)}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-paper/50 hover:bg-paper hover:border-brass/40 transition-colors text-left"
                >
                  <Icon className="w-4 h-4 text-brass-600 shrink-0" aria-hidden="true" />
                  <span className="text-xs font-medium text-ink-soft">{label}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* ------------------------------- the short cards, stacked narrow */}
        <div className="space-y-5 order-1 lg:order-2">
        {/* ------------------------------------------------------ accounts */}
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle>Your accounts</CardTitle>
              <CardDescription>
                {stats.open.length} open
                {accounts.length > stats.open.length
                  ? ` · ${accounts.length - stats.open.length} inactive`
                  : ''}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/accounts')}
            >
              View all <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </CardHeader>

          {accounts.length === 0 ? (
            <EmptyState
              icon={<Wallet className="w-6 h-6" />}
              title="No accounts yet"
              description="Open a savings or current account to get started."
              action={
                <Button variant="brass" onClick={() => navigate('/accounts/open')}>
                  Open an account
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {accounts.slice(0, 4).map((account) => {
                const Icon = ACCOUNT_ICON[account.accountType] ?? Wallet;
                return (
                  <li key={account.id}>
                    <button
                      onClick={() => navigate(`/accounts/${account.accountNumber}`)}
                      className="w-full text-left flex items-center gap-3.5 px-5 sm:px-6 py-4 hover:bg-paper/60 transition-colors"
                    >
                      <span
                        className={cn(
                          'grid place-items-center h-10 w-10 shrink-0 rounded-xl border',
                          account.status === 'ACTIVE'
                            ? 'bg-primary-50 border-primary-100 text-primary-600'
                            : 'bg-paper border-border text-muted'
                        )}
                      >
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text">{account.accountType}</span>
                          <StatusBadge status={account.status} />
                        </span>
                        <span className="block font-mono text-xs text-muted mt-0.5">
                          {maskAccountNumber(account.accountNumber)}
                          {account.interestRate ? ` · ${account.interestRate}% p.a.` : ''}
                        </span>
                      </span>

                      <span className="text-right shrink-0">
                        <span className="block font-mono text-sm font-semibold text-text tnum">
                          {formatCurrency(account.balance)}
                        </span>
                        {account.accountType === 'SAVINGS' ? (
                          <span className="block text-[0.6875rem] text-muted mt-0.5">
                            earns {formatCurrency(
                              (account.balance * account.interestRate) / 100 / 12
                            )}/mo
                          </span>
                        ) : null}
                      </span>

                      <ChevronRight
                        className="w-4 h-4 text-muted/50 shrink-0 hidden sm:block"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

          {notifications.length > 0 ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted" aria-hidden="true" />
                  Alerts
                </CardTitle>
                <Link
                  to="/notifications"
                  className="text-xs font-medium text-brass-700 hover:text-brass-800"
                >
                  All
                </Link>
              </CardHeader>
              <ul className="divide-y divide-border/70">
                {notifications.slice(0, 3).map((n) => (
                  <li key={n.id} className="px-5 sm:px-6 py-3">
                    <p
                      className={cn(
                        'text-sm truncate',
                        n.read ? 'text-ink-soft' : 'font-medium text-text'
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[0.6875rem] text-muted/70 mt-1">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The dark brand panel that anchors the top of the dashboard. */
function CardAccentPanel({
  total,
  accountCount,
  inflow,
  outflow,
}: {
  total: number;
  accountCount: number;
  inflow: number;
  outflow: number;
}) {
  const net = inflow - outflow;

  return (
    <div
      /*
        `rounded-lg`, not `rounded-[--radius]`. Tailwind's arbitrary-value syntax
        needs the CSS function -- `rounded-[--radius]` is not a value Tailwind
        can resolve, so the class was silently dropped and this panel rendered
        with square corners while every other surface on the page was 8px. The
        failure is invisible in review and obvious on screen.

        The shadow plus the inset top highlight is what gives the panel its
        physical edge; the gradient alone reads as a flat rectangle of colour.
      */
      className="relative rounded-lg p-5 sm:p-6 overflow-hidden shadow-overlay"
      style={{
        backgroundImage:
          'linear-gradient(140deg, #1B2A44 0%, #0E1726 55%, #080D15 100%)',
        boxShadow:
          'var(--shadow-xl), inset 0 1px 0 0 rgb(255 255 255 / 0.10)',
      }}
    >
      {/* Concentric arcs echoing the logo mark. */}
      <div
        className="absolute -right-20 -top-24 w-80 h-80 rounded-full border border-white/[0.06]"
        aria-hidden="true"
      />
      <div
        className="absolute -right-10 -top-14 w-52 h-52 rounded-full border border-white/[0.06]"
        aria-hidden="true"
      />
      <div
        className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-brass-400/70 to-transparent"
        aria-hidden="true"
      />

      <div className="relative">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-brass-300/80">
          Total balance
        </p>
        {/*
          600, not 700, at 34px. Bold at display size thickens the strokes until
          the counters in 0/6/8 start to close up, and this is the one figure on
          the page that has to be read at a glance -- it is the balance.
        */}
        <p className="mt-2.5 text-[1.875rem] sm:text-[2.125rem] leading-[1.05] tracking-[-0.024em] font-semibold text-white tnum">
          {formatCurrency(total)}
        </p>
        <p className="mt-2 text-xs text-white/50">
          {accountCount} {accountCount === 1 ? 'account' : 'accounts'} open
        </p>

        {/*
          Exact figures, not `1.88 L` / `62.24K`.

          Abbreviating money is fine in a tight chart label and wrong next to a
          total balance shown to the paisa — "₹1.88 L more in than out" is not a
          number anyone can reconcile against their own statement. The compact
          form stays available in `formatCompactCurrency` for places that
          genuinely need it (a narrow table cell, a chart axis).
        */}
        <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[0.625rem] uppercase tracking-[0.12em] text-white/40">In</p>
            <p className="font-mono text-sm text-success-400 mt-0.5 tnum">
              +{formatCurrency(inflow)}
            </p>
          </div>
          <div>
            <p className="text-[0.625rem] uppercase tracking-[0.12em] text-white/40">Out</p>
            <p className="font-mono text-sm text-brass-300 mt-0.5 tnum">
              −{formatCurrency(outflow)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[0.6875rem]">
          {net >= 0 ? (
            <>
              <TrendingUp className="w-3.5 h-3.5 text-success-400" aria-hidden="true" />
              <span className="text-success-400">
                {formatCurrency(net)} more in than out
              </span>
            </>
          ) : (
            <>
              <TrendingDown className="w-3.5 h-3.5 text-brass-300" aria-hidden="true" />
              <span className="text-brass-300">
                {formatCurrency(Math.abs(net))} more out than in
              </span>
            </>
          )}
          <span className="text-white/35">· recent activity</span>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
