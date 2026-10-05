import { useEffect, useRef, useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Menu,
  LogOut,
  Bell,
  User,
  Settings,
  ShieldCheck,
  ChevronDown,
  CheckCheck,
  Wallet,
  ArrowLeftRight,
  Landmark,
  CreditCard,
  BellRing,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';
import { AppNotification } from '../../types';
import { formatRelativeTime, formatCurrency } from '../../utils/format';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '../../utils/cn';

const CATEGORY_ICON: Record<string, typeof Bell> = {
  transaction: ArrowLeftRight,
  account: Wallet,
  loan: Landmark,
  card: CreditCard,
  security: ShieldCheck,
  system: Bell,
};

const CATEGORY_TINT: Record<string, string> = {
  transaction: 'bg-primary-50 text-primary-600 border-primary-100',
  account: 'bg-brass-50 text-brass-700 border-brass-100',
  loan: 'bg-success-50 text-success-700 border-success-100',
  card: 'bg-primary-50 text-primary-600 border-primary-100',
  security: 'bg-danger-50 text-danger-700 border-danger-100',
  system: 'bg-paper text-muted border-border',
};

interface HeaderProps {
  onOpenNav: () => void;
}

export function Header({ onOpenNav }: HeaderProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowUserMenu(false);
      setShowNotifications(false);
    };

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const res = await api.getNotifications({ limit: 8 });
      setNotifications(res.data?.notifications ?? []);
      setUnread(res.meta?.unreadCount ?? 0);
    } catch {
      // The bell is a nicety; a failed poll must not surface an error.
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  // Poll while the tab is visible; a hidden tab has no use for it.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled || document.hidden) return;
      try {
        const count = await api.getUnreadNotificationCount();
        if (!cancelled) setUnread(count);
      } catch {
        /* ignore */
      }
    };

    tick();
    const id = window.setInterval(tick, 60_000);

    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnread(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      /* ignore */
    }
  };

  const openNotification = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await api.markNotificationRead(n.id);
        setUnread((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
        );
      } catch {
        /* ignore */
      }
    }
    setShowNotifications(false);
    if (n.link) navigate(n.link);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-card/85 backdrop-blur-md border-b border-border safe-t">
      <div className="flex items-center justify-between gap-3 h-[4.5rem] px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenNav}
            className="lg:hidden -ml-1 p-2.5 rounded-lg text-text hover:bg-paper transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <NavLink to="/dashboard" className="hidden sm:flex items-center gap-2.5 lg:hidden min-w-0">
            <Logo className="h-8 w-8 rounded-lg" showWordmark={false} />
            <span className="font-display font-bold tracking-[0.12em] text-text">MANGAUD</span>
          </NavLink>

          <p className="hidden lg:block font-display text-lg font-semibold text-text truncate">
            Banking Console
          </p>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle className="mr-1 hidden sm:inline-flex" />

          {/* ------------------------------------------------ notifications */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => {
                setShowNotifications((v) => !v);
                if (!showNotifications) loadNotifications();
              }}
              className="relative p-2.5 rounded-lg text-ink-soft hover:bg-paper transition-colors"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
              aria-expanded={showNotifications}
              aria-haspopup="dialog"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 ? (
                <span className="absolute top-1 right-1 min-w-[1.125rem] h-[1.125rem] px-1 grid place-items-center rounded-full bg-danger-600 text-white text-[0.625rem] font-bold tabular-nums">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </button>

            {showNotifications ? (
              <div
                role="dialog"
                aria-label="Notifications"
                className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-0 top-[4.75rem] sm:top-auto sm:mt-2 w-auto sm:w-[22rem] max-w-[calc(100vw-1.5rem)] bg-card rounded-2xl border border-border shadow-pop overflow-hidden animate-scale-in"
              >
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                  <h2 className="font-display font-semibold text-text text-sm">Notifications</h2>
                  {unread > 0 ? (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs font-medium text-brass-700 hover:text-brass-800 flex items-center gap-1.5"
                    >
                      <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      Mark all read
                    </button>
                  ) : null}
                </div>

                <div className="max-h-[22rem] overflow-y-auto">
                  {loadingNotifications ? (
                    <div className="px-4 py-8 text-center text-sm text-muted">Loading…</div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <BellRing className="w-7 h-7 text-muted/50 mx-auto mb-2" aria-hidden="true" />
                      <p className="text-sm text-muted">No notifications yet</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border/70">
                      {notifications.map((n) => {
                        const Icon = CATEGORY_ICON[n.category] ?? Bell;
                        return (
                          <li key={n.id}>
                            <button
                              onClick={() => openNotification(n)}
                              className={cn(
                                'w-full text-left px-4 py-3 flex gap-3 hover:bg-paper/70 transition-colors',
                                !n.read && 'bg-brass-50/40'
                              )}
                            >
                              <span
                                className={cn(
                                  'grid place-items-center h-8 w-8 shrink-0 rounded-lg border',
                                  CATEGORY_TINT[n.category] ?? CATEGORY_TINT.system
                                )}
                              >
                                <Icon className="w-4 h-4" aria-hidden="true" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-2">
                                  <span
                                    className={cn(
                                      'text-sm truncate',
                                      n.read ? 'text-ink-soft' : 'font-semibold text-text'
                                    )}
                                  >
                                    {n.title}
                                  </span>
                                  <span className="text-[0.625rem] text-muted shrink-0 mt-0.5">
                                    {formatRelativeTime(n.createdAt)}
                                  </span>
                                </span>
                                <span className="block text-xs text-muted mt-0.5 line-clamp-2">
                                  {n.body}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="px-4 py-2.5 border-t border-border bg-paper/50">
                  <button
                    onClick={() => {
                      setShowNotifications(false);
                      navigate('/notifications');
                    }}
                    className="text-xs font-medium text-brass-700 hover:text-brass-800 w-full text-center"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* --------------------------------------------------- user menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2 p-1.5 sm:pl-2 sm:pr-2.5 rounded-lg hover:bg-paper transition-colors"
              aria-label="Account menu"
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
            >
              {/* Inverted surface, so it uses the semantic slots rather than
                  `bg-ink text-white` — `ink` follows the theme, which made this
                  white-on-white in dark mode. */}
              <span className="grid place-items-center h-8 w-8 shrink-0 rounded-full bg-text text-card text-xs font-bold">
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </span>
              <span className="hidden md:block text-left min-w-0">
                <span className="block text-sm font-medium text-text truncate leading-tight">
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="block text-[0.6875rem] text-muted capitalize leading-tight">
                  {user?.role}
                </span>
              </span>
              <ChevronDown className="hidden md:block w-4 h-4 text-muted" aria-hidden="true" />
            </button>

            {showUserMenu ? (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-60 bg-card rounded-2xl border border-border shadow-pop overflow-hidden animate-scale-in"
              >
                <div className="px-4 py-3 border-b border-border">
                  <p className="font-medium text-text truncate">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-muted truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  {[
                    { to: '/profile', label: 'Profile', Icon: User },
                    { to: '/security', label: 'Security', Icon: ShieldCheck },
                    { to: '/settings', label: 'Settings', Icon: Settings },
                  ].map(({ to, label, Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      role="menuitem"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink-soft hover:bg-paper hover:text-text transition-colors"
                    >
                      <Icon className="w-4 h-4 text-muted" aria-hidden="true" />
                      {label}
                    </NavLink>
                  ))}
                </div>
                <div className="border-t border-border py-1">
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-danger-700 hover:bg-danger-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
