import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  Monitor,
  LogOut,
  Trash2,
  KeyRound,
  Globe,
  History,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { AuditEntry, ActiveSession } from '../types';
import { formatDateTime, formatRelativeTime } from '../utils/format';
import { cn } from '../utils/cn';
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
  EmptyState,
} from '../components/ui';

const ACTION_TONE: Record<string, 'success' | 'danger' | 'info' | 'warning' | 'neutral'> = {
  LOGIN: 'success',
  LOGIN_FAILED: 'danger',
  PAYMENT_SENT: 'info',
  PAYMENT_REVERSED: 'warning',
  CARD_FREEZE: 'warning',
  CARD_CANCEL: 'danger',
  CARD_PIN_SET: 'warning',
  SESSION_REVOKED: 'neutral',
  ALL_SESSIONS_REVOKED: 'danger',
  STATEMENT_DOWNLOADED: 'neutral',
  STATEMENT_GENERATED: 'info',
};

const prettyAction = (action: string) =>
  action
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export function Security() {
  const { user, logout } = useAuthStore();

  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionsRes, logRes] = await Promise.all([
        api.getActiveSessions(),
        api.getMySecurityLog({ limit: 25 }),
      ]);
      setSessions(sessionsRes.data?.sessions ?? []);
      setEntries(logRes.data?.entries ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load your security activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (session: ActiveSession) => {
    setBusy(session.id);
    try {
      await api.revokeSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      if (session.current) {
        toast.success('Signed out. Please log in again.');
        await logout();
        window.location.replace('/login');
        return;
      }
      toast.success('Device signed out');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not revoke that session');
    } finally {
      setBusy(null);
    }
  };

  const revokeAll = async () => {
    if (!window.confirm('Sign out of every device, including this one?')) return;
    setBusy('all');
    try {
      await api.revokeAllSessions();
      toast.success('Signed out everywhere');
      await logout();
      window.location.replace('/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not sign out everywhere');
    } finally {
      setBusy(null);
    }
  };

  const failedAttempts = entries.filter((e) => e.status === 'FAILURE').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Protect your money"
        title="Security"
        description="Where you're signed in, and everything you've done recently."
        actions={
          <Button
            variant="danger"
            leftIcon={<LogOut className="w-4 h-4" />}
            onClick={revokeAll}
            isLoading={busy === 'all'}
          >
            Sign out everywhere
          </Button>
        }
      />

      {failedAttempts > 0 ? (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border border-brass-100 bg-brass-50 text-sm text-brass-800"
          role="status"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">
              {failedAttempts} failed sign-in {failedAttempts === 1 ? 'attempt' : 'attempts'} on your
              account recently.
            </p>
            <p className="mt-0.5 text-brass-700/80 leading-relaxed">
              If any of these were not you, change your password now and sign out of every device.
            </p>
          </div>
        </div>
      ) : (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border border-success-100 bg-success-50 text-sm text-success-700"
          role="status"
        >
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="leading-relaxed">
            No failed sign-in attempts in your recent activity. Your account looks healthy.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ------------------------------------------------- active sessions */}
        <Card className="lg:col-span-2 h-fit">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Signed-in devices</CardTitle>
            <Badge variant="outline" size="sm">
              {sessions.length}
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} variant="rectangular" height={72} />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted py-6 text-center">No other active sessions.</p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      'p-3.5 rounded-xl border transition-colors',
                      s.current ? 'border-success-100 bg-success-50/50' : 'border-border bg-paper/40'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Monitor className="w-4 h-4 text-muted mt-0.5 shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text truncate">
                            {s.current ? 'This device' : `Session ${s.fingerprint}…`}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            Started {formatRelativeTime(s.createdAt)}
                          </p>
                          <p className="text-[0.6875rem] text-muted/70 mt-0.5">
                            Expires {formatDateTime(s.expiresAt)}
                          </p>
                        </div>
                      </div>
                      {s.current ? (
                        <Badge variant="success" size="sm" dot>
                          Active
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revoke(s)}
                          isLoading={busy === s.id}
                          aria-label="Sign out this device"
                        >
                          Sign out
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- audit trail */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4 text-muted" aria-hidden="true" />
                Recent activity
              </CardTitle>
              <p className="text-xs text-muted mt-1">
                Everything recorded against {user?.email}
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={44} />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="w-6 h-6" />}
                title="No activity yet"
                description="Your sign-ins, payments and card actions will be listed here."
              />
            ) : (
              <ul className="divide-y divide-border/70">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-text">
                          {prettyAction(entry.action)}
                        </span>
                        <Badge
                          variant={ACTION_TONE[entry.action] ?? (entry.status === 'FAILURE' ? 'danger' : 'neutral')}
                          size="sm"
                        >
                          {entry.status === 'FAILURE' ? 'Failed' : entry.entity}
                        </Badge>
                      </div>
                      {entry.message ? (
                        <p className="text-xs text-muted mt-0.5">{entry.message}</p>
                      ) : null}
                    </div>
                    <time
                      className="text-[0.6875rem] text-muted shrink-0 mt-1"
                      dateTime={entry.createdAt}
                      title={formatDateTime(entry.createdAt)}
                    >
                      {formatRelativeTime(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------- hardening */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: KeyRound,
            title: 'Strong password',
            body: 'Use a long passphrase you do not use anywhere else. It is the single biggest factor.',
            action: { label: 'Change password', onClick: () => (window.location.href = '/settings') },
          },
          {
            icon: Globe,
            title: 'Check your payees',
            body: 'Most fraud starts with a saved payee that was added by someone else. Verify new entries.',
            action: { label: 'Review payees', onClick: () => (window.location.href = '/beneficiaries') },
          },
          {
            icon: Monitor,
            title: 'Sign out old devices',
            body: 'If you no longer use a phone or laptop, remove it from your active sessions.',
            action: { label: 'Manage devices', onClick: () => document.getElementById('main-scroll')?.scrollTo({ top: 0 }) },
          },
        ].map(({ icon: Icon, title, body, action }) => (
          <Card key={title} className="card-hover p-5">
            <span className="grid place-items-center h-10 w-10 rounded-xl bg-brass-50 border border-brass-100 text-brass-700 mb-3">
              <Icon className="w-5 h-5" aria-hidden="true" />
            </span>
            <h3 className="font-display font-semibold text-text">{title}</h3>
            <p className="text-sm text-muted mt-1.5 leading-relaxed">{body}</p>
            <Button variant="ghost" size="sm" className="mt-3 -ml-3" onClick={action.onClick}>
              {action.label}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default Security;
