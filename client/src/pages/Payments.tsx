import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Star,
  Users,
  Check,
  Clock,
  Copy,
  RotateCcw,
  Search,
  AlertTriangle,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { Account, Beneficiary, PaymentChannel, PaymentResult } from '../types';
import { formatCurrency, formatDateTime, maskAccountNumber } from '../utils/format';
import { cn } from '../utils/cn';
import {
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  Select,
  Modal,
  Skeleton,
  EmptyState,
} from '../components/ui';

const CHANNEL_TONE: Record<string, 'success' | 'info' | 'brass' | 'warning'> = {
  IMPS: 'success',
  UPI: 'success',
  NEFT: 'info',
  RTGS: 'brass',
};

const QUICK_AMOUNTS = [500, 1000, 2500, 5000, 10000, 25000];

export function Payments() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payees, setPayees] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [sourceAccountId, setSourceAccountId] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState(searchParams.get('beneficiary') ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ channel: string; arrival: string; fee: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<PaymentResult | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, payeesRes] = await Promise.all([
        api.getMyAccounts(),
        api.getBeneficiaries(),
      ]);
      const usable = (accountsRes.data?.accounts ?? []).filter((a) => a.status === 'ACTIVE');
      setAccounts(usable);
      setPayees((payeesRes.data?.beneficiaries ?? []).filter((b) => b.status === 'ACTIVE'));
      setSourceAccountId((prev) => prev || usable[0]?.id || '');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load payment details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPayee = useMemo(
    () => payees.find((b) => b.id === beneficiaryId) ?? null,
    [payees, beneficiaryId]
  );
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === sourceAccountId) ?? null,
    [accounts, sourceAccountId]
  );

  /*
   * Rail preview, debounced so the customer sees how the money will move before
   * committing without a request per keystroke. Uses `useDebounce` rather than
   * an inline timer -- Deposits needed the same behaviour and had already grown
   * its own copy, which is why the hook shipped unused.
   */
  const debouncedAmount = useDebounce(amount, 300);

  useEffect(() => {
    const value = Number(debouncedAmount);
    if (!Number.isFinite(value) || value <= 0) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await api.previewPayment(value);
        if (!cancelled) setPreview(res.data?.preview ?? null);
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();

    // Guards against a response landing after a newer amount was typed, or
    // after unmount.
    return () => {
      cancelled = true;
    };
  }, [debouncedAmount]);

  const sortedPayees = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? payees.filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            b.bankName.toLowerCase().includes(q) ||
            b.upiId?.toLowerCase().includes(q)
        )
      : payees;
    return [...filtered].sort((a, b) => Number(b.isFavourite) - Number(a.isFavourite));
  }, [payees, search]);

  const errors = useMemo(() => {
    const value = Number(amount);
    const out: Record<string, string> = {};
    if (amount && (!Number.isFinite(value) || value <= 0)) out.amount = 'Enter a valid amount';
    if (selectedAccount && Number.isFinite(value) && value > selectedAccount.balance) {
      out.amount = `More than the ₹${selectedAccount.balance.toLocaleString('en-IN')} available`;
    }
    if (selectedPayee && Number.isFinite(value) && value > selectedPayee.dailyLimit) {
      out.amount = `Above the ${formatCurrency(selectedPayee.dailyLimit)} daily limit for this payee`;
    }
    return out;
  }, [amount, selectedAccount, selectedPayee]);

  const submit = async () => {
    if (!sourceAccountId) return toast.error('Choose an account to pay from');
    if (!beneficiaryId) return toast.error('Choose a payee');
    if (errors.amount) return toast.error(errors.amount);

    setSubmitting(true);
    try {
      const res = await api.payBeneficiary({
        sourceAccountId,
        beneficiaryId,
        amount: Number(amount),
        note: note.trim() || undefined,
      });
      setReceipt(res.data?.payment ?? null);
      setAmount('');
      setNote('');
      setPreview(null);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'The payment could not be completed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 skeleton" />
        <div className="grid gap-5 lg:grid-cols-5">
          <Skeleton variant="rectangular" height={420} className="lg:col-span-3" />
          <Skeleton variant="rectangular" height={420} className="lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Move money"
        title="Pay & transfer"
        description="Send money to a saved payee, or record money that has come in from outside."
        actions={
          <Button
            variant="secondary"
            leftIcon={<ArrowDownLeft className="w-4 h-4" />}
            onClick={() => setReceiveOpen(true)}
          >
            Record money received
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AlertTriangle className="w-6 h-6" />}
            title="You need an active account to pay from"
            description="Open a savings or current account first, then come back here."
            action={<Button variant="brass" onClick={() => navigate('/accounts/open')}>Open an account</Button>}
          />
        </Card>
      ) : payees.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="Add a payee first"
            description="Payments go to a saved payee, which keeps the account number and IFSC on file."
            action={<Button variant="brass" onClick={() => navigate('/beneficiaries')}>Add a payee</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          {/* ------------------------------------------------ payee picker */}
          <Card className="lg:col-span-3 flex flex-col overflow-hidden">
            <div className="px-5 pt-5 sm:px-6 sm:pt-6 pb-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-display text-lg font-semibold text-text">Who are you paying?</h2>
                <Badge variant="outline" size="sm">
                  {payees.length} saved
                </Badge>
              </div>
              <Input
                placeholder="Search name, bank or UPI ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
                aria-label="Search payees"
              />
            </div>

            <div className="flex-1 overflow-y-auto max-h-[26rem] border-t border-border">
              {sortedPayees.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted">No payees match “{search}”</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {sortedPayees.map((b) => {
                    const selected = b.id === beneficiaryId;
                    return (
                      <li key={b.id}>
                        <button
                          onClick={() => {
                            setBeneficiaryId(b.id);
                            setSearchParams({ beneficiary: b.id });
                          }}
                          aria-pressed={selected}
                          className={cn(
                            'w-full text-left px-5 sm:px-6 py-3.5 flex items-center gap-3 transition-colors',
                            selected ? 'bg-brass-50/60' : 'hover:bg-paper/70'
                          )}
                        >
                          <span
                            className={cn(
                              'grid place-items-center h-10 w-10 shrink-0 rounded-xl border text-sm font-semibold font-display',
                              selected
                                ? 'bg-brass-500 border-brass-500 text-[#1a1204]'
                                : 'bg-paper border-border text-ink-soft'
                            )}
                          >
                            {b.name
                              .split(' ')
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className={cn('text-sm truncate', selected ? 'font-semibold text-text' : 'font-medium text-ink-soft')}>
                                {b.name}
                              </span>
                              {b.isFavourite ? (
                                <Star className="w-3 h-3 fill-brass-400 text-brass-500 shrink-0" aria-label="Favourite" />
                              ) : null}
                            </span>
                            <span className="block text-xs text-muted truncate mt-0.5">
                              {b.bankName} · {maskAccountNumber(b.accountNumber)}
                            </span>
                          </span>
                          {selected ? <Check className="w-4 h-4 text-brass-600 shrink-0" aria-hidden="true" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>

          {/* ------------------------------------------------- payment form */}
          <Card className="lg:col-span-2 h-fit lg:sticky lg:top-[5.5rem]">
            <CardContent className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-text">Payment details</h2>

              <Select
                label="Pay from"
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.accountType} · ${maskAccountNumber(a.accountNumber)} · ${formatCurrency(a.balance)}`,
                }))}
              />

              {selectedPayee ? (
                <div className="p-3.5 rounded-xl border border-brass-100 bg-brass-50/60">
                  <p className="text-[0.6875rem] uppercase tracking-wider text-brass-700">Paying</p>
                  <p className="font-medium text-text mt-0.5">{selectedPayee.name}</p>
                  <p className="text-xs text-muted mt-0.5 font-mono">
                    {selectedPayee.bankName} · {selectedPayee.ifsc} ·{' '}
                    {maskAccountNumber(selectedPayee.accountNumber)}
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-dashed border-border text-sm text-muted text-center">
                  {/* The list sits beside this panel on wide screens and above
                      it on narrow ones, so the copy stays layout-agnostic. */}
                  Choose a payee
                </div>
              )}

              <div>
                <label className="label" htmlFor="amount">
                  Amount <span className="text-danger-600">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft font-mono text-lg pointer-events-none">
                    ₹
                  </span>
                  <input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    aria-invalid={!!errors.amount}
                    className={cn(
                      'input pl-9 text-lg font-mono h-12',
                      errors.amount && 'input-error'
                    )}
                  />
                </div>
                {errors.amount ? (
                  <p className="text-xs text-danger-600 mt-1.5">{errors.amount}</p>
                ) : null}

                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {QUICK_AMOUNTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAmount(String(value))}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-paper border border-border text-ink-soft hover:bg-paper-raised hover:border-brass/50 transition-colors"
                    >
                      {formatCurrency(value, 'INR').replace('.00', '')}
                    </button>
                  ))}
                  {selectedAccount ? (
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.max(0, selectedAccount.balance - 1000)))}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-paper border border-border text-ink-soft hover:border-brass/50 transition-colors"
                    >
                      Max
                    </button>
                  ) : null}
                </div>
              </div>

              <Input
                label="What's this for?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Rent, groceries, invoice #42…"
                maxLength={120}
                hint="Shows on both statements — a reminder for later."
              />

              {preview ? (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-primary-100 bg-primary-50">
                  <Info className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 text-xs">
                    <p className="flex items-center gap-1.5">
                      <Badge variant={CHANNEL_TONE[preview.channel] ?? 'info'} size="sm">
                        {preview.channel}
                      </Badge>
                      <span className="text-primary-700 font-medium">No fee</span>
                    </p>
                    <p className="text-primary-700/80 mt-1 leading-relaxed">{preview.arrival}</p>
                  </div>
                </div>
              ) : null}

              <Button
                variant="brass"
                size="lg"
                className="w-full"
                leftIcon={<ArrowUpRight className="w-4 h-4" />}
                onClick={submit}
                isLoading={submitting}
                disabled={!beneficiaryId || !amount || !!errors.amount}
              >
                {amount && !errors.amount
                  ? `Pay ${formatCurrency(Number(amount))}`
                  : 'Enter an amount'}
              </Button>

              <p className="text-[0.6875rem] text-muted leading-relaxed text-center">
                Payments leave instantly. If sent to a wrong account number, most banks do not
                reverse them.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />
      <ReceiveModal
        isOpen={receiveOpen}
        accounts={accounts}
        onClose={() => setReceiveOpen(false)}
        onSaved={load}
      />
    </div>
  );
}

// ------------------------------------------------------------- receipt

function ReceiptModal({ payment, onClose }: { payment: PaymentResult | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!payment) return null;

  return (
    <Modal
      isOpen={!!payment}
      onClose={onClose}
      title="Payment sent"
      footer={
        <Button variant="brass" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="text-center">
        <span className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-success-50 border border-success-100 text-success-600 mb-4">
          <Check className="w-7 h-7" aria-hidden="true" />
        </span>
        <p className="font-display text-3xl font-bold text-text tnum">{formatCurrency(payment.amount)}</p>
        <p className="text-sm text-muted mt-1">sent to {payment.beneficiary.name}</p>

        <div className="mt-5 space-y-2.5 text-left">
          {[
            { label: 'Reference', value: payment.reference, mono: true },
            { label: 'From', value: `${maskAccountNumber(payment.sourceAccount.accountNumber)} · ${formatCurrency(payment.sourceAccount.balance)} left` },
            { label: 'Bank', value: payment.beneficiary.bankName },
            { label: 'IFSC', value: payment.beneficiary.ifsc, mono: true },
            { label: 'Rail', value: payment.channel },
            { label: 'Arrival', value: payment.estimatedArrival },
            { label: 'Sent at', value: formatDateTime(payment.settledAt) },
          ].map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-muted shrink-0">{row.label}</span>
              <span className={cn('text-text text-right', row.mono && 'font-mono text-xs')}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-4"
          leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(payment.reference);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error('Could not copy');
            }
          }}
        >
          {copied ? 'Copied' : 'Copy reference'}
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------- receive

function ReceiveModal({
  isOpen,
  accounts,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAccountId(accounts[0]?.id ?? '');
      setAmount('');
      setFrom('');
      setReference('');
      setNote('');
    }
  }, [isOpen, accounts]);

  const save = async () => {
    const value = Number(amount);
    if (!accountId) return toast.error('Choose an account');
    if (!Number.isFinite(value) || value <= 0) return toast.error('Enter a valid amount');
    if (!from.trim()) return toast.error('Who sent the money?');

    setSaving(true);
    try {
      await api.recordIncoming({
        accountId,
        amount: value,
        from: from.trim(),
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success('Payment recorded');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not record the payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record money received"
      description="For salary, cash deposits, refunds and transfers from outside the bank."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brass" onClick={save} isLoading={saving}>
            Record it
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Deposit into"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accounts.map((a) => ({
            value: a.id,
            label: `${a.accountType} · ${maskAccountNumber(a.accountNumber)}`,
          }))}
        />
        <Input
          label="Amount (₹)"
          type="number"
          inputMode="decimal"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="font-mono"
          required
        />
        <Input
          label="Received from"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="Employer, friend, cash counter…"
          required
          maxLength={80}
        />
        <Input
          label="Their reference (optional)"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="UTR / cheque number"
          className="font-mono"
          maxLength={40}
        />
        <Input
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={120}
        />
      </div>
    </Modal>
  );
}

export default Payments;
