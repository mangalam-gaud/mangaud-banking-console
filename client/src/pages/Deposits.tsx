import { useCallback, useEffect, useMemo, useState } from 'react';
import { PiggyBank, Plus, TrendingUp, CalendarClock, XCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { Account, DepositQuote, FixedDeposit } from '../types';
import { formatCurrency, formatDate } from '../utils/format';
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatTile,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  Skeleton,
  EmptyState,
} from '../components/ui';
import { cn } from '../utils/cn';

/** The published rate card. Mirrored from the server's `DEPOSIT_RATE_CARD`. */
const TERM_OPTIONS = [
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
  { months: 9, label: '9 months' },
  { months: 12, label: '12 months' },
  { months: 18, label: '18 months' },
  { months: 24, label: '24 months' },
  { months: 36, label: '36 months' },
  { months: 60, label: '60 months' },
];

const PAYOUT_MODES = [
  { value: 'MATURITY', label: 'On maturity' },
  { value: 'MONTHLY', label: 'Every month' },
];

function DepositStatusBadge({ status }: { status: FixedDeposit['status'] }) {
  const map = {
    ACTIVE: { variant: 'success' as const, label: 'Active' },
    MATURED: { variant: 'info' as const, label: 'Matured' },
    PREMATURELY_CLOSED: { variant: 'warning' as const, label: 'Closed early' },
  };
  const entry = map[status] ?? map.ACTIVE;
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function Deposits() {
  const [deposits, setDeposits] = useState<FixedDeposit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  // Form state
  const [accountId, setAccountId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [termMonths, setTermMonths] = useState('12');
  const [payoutMode, setPayoutMode] = useState('MATURITY');
  const [quote, setQuote] = useState<DepositQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [closing, setClosing] = useState<FixedDeposit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [depositRes, accountRes] = await Promise.all([
        api.getDeposits(),
        api.getMyAccounts(),
      ]);
      if (depositRes.success && depositRes.data) setDeposits(depositRes.data.deposits);
      if (accountRes.success && accountRes.data) {
        setAccounts(accountRes.data.accounts);
        // Default to the first account that can actually fund a deposit, so the
        // form is submittable without a pointless extra click.
        const fundable = (accountRes.data.accounts ?? []).find((a) => a.balance > 0);
        if (fundable) setAccountId((prev) => prev || fundable.id);
      }
    } catch {
      toast.error('Could not load your deposits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Re-quote whenever the amount or term changes. The quote is what the user
   * agrees to, so it must never be stale when they press Open.
   *
   * Debounced with `useDebounce` rather than an inline `setTimeout`: this page
   * and Payments both wanted the same 300ms behaviour, and each grew its own
   * copy, which is how `useDebounce` ended up shipped and unused.
   */
  const debouncedPrincipal = useDebounce(principal, 300);
  const debouncedTerm = useDebounce(termMonths, 300);

  useEffect(() => {
    const value = Number(debouncedPrincipal);
    const term = Number(debouncedTerm);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(term)) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    setQuoting(true);
    (async () => {
      try {
        const res = await api.quoteDeposit({ principal: value, termMonths: term });
        if (!cancelled && res.success && res.data) setQuote(res.data.quote);
      } catch {
        if (!cancelled) setQuote(null);
      } finally {
        if (!cancelled) setQuoting(false);
      }
    })();

    // `cancelled` guards against a state update after unmount, and after a
    // newer request has already superseded this one.
    return () => {
      cancelled = true;
    };
  }, [debouncedPrincipal, debouncedTerm]);

  const totals = useMemo(() => {
    const active = deposits.filter((d) => d.status === 'ACTIVE');
    return {
      activeCount: active.length,
      invested: active.reduce((sum, d) => sum + d.principal, 0),
      expected: active.reduce((sum, d) => sum + d.maturityAmount, 0),
      nextMaturity: active
        .slice()
        .sort((a, b) => new Date(a.maturesAt).getTime() - new Date(b.maturesAt).getTime())
        .at(0),
    };
  }, [deposits]);

  const openDeposit = async () => {
    if (!accountId || !quote) return;
    setSubmitting(true);
    try {
      const res = await api.openDeposit({
        sourceAccountId: accountId,
        principal: Number(principal),
        termMonths: Number(termMonths),
        interestPayoutMode: payoutMode as 'MATURITY' | 'MONTHLY',
      });
      if (res.success) {
        toast.success(res.message || 'Fixed deposit opened');
        setOpening(false);
        setPrincipal('');
        setQuote(null);
        await load();
      } else {
        toast.error(res.error || 'Could not open the deposit');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not open the deposit');
    } finally {
      setSubmitting(false);
    }
  };

  const closeDeposit = async () => {
    if (!closing) return;
    setSubmitting(true);
    try {
      const res = await api.closeDeposit(closing.id, 'Closed by the account holder');
      if (res.success) {
        toast.success(res.message || 'Deposit closed');
        setClosing(null);
        await load();
      } else {
        toast.error(res.error || 'Could not close the deposit');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not close the deposit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixed deposits"
        description="Lock a sum for a fixed term at a guaranteed rate."
        actions={
          <Button variant="brass" onClick={() => setOpening(true)}>
            <Plus className="w-4 h-4" />
            Open a deposit
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <StatTile
              label="Active deposits"
              value={String(totals.activeCount)}
              icon={<PiggyBank className="w-5 h-5" />}
              hint="Currently earning"
            />
            <StatTile
              label="Total invested"
              value={formatCurrency(totals.invested)}
              icon={<TrendingUp className="w-5 h-5" />}
              hint="Principal locked"
              tone="brass"
            />
            <StatTile
              label="Expected at maturity"
              value={formatCurrency(totals.expected)}
              icon={<CalendarClock className="w-5 h-5" />}
              hint="Principal plus interest"
              tone="positive"
            />
            <StatTile
              label="Next maturity"
              value={
                totals.nextMaturity ? formatDate(totals.nextMaturity.maturesAt) : '—'
              }
              icon={<CalendarClock className="w-5 h-5" />}
              hint={
                totals.nextMaturity
                  ? formatCurrency(totals.nextMaturity.maturityAmount)
                  : 'Nothing scheduled'
              }
            />
          </>
        )}
      </div>

      <Card className="card-accent">
        <CardHeader>
          <CardTitle>Your deposits</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : deposits.length === 0 ? (
            <EmptyState
              icon={<PiggyBank className="w-6 h-6" />}
              title="No fixed deposits yet"
              description="Open one to lock a guaranteed rate for 3 to 60 months."
              action={
                <Button variant="brass" onClick={() => setOpening(true)}>
                  Open your first deposit
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {deposits.map((deposit) => (
                <li
                  key={deposit.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{formatCurrency(deposit.principal)}</span>
                      <span className="text-sm text-muted">
                        at {deposit.interestRate}% for {deposit.termMonths} months
                      </span>
                      <DepositStatusBadge status={deposit.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      <span className="amount">{deposit.reference}</span> · matures{' '}
                      {formatDate(deposit.maturesAt)}
                      {deposit.sourceAccount?.accountNumber
                        ? ` · from ${deposit.sourceAccount.accountNumber}`
                        : ''}
                    </p>
                    {deposit.status === 'ACTIVE' && typeof deposit.daysToMaturity === 'number' ? (
                      <p className="mt-1 text-xs text-muted">
                        {deposit.daysToMaturity} days remaining
                        {deposit.interestPayoutMode === 'MONTHLY' ? ' · interest paid monthly' : ''}
                      </p>
                    ) : null}
                    {deposit.status === 'PREMATURELY_CLOSED' && deposit.earlyClosurePenalty ? (
                      <p className="mt-1 text-xs text-danger">
                        Premature closure penalty {formatCurrency(deposit.earlyClosurePenalty)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-4 sm:shrink-0 sm:flex-col sm:items-end sm:gap-1">
                    <span className="amount text-lg font-semibold">
                      {formatCurrency(
                        deposit.status === 'ACTIVE' ? deposit.maturityAmount : deposit.interestCredited ?? 0
                      )}
                    </span>
                    <span className="text-xs text-muted">
                      {deposit.status === 'ACTIVE' ? 'on maturity' : 'interest received'}
                    </span>
                    {deposit.status === 'ACTIVE' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger mt-1"
                        onClick={() => setClosing(deposit)}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Close early
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------- open modal */}
      <Modal
        isOpen={opening}
        onClose={() => setOpening(false)}
        title="Open a fixed deposit"
        size="lg"
      >
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="fd-account">
              Debit from
            </label>
            <Select
              id="fd-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountNumber} · {account.accountType} ·{' '}
                  {formatCurrency(account.balance)}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="fd-amount">
                Amount
              </label>
              <Input
                id="fd-amount"
                type="number"
                inputMode="numeric"
                min={1000}
                step={1000}
                placeholder="50000"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
              <p className="field-hint">Minimum ₹1,000.</p>
            </div>
            <div>
              <label className="label" htmlFor="fd-term">
                Term
              </label>
              <Select
                id="fd-term"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
              >
                {TERM_OPTIONS.map((t) => (
                  <option key={t.months} value={t.months}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <span className="label">Interest payout</span>
            <div className="grid grid-cols-2 gap-2">
              {PAYOUT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setPayoutMode(mode.value)}
                  aria-pressed={payoutMode === mode.value}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm font-medium transition-all',
                    payoutMode === mode.value
                      ? 'border-brass bg-brass/10 text-brass-600'
                      : 'border-border text-muted hover:border-ink-muted/40'
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* The quote is the offer. It is shown before the button is enabled
              so the customer is agreeing to a number they can actually see. */}
          <div className="rounded-xl border border-brass/30 bg-brass/[0.06] p-4">
            {quoting ? (
              <Skeleton className="h-16" />
            ) : quote ? (
              <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-4">
                <QuoteCell label="Rate" value={`${quote.interestRate}%`} />
                <QuoteCell label="Interest" value={formatCurrency(quote.interestAmount)} />
                <QuoteCell label="You receive" value={formatCurrency(quote.maturityAmount)} strong />
                <QuoteCell label="On" value={formatDate(quote.maturityDate)} />
              </div>
            ) : (
              <p className="text-sm text-muted">Enter an amount to see the rate and payout.</p>
            )}
            {quote ? (
              <p className="mt-3 flex items-start gap-2 text-xs text-muted">
                <Info className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
                {quote.taxNote}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpening(false)}>
              Cancel
            </Button>
            <Button variant="brass" onClick={openDeposit} disabled={!quote || submitting}>
              {submitting ? 'Opening…' : 'Open deposit'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* --------------------------------------------------- close modal */}
      <Modal
        isOpen={!!closing}
        onClose={() => setClosing(null)}
        title="Close this deposit early?"
        size="md"
      >
        {closing ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              You are closing a {formatCurrency(closing.principal)} deposit that was placed for{' '}
              {closing.termMonths} months. Interest is recalculated for the time it has actually run,
              and the penalty below is deducted before you are paid.
            </p>
            <div className="rounded-xl border border-danger/30 bg-danger/[0.05] p-4 text-sm">
              <p className="font-medium text-danger">You cannot undo this.</p>
              <p className="mt-1 text-muted">
                A prematurely closed deposit earns far less than the quoted rate. Consider waiting if
                the term has only a little left to run.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setClosing(null)}>
                Keep the deposit
              </Button>
              <Button variant="danger" onClick={closeDeposit} disabled={submitting}>
                {submitting ? 'Closing…' : 'Close it now'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function QuoteCell({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={cn('amount mt-1', strong ? 'text-lg font-semibold' : 'text-sm')}>{value}</p>
    </div>
  );
}

export default Deposits;
