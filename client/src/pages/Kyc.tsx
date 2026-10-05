import { useCallback, useEffect, useState } from 'react';
import {
  BadgeCheck,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck2,
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { KycSubmission } from '../types';
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
  Textarea,
  Checkbox,
  Skeleton,
  EmptyState,
} from '../components/ui';
import { cn } from '../utils/cn';

const OCCUPATIONS = [
  'Salaried employee',
  'Self-employed / business',
  'Professional (doctor, lawyer, CA)',
  'Government employee',
  'Student',
  'Homemaker',
  'Retired',
  'Other',
];

const SOURCES_OF_FUNDS = [
  'Salary',
  'Business income',
  'Sale of property',
  'Investment returns',
  'Gift or inheritance',
  'Loan',
];

const DOCUMENT_TYPES = ['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID'];

function KycStatusBadge({ status }: { status: KycSubmission['status'] }) {
  const map = {
    DRAFT: { variant: 'neutral' as const, label: 'Draft', Icon: FileCheck2 },
    SUBMITTED: { variant: 'info' as const, label: 'Submitted', Icon: Clock },
    UNDER_REVIEW: { variant: 'brass' as const, label: 'In review', Icon: Clock },
    VERIFIED: { variant: 'success' as const, label: 'Verified', Icon: CheckCircle2 },
    REJECTED: { variant: 'danger' as const, label: 'Rejected', Icon: XCircle },
    EXPIRED: { variant: 'warning' as const, label: 'Expired', Icon: ShieldAlert },
  };
  const entry = map[status] ?? map.SUBMITTED;
  return (
    <Badge variant={entry.variant}>
      <entry.Icon className="w-3 h-3 mr-1" />
      {entry.label}
    </Badge>
  );
}

