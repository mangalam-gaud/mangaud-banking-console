/**
 * Password strength and validation.
 *
 * These rules mirror `server/src/utils/validation.ts` and the auth schemas on
 * the server, so the meter shown while typing agrees with what the API will
 * accept. A meter that disagrees with the server is worse than none: it tells
 * the user "Strong" and then the form rejects them.
 */

export interface PasswordCheck {
  valid: boolean;
  /** 0-4, mapped to the labels below. */
  score: number;
  label: string;
  errors: string[];
  /** Per-rule results, for the tick list under the field. */
  rules: Array<{ id: string; label: string; met: boolean }>;
}

export const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/** Tailwind classes per score, kept out of the component so they stay in the
 *  Tailwind content scan (dynamic class names are not detected). */
export const STRENGTH_CLASSES = [
  'bg-danger-500',
  'bg-danger-400',
  'bg-brass-500',
  'bg-success-500',
  'bg-success-600',
] as const;

const RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

/**
 * Assess a password.
 *
 * Takes `string | undefined` on purpose: `watch('password')` from react-hook-form
 * returns `undefined` on the very first render when the form has no
 * `defaultValues`, and the previous implementation read `.length` on it
 * directly, which crashed the whole Register page on mount.
 */
export function checkPassword(password?: string | null): PasswordCheck {
  const value = password ?? '';

  const rules = RULES.map((rule) => ({ id: rule.id, label: rule.label, met: rule.test(value) }));
  const errors = rules.filter((r) => !r.met).map((r) => r.label);

  // One point per rule met, with a bonus for length beyond the minimum so a
  // long passphrase is not scored the same as a token-shaped password.
  let score = rules.filter((r) => r.met).length;
  if (value.length >= 14) score += 1;
  if (value.length >= 20) score += 1;
  score = Math.min(4, score);

  return {
    valid: errors.length === 0,
    score,
    label: STRENGTH_LABELS[score],
    errors,
    rules,
  };
}

/** True when both fields match and the password is acceptable. */
export function passwordsMatch(password?: string, confirm?: string): boolean {
  return !!password && password === confirm;
}
