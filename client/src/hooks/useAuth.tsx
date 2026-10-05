import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuthStore } from '../store/authStore';
import { tokenStorage } from '../services/tokenStorage';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  /**
   * A login/register request is in flight.
   *
   * Deliberately NOT the same thing as "the session check has not finished".
   * Route guards used to gate on this, which meant pressing "Sign in" flipped
   * the guard to its loading branch and *unmounted the form that was
   * submitting* — so a wrong password silently discarded everything typed and
   * the error message never had a chance to render. The form appeared to ignore
   * the click. Use `isBootstrapping` for route-level gates.
   */
  isLoading: boolean;
  /**
   * The one-time session check on mount is still running.
   *
   * This is what a route guard should wait on: it is true for a moment on a cold
   * load and false forever after, so gating on it cannot tear down a screen the
   * user is already interacting with.
   */
  isBootstrapping: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  /** Set when the session check could not reach the server. */
  sessionError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Hard ceiling on the boot-time session check.
 *
 * Longer than any real `/auth/profile` round trip by a wide margin; it exists
 * so the app can never be left showing nothing at all.
 */
const SESSION_CHECK_TIMEOUT_MS = 12_000;

/**
 * Did the session check fail because the server is not really there, rather
 * than because it rejected the session?
 *
 * The distinction decides whether a user gets signed out or told the server is
 * down, and getting it wrong is precisely what makes an outage look like a
 * broken app.
 *
 * The hard part is that a dead API does not arrive as a network error. Behind
 * the dev proxy a refused connection comes back as **404 for GET** and **500
 * for POST**, because the proxy is what answered - not the API. So "the request
 * failed" is not a reliable signal; the status code is.
 *
 * Only 401 and 403 mean the session itself is bad. 404 and any 5xx mean the
 * request never got a real answer from the API, and signing someone out
 * because their own machine could not reach the server is both wrong and
 * unactionable - they would just get a login page that cannot work either.
 */
const isServerUnreachable = (error: unknown): boolean => {
  const e = error as
    | { code?: string; response?: { status?: number }; message?: string }
    | undefined;
  if (!e) return false;

  const status = e.response?.status;

  // No response at all: DNS failure, refused connection, TLS failure, timeout.
  if (status === undefined) {
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || e.code === 'ERR_NETWORK') {
      return true;
    }
    if (
      typeof e.message === 'string' &&
      /network|timeout|socket hang up|failed to fetch/i.test(e.message)
    ) {
      return true;
    }
    return false;
  }

  // Something answered, but not with a verdict on the session. 401/403 are
  // verdicts; 404 and 5xx are outages.
  return status === 404 || status === 408 || status >= 500;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
    forgotPassword,
    resetPassword,
  } = useAuthStore();

  // Decide the session once on mount, rather than on every render. The old
  // effect ran on each `isAuthenticated` change and re-validated the session
  // in a loop when the stored token turned out to be stale.
  const [initialising, setInitialising] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    /*
     * A deadline around the session check, independent of the HTTP timeout.
     *
     * The axios timeout covers a stalled socket. This covers the rest: a
     * promise that never settles for any other reason - a bug in the store, a
     * rejected refresh that is swallowed upstream - still leaves `initialising`
     * true, and `initialising` true means the whole app renders nothing. The
     * gate must be guaranteed to open.
     */
    const settle = () => {
      if (!cancelled) setInitialising(false);
    };
    const guard = setTimeout(settle, SESSION_CHECK_TIMEOUT_MS);

    const initAuth = async () => {
      const token = tokenStorage.getAccessToken();
      const storedUser = tokenStorage.getUser();

      if (token && storedUser) {
        try {
          // Re-validate with the API: the token may be expired or revoked.
          await useAuthStore.getState().refreshUser();
        } catch (error) {
          /*
           * A rejected session check is not the same as a bad token. If the
           * server is simply unreachable, signing the user out is both wrong
           * and invisible: they are bounced to /login with a "wrong password"
           * shaped page while their password is fine. Say what happened.
           */
          if (isServerUnreachable(error)) {
            setSessionError(
              'Could not reach the API on port 5000. Start it with start.bat, then reload.'
            );
          } else {
            useAuthStore.getState().clearAuth();
          }
        }
      } else if (!token) {
        useAuthStore.getState().clearAuth();
      }

      clearTimeout(guard);
      settle();
    };

    initAuth();
    return () => {
      cancelled = true;
      clearTimeout(guard);
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      // Stay "loading" until the initial session check finishes, so the route
      // guards do not bounce an authenticated user to /login mid-check.
      isLoading: isLoading || initialising,
      // ...but expose the two separately, because they mean different things and
      // conflating them unmounts a form mid-submit. See AuthContextType.
      isBootstrapping: initialising,
      login,
      register,
      logout,
      refreshUser,
      forgotPassword,
      resetPassword,
      sessionError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}