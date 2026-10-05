import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { Card } from '../../components/ui';

/**
 * Shared pieces for the six role dashboards.
 *
 * Deliberately small and unopinionated. The dashboards differ in what they show,
 * not in how a panel looks: one panel component means a teller and a manager
 * cannot drift apart visually, and a change to a panel lands everywhere at once.
 */

/** A panel with a heading, optional count, and optional link to the full view. */
export function Panel({
  title,
  subtitle,
  to,
  toLabel = 'View all',
  children,
  className = '',
  action,
}: {
  title: string;
  subtitle?: string;
  to?: string;
  toLabel?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-text">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p> : null}
        </div>
        {action}
        {to ? (
          <Link
            to={to}
            className="shrink-0 text-xs font-medium text-brand-ink hover:underline inline-flex items-center gap-1"
          >
            {toLabel}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
    </Card>
  );
}

/**
 * A single thing that needs doing, with the action that does it.
 *
 * Every entry is clickable and goes somewhere real. A work queue whose rows are
 * not links is a report, and a report is not what a teller opens at the start of
 * a shift — it is a list of names to act on.
 */
export function WorkItem({
  title,
  meta,
  to,
  right,
  tone = 'neutral',
}: {
  title: ReactNode;
  meta?: ReactNode;
  to?: string;
  right?: ReactNode;
  tone?: 'neutral' | 'warning' | 'danger' | 'positive';
}) {
  const toneClass = {
    neutral: 'text-ink-soft',
    warning: 'text-warning-700',
    danger: 'text-danger-700',
    positive: 'text-success-700',
  }[tone];

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text">{title}</span>
        {meta ? <span className={`block truncate text-xs ${toneClass}`}>{meta}</span> : null}
      </span>
      {right ? <span className="shrink-0 text-xs font-medium tnum">{right}</span> : null}
      {to ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" /> : null}
    </>
  );

  return to ? (
    <Link
      to={to}
      className="flex items-center gap-3 border-b border-border px-5 py-3 transition-colors last:border-b-0 hover:bg-sunken"
    >
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">{body}</div>
  );
}

/** A counter action: big enough to hit at a till, routed to the real workflow. */
export function ActionTile({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="card card-lift group flex items-start gap-3 p-4 focus-visible:outline-none"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-sunken text-ink-soft transition-colors group-hover:border-brand-line group-hover:text-brand-ink">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span> : null}
      </span>
    </Link>
  );
}

/** Empty state that says what would be here and why it is not. */
export function Nothing({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 py-6 text-center text-sm leading-relaxed text-muted">{children}</p>
  );
}

/**
 * The scope banner.
 *
 * Every staff dashboard states which branch it is showing and how many records
 * that is, because a branch-scoped view that does not say so reads as the whole
 * bank. This is the honest half of least-privilege: the limit is visible to the
 * person operating inside it.
 */
export function ScopeNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-muted">
      {children}
    </p>
  );
}

/** A compact label/value row for summary blocks. */
export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-medium tnum text-text">{value}</span>
    </div>
  );
}
