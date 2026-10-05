import { useCallback, useEffect, useState } from 'react';
import {
  Repeat,
  Plus,
  Play,
  Pause,
  Trash2,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Account, Beneficiary, StandingInstruction } from '../types';
import { formatCurrency, formatDate } from '../utils/format';
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  Skeleton,
  EmptyState,
} from '../components/ui';
import { cn } from '../utils/cn';

const FREQUENCIES = [
  { value: 'WEEKLY', label: 'Every week', hint: '7 days between runs' },
  { value: 'MONTHLY', label: 'Every month', hint: 'On a chosen day' },
  { value: 'QUARTERLY', label: 'Every 3 months', hint: 'Jan · Apr · Jul · Oct' },
  { value: 'YEARLY', label: 'Every year', hint: 'Once annually' },
];

function InstructionBadge({ status }: { status: StandingInstruction['status'] }) {
  const map = {
    ACTIVE: { variant: 'success' as const, label: 'Active' },
    PAUSED: { variant: 'warning' as const, label: 'Paused' },
    CANCELLED: { variant: 'neutral' as const, label: 'Cancelled' },
    COMPLETED: { variant: 'info' as const, label: 'Completed' },
  };
  const entry = map[status] ?? map.ACTIVE;
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function StandingInstructions() {
  const [instructions, setInstructions] = useState<StandingInstruction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payees, setPayees] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [nickname, setNickname] = useState('');

  const [cancelling, setCancelling] = useState<StandingInstruction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [instructionRes, accountRes, payeeRes] = await Promise.all([
        api.getStandingInstructions(),
        api.getMyAccounts(),
        api.getBeneficiaries(),
      ]);
      if (instructionRes.success && instructionRes.data) {
        setInstructions(instructionRes.data.instructions);
      }
      if (accountRes.success && accountRes.data) {
        setAccounts(accountRes.data.accounts);
        const fundable = (accountRes.data.accounts ?? []).find((a) => a.balance > 0);
        if (fundable) setSourceAccountId((prev) => prev || fundable.id);
      }
      if (payeeRes.success && payeeRes.data) {
        setPayees(payeeRes.data.beneficiaries);
        if (payeeRes.data.beneficiaries?.length) {
          setBeneficiaryId((prev) => prev || payeeRes.data!.beneficiaries[0].id);
        }
      }
    } catch {
      toast.error('Could not load your auto-payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A weekly debit has no meaningful "day of month" — showing an enabled day
  // picker for it invites a setting that is silently ignored.
  const isWeekly = frequency === 'WEEKLY';

  const create = async () => {
    if (!sourceAccountId || !beneficiaryId || !amount) return;
    setSubmitting(true);
    try {
      const res = await api.createStandingInstruction({
        sourceAccountId,
        beneficiaryId,
        amount: Number(amount),
        frequency: frequency as 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
        dayOfMonth: Number(dayOfMonth),
        startDate,
        nickname: nickname || undefined,
      });
      if (res.success) {
        toast.success('Auto-payment created');
        setCreating(false);
        setAmount('');
        setNickname('');
        await load();
      } else {
        toast.error(res.error || 'Could not create the auto-payment');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not create the auto-payment');
    } finally {
      setSubmitting(false);
    }
  };

  /** One helper for pause/resume/run so the busy state and error toast match. */
  const act = async (
    instruction: StandingInstruction,
    action: 'pause' | 'resume' | 'run'
  ) => {
    setBusyId(instruction.id);
    // Optimistic UI: update status immediately, rollback on failure
    const originalStatus = instruction.status;
    const optimisticStatus = action === 'pause' ? 'PAUSED' : action === 'resume' ? 'ACTIVE' : originalStatus;
    
    setInstructions((prev) =>
      prev.map((i) =>
        i.id === instruction.id ? { ...i, status: optimisticStatus as StandingInstruction['status'] } : i
      )
    );

    try {
      const res =
        action === 'pause'
          ? await api.pauseStandingInstruction(instruction.id)
          : action === 'resume'
            ? await api.resumeStandingInstruction(instruction.id)
            : await api.runStandingInstructionNow(instruction.id);

      if (res.success) {
        toast.success(
          action === 'pause'
            ? 'Auto-payment paused'
            : action === 'resume'
              ? 'Auto-payment resumed'
              : res.message || 'Auto-payment executed'
        );
        await load();
      } else {
        // Rollback on failure
        setInstructions((prev) =>
          prev.map((i) =>
            i.id === instruction.id ? { ...i, status: originalStatus } : i
          )
        );
        toast.error(res.error || 'That did not work');
      }
    } catch (error: any) {
      // Rollback on failure
      setInstructions((prev) =>
        prev.map((i) =>
          i.id === instruction.id ? { ...i, status: originalStatus } : i
        )
      );
      toast.error(error?.response?.data?.error || 'That did not work');
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async () => {
    if (!cancelling) return;
    setSubmitting(true);
    // Optimistic UI: mark as cancelled immediately, rollback on failure
    const original = instructions.find((i) => i.id === cancelling.id);
    
    setInstructions((prev) =>
      prev.map((i) =>
        i.id === cancelling.id ? { ...i, status: 'CANCELLED' as StandingInstruction['status'] } : i
      )
    );

    try {
      const res = await api.cancelStandingInstruction(cancelling.id, 'Cancelled by the account holder');
      if (res.success) {
        toast.success('Auto-payment cancelled');
        setCancelling(null);
        await load();
      } else {
        // Rollback on failure
        if (original) {
          setInstructions((prev) =>
            prev.map((i) =>
              i.id === cancelling.id ? { ...i, status: original.status } : i
            )
          );
        }
        toast.error(res.error || 'Could not cancel it');
      }
    } catch (error: any) {
      // Rollback on failure
      if (original) {
        setInstructions((prev) =>
          prev.map((i) =>
            i.id === cancelling.id ? { ...i, status: original.status } : i
          )
        );
      }
      toast.error(error?.response?.data?.error || 'Could not cancel it');
    } finally {
      setSubmitting(false);
    }
  };

  const active = instructions.filter((i) => i.status === 'ACTIVE');
  const monthlyLoad = active.reduce(
    // A weekly debit is ~4.33 a month and a yearly one is 1/12, so the summary
    // tile reflects what will actually leave the account each month rather than
    // multiplying every instruction by the same factor.
    (sum, i) =>
      sum +
      i.amount *
        (i.frequency === 'WEEKLY'
          ? 4.33
          : i.frequency === 'MONTHLY'
            ? 1
            : i.frequency === 'QUARTERLY'
              ? 1 / 3
              : 1 / 12),
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto-payments"
        description="Standing instructions that debit your account on a schedule."
        actions={
          <Button
            variant="brass"
            onClick={() => setCreating(true)}
            disabled={payees.length === 0}
          >
            <Plus className="w-4 h-4" />
            New auto-payment
          </Button>
        }
      />

      {payees.length === 0 && !loading ? (
        <Card className="border-brass/30 bg-brass/[0.05]">
          <CardContent className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-brass-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Add a payee first</p>
              <p className="text-sm text-muted mt-1">
                An auto-payment needs someone to pay. Save a payee on the Payees page and it will
                show up here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))
        ) : (
          <>
            <div className="card p-5">
              <p className="eyebrow">Active</p>
              <p className="amount mt-2 text-2xl font-semibold">{active.length}</p>
              <p className="mt-1 text-xs text-muted">Running on schedule</p>
            </div>
            <div className="card p-5">
              <p className="eyebrow">Monthly outflow</p>
              <p className="amount mt-2 text-2xl font-semibold">{formatCurrency(monthlyLoad)}</p>
              <p className="mt-1 text-xs text-muted">Normalised across all frequencies</p>
            </div>
            <div className="card p-5">
              <p className="eyebrow">Total debited</p>
              <p className="amount mt-2 text-2xl font-semibold">
                {formatCurrency(instructions.reduce((s, i) => s + i.totalDebited, 0))}
              </p>
              <p className="mt-1 text-xs text-muted">All time, all instructions</p>
            </div>
          </>
        )}
      </div>

      <Card className="card-accent">
        <CardHeader>
          <CardTitle>Your instructions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : instructions.length === 0 ? (
            <EmptyState
              icon={<Repeat className="w-6 h-6" />}
              title="No auto-payments set up"
              description="Set up rent, a SIP, or a bill payment once and let it run."
              action={
                <Button
                  variant="brass"
                  onClick={() => setCreating(true)}
                  disabled={payees.length === 0}
                >
                  Create one
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {instructions.map((instruction) => (
                <li key={instruction.id} className="py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{instruction.nickname}</span>
                        <InstructionBadge status={instruction.status} />
                        {instruction.isDue ? (
                          <Badge variant="brass">Due now</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {formatCurrency(instruction.amount)}{' '}
                        {instruction.frequency.toLowerCase()} to{' '}
                        {instruction.destination?.label ?? 'no destination set'}
                        {instruction.destination?.detail ? (
                          <span className="text-muted"> · {instruction.destination.detail}</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        <span className="amount">{instruction.reference}</span> ·{' '}
                        {instruction.scheduleLabel.toLowerCase()} · next{' '}
                        {formatDate(instruction.nextRunDate)} ·{' '}
                        {instruction.runsCompleted} runs ·{' '}
                        {formatCurrency(instruction.totalDebited)} debited
                      </p>

                      {instruction.status === 'PAUSED' && instruction.pauseReason ? (
                        <p className="mt-2 text-xs text-muted">
                          Paused {formatDate(instruction.pausedAt)} — {instruction.pauseReason}
                        </p>
                      ) : null}

                      {/*
                        A paused-by-failure instruction is a different problem
                        from a user-paused one: the money did not move, and the
                        customer needs to know before they assume the bill is
                        paid.
                      */}
                      {instruction.failureCount > 0 ? (
                        <p className="mt-2 flex items-start gap-2 rounded-lg bg-danger/[0.06] px-3 py-2 text-xs text-danger">
                          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                          {instruction.failureCount === 3
                            ? 'Paused automatically after 3 failed attempts. Check the balance, then resume.'
                            : `Failed ${instruction.failureCount} time${instruction.failureCount > 1 ? 's' : ''} — most likely insufficient balance.`}
                        </p>
                      ) : null}
                    </div>

                    {instruction.status !== 'CANCELLED' ? (
                      <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                        {instruction.status === 'ACTIVE' ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => act(instruction, 'pause')}
                              disabled={busyId === instruction.id}
                            >
                              <Pause className="w-3.5 h-3.5" />
                              Pause
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => act(instruction, 'run')}
                              disabled={busyId === instruction.id}
                            >
                              <Play className="w-3.5 h-3.5" />
                              Run now
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => act(instruction, 'resume')}
                            disabled={busyId === instruction.id}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Resume
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          onClick={() => setCancelling(instruction)}
                          disabled={busyId === instruction.id}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted lg:shrink-0">
                        Cancelled {formatDate(instruction.cancelledAt)}
                      </p>
                    )}                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------------- create modal */}
      <Modal isOpen={creating} onClose={() => setCreating(false)} title="New auto-payment" size="lg">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="si-from">
                Debit from
              </label>
              <Select
                id="si-from"
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountNumber} · {formatCurrency(account.balance)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor="si-payee">
                Pay
              </label>
              <Select
                id="si-payee"
                value={beneficiaryId}
                onChange={(e) => setBeneficiaryId(e.target.value)}
              >
                {payees.map((payee) => (
                  <option key={payee.id} value={payee.id}>
                    {payee.name} · {payee.accountNumber}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="si-amount">
                Amount
              </label>
              <Input
                id="si-amount"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="15000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="si-nickname">
                Label
                <span className="text-muted font-normal"> (optional)</span>
              </label>
              <Input
                id="si-nickname"
                placeholder="House rent"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
          </div>

          <div>
            <span className="label">How often</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FREQUENCIES.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFrequency(f.value)}
                  aria-pressed={frequency === f.value}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left transition-all',
                    frequency === f.value
                      ? 'border-brass bg-brass/10'
                      : 'border-border hover:border-ink-muted/40'
                  )}
                >
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      frequency === f.value ? 'text-brass-600' : 'text-ink-soft'
                    )}
                  >
                    {f.label}
                  </span>
                  <span className="block text-[0.6875rem] text-muted mt-0.5">{f.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {isWeekly ? (
              <div className="rounded-xl border border-border bg-sunken px-4 py-3">
                <p className="text-sm text-muted">
                  Runs 7 days after the start date, then every 7 days.
                </p>
              </div>
            ) : (
              <div>
                <label className="label" htmlFor="si-day">
                  Day of month
                </label>
                <Select
                  id="si-day"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}
                      {day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                    </option>
                  ))}
                </Select>
                <p className="field-hint">
                  Capped at 28 so it lands on the same date in February too.
                </p>
              </div>
            )}
            <div>
              <label className="label" htmlFor="si-start">
                First run
              </label>
              <Input
                id="si-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-xl bg-sunken px-4 py-3 text-xs text-muted">
            <CalendarClock className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
            The first run happens on or after the start date. If the balance is short the instruction
            is retried, and after three failures it pauses itself rather than continuing to fail.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              variant="brass"
              onClick={create}
              disabled={!sourceAccountId || !beneficiaryId || !Number(amount) || submitting}
            >
              {submitting ? 'Creating…' : 'Create auto-payment'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* --------------------------------------------------- cancel modal */}
      <Modal
        isOpen={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this auto-payment?"
        size="md"
      >
        {cancelling ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              <strong className="text-ink-soft">{cancelling.nickname}</strong> will stop after its
              current run. The record is kept so you can see what was paid and when.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setCancelling(null)}>
                Keep it
              </Button>
              <Button variant="danger" onClick={cancel} disabled={submitting}>
                {submitting ? 'Cancelling…' : 'Cancel auto-payment'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default StandingInstructions;
