import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../utils/cn';

/**
 * Light/dark switch.
 *
 * Two buttons in a segmented control rather than one icon that swaps: the
 * current theme stays visible, so the control reads as a setting rather than as
 * an action of unknown consequence. `aria-pressed` on each half announces which
 * is active.
 *
 * Sized for both the desktop header and the mobile auth header.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  const options = [
    { value: 'light' as const, label: 'Light', Icon: Sun },
    { value: 'dark' as const, label: 'Dark', Icon: Moon },
  ];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-paper',
        className
      )}
      role="group"
      aria-label="Colour theme"
    >
      {options.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            className={cn(
              'grid place-items-center h-8 w-8 rounded-md transition-all duration-200',
              active
                ? 'bg-card text-brass-600 shadow-card'
                : 'text-muted hover:text-text'
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export default ThemeToggle;