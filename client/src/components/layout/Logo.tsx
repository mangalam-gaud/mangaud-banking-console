import { cn } from '../../utils/cn';

/**
 * The MANGAUD mark, inlined rather than loaded as an image.
 *
 * `<img src="/logo.svg">` would flash white before the file loads and can't
 * inherit `currentColor`; inlining keeps it crisp and lets the wordmark use the
 * right font without a second network request.
 */
export function Logo({
  className,
  showWordmark = false,
  inverted = false,
}: {
  className?: string;
  showWordmark?: boolean;
  inverted?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 64 64"
        className="h-full w-full shrink-0"
        role="img"
        aria-label={showWordmark ? 'MANGAUD Banking Console' : 'MANGAUD'}
      >
        <defs>
          <linearGradient id="mgd-base" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1B2A44" />
            <stop offset="55%" stopColor="#0E1726" />
            <stop offset="100%" stopColor="#080D15" />
          </linearGradient>
          <linearGradient id="mgd-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F7C463" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="15" fill="url(#mgd-base)" />
        <circle cx="32" cy="30" r="22" fill="none" stroke="#F5B841" strokeOpacity="0.16" strokeWidth="1.4" />
        <circle cx="32" cy="30" r="17" fill="none" stroke="#F5B841" strokeOpacity="0.26" strokeWidth="1.4" />
        <g
          fill="none"
          stroke="url(#mgd-accent)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 23 H43" />
          <path d="M21 31 H43" />
          <path d="M27 23 V31 C27 38 32 41 43 41" />
        </g>
        <g fill="#F5B841" fillOpacity="0.5">
          <rect x="21" y="46" width="4" height="2" rx="1" />
          <rect x="29" y="46" width="4" height="2" rx="1" />
          <rect x="37" y="46" width="4" height="2" rx="1" />
        </g>
      </svg>

      {showWordmark ? (
        <span className="flex flex-col leading-none min-w-0">
          <span
            className={cn(
              'font-display text-lg font-bold tracking-[0.14em]',
              inverted ? 'text-white' : 'text-text'
            )}
          >
            MANGAUD
          </span>
          <span
            className={cn(
              'text-[0.5625rem] uppercase tracking-[0.24em] mt-1',
              inverted ? 'text-brass-300/70' : 'text-muted'
            )}
          >
            Banking Console
          </span>
        </span>
      ) : null}
    </span>
  );
}

export default Logo;
