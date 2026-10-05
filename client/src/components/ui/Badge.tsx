import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type BadgeVariant =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brass'
  | 'outline'
  /** Legacy aliases from the pre-redesign kit, kept so older call sites work. */
  | 'gray'
  | 'default';

export type BadgeSize = 'sm' | 'md';

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-paper text-ink-soft border-border',
  success: 'bg-success-50 text-success-700 border-success-100',
  warning: 'bg-brass-50 text-brass-700 border-brass-100',
  danger: 'bg-danger-50 text-danger-700 border-danger-100',
  info: 'bg-primary-50 text-primary-700 border-primary-100',
  brass: 'bg-brass-100 text-brass-800 border-brass-200',
  outline: 'bg-transparent text-muted border-border',
  gray: 'bg-paper text-ink-soft border-border',
  default: 'bg-primary-50 text-primary-700 border-primary-100',
};

const SIZES: Record<BadgeSize, string> = {
  sm: 'text-2xs px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-0.5 gap-1.5',
};

export function Badge({
  variant = 'neutral',
  size = 'md',
  className,
  children,
  dot,
  icon,
}: {
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  children: ReactNode;
  dot?: boolean;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium whitespace-nowrap',
        SIZES[size],
        VARIANTS[variant],
        className
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" /> : null}
      {icon}
      {children}
    </span>
  );
}

/** Maps a domain status string to the right badge tone + label. */
const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  ACTIVE: { variant: 'success', label: 'Active' },
  CLOSED: { variant: 'neutral', label: 'Closed' },
  BLOCKED: { variant: 'danger', label: 'Blocked' },
  FROZEN: { variant: 'warning', label: 'Frozen' },
  PENDING: { variant: 'warning', label: 'Pending' },
  COMPLETED: { variant: 'success', label: 'Completed' },
  FAILED: { variant: 'danger', label: 'Failed' },
  REVERSED: { variant: 'neutral', label: 'Reversed' },
  APPLIED: { variant: 'info', label: 'Applied' },
  APPROVED: { variant: 'info', label: 'Approved' },
  DISBURSED: { variant: 'success', label: 'Disbursed' },
  REJECTED: { variant: 'danger', label: 'Rejected' },
  VERIFIED: { variant: 'success', label: 'Verified' },
  PENDING_KYC: { variant: 'warning', label: 'Pending' },
  SAVINGS: { variant: 'brass', label: 'Savings' },
  CURRENT: { variant: 'info', label: 'Current' },
  SALARY: { variant: 'success', label: 'Salary' },
};

export function StatusBadge({ status, className }: { status?: string; className?: string }) {
  if (!status) return null;
  const entry = STATUS_MAP[status.toUpperCase()];
  if (!entry) {
    return (
      <Badge variant="outline" className={className}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant={entry.variant} dot className={className}>
      {entry.label}
    </Badge>
  );
}

export default Badge;
