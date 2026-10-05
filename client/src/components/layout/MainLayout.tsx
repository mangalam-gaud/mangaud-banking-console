import { useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom';
import {
  Home,
  Wallet,
  ArrowLeftRight,
  ScrollText,
  ClipboardCheck,
  ClipboardList,
  User,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { OfflineBanner, PwaManager } from '../PwaManager';
import { Header } from './Header';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePermissions } from '../../store/permissionStore';
import { cn } from '../../utils/cn';

interface QuickLink {
  to: string;
  label: string;
  icon: typeof Home;
  permissions: string[];
  customerOnly?: boolean;
}

/**
 * The four highest-traffic destinations, filtered by the same rules as the
 * sidebar.
 *
 * A hardcoded list put "Pay" in front of every staff member, and `/payments`
 * redirects them straight back — two of four taps doing nothing. Staff get their
 * own work queue instead, and the bar always renders exactly four items so the
 * grid does not reflow.
 */
const QUICK_LINKS: QuickLink[] = [
  { to: '/dashboard', label: 'Home', icon: Home, permissions: [], customerOnly: true },
  {
    to: '/accounts',
    label: 'Accounts',
    icon: Wallet,
    permissions: ['account:read:own', 'account:read:any'],
  },
  {
    to: '/payments',
    label: 'Pay',
    icon: ArrowLeftRight,
    permissions: ['payment:send:own'],
    customerOnly: true,
  },
  {
    to: '/transactions',
    label: 'Activity',
    icon: ScrollText,
    permissions: ['transaction:read:own', 'transaction:read:any'],
  },
];

const STAFF_QUICK_LINKS: QuickLink[] = [
  { to: '/kyc-queue', label: 'Review', icon: ClipboardCheck, permissions: ['kyc:review'] },
  {
    to: '/transactions',
    label: 'Activity',
    icon: ScrollText,
    permissions: ['transaction:read:own', 'transaction:read:any'],
  },
  { to: '/audit', label: 'Audit', icon: ClipboardList, permissions: ['audit:read:any'] },
  { to: '/profile', label: 'Profile', icon: User, permissions: [] },
];

/** Pads a short list to four so the bottom bar's grid never collapses. */
const fillToFour = (links: QuickLink[]) => {
  const fallback = QUICK_LINKS.filter((l) => !links.some((existing) => existing.to === l.to));
  return [...links, ...fallback].slice(0, 4);
};

/**
 * App shell.
 *
 * Below `lg` the sidebar becomes an overlay drawer owned by this component, so
 * the header hamburger and the sidebar share one piece of state. From `lg` up
 * the sidebar is permanently docked and the content column carries the offset.
 */
export function MainLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const location = useLocation();
  const navigate = useNavigate();
  const { canAny, isStaff } = usePermissions();

  // Same reachability rules as the sidebar: a page staff cannot actually open
  // must not be a tap target.
  const quickLinks = useMemo(() => {
    const pool = isStaff ? STAFF_QUICK_LINKS : QUICK_LINKS;
    const reachable = pool.filter(
      (link) => !(isStaff && link.customerOnly) && canAny(...link.permissions)
    );
    return fillToFour(reachable);
  }, [isStaff, canAny]);

  // Returning to desktop must not leave `navOpen` set, or the next time the
  // viewport shrinks the drawer reappears already open.
  useEffect(() => {
    if (isDesktop) setNavOpen(false);
  }, [isDesktop]);

  // Reset the content column's scroll offset on navigation. Without this a
  // short page following a long one starts halfway down.
  useEffect(() => {
    document.getElementById('main-scroll')?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    /*
     * A flex row, so the sidebar can be a `sticky` child rather than `fixed`.
     *
     * `fixed` + `h-screen` is viewport-height, not document-height: on a page
     * taller than the screen the sidebar stopped halfway down and left bare
     * page background beside the content that should have been under it. In the
     * dark theme that read as a rendering bug. Sticky keeps it pinned to the
     * viewport for the whole scroll, with no gap to reason about.
     */
    <div className="flex min-h-screen bg-background">
      <Sidebar isOpen={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setNavOpen(true)} />

        {/*
          Status strips, in normal flow directly under the header.

          Both used to be `fixed` overlays. The install prompt sat on top of the
          dashboard's "View all >" link on mobile; OfflineBanner was exported and
          imported by App.tsx, which never rendered it, so it did not appear at
          all. Giving them layout space means they push content down rather than
          covering it, and they scroll with the page like everything else.
        */}
        <OfflineBanner />
        <PwaManager />

        <main
          id="main-scroll"
          /*
           * `pb-28` clears the fixed mobile bottom bar (~58px tall) plus the
           * safe-area inset. Without it the last row of a list sits underneath
           * the bar, which is the "scroll content obscured by a fixed element"
           * failure -- most visible on the paginated lists, where the pagination
           * controls are always the last thing on the page.
           */
          className="flex-1 px-4 py-5 pb-28 sm:px-6 sm:py-6 lg:px-8 lg:py-8 lg:pb-10"
        >
          <div className="mx-auto w-full max-w-content">
            <Outlet />
          </div>
        </main>

        {/*
          Mobile bottom bar.

          A real bar with a top border and an opaque background rather than a
          blurred translucent strip: the items are 4-up icon+label destinations,
          and a blur behind them makes the page content underneath legible enough
          to read as part of the bar.
        */}
        <nav
          className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-border bg-card lg:hidden"
          aria-label="Quick navigation"
        >
          <div className="grid grid-cols-4 pb-[env(safe-area-inset-bottom,0px)]">
            {quickLinks.map((item) => {
              const isCurrent = location.pathname === item.to;
              return (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    // 44px minimum height per the engine's touch guidance.
                    'flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6875rem] font-medium transition-colors duration-[120ms]',
                    isCurrent ? 'text-brand-ink' : 'text-muted'
                  )}
                >
                  {/*
                    The active marker is a bar plus colour, not colour alone --
                    colour-blind users need a second, non-colour signal, and the
                    engine's guidance is explicit that badge meaning cannot rely
                    on hue.
                  */}
                  <span
                    className={cn(
                      'h-0.5 w-6 rounded-full transition-colors duration-[120ms]',
                      isCurrent ? 'bg-brand' : 'bg-transparent'
                    )}
                    aria-hidden="true"
                  />
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
