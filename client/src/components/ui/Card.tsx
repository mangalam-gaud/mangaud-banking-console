import { Children, forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

/**
 * `children` is passed through `Children.toArray` in every wrapper below.
 *
 * Re-emitting JSX children from inside a component turns the
 * "static children" array (which React skips key validation on) back into an
 * ordinary array, so React logs a missing-key warning for every card in the
 * app. `toArray` gives each element a derived key, which satisfies validation
 * without forcing every call site to hand-write keys.
 */
const keyed = (children: React.ReactNode) => Children.toArray(children);

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...props}>
      {keyed(children)}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 pt-5 pb-4 sm:px-6 sm:pt-6', className)} {...props}>
      {keyed(children)}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-display text-lg sm:text-xl font-semibold text-text', className)} {...props}>
      {keyed(children)}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-muted mt-1 leading-relaxed', className)} {...props}>
      {keyed(children)}
    </p>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 pb-5 sm:px-6 sm:pb-6', className)} {...props}>
      {keyed(children)}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-5 pb-5 sm:px-6 sm:pb-6 pt-4 border-t border-border flex items-center gap-3', className)}
      {...props}
    >
      {keyed(children)}
    </div>
  );
}

/** Card with the brass hairline motif used for primary/hero panels. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'brass';
  className?: string;
}) {
  const toneRing: Record<string, string> = {
    neutral: 'text-ink-soft bg-paper border-border',
    positive: 'text-success-600 bg-success-50 border-success-100',
    warning: 'text-brass-700 bg-brass-50 border-brass-100',
    danger: 'text-danger-600 bg-danger-50 border-danger-100',
    brass: 'text-brass-700 bg-brass-50 border-brass-200',
  };

  return (
    <div className={cn('card card-lift p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow truncate">{label}</p>
          {/* `.figure-md`, not a raw size: the tile value is a quantity the
              reader compares against the tiles beside it, so it needs the
              optical tracking correction and tabular figures to stay aligned. */}
          <p className="figure-md mt-2 text-text">{value}</p>
          {hint ? <p className="mt-2 text-xs text-muted truncate">{hint}</p> : null}
        </div>
        {icon ? (
          <span className={cn('shrink-0 grid place-items-center h-10 w-10 rounded-xl border', toneRing[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Consistent empty / zero-data state. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-14', className)}>
      {icon ? (
        <div className="grid place-items-center h-14 w-14 rounded-2xl bg-paper border border-border text-muted mb-4">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-lg font-semibold text-text">{title}</h3>
      {description ? <p className="mt-1.5 text-sm text-muted max-w-sm">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export { Card as default };
