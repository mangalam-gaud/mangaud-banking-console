import { useState, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function Tabs({
  items,
  activeId,
  onChange,
  className,
}: {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1',
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative inline-flex items-center gap-2 whitespace-nowrap px-3.5 py-2 rounded-lg',
              'text-sm font-medium transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass',
              // Inverted surface, expressed with the semantic slots rather than
              // `bg-ink text-white`. `ink` follows the theme, so in dark mode that
              // pairing became white text on a near-white chip.
              active
                ? 'bg-text text-card shadow-card'
                : 'text-muted hover:text-text hover:bg-sunken'
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

/** Uncontrolled tab set with internal state. */
