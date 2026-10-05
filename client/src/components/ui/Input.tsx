import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

interface FieldShellProps {
  id: string;
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

function FieldShell({ id, label, error, hint, required, className, children }: FieldShellProps) {
  /*
    The error and hint paragraphs carry ids derived from the field's own id,
    because the input points at them with `aria-describedby`.

    They used to have no id at all, so `aria-describedby` resolved to nothing:
    a screen reader announced the field as invalid and then said nothing about
    *why*. That is the "visual-only error indication" failure — the red border
    and the red text are both invisible to a non-sighted user, and the message
    that explains the problem existed only for people who could see it.
  */
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <label htmlFor={id} className="label">
          {label}
          {required ? <span className="text-danger-600 ml-0.5">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-xs text-danger-600 mt-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, rightIcon, className, containerClassName, id, required, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;

  return (
    <FieldShell
      id={inputId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        {leftIcon ? (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            'input',
            error && 'input-error',
            leftIcon && 'pl-10',
            // `pr-11` rather than `pr-10`: the slot now holds a real control, and
            // the icon sits inside a 2.25rem hit area, so the text needs to stop
            // short of the button rather than tuck under it.
            rightIcon && 'pr-11',
            className
          )}
          {...props}
        />
        {rightIcon ? (
          /*
            `pointer-events-none` on the wrapper so a decorative icon never
            swallows a click — but the slot is also used for *interactive*
            content, most importantly the show/hide-password button on the sign-in
            form. Without re-enabling it here, that button was inert: it looked
            clickable, had a label and a hover state, and did nothing, because it
            inherited `none` from its parent.
          */
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            {rightIcon}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string } | string>;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, placeholder, options = [], className, containerClassName, id, required, ...props },
  ref
) {
  const autoId = useId();
  const selectId = id || autoId;
  const normalised = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

  return (
    <FieldShell
      id={selectId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          className={cn('input appearance-none pr-9 cursor-pointer', error && 'input-error', className)}
          {...props}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {normalised.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
          aria-hidden="true"
        />
      </div>
    </FieldShell>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, containerClassName, id, required, ...props },
  ref
) {
  const autoId = useId();
  const areaId = id || autoId;
  return (
    <FieldShell
      id={areaId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
<textarea
          ref={ref}
          id={areaId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${areaId}-error` : hint ? `${areaId}-hint` : undefined}
          className={cn('input min-h-[88px] resize-y', error && 'input-error', className)}
          {...props}
        />
    </FieldShell>
  );
});

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  containerClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, containerClassName, id, ...props },
  ref
) {
  const autoId = useId();
  const boxId = id || autoId;
  return (
    <label
      htmlFor={boxId}
      className={cn('inline-flex items-center gap-2 cursor-pointer select-none', containerClassName)}
    >
      <input
        ref={ref}
        id={boxId}
        type="checkbox"
        className={cn(
          'w-4 h-4 rounded border-border text-brass-600 focus:ring-2 focus:ring-brass/40 cursor-pointer',
          className
        )}
        {...props}
      />
      {label ? <span className="text-sm text-ink-soft">{label}</span> : null}
    </label>
  );
});
