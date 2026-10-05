import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Bell,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  FileSearch,
  FileText,
  Landmark,
  LayoutDashboard,
  Lock,
  PiggyBank,
  Receipt,
  Settings,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AuthScene } from '../components/three/AuthScene';
import { Logo } from '../components/layout/Logo';
import { ThemeToggle } from '../components/layout/ThemeToggle';

/**
 * One destination in the quick-access grid.
 *
 * `href` values are real routes, not aspirational ones. Every path below is
 * declared in `App.tsx`, so a link here cannot rot into a 404 the way a
 * hand-written marketing page does -- there is no `/customers` tile, because no
 * such route exists yet.
 */
interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface QuickGroup {
  title: string;
  /** Shown only as a group heading note, never as a marketing claim. */
  note?: string;
  links: QuickLink[];
}

const GROUPS: QuickGroup[] = [
  {
    title: 'Accounts & money',
    links: [
      { href: '/accounts', label: 'Accounts', description: 'Balances and account detail', icon: Wallet },
      { href: '/payments', label: 'Pay & transfer', description: 'Send money to a saved payee', icon: ArrowLeftRight },
      { href: '/transactions', label: 'Transactions', description: 'Every debit and credit', icon: Receipt },
      { href: '/statements', label: 'Statements', description: 'Downloadable statements', icon: FileText },
      { href: '/beneficiaries', label: 'Payees', description: 'Saved beneficiaries', icon: Users },
      {
        href: '/standing-instructions',
        label: 'Auto-payments',
        description: 'Standing debits and mandates',
        icon: CalendarClock,
      },
    ],
  },
  {
    title: 'Products',
    links: [
      { href: '/cards', label: 'Cards', description: 'Limits, status and cards', icon: CreditCard },
      { href: '/loans', label: 'Loans', description: 'Apply, track and repay', icon: Landmark },
      { href: '/deposits', label: 'Fixed deposits', description: 'Open, track and break', icon: PiggyBank },
    ],
  },
  {
    title: 'Profile',
    links: [
      { href: '/kyc', label: 'KYC', description: 'PAN, address and documents', icon: ShieldCheck },
      { href: '/nominees', label: 'Nominees', description: 'Who to pay out to', icon: Users },
      { href: '/profile', label: 'Profile', description: 'Your details', icon: User },
      { href: '/security', label: 'Security', description: 'Password, devices, sessions', icon: Lock },
      { href: '/notifications', label: 'Notifications', description: 'Alerts and preferences', icon: Bell },
      { href: '/settings', label: 'Settings', description: 'Console preferences', icon: Settings },
    ],
  },
  {
    title: 'Branch & staff',
    note: 'These open for staff sign-in. Your permissions decide what renders once you are in.',
    links: [
      {
        href: '/accounts/open',
        label: 'Open an account',
        description: 'Counter deposit for a walk-in',
        icon: UserPlus,
      },
      {
        href: '/kyc-queue',
        label: 'KYC review queue',
        description: 'Sign-off on pending files',
        icon: ClipboardCheck,
      },
      { href: '/audit', label: 'Audit log', description: 'Read-only trail', icon: FileSearch },
    ],
  },
];

/**
 * The front door for signed-out visitors: a way into every part of the console.
 *
 * The previous landing page was marketing copy -- hero, feature grid, testimonials
 * -- for a bank that has no customers to market to and no testimonials to show.
 * It was replaced with a plain index of where things are, because the only thing
 * a signed-out visitor can actually do here is pick a destination and sign in.
 *
 * Two behaviours are worth stating because they are easy to break:
 *
 * 1. A signed-in visitor never sees this page. `FrontDoor` in `App.tsx` sends
 *    them to their role dashboard instead, so the hub cannot become a place
 *    that shadows the real home screen.
 * 2. Every tile points at a protected route. Clicking one bounces to `/login`
 *    carrying `state.from`, and `Login` returns the visitor to the exact page
 *    they chose -- the hub is a shortcut, not a dead end at a login form.
 */
export function QuickAccess() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Same fixed, pointer-events-none backdrop the auth screens sit on. It
          needs an explicit z-0 and the content an explicit z-10: a negative z
          would push it behind the page background. */}
      <AuthScene />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex items-start justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3">
            <Logo className="h-11 w-11 rounded-xl shadow-pop" showWordmark={false} />
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-bold tracking-[0.16em] text-white">
                MANGAUD
              </span>
              <span className="text-[0.5625rem] uppercase tracking-[0.28em] text-brass-300/70 mt-1">
                Banking Console
              </span>
            </span>
          </Link>

          <ThemeToggle className="!bg-ink/30 !border-white/15" />
        </header>

        <main className="mt-10 sm:mt-14">
          <p className="eyebrow !text-white/50">Quick access</p>
          <h1 className="font-display mt-2 text-3xl sm:text-4xl font-bold text-white leading-tight">
            Everything in the console, in one place
          </h1>
          <p className="mt-3 max-w-2xl text-sm sm:text-[0.9375rem] text-white/60 leading-relaxed">
            Pick a destination. You will sign in first, then land straight on the page
            you chose -- no hunting through a menu afterwards.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link to="/login" className="btn btn-brand">
              Sign in
              <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
            </Link>
            <Link to="/register" className="btn btn-outline !bg-ink/25 !border-white/20 !text-white">
              Create an account
            </Link>
            <Link
              to="/dashboard"
              className="btn btn-ghost !text-white/70 hover:!text-white"
            >
              <LayoutDashboard className="w-4 h-4 mr-2" aria-hidden="true" />
              Go to my dashboard
            </Link>
          </div>

          <div className="mt-10 space-y-8">
            {GROUPS.map((group) => (
              <section key={group.title} aria-labelledby={`quick-${group.title}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2
                    id={`quick-${group.title}`}
                    className="font-display text-lg font-semibold text-white"
                  >
                    {group.title}
                  </h2>
                  {group.note ? (
                    <p className="text-xs text-white/45 leading-relaxed">{group.note}</p>
                  ) : null}
                </div>

                <nav aria-label={group.title} className="mt-3">
                  <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.links.map((link) => {
                      const Icon = link.icon;
                      return (
                        <li key={link.href}>
                          <Link
                            to={link.href}
                            className="card card-hover card-lift flex h-full items-start gap-3 p-4 no-underline"
                          >
                            <span
                              aria-hidden="true"
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"
                            >
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-text">
                                {link.label}
                              </span>
                              <span className="block text-xs text-muted mt-0.5 leading-relaxed">
                                {link.description}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </section>
            ))}
          </div>

          <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/45 leading-relaxed">
            <p>
              Passwords are hashed with bcrypt and never stored in plain text. Sessions are
              revocable from Security at any time.
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link to="/forgot-password" className="text-white/60 hover:text-white">
                Forgot password
              </Link>
              <Link to="/login" className="text-white/60 hover:text-white">
                Sign in
              </Link>
              <Link to="/register" className="text-white/60 hover:text-white">
                Create an account
              </Link>
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default QuickAccess;