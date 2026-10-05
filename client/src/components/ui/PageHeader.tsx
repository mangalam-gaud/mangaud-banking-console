import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

/** Consistent page title block. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-text leading-tight">{title}</h1>
        {description ? (
          <p className="text-sm sm:text-[0.9375rem] text-muted mt-1.5 max-w-2xl leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div> : null}
    </div>
  );
}

export default PageHeader;
