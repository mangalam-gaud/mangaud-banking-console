import { useCallback, useEffect, useState } from 'react';
import {
  CreditCard,
  Plus,
  Snowflake,
  Play,
  XCircle,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Settings2,
  Trash2,
  Wallet,
  Check,
  Copy,
  AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { BankCard, CardSummary, Account } from '../types';
import { formatCurrency, formatDate, maskAccountNumber } from '../utils/format';
import { cn } from '../utils/cn';
import {
  PageHeader,
  Card,
  CardContent,
  StatTile,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  Skeleton,
  EmptyState,
  Tabs,
} from '../components/ui';

const CARD_THEMES: Record<string, { from: string; to: string; ring: string; label: string }> = {
  ink: { from: '#1B2A44', to: '#080D15', ring: 'border-white/10', label: 'Ink' },
  brass: { from: '#F7C463', to: '#B45309', ring: 'border-black/10', label: 'Brass' },
  forest: { from: '#0F4C3A', to: '#052E24', ring: 'border-white/10', label: 'Forest' },
  slate: { from: '#3F4C5F', to: '#1B2432', ring: 'border-white/10', label: 'Slate' },
  plum: { from: '#4A1F3D', to: '#220C1D', ring: 'border-white/10', label: 'Plum' },
};

function CardFace({
  card,
  revealed,
  onToggleReveal,
}: {
  card: BankCard;
  revealed: boolean;
  onToggleReveal?: () => void;
}) {
  const theme = CARD_THEMES[card.colour] ?? CARD_THEMES.ink;
  const light = card.colour === 'brass';

  return (
    <div
      className={cn(
        'relative rounded-2xl p-5 sm:p-6 text-white shadow-pop overflow-hidden aspect-[1.586]',
        'flex flex-col justify-between min-h-[13rem] sm:min-h-[15rem]',
        theme.ring
      )}
      style={{ backgroundImage: `linear-gradient(145deg, ${theme.from} 0%, ${theme.to} 100%)` }}
    >
      {/* Decorative arcs, echoing the logo. */}
      <div
        className="absolute -right-16 -top-16 w-64 h-64 rounded-full border border-white/[0.07]"
        aria-hidden="true"
      />
      <div
        className="absolute -right-8 -top-8 w-40 h-40 rounded-full border border-white/[0.07]"
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('font-display text-sm font-semibold tracking-wide truncate', light ? 'text-[#1a1204]' : 'text-white')}>
            {card.nickname || `${card.type} card`}
          </p>
          <p className={cn('text-[0.625rem] uppercase tracking-[0.18em] mt-1', light ? 'text-[#1a1204]/60' : 'text-white/55')}>
            {card.network}
          </p>
        </div>
        <span
          className={cn(
            'text-[0.625rem] font-semibold uppercase tracking-[0.14em] px-2 py-1 rounded-full',
            light ? 'bg-black/15 text-[#1a1204]' : 'bg-white/12 text-white/85'
          )}
        >
          {card.type}
        </span>
      </div>

      <div className="relative">
        {/* Chip */}
        <div
          className={cn(
            'w-11 h-8 rounded-md mb-4 border',
            light ? 'bg-black/20 border-black/20' : 'bg-gradient-to-br from-amber-200/80 to-amber-500/60 border-white/25'
          )}
          aria-hidden="true"
        />

        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              'font-mono text-[0.9375rem] sm:text-base tracking-[0.18em] tabular-nums truncate',
              light ? 'text-[#1a1204]' : 'text-white'
            )}
          >
            {revealed ? card.cardNumber.replace(/(.{4})/g, '$1 ').trim() : card.maskedNumber}
          </p>
          {onToggleReveal ? (
            <button
              onClick={onToggleReveal}
              className={cn(
                'p-2 rounded-lg transition-colors shrink-0',
                light ? 'text-[#1a1204]/70 hover:bg-black/10' : 'text-white/70 hover:bg-white/10'
              )}
              aria-label={revealed ? 'Hide card number' : 'Reveal card number'}
            >
              {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-4 mt-4">
          <div className="min-w-0">
            <p className={cn('text-[0.5625rem] uppercase tracking-[0.16em]', light ? 'text-[#1a1204]/55' : 'text-white/50')}>
              Card holder
            </p>
            <p className={cn('text-xs font-medium truncate', light ? 'text-[#1a1204]' : 'text-white')}>
              {card.cardholderName}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={cn('text-[0.5625rem] uppercase tracking-[0.16em]', light ? 'text-[#1a1204]/55' : 'text-white/50')}>
              Expires
            </p>
            <p className={cn('font-mono text-xs', light ? 'text-[#1a1204]' : 'text-white')}>
              {card.expiryLabel}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Cards() {
  const navigate = useNavigate();

  const [cards, setCards] = useState<BankCard[]>([]);
  const [summary, setSummary] = useState<CardSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('all');

  // modals
  const [issueOpen, setIssueOpen] = useState(false);
  const [limitsFor, setLimitsFor] = useState<BankCard | null>(null);
  const [pinFor, setPinFor] = useState<BankCard | null>(null);
  const [detailsFor, setDetailsFor] = useState<(BankCard & { cvv?: string }) | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cardsRes, summaryRes, accountsRes] = await Promise.all([
        api.getCards(),
        api.getCardSummary(),
        api.getMyAccounts(),
      ]);
      setCards(cardsRes.data?.cards ?? []);
      setSummary(summaryRes.data?.summary ?? null);
      setAccounts((accountsRes.data?.accounts ?? []).filter((a) => a.status === 'ACTIVE'));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load your cards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const withBusy = async (cardId: string, fn: () => Promise<void>) => {
    setBusyId(cardId);
    try {
      await fn();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const toggleFreeze = (card: BankCard) =>
    withBusy(card.id, async () => {
      // Optimistic UI: flip the status immediately so the card animation/state
      // feels instant, and roll back if the API rejects it. Never leave the
      // row showing a status the server still disagrees with afterwards.
      const intended = card.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, status: intended as BankCard['status'] } : c)));
      try {
        const res = card.status === 'FROZEN'
          ? await api.unfreezeCard(card.id)
          : await api.freezeCard(card.id);
        setCards((prev) => prev.map((c) => (c.id === card.id ? (res.data?.card ?? c) : c)));
        toast.success(card.status === 'FROZEN' ? 'Card unfrozen' : 'Card frozen — payments will be declined');
      } catch (err: any) {
        setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
        toast.error(err?.response?.data?.error || 'Could not update card status');
        throw err;
      }
      const summaryRes = await api.getCardSummary();
      setSummary(summaryRes.data?.summary ?? null);
    });

  const cancel = (card: BankCard) =>
    withBusy(card.id, async () => {
      const res = await api.cancelCard(card.id);
      setCards((prev) => prev.map((c) => (c.id === card.id ? (res.data?.card ?? c) : c)));
      toast.success('Card cancelled');
    });

  const reveal = (card: BankCard) =>
    withBusy(card.id, async () => {
      const res = await api.revealCard(card.id);
      setDetailsFor({ ...card, ...res.data?.credentials });
    });

  const visible = cards.filter((c) => (filter === 'all' ? true : c.status === filter));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-56 skeleton" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={104} />
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={260} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money in your pocket"
        title="Cards"
        description="Issue, freeze and manage the cards linked to your accounts."
        actions={
          <Button
            variant="brass"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIssueOpen(true)}
            disabled={accounts.length === 0}
          >
            Issue a card
          </Button>
        }
      />

      {error ? (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border border-danger-100 bg-danger-50 text-sm text-danger-700"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Total cards"
            value={summary.total}
            hint={`${summary.active} active · ${summary.frozen} frozen`}
            icon={<CreditCard className="w-5 h-5" />}
          />
          <StatTile
            label="Spent this month"
            value={formatCurrency(summary.monthlySpend)}
            tone="warning"
            icon={<Wallet className="w-5 h-5" />}
          />
          <StatTile
            label="Limit available"
            value={formatCurrency(summary.monthlyAvailable)}
            hint="Across all cards"
            tone="positive"
            icon={<Check className="w-5 h-5" />}
          />
          <StatTile
            label="Average per card"
            value={
              summary.total > 0 ? formatCurrency(summary.monthlySpend / summary.total) : formatCurrency(0)
            }
            icon={<CreditCard className="w-5 h-5" />}
          />
        </div>
      ) : null}

      {cards.length > 0 ? (
        <Tabs
          items={[
            { id: 'all', label: `All (${cards.length})` },
            { id: 'ACTIVE', label: 'Active' },
            { id: 'FROZEN', label: 'Frozen' },
            { id: 'CANCELLED', label: 'Cancelled' },
          ]}
          activeId={filter}
          onChange={setFilter}
        />
      ) : null}

      {visible.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon={<CreditCard className="w-6 h-6" />}
            title={cards.length === 0 ? 'No cards yet' : `No ${filter.toLowerCase()} cards`}
            description={
              cards.length === 0
                ? 'Issue a debit or virtual card against any of your active accounts.'
                : 'Try a different filter to see your other cards.'
            }
            action={
              cards.length === 0 && accounts.length > 0 ? (
                <Button variant="brass" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIssueOpen(true)}>
                  Issue your first card
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((card) => (
            <div key={card.id} className="space-y-3">
              <CardFace
                card={card}
                revealed={!!revealed[card.id]}
                onToggleReveal={() =>
                  setRevealed((prev) => ({ ...prev, [card.id]: !prev[card.id] }))
                }
              />

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">Linked account</p>
                    <p className="font-mono text-sm text-text truncate">
                      {card.accountNumber ? maskAccountNumber(card.accountNumber) : '—'}
                      {card.accountType ? (
                        <span className="ml-2 text-[0.625rem] uppercase tracking-wider text-muted">
                          {card.accountType}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Badge
                    variant={card.status === 'ACTIVE' ? 'success' : card.status === 'FROZEN' ? 'warning' : 'neutral'}
                    dot
                  >
                    {card.status.charAt(0) + card.status.slice(1).toLowerCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-xs">
                  <div>
                    <p className="text-muted">Daily limit</p>
                    <p className="font-mono text-text">{formatCurrency(card.dailyLimit)}</p>
                  </div>
                  <div>
                    <p className="text-muted">Monthly left</p>
                    <p className="font-mono text-text">{formatCurrency(card.monthlyAvailable)}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="h-1.5 rounded-full bg-rule overflow-hidden" aria-hidden="true">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        card.monthlyAvailable / (card.monthlyLimit || 1) < 0.2
                          ? 'bg-danger-500'
                          : 'bg-brass-500'
                      )}
                      style={{
                        width: `${Math.min(
                          100,
                          ((card.monthlyLimit - card.spentThisMonth) / (card.monthlyLimit || 1)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-[0.625rem] text-muted mt-1.5">
                    {formatCurrency(card.spentThisMonth)} of {formatCurrency(card.monthlyLimit)} used
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {card.status !== 'CANCELLED' ? (
                    <Button
                      size="sm"
                      variant={card.status === 'FROZEN' ? 'secondary' : 'outline'}
                      leftIcon={card.status === 'FROZEN' ? <Play className="w-3.5 h-3.5" /> : <Snowflake className="w-3.5 h-3.5" />}
                      onClick={() => toggleFreeze(card)}
                      isLoading={busyId === card.id}
                    >
                      {card.status === 'FROZEN' ? 'Unfreeze' : 'Freeze'}
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Settings2 className="w-3.5 h-3.5" />}
                    onClick={() => setLimitsFor(card)}
                  >
                    Limits
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={card.pinSet ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    onClick={() => setPinFor(card)}
                  >
                    PIN
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Eye className="w-3.5 h-3.5" />}
                    onClick={() => reveal(card)}
                    isLoading={busyId === card.id}
                  >
                    Details
                  </Button>

                  {card.status !== 'CANCELLED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="!text-danger-600 hover:!bg-danger-50 ml-auto"
                      leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => {
                        if (window.confirm('Cancel this card? This cannot be undone.')) cancel(card);
                      }}
                      isLoading={busyId === card.id}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}

      <IssueCardModal
        isOpen={issueOpen}
        onClose={() => setIssueOpen(false)}
        accounts={accounts}
        onIssued={load}
      />

      <LimitsModal card={limitsFor} onClose={() => setLimitsFor(null)} onSaved={load} />
      <PinModal card={pinFor} onClose={() => setPinFor(null)} onSaved={load} />
      <DetailsModal card={detailsFor} onClose={() => setDetailsFor(null)} />
    </div>
  );
}

// ------------------------------------------------------------- issue modal

function IssueCardModal({
  isOpen,
  onClose,
  accounts,
  onIssued,
}: {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  onIssued: () => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState('DEBIT');
  const [network, setNetwork] = useState('VISA');
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAccountId(accounts[0]?.id ?? '');
      setType('DEBIT');
      setNetwork('VISA');
      setNickname('');
    }
  }, [isOpen, accounts]);

  const submit = async () => {
    if (!accountId) {
      toast.error('Choose an account');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.issueCard({ accountId, type, network, nickname: nickname || undefined });
      const card = res.data?.card;
      const creds = res.data?.credentials;
      onIssued();
      onClose();
      toast.success(
        (creds ? `Card ${creds.cardNumber.replace(/(.{4})/g, '$1 ')} issued` : 'Card issued') +
          (card?.accountNumber ? ` on ${card.accountNumber}` : '')
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not issue the card');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Issue a card"
      description="Pick the account the card will draw from."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brass" onClick={submit} isLoading={submitting}>
            Issue card
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Account"
          required
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accounts.map((a) => ({
            value: a.id,
            label: `${a.accountType} · ${maskAccountNumber(a.accountNumber)} · ${formatCurrency(a.balance)}`,
          }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Card type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              { value: 'DEBIT', label: 'Debit' },
              { value: 'VIRTUAL', label: 'Virtual' },
              { value: 'CREDIT', label: 'Credit' },
            ]}
          />
          <Select
            label="Network"
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            options={['VISA', 'MASTERCARD', 'RUPAY']}
          />
        </div>
        <Input
          label="Nickname"
          placeholder="e.g. Groceries"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          hint="Optional — helps you tell cards apart."
          maxLength={40}
        />
        <p className="text-xs text-muted leading-relaxed">
          The full card number and CVV are shown once, immediately after issuance. Store them
          somewhere safe.
        </p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ limits modal

function LimitsModal({
  card,
  onClose,
  onSaved,
}: {
  card: BankCard | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [daily, setDaily] = useState('');
  const [monthly, setMonthly] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (card) {
      setDaily(String(card.dailyLimit));
      setMonthly(String(card.monthlyLimit));
    }
  }, [card]);

  const save = async () => {
    if (!card) return;
    const d = Number(daily);
    const m = Number(monthly);
    if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(m) || m <= 0) {
      toast.error('Enter valid limits');
      return;
    }
    if (d > m) {
      toast.error('The daily limit cannot be more than the monthly limit');
      return;
    }
    setSaving(true);
    try {
      await api.updateCardLimits(card.id, { dailyLimit: d, monthlyLimit: m });
      toast.success('Limits updated');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not update limits');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!card}
      onClose={onClose}
      title="Card limits"
      description={card ? `${card.maskedNumber} · ${formatCurrency(card.spentThisMonth)} used this month` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brass" onClick={save} isLoading={saving}>
            Save limits
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Daily limit (₹)"
          type="number"
          inputMode="numeric"
          value={daily}
          onChange={(e) => setDaily(e.target.value)}
        />
        <Input
          label="Monthly limit (₹)"
          type="number"
          inputMode="numeric"
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
          hint={
            card && Number(monthly) < card.spentThisMonth
              ? `Cannot be below ${formatCurrency(card.spentThisMonth)} already spent`
              : undefined
          }
          error={
            card && Number(monthly) < card.spentThisMonth
              ? `Must be at least ${formatCurrency(card.spentThisMonth)}`
              : undefined
          }
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- pin modal

function PinModal({ card, onClose, onSaved }: { card: BankCard | null; onClose: () => void; onSaved: () => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setPin('');
    setConfirm('');
  }, [card]);

  const save = async () => {
    if (!card) return;
    if (!/^\d{4}$/.test(pin)) {
      toast.error('The PIN must be exactly 4 digits');
      return;
    }
    if (pin !== confirm) {
      toast.error('The two PINs do not match');
      return;
    }
    setSaving(true);
    try {
      await api.setCardPin(card.id, pin);
      toast.success('PIN updated');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not set the PIN');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!card}
      onClose={onClose}
      title={card?.pinSet ? 'Change card PIN' : 'Set card PIN'}
      description="Your PIN is stored encrypted and never sent back to you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brass" onClick={save} isLoading={saving}>
            Save PIN
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="4-digit PIN"
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={4}
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          rightIcon={
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide PIN' : 'Show PIN'}>
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />
        <Input
          label="Confirm PIN"
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={4}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
        />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ details modal

function DetailsModal({
  card,
  onClose,
}: {
  card: (BankCard & { cvv?: string }) | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!card) return null;
  const cvv = card.cvv ?? '';

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  return (
    <Modal
      isOpen={!!card}
      onClose={onClose}
      title="Card details"
      description="Shown in full this once. Store it somewhere safe."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-3">
        {[
          { label: 'Card number', value: card.cardNumber },
          { label: 'CVV', value: cvv },
          { label: 'Expiry', value: card.expiryLabel },
        ].map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-paper/60"
          >
            <div className="min-w-0">
              <p className="text-[0.6875rem] uppercase tracking-wider text-muted">{row.label}</p>
              <p className="font-mono text-text mt-0.5 truncate">{row.value}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => copy(row.label, row.value)}
              aria-label={`Copy ${row.label}`}
            >
              {copied === row.label ? (
                <Check className="w-4 h-4 text-success-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        ))}

        <p className="text-xs text-muted leading-relaxed pt-1">
          Issued {formatDate(card.issuedAt)}
          {card.lastUsedAt ? ` · last used ${formatDate(card.lastUsedAt)}` : ''}.
        </p>
      </div>
    </Modal>
  );
}

export default Cards;
