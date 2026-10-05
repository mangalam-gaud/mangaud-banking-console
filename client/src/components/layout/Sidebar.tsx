import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CreditCard,
  Users,
  Landmark,
  FileText,
  ScrollText,
  PlusCircle,
  ShieldCheck,
  ClipboardList,
  PiggyBank,
  Repeat,
  UserCheck,
  BadgeCheck,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../store/permissionStore';
import { Logo } from './Logo';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  /**
   * Permissions that grant access. Empty means "anyone signed in".
   *
   * Read from the server's list rather than hard-coded per role, so this nav
   * cannot offer a screen the API will refuse. An `own`/`any` pair is satisfied
   * by either — see `canAny` below.
   */
  permissions?: string[];
  /**
   * Staff cannot reach this page at all, whatever permissions they hold.
   *
   * Needed because a `*:own` permission is necessary but not sufficient for
   * staff: they have no `Customer` record, so the page's data never loads. An
   * admin holds every `*:own` permission in the matrix and would otherwise be
   * shown a sidebar full of links that can only 403.
   */
  customerOnly?: boolean;
  /** Never highlighted as active, because it is an action not a section. */
  isAction?: boolean;
}

const navigation: NavItem[] = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Accounts', href: '/accounts', icon: Wallet, permissions: ['account:read:own', 'account:read:any'] },
  {
    name: 'Pay & Transfer',
    href: '/payments',
    icon: ArrowLeftRight,
    permissions: ['payment:send:own'],
    customerOnly: true,
  },
  { name: 'Cards', href: '/cards', icon: CreditCard, permissions: ['card:read:own', 'card:read:any'] },
  {
    name: 'Payees',
    href: '/beneficiaries',
    icon: Users,
    permissions: ['beneficiary:manage:own'],
    customerOnly: true,
  },
  {
    name: 'Transactions',
    href: '/transactions',
    icon: ScrollText,
    permissions: ['transaction:read:own', 'transaction:read:any'],
  },
  { name: 'Loans', href: '/loans', icon: Landmark, permissions: ['loan:read:own', 'loan:read:any'], customerOnly: true },
  {
    name: 'Fixed deposits',
    href: '/deposits',
    icon: PiggyBank,
    permissions: ['deposit:read:own'],
    customerOnly: true,
  },
  {
    name: 'Auto-payments',
    href: '/standing-instructions',
    icon: Repeat,
    permissions: ['instruction:read:own'],
    customerOnly: true,
  },
  {
    name: 'Nominees',
    href: '/nominees',
    icon: UserCheck,
    permissions: ['customer:read:own'],
    customerOnly: true,
  },
  { name: 'KYC', href: '/kyc', icon: BadgeCheck, permissions: ['kyc:read:own'], customerOnly: true },
  { name: 'Statements', href: '/statements', icon: FileText, permissions: ['statement:read:own', 'statement:read:any'] },

  // No permission requirement, so these are reachable by every role. They live
  // in the same list rather than a separate "universal" one because two lists
  // concatenated for staff put "Security" in the nav twice.
  { name: 'Security', href: '/security', icon: ShieldCheck },
  { name: 'Profile', href: '/profile', icon: Users },
  {
    name: 'KYC review queue',
    href: '/kyc-queue',
    icon: BadgeCheck,
    permissions: ['kyc:review'],
  },
  { name: 'Audit log', href: '/audit', icon: ClipboardList, permissions: ['audit:read:any'] },
  {
    /*
      Both forms, and not customer-only: `account:open` is self-service, and
      `account:open:any` is the counter workflow a teller or manager performs for
      a walk-in. Listing only the `:own` form hid the counter action from exactly
      the roles that are allowed to use it — the page then adapts, showing a
      customer lookup instead of a deposit box.
    */
    name: 'Open account',
    href: '/accounts/open',
    icon: PlusCircle,
    permissions: ['account:open', 'account:open:any'],
    isAction: true,
  },
];

interface SidebarProps {
  /** Controlled by MainLayout so the header hamburger can open it. */
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();
  const { canAny, isStaff, roleLabel, branchCode } = usePermissions();

