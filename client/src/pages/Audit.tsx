import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Filter, Download, ShieldCheck, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { AuditEntry } from '../types';
import { formatDateTime, downloadCSV } from '../utils/format';
import { cn } from '../utils/cn';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Select,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Skeleton,
  EmptyState,
} from '../components/ui';

const prettyAction = (action: string) =>
  action
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export function Audit() {
  const { user } = useAuthStore();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: '', entity: '', status: '', fromDate: '', toDate: '' });

  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (filters.action) params.action = filters.action;
      if (filters.entity) params.entity = filters.entity;
      if (filters.status) params.status = filters.status;
      if (filters.fromDate) params.fromDate = new Date(filters.fromDate).toISOString();
      if (filters.toDate) {
        const d = new Date(filters.toDate);
        d.setHours(23, 59, 59, 999);
        params.toDate = d.toISOString();
      }

      const res = await api.getAuditLog(params);
      setEntries(res.data?.entries ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load the audit log');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'manager') return;
    api
      .getAuditLog({ limit: 1 })
      .then(() => undefined)
      .catch(() => undefined);
  }, [user]);

  // Populate the action filter from the data we have, rather than a second
  // endpoint round-trip.
  useEffect(() => {
    const seen = new Set<string>();
    for (const e of entries) seen.add(e.action);
    setActions((prev) => {
      const merged = new Set([...prev, ...seen]);
      return [...merged].sort();
    });
  }, [entries]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasFilters = Object.values(filters).some(Boolean);

  const exportCsv = () => {
    if (entries.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    downloadCSV(
      `audit-log-${new Date().toISOString().slice(0, 10)}`,
      entries.map((e) => ({
        Timestamp: formatDateTime(e.createdAt),
        Actor: e.actorEmail ?? '',
        Role: e.actorRole ?? '',
        Action: e.action,
        Entity: e.entity,
        Status: e.status,
        IP: e.ip ?? '',
        Message: e.message ?? '',
      }))
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance"
        title="Audit log"
        description="An append-only record of every state-changing action. Entries cannot be edited or deleted."
        actions={
          <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />} onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted" aria-hidden="true" />
          <h2 className="eyebrow">Filters</h2>
          {hasFilters ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              leftIcon={<XCircle className="w-3.5 h-3.5" />}
              onClick={() => {
                setFilters({ action: '', entity: '', status: '', fromDate: '', toDate: '' });
                setPage(1);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Action"
            value={filters.action}
            onChange={(e) => {
              setFilters((f) => ({ ...f, action: e.target.value }));
              setPage(1);
            }}
            placeholder="Any action"
            options={actions.map((a) => ({ value: a, label: prettyAction(a) }))}
          />
          <Select
            label="Entity"
            value={filters.entity}
            onChange={(e) => {
              setFilters((f) => ({ ...f, entity: e.target.value }));
              setPage(1);
            }}
            placeholder="Any entity"
            options={['auth', 'account', 'transaction', 'card', 'beneficiary', 'loan', 'statement', 'session']}
          />
          <Select
            label="Status"
            value={filters.status}
            onChange={(e) => {
              setFilters((f) => ({ ...f, status: e.target.value }));
              setPage(1);
            }}
            placeholder="Any status"
            options={[
              { value: 'SUCCESS', label: 'Success' },
              { value: 'FAILURE', label: 'Failure' },
            ]}
          />
          <Input
            label="From"
            type="date"
            value={filters.fromDate}
            onChange={(e) => {
              setFilters((f) => ({ ...f, fromDate: e.target.value }));
              setPage(1);
            }}
          />
          <Input
            label="To"
            type="date"
            value={filters.toDate}
            onChange={(e) => {
              setFilters((f) => ({ ...f, toDate: e.target.value }));
              setPage(1);
            }}
          />
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="p-5 space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={40} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="w-6 h-6" />}
            title="No matching entries"
            description={
              hasFilters
                ? 'Try widening the date range or clearing a filter.'
                : 'Actions taken in the app will be recorded here.'
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead className="hidden sm:table-cell">Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Entity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, i) => (
                <TableRow key={e.id ?? `${e.createdAt}-${e.action}-${i}`}>
                  <TableCell className="whitespace-nowrap text-xs text-muted">
                    {formatDateTime(e.createdAt)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-sm text-ink-soft truncate block max-w-[14rem]">
                      {e.actorEmail ?? '—'}
                    </span>
                    {e.actorRole ? (
                      <Badge variant="outline" size="sm" className="mt-0.5">
                        {e.actorRole}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium text-text">{prettyAction(e.action)}</span>
                    {e.message ? (
                      <span className="block text-xs text-muted mt-0.5 max-w-[22rem] truncate">
                        {e.message}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" size="sm">
                      {e.entity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.status === 'FAILURE' ? 'danger' : 'success'} size="sm" dot>
                      {e.status === 'FAILURE' ? 'Failed' : 'OK'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs text-muted">
                    {e.ip ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border">
            <p className="text-xs text-muted">
              Page {page} of {totalPages} · {total} entries
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted leading-relaxed">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        Audit entries are written on every account, card, payment and statement change. Passwords,
        PINs and tokens are stripped before anything is stored here.
      </p>
    </div>
  );
}

export default Audit;
