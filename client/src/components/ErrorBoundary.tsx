import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Logo } from './layout/Logo';

interface Props {
  children: ReactNode;
  /** Shown instead of the default panel when provided. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Catches render-time errors anywhere below it.
 *
 * Without this a single bad page takes down the whole SPA and the user is left
 * staring at a blank screen with no way back — in an installed PWA, that means
 * re-launching the app to escape it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In a real deployment this is where the error would be reported to
    // Sentry/Datadog. Console keeps it visible during development.
    console.error('Unhandled UI error:', error, info.componentStack);
    this.setState({ info });
  }

  reset = (): void => {
    this.setState({ error: null, info: null });
  };

  render(): ReactNode {
    const { error, info } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;
    if (fallback) return fallback(error, this.reset);

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 safe-t safe-b">
        <div className="w-full max-w-lg text-center">
          <Logo className="h-12 w-12 mx-auto rounded-2xl" showWordmark={false} />

          <span className="inline-grid place-items-center h-12 w-12 rounded-2xl bg-danger-50 border border-danger-100 text-danger-600 mt-6">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </span>

          <h1 className="font-display text-2xl font-bold text-text mt-5">Something broke</h1>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            This screen hit an unexpected error. Your money and data are unaffected.
          </p>

          <details className="mt-6 text-left">
            <summary className="text-xs text-muted cursor-pointer select-none">
              Technical details
            </summary>
            <pre className="mt-2 p-3 rounded-xl bg-text text-card/80 text-[0.6875rem] overflow-x-auto whitespace-pre-wrap break-words max-h-48">
              {error.message}
              {info?.componentStack}
            </pre>
          </details>

          <div className="flex flex-wrap gap-2.5 justify-center mt-6">
            <button onClick={this.reset} className="btn btn-brass">
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
            <a href="/dashboard" className="btn btn-secondary">
              <Home className="w-4 h-4" aria-hidden="true" />
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
