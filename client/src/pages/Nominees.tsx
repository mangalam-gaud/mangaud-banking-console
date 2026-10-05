import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCheck, Plus, Trash2, Info, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Account, Nominee } from '../types';
import { formatDate } from '../utils/format';
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

const RELATIONSHIPS = [
  'Spouse',
  'Son',
  'Daughter',
  'Father',
  'Mother',
  'Brother',
  'Sister',
  'Grandparent',
  'Grandchild',
  'Friend',
  'Other',
];

/** An empty row, used both for the initial form and for "Add another". */
const blankNominee = () => ({
  name: '',
  relationship: 'Spouse',
  sharePercentage: '',
  dateOfBirth: '',
  address: '',
  mobile: '',
  email: '',
  identityProof: 'Aadhaar',
});

type NomineeDraft = ReturnType<typeof blankNominee>;

export function Nominees() {
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const [registering, setRegistering] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [drafts, setDrafts] = useState<NomineeDraft[]>([blankNominee()]);

  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nomineeRes, accountRes] = await Promise.all([
        api.getNominees(),
        api.getMyAccounts(),
      ]);
      if (nomineeRes.success && nomineeRes.data) setNominees(nomineeRes.data.nominees);
      if (accountRes.success && accountRes.data) {
        setAccounts(accountRes.data.accounts);
        setAccountId((prev) => prev || accountRes.data!.accounts[0]?.id || '');
      }
    } catch {
      toast.error('Could not load your nominees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalShare = useMemo(
    () => drafts.reduce((sum, d) => sum + (Number(d.sharePercentage) || 0), 0),
    [drafts]
  );

  /**
   * Shares must total exactly 100%.
   *
   * Checked here as well as on the server, because "sums to 97%" is the kind of
   * error a user can only find by adding up three fields by hand. The check is
   * on the sum, not on a tolerance — a nominee register that adds to 99% is
   * ambiguous about who gets the last percent.
   */
  const shareIsValid = totalShare === 100;
  const allRowsComplete = drafts.every(
    (d) => d.name.trim().length > 1 && Number(d.sharePercentage) > 0
  );

  const updateDraft = (index: number, patch: Partial<NomineeDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const submit = async () => {
    if (!accountId) return;
    setSubmitting(true);
    try {
      const res = await api.registerNominees({
        accountId,
        nominees: drafts.map((d) => ({
          name: d.name.trim(),
          relationship: d.relationship,
          sharePercentage: Number(d.sharePercentage),
          dateOfBirth: d.dateOfBirth || undefined,
          address: d.address || undefined,
          mobile: d.mobile || undefined,
          email: d.email || undefined,
          identityProof: d.identityProof || undefined,
        })),
      });
      if (res.success) {
        toast.success(res.message || 'Nominees registered');
        setRegistering(false);
        setDrafts([blankNominee()]);
        await load();
      } else {
        toast.error(res.error || 'Could not register the nominees');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not register the nominees');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Cancel the nomination on one specific account.
   *
   * Keyed by the account number shown in the card, not by whatever the create
   * form happens to have selected -- using the form's value cancelled a
   * different account's nomination than the one the user clicked on.
   */
  const cancelAll = async () => {
    const target = accounts.find((a) => a.accountNumber === cancelling);
    if (!target) {
      toast.error('That account is no longer available');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.cancelNominees(target.id, 'Superseded by a new nomination');
      if (res.success) {
        toast.success('Nomination cancelled');
        setCancelling(null);
        await load();
      } else {
        toast.error(res.error || 'Could not cancel the nomination');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not cancel the nomination');
    } finally {
      setSubmitting(false);
    }
  };

  // Grouped by account, because a nomination is registered against one account
  // and a flat list makes that relationship invisible.
  const grouped = useMemo(() => {
    const map = new Map<string, Nominee[]>();
    for (const nominee of nominees) {
      const key = nominee.accountNumber || 'No account on file';
      const list = map.get(key) ?? [];
      list.push(nominee);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [nominees]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nominees"
        description="Who receives the balance if something happens to you."
        actions={
          <Button variant="brass" onClick={() => setRegistering(true)}>
            <Plus className="w-4 h-4" />
            {nominees.length ? 'Update nomination' : 'Add nominees'}
          </Button>
        }
      />

      {/*
        A nomination is not a will. Saying so plainly matters more than any
        feature here — this is the single most misunderstood thing in retail
        banking, and the app is the right place to correct it.
      */}
      <Card className="border-brass/30 bg-brass/[0.05]">
        <CardContent className="flex items-start gap-3">
          <Info className="w-5 h-5 text-brass-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium text-ink-soft">A nomination is not a will</p>
            <p className="mt-1 text-muted">
              Nominees receive the balance in your accounts. They do not inherit anything else, and
              they have no claim if you have a valid will. Update this whenever your family
              situation or your accounts change.
            </p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<UserCheck className="w-6 h-6" />}
              title="No nomination registered"
              description="Naming someone takes two minutes and means your money is not left in limbo."
              action={
                <Button variant="brass" onClick={() => setRegistering(true)}>
                  Add a nominee
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        grouped.map(([accountNumber, group]) => {
          const active = group.filter((n) => n.status === 'REGISTERED');
          return (
            <Card key={accountNumber} className="card-accent">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Account {accountNumber}</CardTitle>
                    <p className="text-sm text-muted mt-0.5">
                      {active.length} nominee{active.length === 1 ? '' : 's'} ·{' '}
                      {active.reduce((s, n) => s + n.sharePercentage, 0)}% allocated
                    </p>
                  </div>
                  {active.length > 0 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCancelling(accountNumber)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Cancel nomination
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {active.length === 0 ? (
                  <p className="text-sm text-muted">
                    This nomination has been cancelled or superseded.
                  </p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {active.map((nominee) => (
                      <li
                        key={nominee.id}
                        className="rounded-xl border border-border p-4 flex items-start gap-3"
                      >
                        <span className="grid place-items-center h-10 w-10 shrink-0 rounded-full bg-brass/15 text-brass-600 font-semibold text-sm">
                          {nominee.name
                            .split(' ')
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join('')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium truncate">{nominee.name}</p>
                            <span className="amount shrink-0 text-sm font-semibold text-brass-600">
                              {nominee.sharePercentage}%
                            </span>
                          </div>
                          <p className="text-sm text-muted">{nominee.relationship}</p>
                          {nominee.dateOfBirth ? (
                            <p className="mt-1 text-xs text-muted">
                              {formatDate(nominee.dateOfBirth)}
                              {nominee.mobile ? ` · ${nominee.mobile}` : ''}
                            </p>
                          ) : null}
                          {nominee.identityProof ? (
                            <p className="mt-1.5">
                              <Badge variant="outline" size="sm">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                {nominee.identityProof} on file
                              </Badge>
                            </p>
                          ) : null}
                          <p className="mt-1.5 text-xs text-muted">
                            Registered {formatDate(nominee.registeredAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* ------------------------------------------------ register modal */}
      <Modal
        isOpen={registering}
        onClose={() => setRegistering(false)}
        title="Register nominees"
        size="xl"
      >
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="nm-account">
              Account
            </label>
            <Select
              id="nm-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountNumber} · {account.accountType}
                </option>
              ))}
            </Select>
            <p className="field-hint">
              Registering a new set replaces the current nomination on this account.
            </p>
          </div>

          <div className="space-y-4">
            {drafts.map((draft, index) => (
              <div key={index} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="eyebrow">Nominee {index + 1}</p>
                  {drafts.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== index))}
                      className="text-xs text-danger hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`nm-name-${index}`}>
                      Full name
                    </label>
                    <Input
                      id={`nm-name-${index}`}
                      placeholder="Priya Nair"
                      value={draft.name}
                      onChange={(e) => updateDraft(index, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`nm-rel-${index}`}>
                      Relationship
                    </label>
                    <Select
                      id={`nm-rel-${index}`}
                      value={draft.relationship}
                      onChange={(e) => updateDraft(index, { relationship: e.target.value })}
                    >
                      {RELATIONSHIPS.map((rel) => (
                        <option key={rel} value={rel}>
                          {rel}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label" htmlFor={`nm-share-${index}`}>
                      Share %
                    </label>
                    <Input
                      id={`nm-share-${index}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      placeholder="50"
                      value={draft.sharePercentage}
                      onChange={(e) => updateDraft(index, { sharePercentage: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`nm-dob-${index}`}>
                      Date of birth
                    </label>
                    <Input
                      id={`nm-dob-${index}`}
                      type="date"
                      value={draft.dateOfBirth}
                      onChange={(e) => updateDraft(index, { dateOfBirth: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`nm-mobile-${index}`}>
                      Mobile
                    </label>
                    <Input
                      id={`nm-mobile-${index}`}
                      type="tel"
                      inputMode="numeric"
                      placeholder="98765 43210"
                      value={draft.mobile}
                      onChange={(e) => updateDraft(index, { mobile: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`nm-address-${index}`}>
                      Address
                    </label>
                    <Input
                      id={`nm-address-${index}`}
                      placeholder="Flat 4B, Brigade Gardens, Bengaluru 560001"
                      value={draft.address}
                      onChange={(e) => updateDraft(index, { address: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`nm-id-${index}`}>
                      Identity proof
                    </label>
                    <Select
                      id={`nm-id-${index}`}
                      value={draft.identityProof}
                      onChange={(e) => updateDraft(index, { identityProof: e.target.value })}
                    >
                      {['Aadhaar', 'PAN', 'Passport', 'Driving licence', 'Voter ID'].map((doc) => (
                        <option key={doc} value={doc}>
                          {doc}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Live total, because "must equal 100%" is only actionable if you
              can see the running sum while you edit. */}
          <div
            className={cn(
              'rounded-xl border p-4',
              shareIsValid ? 'border-success/40 bg-success/[0.06]' : 'border-danger/40 bg-danger/[0.06]'
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Total allocated</span>
              <span
                className={cn(
                  'amount text-lg font-semibold',
                  shareIsValid ? 'text-success-700' : 'text-danger'
                )}
              >
                {totalShare}%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {shareIsValid
                ? 'Shares add up correctly.'
                : totalShare > 100
                  ? `Reduce by ${totalShare - 100}% — you cannot allocate more than the whole balance.`
                  : `${100 - totalShare}% left to allocate.`}
            </p>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setDrafts((prev) => [...prev, blankNominee()])}
            disabled={drafts.length >= 4}
          >
            <Plus className="w-4 h-4" />
            {drafts.length >= 4 ? 'Four nominees is the maximum' : 'Add another nominee'}
          </Button>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setRegistering(false)}>
              Cancel
            </Button>
            <Button
              variant="brass"
              onClick={submit}
              disabled={!shareIsValid || !allRowsComplete || submitting}
            >
              {submitting ? 'Registering…' : 'Register nomination'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------- cancel modal */}
      <Modal
        isOpen={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this nomination?"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            The nomination on account <strong className="text-ink-soft">{cancelling}</strong> will
            be marked cancelled and kept for your records. If you have not registered a replacement,
            that account will have no nominee.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={cancelAll} disabled={submitting}>
              {submitting ? 'Cancelling…' : 'Cancel nomination'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default Nominees;
