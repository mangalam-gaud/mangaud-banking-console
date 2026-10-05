import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ButtonVariant =
  /** The main action on a page. Ink in light mode, a raised surface in dark. */
  | 'primary'
  /** The accent-gold action. At most one per view -- a second competes with it. */
  | 'brand'
  /** Historical alias for `brand`, kept so existing call sites read correctly. */
  | 'brass'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'danger-outline'
  /** Historical alias for `brand`. */
  | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /**
   * `asChild` was declared here and never read, so passing it did nothing --
   * a caller who reached for it got a `<button>` and no error. Removed rather
   * than implemented: doing it properly needs a `Slot` primitive, and the one
   * call site that wanted it (a router `Link` in Settings) is better served by a
   * `Link` carrying the `.btn` classes, which is valid HTML. A `<button>` cannot
   * contain an `<a>`, so the two are not interchangeable.
   */
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  brand: 'btn-brand',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  'danger-outline': 'btn-danger-outline',
  // Aliases. `brass` and `success` both predate the `brand` rename and still
  // appear across the pages; mapping them to the same class means the rename
  // does not need a sweep to take effect.
  brass: 'btn-brand',
  success: 'btn-brand',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  // 36px square clears the 24x24 CSS-px target floor; the label is never an
  // icon-only control without an accessible name.
  icon: 'btn-icon',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'btn',
        VARIANTS[variant],
        SIZES[size],
        size === 'icon' && 'btn-sm !px-0',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
});

export default Button;
