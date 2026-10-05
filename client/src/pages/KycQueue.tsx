import { useCallback, useEffect, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Search,
  Inbox,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { KycSubmission } from '../types';
import { formatCurrency, formatDate, fullName } from '../utils/format';
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
  Textarea,
  Skeleton,
  EmptyState,
  Tabs,
} from '../components/ui';
import { cn } from '../utils/cn';

/**
 * Tab ids are real `KycStatus` values, because they are sent straight to
 * `GET /banking/kyc/queue?status=`. An earlier version used a display label
 * (`PENDING`) as the id and the tab silently matched nothing.
 */
const STATUS_TABS = [
  { id: 'SUBMITTED', label: 'Waiting' },
  { id: 'UNDER_REVIEW', label: 'In review' },
  { id: 'VERIFIED', label: 'Verified' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'ALL', label: 'All' },
];

export function KycQueue() {
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('SUBMITTED');
  const [search, setSearch] = useState('');

  const [reviewing, setReviewing] = useState<KycSubmission | null>(null);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [notes, setNotes] = useState('');
  const [riskLevel, setRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW');
  const [reasons, setReasons] = useState<string[]>([]);
  const [reasonDraft, setReasonDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await api.getKycQueue(status === 'ALL' ? undefined : status);
      if (res.success && res.data) {
        setSubmissions(res.data.submissions);
        setCounts(res.data.counts ?? {});
      }
    } catch {
      toast.error('Could not load the review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  const filtered = submissions.filter((s) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return (
      s.reference.toLowerCase().includes(needle) ||
      fullName(s.customer).toLowerCase().includes(needle) ||
      (s.customer?.email ?? '').toLowerCase().includes(needle) ||
      s.declared.fullName.toLowerCase().includes(needle)
    );
  });

  const openReview = (submission: KycSubmission) => {
    setReviewing(submission);
    setDecision('APPROVE');
    setNotes('');
    setRiskLevel('LOW');
    setReasons([]);
    setReasonDraft('');
  };

  const submitReview = async () => {
    if (!reviewing) return;
    setSubmitting(true);
    try {
      const res = await api.reviewKyc(reviewing.id, {
        decision,
        notes: notes || undefined,
        riskLevel,
        rejectionReasons: decision === 'REJECT' && reasons.length ? reasons : undefined,
      });
      if (res.success) {
        toast.success(
          decision === 'APPROVE' ? 'KYC verified' : 'KYC rejected and the customer notified'
        );
        setReviewing(null);
        await load(tab);
      } else {
        toast.error(res.error || 'Could not record the decision');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Could not record the decision');
    } finally {
      setSubmitting(false);
    }
  };

  const addReason = () => {
    const trimmed = reasonDraft.trim();
    if (!trimmed) return;
    setReasons((prev) => [...prev, trimmed]);
    setReasonDraft('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="KYC review queue"
        description="Identity verifications waiting on a decision."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))
        ) : (
          <>
            <StatTile
              label="Waiting"
              value={String(counts.SUBMITTED ?? 0)}
              icon={<Clock className="w-5 h-5" />}
              hint="Not yet picked up"
              tone={counts.SUBMITTED ? 'brass' : 'neutral'}
            />
            <StatTile
              label="In review"
              value={String(counts.UNDER_REVIEW ?? 0)}
              icon={<ShieldAlert className="w-5 h-5" />}
              hint="Being checked"
            />
            <StatTile
              label="Verified"
              value={String(counts.VERIFIED ?? 0)}
              icon={<CheckCircle2 className="w-5 h-5" />}
              hint="All time"
              tone="positive"
            />
            <StatTile
              label="Rejected"
              value={String(counts.REJECTED ?? 0)}
              icon={<XCircle className="w-5 h-5" />}
              hint="Resubmission needed"
              tone={counts.REJECTED ? 'warning' : 'neutral'}
            />
          </>
        )}
      </div>

      <Card className="card-accent">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Submissions</CardTitle>
              <div className="relative sm:w-72">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email or reference"
                  className="pl-9"
                  aria-label="Search submissions"
                />
              </div>
            </div>
            <Tabs
              items={STATUS_TABS.map((t) => ({
                ...t,
                count: t.id === 'ALL' ? undefined : counts[t.id],
              }))}
              activeId={tab}
              onChange={setTab}
            />          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Inbox className="w-6 h-6" />}
              title={search ? 'Nothing matches that search' : 'Queue is clear'}
              description={
                search
                  ? 'Try a different name, email or reference.'
                  : 'No submissions are waiting in this state.'
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((submission) => (
                <li
                  key={submission.id}
                  className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {submission.customer
                          ? fullName(submission.customer)
                          : submission.declared.fullName}
                      </span>
                      <StatusPill status={submission.status} />
                      {submission.riskLevel && submission.riskLevel !== 'LOW' ? (
                        <Badge variant="warning">{submission.riskLevel} risk</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted truncate">
                      {submission.customer?.email ?? '—'} · {submission.customer?.phone ?? '—'}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      <span className="amount">{submission.reference}</span> · submitted{' '}
                      {formatDate(submission.submittedAt)} · {submission.declared.occupation} ·{' '}
                      {formatCurrency(submission.declared.annualIncome)} a year
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="lg:shrink-0"
                    onClick={() => openReview(submission)}
                  >
                    <BadgeCheck className="w-3.5 h-3.5" />
                    Review
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------- review modal */}
      <Modal
        isOpen={!!reviewing}
        onClose={() => setReviewing(null)}
        title="Review KYC submission"
        size="xl"
      >
        {reviewing ? (
          <div className="space-y-5">
            <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
              <Detail label="Customer" value={fullName(reviewing.customer) || reviewing.declared.fullName} />
              <Detail label="Reference" value={reviewing.reference} mono />
              <Detail label="Date of birth" value={formatDate(reviewing.declared.dateOfBirth)} />
              <Detail label="Occupation" value={reviewing.declared.occupation} />
              <Detail label="Annual income" value={formatCurrency(reviewing.declared.annualIncome)} />
              <Detail label="Source of funds" value={reviewing.declared.sourceOfFunds} />
              <Detail
                label="Address"
                value={reviewing.declared.address}
                className="sm:col-span-2"
              />
              <Detail label="Address proof" value={reviewing.addressProofType ?? '—'} />
              <Detail
                label="Selfie match"
                value={reviewing.selfieVerified ? 'Matched' : 'Not captured'}
              />
            </div>

            {reviewing.declared.politicallyExposed ? (
              <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/[0.08] p-4 text-sm">
                <ShieldAlert className="w-4 h-4 text-warning-700 shrink-0 mt-0.5" />
                <span>
                  <strong className="font-medium">Politically exposed person declared.</strong>{' '}
                  Enhanced due diligence applies — escalate rather than approve outright.
                </span>
              </p>
            ) : null}

            <div>
              <p className="label">Documents</p>
              <ul className="space-y-1.5 text-sm">
                {reviewing.documents.map((doc) => (
                  <li key={doc.type} className="flex items-center justify-between gap-3">
                    <span className="text-ink-soft">
                      {doc.type.replace(/_/g, ' ').toLowerCase()}
                      {doc.number ? ` · ${doc.number}` : ''}
                    </span>
                    {doc.verified ? (
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-label="Verified" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted shrink-0" aria-label="Not yet checked" />
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <span className="label">Decision</span>
              <div className="grid grid-cols-2 gap-2">
                {(['APPROVE', 'REJECT'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDecision(option)}
                    aria-pressed={decision === option}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all',
                      decision === option
                        ? option === 'APPROVE'
                          ? 'border-success bg-success/10 text-success-700'
                          : 'border-danger bg-danger/10 text-danger'
                        : 'border-border text-muted hover:border-ink-muted/40'
                    )}
                  >
                    {option === 'APPROVE' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    {option === 'APPROVE' ? 'Verify' : 'Reject'}
                  </button>
                ))}
              </div>
            </div>

            {decision === 'REJECT' ? (
              <div>
                <span className="label">Why is it being rejected?</span>
                <p className="field-hint mb-2">
                  The customer sees these reasons, so be specific enough for them to fix it.
                </p>
                <ul className="space-y-2 mb-2">
                  {reasons.map((reason, index) => (
                    <li
                      key={index}
                      className="flex items-start justify-between gap-3 rounded-lg bg-danger/[0.06] px-3 py-2 text-sm"
                    >
                      <span>{reason}</span>
                      <button
                        type="button"
                        onClick={() => setReasons((prev) => prev.filter((_, i) => i !== index))}
                        className="text-danger shrink-0"
                        aria-label="Remove reason"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Input
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addReason();
                      }
                    }}
                    placeholder="Aadhaar image is not legible"
                  />
                  <Button variant="secondary" onClick={addReason}>
                    Add
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="kyc-risk">
                  Risk level
                </label>
                <Select
                  id="kyc-risk"
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                >
                  <option value="LOW">Low — standard customer</option>
                  <option value="MEDIUM">Medium — periodic review</option>
                  <option value="HIGH">High — enhanced monitoring</option>
                </Select>
              </div>
              <div>
                <label className="label" htmlFor="kyc-notes">
                  Internal notes
                </label>
                <Input
                  id="kyc-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Checked against source records"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setReviewing(null)}>
                Close
              </Button>
              <Button
                variant={decision === 'APPROVE' ? 'brass' : 'danger'}
                onClick={submitReview}
                disabled={submitting || (decision === 'REJECT' && reasons.length === 0)}
              >
                {submitting
                  ? 'Recording…'
                  : decision === 'APPROVE'
                    ? 'Verify this customer'
                    : 'Reject and notify'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function StatusPill({ status }: { status: KycSubmission['status'] }) {
  const map = {
    DRAFT: { variant: 'neutral' as const, label: 'Draft' },
    SUBMITTED: { variant: 'info' as const, label: 'Waiting' },
    UNDER_REVIEW: { variant: 'brass' as const, label: 'In review' },
    VERIFIED: { variant: 'success' as const, label: 'Verified' },
    REJECTED: { variant: 'danger' as const, label: 'Rejected' },
    EXPIRED: { variant: 'warning' as const, label: 'Expired' },
  };
  const entry = map[status] ?? map.SUBMITTED;
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

function Detail({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="eyebrow">{label}</p>
      <p className={cn('mt-1 text-sm text-ink-soft', mono && 'amount')}>{value}</p>
    </div>
  );
}

export default KycQueue;