  // Route changes must dismiss the drawer, otherwise it stays open over the
  // page the user just navigated to. The callback is held in a ref so the
  // effect depends only on the path and does not re-run every render when
  // MainLayout passes a fresh closure.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onCloseRef.current();
  }, [location.pathname]);

  if (!isAuthenticated) return null;

  /**
   * Filtered by permission, not by a role list.
   *
   * A teller sees Accounts, Cards, Transactions and Statements — the pages that
   * work for them; an auditor sees the audit log and nothing else; a customer
   * sees their own products. Deriving this from the server's permission list is
   * the whole reason the nav can be trusted: every link here has a matching API
   * gate, so no one can click through to a 403.
   */
  const reachable = (item: NavItem) => {
    if (isStaff && item.customerOnly) return false;
    if (!item.permissions) return true;
    return canAny(...item.permissions);
  };

  // One list, filtered. Items with no `permissions` are reachable by every
  // role, which is how Security and Profile stay available to staff without
  // needing a second nav array.
  const items = navigation.filter(reachable);

  // From `lg` the sidebar is part of the layout rather than an overlay, so
  // `isOpen` says nothing about whether it is visible. Anything that reasons
  // about visibility has to ask this instead.
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <>
      {/* Scrim: only on small screens, where the sidebar is an overlay. */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-ink/55 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-[17.5rem] max-w-[86vw]',
          'bg-sidebar flex flex-col border-r border-white/10 safe-t',
          // `visibility` is transitioned alongside the transform on purpose.
          // `-translate-x-full` alone moves the drawer off-screen but leaves it
          // in the tab order, so keyboard users on a phone tabbed straight into
          // an invisible menu. Hiding it for real is what takes it out of the
          // accessibility tree and the focus ring together.
          'transition-[transform,visibility] duration-300 ease-out',
          'lg:visible lg:sticky lg:top-0 lg:z-40 lg:h-screen lg:translate-x-0 lg:shrink-0',
          isOpen ? 'translate-x-0 visible shadow-pop' : '-translate-x-full invisible'
        )}
        aria-label="Main navigation"
        /*
          Not `aria-hidden={!isOpen}`. From `lg` up the sidebar is a permanent
          part of the layout while `navOpen` stays false, so that expression
          marked the whole primary navigation hidden from screen readers on
          desktop — visible to everyone, present to no one. Only the overlay
          drawer, which really is closed, gets the attribute.
        */
        aria-hidden={isDesktop ? undefined : !isOpen}
      >
        <div className="flex items-center justify-between gap-3 px-5 h-[4.5rem] border-b border-white/10 shrink-0">
          <NavLink to="/dashboard" className="flex items-center gap-3 min-w-0">
            <Logo className="h-9 w-9 rounded-xl" showWordmark={false} />
            <div className="min-w-0">
              <p className="font-display text-[1.0625rem] font-bold text-white tracking-[0.14em] leading-none">
                MANGAUD
              </p>
              <p className="text-[0.5625rem] uppercase tracking-[0.24em] text-brass-300/70 mt-1">
                Banking Console
              </p>
            </div>
          </NavLink>
          <button
            onClick={onClose}
            className="lg:hidden p-2 -mr-2 rounded-lg text-sidebar-text/70 hover:text-white hover:bg-white/10"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Sections">
          {items.map((item) => {
            const isActive = item.isAction
              ? false
              : location.pathname === item.href ||
                (item.href !== '/dashboard' && location.pathname.startsWith(`${item.href}/`));

            return (
              <NavLink
                key={item.href}
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[0.9375rem]',
                  'transition-colors duration-150',
                  isActive
                    ? 'bg-sidebar-active text-white font-medium'
                    : item.isAction
                      ? 'text-brass-300 hover:bg-white/[0.07] hover:text-brass-200'
                      : 'text-sidebar-text/75 hover:text-white hover:bg-white/[0.07]'
                )}
              >
                {/* Brass rail marks the active section. */}
                {isActive ? (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-brass-400"
                    aria-hidden="true"
                  />
                ) : null}
                <item.icon
                  className={cn(
                    'w-[1.125rem] h-[1.125rem] shrink-0',
                    isActive ? 'text-brass-400' : 'text-sidebar-muted group-hover:text-white'
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 shrink-0 safe-b lg:safe-b-0">
          <NavLink
            to="/profile"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.07] transition-colors"
          >
            <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-brass-600 text-[#1a1204] text-xs font-bold">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </span>
              <span className="block text-[0.6875rem] text-sidebar-muted truncate">
                {/* Staff see their role and branch here; a customer has no
                    branch, so their email is the useful second line. */}
                {isStaff ? `${roleLabel || user?.role}${branchCode ? ` · ${branchCode}` : ''}` : user?.email}
              </span>
            </span>
            {isStaff ? (
              <Badge variant="brass" size="sm" className="shrink-0">
                {user?.role}
              </Badge>
            ) : null}
          </NavLink>
        </div>
      </aside>
    </>
  );
}
