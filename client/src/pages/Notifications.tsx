import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellRing,
  CheckCheck,
  Trash2,
  ArrowUpRight,
  Wallet,
  ArrowLeftRight,
  Landmark,
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { AppNotification, NotificationCategory } from '../types';
import { formatRelativeTime, formatDateTime } from '../utils/format';
import { cn } from '../utils/cn';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  Tabs,
} from '../components/ui';

const ICONS: Record<NotificationCategory, typeof Bell> = {
  transaction: ArrowLeftRight,
  account: Wallet,
  loan: Landmark,
  card: CreditCard,
  security: ShieldCheck,
  system: Bell,
};

const TINTS: Record<NotificationCategory, string> = {
  transaction: 'bg-primary-50 text-primary-600 border-primary-100',
  account: 'bg-brass-50 text-brass-700 border-brass-100',
  loan: 'bg-success-50 text-success-700 border-success-100',
  card: 'bg-primary-50 text-primary-600 border-primary-100',
  security: 'bg-danger-50 text-danger-700 border-danger-100',
  system: 'bg-paper text-muted border-border',
};

export function Notifications() {
  const navigate = useNavigate();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [category, setCategory] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications({ limit: 60, unreadOnly: filter === 'unread' });
      setItems(res.data?.notifications ?? []);
      setUnread(res.meta?.unreadCount ?? 0);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    // Optimistic UI: mark all as read immediately
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await api.markAllNotificationsRead();
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Could not update notifications');
    }
  };

  const open = async (n: AppNotification) => {
    if (!n.read) {
      setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
      setUnread((c) => Math.max(0, c - 1));
      api.markNotificationRead(n.id).catch(() => {
        /* optimistic; the badge self-corrects on the next poll */
      });
    }
    if (n.link) navigate(n.link);
  };

  const remove = async (n: AppNotification) => {
    // Optimistic UI: remove immediately, rollback on failure
    const original = items.find((item) => item.id === n.id);
    const wasRead = n.read;

    setItems((prev) => prev.filter((item) => item.id !== n.id));
    if (!n.read) setUnread((c) => Math.max(0, c - 1));

    try {
      await api.removeNotification(n.id);
    } catch {
      // Rollback on failure
      if (original) {
        setItems((prev) => [...prev, original].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }
      setUnread((c) => c + (wasRead ? 0 : 1));
      load();
    }
  };

  const clearRead = async () => {
    // Optimistic UI: clear read notifications immediately
    const readNotifications = items.filter((n) => n.read);
    setItems((prev) => prev.filter((n) => !n.read));
    try {
      await api.clearReadNotifications();
      toast.success('Read notifications cleared');
    } catch {
      // Rollback on failure
      setItems((prev) => [...prev, ...readNotifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      load();
      toast.error('Could not clear notifications');
    }
  };

  const visible = category === 'all' ? items : items.filter((n) => n.category === category);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Everything in one place"
        title="Notifications"
        description="Payment alerts, EMI reminders, card activity and security events."
        actions={
          <>
            {unread > 0 ? (
              <Button variant="secondary" leftIcon={<CheckCheck className="w-4 h-4" />} onClick={markAll}>
                Mark all read
              </Button>
            ) : null}
            <Button variant="ghost" leftIcon={<Trash2 className="w-4 h-4" />} onClick={clearRead}>
              Clear read
            </Button>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Tabs
          items={[
            { id: 'all', label: 'All' },
            { id: 'unread', label: `Unread${unread > 0 ? ` (${unread})` : ''}` },
          ]}
          activeId={filter}
          onChange={(id) => setFilter(id as 'all' | 'unread')}
        />

        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          {[
            { id: 'all', label: 'Every category' },
            { id: 'transaction', label: 'Payments' },
            { id: 'security', label: 'Security' },
            { id: 'card', label: 'Cards' },
            { id: 'loan', label: 'Loans' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                category === c.id
                  ? 'bg-text text-card border-text'
                  : 'bg-card text-muted border-border hover:text-ink-soft'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={84} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BellRing className="w-6 h-6" />}
            title={filter === 'unread' ? 'Nothing unread' : 'No notifications'}
            description={
              filter === 'unread'
                ? 'You are all caught up.'
                : 'Payment alerts and security events will show up here.'
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border/70">
            {visible.map((n) => {
              const Icon = ICONS[n.category] ?? Bell;
              return (
                <li
                  key={n.id}
                  className={cn('group flex items-start gap-3.5 px-4 sm:px-5 py-4 transition-colors', !n.read && 'bg-brass-50/30')}
                >
                  <span
                    className={cn(
                      'grid place-items-center h-9 w-9 shrink-0 rounded-xl border',
                      TINTS[n.category] ?? TINTS.system
                    )}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </span>

                  <button onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-start justify-between gap-3">
                      <span className={cn('text-sm', n.read ? 'text-ink-soft' : 'font-semibold text-text')}>
                        {n.title}
                      </span>
                      <span className="text-[0.6875rem] text-muted shrink-0 mt-0.5">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </span>
                    <span className="block text-sm text-muted mt-0.5 leading-relaxed">{n.body}</span>
                    <span className="flex items-center gap-2 mt-2">
                      {n.priority === 'high' && !n.read ? (
                        <Badge variant="danger" size="sm">
                          High priority
                        </Badge>
                      ) : null}
                      <span className="text-[0.6875rem] text-muted/70">{formatDateTime(n.createdAt)}</span>
                      {n.link ? (
                        <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-brass-700 opacity-0 group-hover:opacity-100 transition-opacity">
                          Open <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        </span>
                      ) : null}
                    </span>
                  </button>

                  <button
                    onClick={() => remove(n)}
                    className="shrink-0 p-2 rounded-lg text-muted/50 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                    aria-label={`Delete notification: ${n.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default Notifications;
