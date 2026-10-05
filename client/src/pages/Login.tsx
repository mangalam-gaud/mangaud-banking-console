import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, AlertCircle, ArrowRight, Copy, Check, Keyboard } from 'lucide-react';
import { Button, Input, Checkbox } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

/** Seeded demo logins, offered as one-tap fills so the app is testable. */
const DEMO_LOGINS = [
  { role: 'Customer', email: 'aarav.sharma@mangaud.demo', password: 'Customer@123' },
  { role: 'Customer', email: 'priya.nair@mangaud.demo', password: 'Customer@123' },
  { role: 'Teller', email: 'teller@mangaud.demo', password: 'Teller@123' },
  { role: 'Loan Officer', email: 'loanofficer@mangaud.demo', password: 'Officer@123' },
  { role: 'Branch Manager', email: 'manager@mangaud.demo', password: 'Manager@123' },
  { role: 'Auditor', email: 'auditor@mangaud.demo', password: 'Auditor@123' },
  { role: 'Administrator', email: 'admin@mangaud.demo', password: 'Admin@123' },
];

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [filled, setFilled] = useState<string | null>(null);
  /*
    Caps Lock, and a ref on the error summary.

    Caps Lock is the single most common cause of "my password is wrong" on a
    form like this, and it is entirely invisible to the person typing: the
    characters come out shifted, so `Password@123` becomes `PASSWORD!@#$`. The
    `getModifierState` probe is free and needs no extra dependency.

    The ref is so a failed submit can move focus to the error. Announcing an
    error is not enough on its own — a screen reader user who pressed Enter in a
    field is still focused in that field, and a message that appears above it is
    easy to miss entirely.
  */
  const [capsLock, setCapsLock] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typeof event.getModifierState === 'function') {
        setCapsLock(event.getModifierState('CapsLock'));
      }
    };
    window.addEventListener('keyup', onKey);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors: formErrors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  /** Return the user to wherever they were headed before the redirect. */
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  const onSubmit = async (data: LoginForm) => {
    setFormError('');
    try {
      await login(data.email, data.password, data.rememberMe);
      toast.success(`Welcome back, ${data.email.split('@')[0]}`);
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true });
    } catch (error: any) {
      /*
        Read the message from *both* shapes.

        `authStore.login` normalises a failed response into a plain
        `Error(response.error)`, so the server's "Invalid email or password"
        arrives as `error.message` — with no `error.response` at all. This page
        was reading only the axios shape, so `message` fell through to its
        default, the credential test below never matched, and a wrong password
        was reported as a transient toast that vanished after four seconds
        instead of the persistent inline message directly above the fields. The
        page's own comment said wrong credentials show inline; they did not.

        Both shapes are accepted so the page keeps working whether the failure
        came from the store's normalisation or from the axios interceptor.
      */
      const message =
        error?.response?.data?.error || error?.message || 'Sign-in failed. Please try again.';

      // A wrong password is a credential problem, so it belongs next to the
      // fields where the reader's attention already is.
      if (/credential|password|email|invalid|not found|unauthor/i.test(message)) {
        setFormError(message);
      } else {
        toast.error(message);
      }
    }
  };

  /*
    Move focus to the error once it is on screen.

    This is an effect rather than a `requestAnimationFrame` inside the catch,
    because `setFormError` has not been committed when the catch runs — the
    ref is still null, so the callback fired against a node that did not exist
    yet and the focus silently did nothing. Depending on the render pass for
    focus is also just correct: the element is focused because it appeared, not
    on a timer.
  */
  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);
  const fillDemo = (email: string, password: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', password, { shouldValidate: true });
    setFormError('');
    setFilled(email);
    setTimeout(() => setFilled(null), 2000);
  };

  return (
    <div className="w-full">
      <div className="text-center mb-7">
        {/*
          600, not 700. At display size a bold weight thickens the strokes until
          the counters in characters like "e" and "a" begin to close up, and this
          is the largest text on the screen.
        */}
        <h1 className="font-display text-2xl sm:text-[1.75rem] font-semibold tracking-[-0.02em] text-text">
          Welcome back
        </h1>
        <p className="text-sm text-muted mt-2">Sign in to your banking workspace</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/*
          `role="alert"` announces the insertion; `tabIndex={-1}` plus the focus
          call in `onSubmit` is what actually moves the caret here, since the
          message appears *above* the field the user submitted from.
        */}
        {formError ? (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="flex items-start gap-2.5 p-3.5 rounded-lg border border-danger-100 bg-danger-50 text-sm text-danger-700"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{formError}</span>
          </div>
        ) : null}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          leftIcon={<Mail className="w-4 h-4" />}
          error={formErrors.email?.message}
          {...register('email')}
        />

<Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Enter your password"
          leftIcon={<Lock className="w-4 h-4" />}
          error={formErrors.password?.message}
          hint={
            /*
              Only while the warning is actually true. A permanent "check caps
              lock" hint is noise; a hint that appears the moment it applies is
              the one time it is read.
            */
            capsLock && !formErrors.password
              ? 'Caps Lock is on'
              : undefined
          }
          rightIcon={
            /*
              A real 36px button rather than a bare icon, so the touch target is
              not the 16px glyph. The wrapper used to be `pointer-events-none`
              for the decorative case, which made this control inert — it looked
              clickable, carried an aria-label and a hover state, and did
              nothing at all.
            */
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="-mr-1.5 grid h-9 w-9 place-items-center rounded-md text-muted transition-colors duration-[120ms] ease-out hover:bg-sunken hover:text-text"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          }
          {...register('password')}
        />

        {/*
          Caps Lock gets the icon as well as the text, so it is not conveyed by
          colour alone — and it is an `aria-live` region because it can appear
          while the user is already focused in the field, with no other event to
          announce it.
        */}
        <p aria-live="polite" className="sr-only">
          {capsLock ? 'Caps Lock is on' : ''}
        </p>

        <div className="flex items-center justify-between gap-3 pt-1">
          <Checkbox label="Remember me" {...register('rememberMe')} />
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brass-700 hover:text-brass-800"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="brass" size="lg" className="w-full" isLoading={isLoading}>
          Sign in
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </form>

      <p className="text-sm text-muted text-center mt-6">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-medium text-brass-700 hover:text-brass-800">
          Sign up
        </Link>
      </p>

      {/* --------------------------------------------------- demo logins */}
      <div className="mt-7 pt-6 border-t border-border">
        <p className="eyebrow text-center mb-3">Demo logins</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {DEMO_LOGINS.map((demo) => (
            <button
              key={demo.email}
              type="button"
              onClick={() => fillDemo(demo.email, demo.password)}
              /*
                `aria-pressed` rather than an icon swap alone: the tick is a
                colour-and-glyph cue that a screen reader would otherwise miss
                entirely, and the state is genuinely a toggle — this one is the
                filled-in credential.
              */
              aria-pressed={filled === demo.email}
              className={cn(
                'group flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left',
                'transition-[box-shadow,border-color,background-color] duration-[180ms] ease-out',
                filled === demo.email
                  ? 'border-brand-line bg-brand-quiet'
                  : 'border-border bg-sunken/60 hover:border-brand-line hover:bg-sunken'
              )}
            >
              <span className="min-w-0">
                <span className="block text-[0.625rem] uppercase tracking-wider text-muted">
                  {demo.role}
                </span>
                <span className="block text-xs text-ink-soft truncate font-mono">{demo.email}</span>
              </span>
              {filled === demo.email ? (
                <Check className="w-3.5 h-3.5 text-brand-ink shrink-0" aria-hidden="true" />
              ) : (
                <Copy
                  className="w-3.5 h-3.5 text-muted/50 group-hover:text-muted shrink-0"
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
        {/* Announces the fill, since the change happens in fields the user may
            not be looking at. */}
        <p aria-live="polite" className="text-[0.6875rem] text-muted text-center mt-3">
          {filled ? 'Credentials filled in. Press Sign in.' : 'Tap a role to fill its credentials.'}
        </p>
      </div>
    </div>
  );
}

export default Login;
