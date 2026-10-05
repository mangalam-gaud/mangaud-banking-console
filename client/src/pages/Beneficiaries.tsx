import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  Star,
  Trash2,
  Pencil,
  ArrowUpRight,
  Building2,
  Phone,
  Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Beneficiary } from '../types';
import { formatCurrency, formatRelativeTime, maskAccountNumber } from '../utils/format';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  Skeleton,
  EmptyState,
} from '../components/ui';

const INDIAN_BANKS = [
  'HDFC Bank',
  'ICICI Bank',
  'State Bank of India',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
  'Canara Bank',
  'IndusInd Bank',
  'Yes Bank',
  'IDFC First Bank',
  'Federal Bank',
];

/** Derives a plausible IFSC from the bank name, since IFSC prefixes are fixed per bank. */
const IFSC_PREFIX: Record<string, string> = {
  'HDFC Bank': 'HDFC0000',
  'ICICI Bank': 'ICIC0000',
  'State Bank of India': 'SBIN0000',
  'Axis Bank': 'AXIS0000',
  'Kotak Mahindra Bank': 'KKBK0000',
  'Punjab National Bank': 'PUNB0000',
  'Bank of Baroda': 'BARB0000',
  'Canara Bank': 'CNRB0000',
  'IndusInd Bank': 'INDB0000',
  'Yes Bank': 'YESB0000',
  'IDFC First Bank': 'IDFB0000',
  'Federal Bank': 'FEDR0000',
};

const suggestIfsc = (bank: string) => `${IFSC_PREFIX[bank] ?? 'MANG0000'}123`;

