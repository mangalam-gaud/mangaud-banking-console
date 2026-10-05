import { cn } from '../../utils/cn';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  style,
  ...props
}: SkeletonProps) {
  const variantStyles = {
    text: 'h-4 w-full rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
    card: 'rounded-2xl',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'shimmer',
    none: '',
  };

  return (
    <div
      aria-hidden="true"
      className={cn('bg-rule/70', variantStyles[variant], animationStyles[animation], className)}
      style={{
        ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
        ...(height !== undefined ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
        ...style,
      }}
      {...props}
    />
  );
}

/*
 * The seven composite variants that used to live here (SkeletonText,
 * SkeletonCard, SkeletonTable, SkeletonList, SkeletonStatCard, SkeletonTransaction,
 * SkeletonAccountCard) had no callers. Every page that had loaded one replaced it with the
 * base Skeleton plus its own layout, which is the better split anyway: a loading state
 * that hardcodes a table's shape drifts from the table it stands in for. Removed.
 */