export function Kyc() {
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [kycStatus, setKycStatus] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [occupation, setOccupation] = useState(OCCUPATIONS[0]);
  const [annualIncome, setAnnualIncome] = useState('');
  const [sourceOfFunds, setSourceOfFunds] = useState(SOURCES_OF_FUNDS[0]);
  const [politicallyExposed, setPoliticallyExposed] = useState(false);
  const [addressProofType, setAddressProofType] = useState('Aadhaar');
  const [docs, setDocs] = useState<Array<{ type: string; number: string; on: boolean }>>([
    { type: 'AADHAAR', number: '', on: true },
    { type: 'PAN', number: '', on: true },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getMyKyc();
      if (res.success && res.data) {
        // `latest` is the current submission and `history` is what came before
        // it. The server includes the current one in `history` too, so dedupe by
        // id — without this the page renders the same submission twice, which
        // React reports as a duplicate key. `latest` is kept first so
        // `submissions[0]` is always the current status.
        const seen = new Set<string>();
        const all = [res.data.latest, ...(res.data.history ?? [])]
          .filter((s): s is KycSubmission => !!s?.id)
          .filter((s) => {
            if (seen.has(s.id)) return false;
            seen.add(s.id);
            return true;
          });
        setSubmissions(all);
        setKycStatus(res.data.kycStatus);
      }
    } catch {
      toast.error('Could not load your KYC status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = submissions[0];
  const canSubmit = fullName.trim().length > 2 && dob && address.trim().length > 8 && Number(annualIncome) >= 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await api.submitKyc({
        declared: {
          fullName: fullName.trim(),
          dateOfBirth: dob,
          address: address.trim(),
          occupation,
          annualIncome: Number(annualIncome),
          sourceOfFunds,
          politicallyExposed,
        },
        documents: docs
          .filter((d) => d.on)
          .map((d) => ({ type: d.type, number: d.number || undefined })),
        addressProofType,
      });
      if (res.success) {
        toast.success('KYC submitted for review');
        setCreating(false);
        await load();
      } else {
        toast.error(res.error || 'Could not submit your KYC');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not submit your KYC');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Know Your Customer"
        description="Your identity verification status and what you have submitted."
        actions={
          <Button
            variant="brass"
            onClick={() => setCreating(true)}
            disabled={latest?.status === 'SUBMITTED' || latest?.status === 'UNDER_REVIEW'}
          >
            <Plus className="w-4 h-4" />
            {submissions.length ? 'Submit an update' : 'Start verification'}
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      ) : latest ? (
        <Card className="card-accent">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Current status</CardTitle>
                <p className="mt-1 text-sm text-muted">
                  <span className="amount">{latest.reference}</span> · submitted{' '}
                  {formatDate(latest.submittedAt)}
                  {/* The bank's own record on the customer, which is what the
                      rest of the app reads to decide whether limits apply.
                      Showing it makes an out-of-sync state visible instead of
                      silently contradicting the submission status above. */}
                  {kycStatus && kycStatus !== latest.status ? (
                    <span className="ml-1 text-warning-700">
                      · bank record reads {kycStatus.toLowerCase()}
                    </span>
                  ) : null}
                </p>
              </div>
              <KycStatusBadge status={latest.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {latest.status === 'VERIFIED' ? (
              <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/[0.06] p-4">
                <CheckCircle2 className="w-5 h-5 text-success-700 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-ink-soft">You are verified</p>
                  <p className="mt-1 text-muted">
                    {latest.riskLevel === 'LOW' ? 'Low' : latest.riskLevel || 'Standard'} risk
                    assessment
                    {latest.validUntil
                      ? `, valid until ${formatDate(latest.validUntil)}.`
                      : '.'}{' '}
                    We will ask you to reverify before this expires.
                  </p>
                </div>
              </div>
            ) : null}

            {latest.status === 'REJECTED' ? (
              <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] p-4">
                <XCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-ink-soft">We could not verify these documents</p>
                  {latest.rejectionReasons?.length ? (
                    <ul className="mt-2 space-y-1 list-disc list-inside text-muted">
                      {latest.rejectionReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                  {latest.decisionNotes ? (
                    <p className="mt-2 text-muted">{latest.decisionNotes}</p>
                  ) : null}
                  <Button variant="brass" size="sm" className="mt-3" onClick={() => setCreating(true)}>
                    Resubmit
                  </Button>
                </div>
              </div>
            ) : null}

            {latest.status === 'SUBMITTED' || latest.status === 'UNDER_REVIEW' ? (
              <div className="flex items-start gap-3 rounded-xl border border-brass/30 bg-brass/[0.06] p-4">
                <Clock className="w-5 h-5 text-brass-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-ink-soft">Under review</p>
                  <p className="mt-1 text-muted">
                    Our team is checking your documents. This usually takes one working day. You will
                    get a notification either way — there is nothing else to do.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="eyebrow">Declared details</p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <Row label="Name" value={latest.declared.fullName} />
                  <Row label="Date of birth" value={formatDate(latest.declared.dateOfBirth)} />
                  <Row label="Occupation" value={latest.declared.occupation} />
                  <Row label="Annual income" value={formatCurrency(latest.declared.annualIncome)} />
                  <Row label="Source of funds" value={latest.declared.sourceOfFunds} />
                </dl>
              </div>
              <div>
                <p className="eyebrow">Documents</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {latest.documents.map((doc) => (
                    <li key={doc.type} className="flex items-center justify-between gap-3">
                      <span className="text-ink-soft">
                        {doc.type.replace(/_/g, ' ').toLowerCase()}
                        {doc.number ? ` · ${doc.number}` : ''}
                      </span>
                      {doc.verified ? (
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-label="Verified" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted shrink-0" aria-label="Pending" />
                      )}
                    </li>
                  ))}
                </ul>
                {latest.reviewedByName ? (
                  <p className="mt-3 text-xs text-muted">
                    Reviewed by {latest.reviewedByName} on {formatDate(latest.reviewedAt)}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={<BadgeCheck className="w-6 h-6" />}
              title="Not verified yet"
              description="Complete verification to raise your account and transaction limits."
              action={
                <Button variant="brass" onClick={() => setCreating(true)}>
                  Start verification
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {submissions.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Submission history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {submissions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      <span className="amount">{s.reference}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(s.submittedAt)}
                      {s.decisionNotes ? ` · ${s.decisionNotes}` : ''}
                    </p>
                  </div>
                  <KycStatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------------- submit modal */}
      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Verify your identity" size="xl">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="kyc-name">
                Full name, as on your ID
              </label>
              <Input
                id="kyc-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Aarav Sharma"
              />
            </div>
            <div>
              <label className="label" htmlFor="kyc-dob">
                Date of birth
              </label>
              <Input
                id="kyc-dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="kyc-address">
              Residential address
            </label>
            <Textarea
              id="kyc-address"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Flat 7A, Koramangala 4th Block, Bengaluru 560034"
            />
            <div className="mt-2">
              <span className="text-sm text-muted">Address proof: </span>
              <Select
                value={addressProofType}
                onChange={(e) => setAddressProofType(e.target.value)}
                className="inline-block w-auto"
              >
                {['Aadhaar', 'Passport', 'Driving licence', 'Utility bill', 'Rent agreement'].map(
                  (t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  )
                )}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="kyc-occupation">
                Occupation
              </label>
              <Select
                id="kyc-occupation"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
              >
                {OCCUPATIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor="kyc-income">
                Annual income
              </label>
              <Input
                id="kyc-income"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="1200000"
                value={annualIncome}
                onChange={(e) => setAnnualIncome(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="kyc-source">
                Main source of funds
              </label>
              <Select
                id="kyc-source"
                value={sourceOfFunds}
                onChange={(e) => setSourceOfFunds(e.target.value)}
              >
                {SOURCES_OF_FUNDS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <p className="label">Documents</p>
            {docs.map((doc, index) => (
              <div
                key={index}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center',
                  doc.on ? 'border-border' : 'border-dashed border-border/60 opacity-60'
                )}
              >
                <Checkbox
                  checked={doc.on}
                  onChange={(e) =>
                    setDocs((prev) =>
                      prev.map((d, i) => (i === index ? { ...d, on: e.target.checked } : d))
                    )
                  }
                  label="Include"
                />
                <Select
                  value={doc.type}
                  onChange={(e) =>
                    setDocs((prev) =>
                      prev.map((d, i) => (i === index ? { ...d, type: e.target.value } : d))
                    )
                  }
                  className="sm:w-44"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="Number"
                  value={doc.number}
                  onChange={(e) =>
                    setDocs((prev) =>
                      prev.map((d, i) => (i === index ? { ...d, number: e.target.value } : d))
                    )
                  }
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDocs((prev) => [...prev, { type: 'PASSPORT', number: '', on: true }])}
              disabled={docs.length >= 4}
            >
              <Plus className="w-3.5 h-3.5" />
              Add another document
            </Button>
          </div>

          {/*
            The PEP question is asked because a bank is legally required to ask
            it, and because the answer genuinely changes how the account is
            handled. Phrased plainly rather than as compliance boilerplate.
          */}
          <label className="flex items-start gap-3 rounded-xl border border-border bg-sunken p-4">
            <Checkbox
              checked={politicallyExposed}
              onChange={(e) => setPoliticallyExposed(e.target.checked)}
              label=""
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium text-ink-soft">
                Are you a politically exposed person?
              </span>
              <span className="block mt-1 text-muted">
                That means a current or former senior government official, a member of their family,
                or someone closely associated with one. Answering yes does not affect your account
                — it changes the checks we are required to run.
              </span>
            </span>
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="brass" onClick={submit} disabled={!canSubmit || submitting}>
              {submitting ? 'Submitting…' : 'Submit for review'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink-soft text-right truncate">{value}</dd>
    </div>
  );
}

export default Kyc;