export function Beneficiaries() {
  const navigate = useNavigate();

  const [items, setItems] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Beneficiary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBeneficiaries();
      setItems(res.data?.beneficiaries ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load your payees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavourite = async (b: Beneficiary) => {
    setBusyId(b.id);
    // Optimistic UI: flip immediately, rollback on failure
    const originalFavourite = b.isFavourite;
    setItems((prev) =>
      prev.map((item) =>
        item.id === b.id ? { ...item, isFavourite: !item.isFavourite } : item
      )
    );
    try {
      const res = await api.updateBeneficiary(b.id, { isFavourite: !b.isFavourite });
      const updated = res.data?.beneficiary;
      setItems((prev) =>
        prev.map((item) =>
          item.id === b.id
            ? (updated ?? item)
            // The server clears every other favourite, so mirror that here
            // rather than waiting for a refetch.
            : updated?.isFavourite
              ? { ...item, isFavourite: false }
              : item
        )
      );
      if (updated) {
        toast.success(updated.isFavourite ? 'Payee favourited' : 'Payee unfavourited');
      }
    } catch (err: any) {
      // Rollback on failure
      setItems((prev) =>
        prev.map((item) =>
          item.id === b.id ? { ...item, isFavourite: originalFavourite } : item
        )
      );
      toast.error(err?.response?.data?.error || 'Could not update favourite');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (b: Beneficiary) => {
    if (!window.confirm(`Remove ${b.name} from your payees? Past payments to them stay in your history.`)) {
      return;
    }
    // Optimistic UI: mark as inactive immediately, rollback on failure
    const original = items.find((item) => item.id === b.id);
    setItems((prev) => prev.map((item) => (item.id === b.id ? { ...item, status: 'INACTIVE' } : item)));
    setBusyId(b.id);
    try {
      await api.removeBeneficiary(b.id);
      toast.success('Payee removed');
    } catch (err: any) {
      // Rollback on failure
      if (original) {
        setItems((prev) => prev.map((item) => (item.id === b.id ? original : item)));
      }
      toast.error(err?.response?.data?.error || 'Could not remove the payee');
    } finally {
      setBusyId(null);
    }
  };

  const active = items.filter((b) => b.status === 'ACTIVE');
  const inactive = items.filter((b) => b.status !== 'ACTIVE');

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-56 skeleton" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rectangular" height={116} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Saved destinations"
        title="Payees"
        description="Bank accounts you send money to regularly. Add one once and pay in a couple of taps."
        actions={
          <Button variant="brass" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>
            Add payee
          </Button>
        }
      />

      {error ? (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-danger-100 bg-danger-50 text-sm text-danger-700" role="alert">
          {error}
        </div>
      ) : null}

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="No payees yet"
            description="Add a bank account or UPI ID and you'll be able to pay it in seconds."
            action={
              <Button variant="brass" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>
                Add your first payee
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((b) => (
            <Card key={b.id} className="card-hover p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="grid place-items-center h-11 w-11 shrink-0 rounded-xl bg-brass-50 border border-brass-100 text-brass-700 font-display font-semibold text-sm">
                    {b.name
                      .split(' ')
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-text truncate">
                      {b.name}
                      {b.nickname ? (
                        <span className="ml-1.5 text-xs font-normal text-muted">· {b.nickname}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted truncate flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                      {b.bankName}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => toggleFavourite(b)}
                  disabled={busyId === b.id}
                  className="shrink-0 p-1.5 rounded-lg transition-colors hover:bg-paper"
                  aria-label={b.isFavourite ? 'Remove from favourites' : 'Mark as favourite'}
                  aria-pressed={b.isFavourite}
                >
                  <Star
                    className={`w-4 h-4 ${b.isFavourite ? 'fill-brass-400 text-brass-500' : 'text-muted/50'}`}
                  />
                </button>
              </div>

              <dl className="mt-4 space-y-2 pt-4 border-t border-border text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Account</dt>
                  <dd className="font-mono text-text">{maskAccountNumber(b.accountNumber)}</dd>
                </div>
                {b.upiId ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">UPI</dt>
                    <dd className="font-mono text-text truncate">{b.upiId}</dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Type</dt>
                  <dd>
                    <Badge variant="outline" size="sm">
                      {b.accountType}
                    </Badge>
                  </dd>
                </div>
                {b.transferCount > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Paid</dt>
                    <dd className="text-text">
                      {b.transferCount}× · {formatCurrency(b.transferredTotal)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
                <Button
                  size="sm"
                  variant="brass"
                  leftIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                  onClick={() => navigate(`/payments?beneficiary=${b.id}`)}
                >
                  Pay
                </Button>
                <Button size="sm" variant="ghost" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => setEditing(b)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="!text-danger-600 hover:!bg-danger-50 ml-auto"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => remove(b)}
                  isLoading={busyId === b.id}
                >
                  Remove
                </Button>
              </div>

              {b.lastTransferredAt ? (
                <p className="text-[0.6875rem] text-muted mt-2">
                  Last paid {formatRelativeTime(b.lastTransferredAt)}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {inactive.length > 0 ? (
        <div className="pt-2">
          <h2 className="eyebrow mb-3">Removed</h2>
          <div className="space-y-2">
            {inactive.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-paper/40"
              >
                <div className="min-w-0">
                  <p className="text-sm text-muted truncate line-through">{b.name}</p>
                  <p className="text-xs text-muted/70 truncate">{b.bankName}</p>
                </div>
                <Badge variant="outline" size="sm">
                  Removed
                </Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <BeneficiaryForm
        isOpen={addOpen || !!editing}
        beneficiary={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={load}
        setItems={setItems}
      />
    </div>
  );
}

// ------------------------------------------------------------------ form

function BeneficiaryForm({
  isOpen,
  beneficiary,
  onClose,
  onSaved,
  setItems,
}: {
  isOpen: boolean;
  beneficiary: Beneficiary | null;
  onClose: () => void;
  onSaved: () => void;
  setItems: React.Dispatch<React.SetStateAction<Beneficiary[]>>;
}) {
  const isEdit = !!beneficiary;
  const [form, setForm] = useState({
    name: '',
    accountNumber: '',
    ifsc: '',
    bankName: INDIAN_BANKS[0],
    accountHolderName: '',
    accountType: 'SAVINGS',
    upiId: '',
    mobile: '',
    email: '',
    nickname: '',
    dailyLimit: '100000',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (beneficiary) {
      setForm({
        name: beneficiary.name,
        accountNumber: beneficiary.accountNumber,
        ifsc: beneficiary.ifsc,
        bankName: beneficiary.bankName,
        accountHolderName: beneficiary.accountHolderName,
        accountType: beneficiary.accountType,
        upiId: beneficiary.upiId ?? '',
        mobile: beneficiary.mobile ?? '',
        email: beneficiary.email ?? '',
        nickname: beneficiary.nickname ?? '',
        dailyLimit: String(beneficiary.dailyLimit),
      });
    } else {
      setForm({
        name: '',
        accountNumber: '',
        ifsc: suggestIfsc(INDIAN_BANKS[0]),
        bankName: INDIAN_BANKS[0],
        accountHolderName: '',
        accountType: 'SAVINGS',
        upiId: '',
        mobile: '',
        email: '',
        nickname: '',
        dailyLimit: '100000',
      });
    }
  }, [beneficiary, isOpen]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => {
      const next = { ...prev, [key]: e.target.value };
      // Keep the IFSC prefix in step with the chosen bank.
      if (key === 'bankName') next.ifsc = suggestIfsc(e.target.value);
      // Default the holder's name to the payee's name on first entry.
      if (key === 'name' && !next.accountHolderName) next.accountHolderName = e.target.value;
      return next;
    });

const save = async () => {
    if (!form.name.trim()) return toast.error('Enter the payeeâ€™s name');
    if (!/^\d{9,18}$/.test(form.accountNumber.replace(/\s/g, ''))) {
      return toast.error('Account number must be 9 to 18 digits');
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc.toUpperCase())) {
      return toast.error('IFSC must look like HDFC0001234');
    }

    // Optimistic UI: add to list immediately for instant feedback
    const tempId = `temp-${Date.now()}`;
    const optimistic: Beneficiary = {
      id: tempId,
      name: form.name.trim(),
      accountNumber: form.accountNumber.replace(/\s/g, ''),
      ifsc: form.ifsc.toUpperCase(),
      bankName: form.bankName,
      accountHolderName: form.accountHolderName.trim() || form.name.trim(),
      accountType: form.accountType as 'SAVINGS' | 'CURRENT' | 'SALARY',
      upiId: form.upiId.trim() || undefined,
      mobile: form.mobile.trim() || undefined,
      email: form.email.trim() || undefined,
      nickname: form.nickname.trim() || undefined,
      dailyLimit: Number(form.dailyLimit) || 100000,
      isFavourite: false,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      transferredTotal: 0,
      transferCount: 0,
      maskedAccountNumber: '****' + form.accountNumber.replace(/\s/g, '').slice(-4),
    };

    // Optimistic add
    if (!isEdit) {
      setItems((prev) => [optimistic, ...prev]);
    } else {
      setItems((prev) => prev.map((item) => (item.id === beneficiary?.id ? { ...item, ...optimistic } : item)));
    }

    setSaving(true);
    try {
      if (isEdit && beneficiary) {
        await api.updateBeneficiary(beneficiary.id, {
          name: form.name.trim(),
          nickname: form.nickname.trim(),
          upiId: form.upiId.trim(),
          mobile: form.mobile.trim(),
          email: form.email.trim(),
          dailyLimit: Number(form.dailyLimit) || 100000,
        });
        toast.success('Payee updated');
      } else {
        await api.addBeneficiary({
          name: form.name.trim(),
          accountNumber: form.accountNumber.replace(/\s/g, ''),
          ifsc: form.ifsc.toUpperCase(),
          bankName: form.bankName,
          accountHolderName: form.accountHolderName.trim() || form.name.trim(),
          accountType: form.accountType,
          upiId: form.upiId.trim() || undefined,
          mobile: form.mobile.trim() || undefined,
          email: form.email.trim() || undefined,
          nickname: form.nickname.trim() || undefined,
        });
        toast.success('Payee added');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      // Rollback on failure
      if (!isEdit) {
        setItems((prev) => prev.filter((item) => item.id !== tempId));
      } else if (beneficiary) {
        setItems((prev) => prev.map((item) => (item.id === beneficiary.id ? { ...item, ...beneficiary } : item)));
      }
      toast.error(err?.response?.data?.error || 'Could not save the payee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit payee' : 'Add a payee'}
      description={
        isEdit
          ? 'Bank account details cannot be changed after saving.'
          : 'Check the IFSC carefully — a wrong IFSC will bounce the payment.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brass" onClick={save} isLoading={saving}>
            {isEdit ? 'Save changes' : 'Add payee'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Payee name" required value={form.name} onChange={set('name')} placeholder="e.g. Ananya Iyer" />
          <Input
            label="Nickname"
            value={form.nickname}
            onChange={set('nickname')}
            placeholder="e.g. Home"
            maxLength={30}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Bank"
            value={form.bankName}
            onChange={set('bankName')}
            options={INDIAN_BANKS}
            disabled={isEdit}
          />
          <Select
            label="Account type"
            value={form.accountType}
            onChange={set('accountType')}
            options={['SAVINGS', 'CURRENT', 'SALARY']}
            disabled={isEdit}
          />
        </div>

        <Input
          label="Account number"
          required
          inputMode="numeric"
          value={form.accountNumber}
          onChange={set('accountNumber')}
          disabled={isEdit}
          placeholder="10 to 18 digits"
          className="font-mono"
          hint={isEdit ? 'Bank details are locked once saved.' : undefined}
        />

        <Input
          label="IFSC code"
          required
          value={form.ifsc}
          onChange={set('ifsc')}
          disabled={isEdit}
          className="font-mono uppercase"
          maxLength={11}
          hint={isEdit ? undefined : 'Auto-filled from the bank above — verify before saving.'}
        />

        <Input
          label="Account holder name"
          value={form.accountHolderName}
          onChange={set('accountHolderName')}
          disabled={isEdit}
          placeholder="As printed on the bank record"
        />

        {isEdit ? (
          <Input
            label="Daily limit (₹)"
            type="number"
            inputMode="numeric"
            value={form.dailyLimit}
            onChange={set('dailyLimit')}
            hint="The most that can be sent to this payee in a day."
          />
        ) : (
          <Input
            label="UPI ID"
            value={form.upiId}
            onChange={set('upiId')}
            placeholder="name@okhdfcbank"
            hint="Optional — lets you pay by UPI as well as NEFT/IMPS."
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Mobile"
            value={form.mobile}
            onChange={set('mobile')}
            leftIcon={<Phone className="w-4 h-4" />}
            placeholder="+91 98765 43210"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={set('email')}
            leftIcon={<Mail className="w-4 h-4" />}
            placeholder="name@example.com"
          />
        </div>
      </div>
    </Modal>
  );
}

export default Beneficiaries;
