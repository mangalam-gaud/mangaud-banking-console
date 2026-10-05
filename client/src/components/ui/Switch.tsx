import { forwardRef, InputHTMLAttributes, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../utils/cn';

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: string;
  description?: string;
  /**
   * Radix-style alias for onChange, so call sites can use either
   * `onChange` or `onCheckedChange`.
   */
  onCheckedChange?: (checked: boolean) => void;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  containerClassName?: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    label,
    description,
    className,
    containerClassName,
    id,
    onCheckedChange,
    onChange,
    disabled,
    ...props
  },
  ref
) {
  const autoId = useId();
  const switchId = id || autoId || label?.toLowerCase().replace(/\s+/g, '-');
  const innerRef = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState(!!props.checked);

  useEffect(() => setChecked(!!props.checked), [props.checked]);

  // Keep the forwarded ref pointing at the real input element.
  useEffect(() => {
    if (typeof ref === 'function') ref(innerRef.current);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = innerRef.current;
  }, [ref]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setChecked(event.target.checked);
    onChange?.(event);
    onCheckedChange?.(event.target.checked);
  };

  return (
    <div className={cn('flex items-start gap-3', containerClassName)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={switchId ? `${switchId}-label` : undefined}
        disabled={disabled}
        onClick={() => innerRef.current?.click()}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked ? 'bg-brass-600 border-brass-600' : 'bg-rule border-rule',
          className
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>

      {/* Real checkbox kept in the DOM so native form semantics and the
          accessible name still work; visually hidden. */}
      <input
        ref={innerRef}
        type="checkbox"
        id={switchId}
        checked={props.checked}
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        {...props}
      />

      {(label || description) && (
        <label htmlFor={switchId} className="min-w-0 cursor-pointer select-none">
          {label ? (
            <span id={`${switchId}-label`} className="block text-sm font-medium text-ink-soft">
              {label}
            </span>
          ) : null}
          {description ? <span className="block text-xs text-muted mt-0.5">{description}</span> : null}
        </label>
      )}
    </div>
  );
});

export default Switch;
