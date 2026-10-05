/**
 * Single source of truth for auth token persistence.
 *
 * Both the axios interceptors (services/api.ts) and the zustand store
 * (store/authStore.ts) must read and write the SAME keys. Previously the store
 * persisted under the zustand key `auth-storage` while api.ts looked for flat
 * `accessToken` / `refreshToken` keys, so the Bearer token was never attached
 * and every authenticated request 401'd -> refresh failed -> redirect to /login.
 */

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

/**
 * The zustand `persist` key for the auth store. It lives here because it is
 * part of the same logical state: `clear()` must remove it too. Leaving it
 * behind means `isAuthenticated: true` survives a reload, the protected routes
 * render, the dashboard re-issues its requests, each 401s, the refresh fails,
 * and the app loops -- burning the whole rate-limit budget in seconds.
 */
const AUTH_STORE_KEY = 'auth-storage';

const safeParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const tokenStorage = {
  getAccessToken: (): string | null => {
    try {
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  getRefreshToken: (): string | null => {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  getUser: <T,>(): T | null => {
    try {
      return safeParse<T>(localStorage.getItem(USER_KEY));
    } catch {
      return null;
    }
  },

  setTokens: (accessToken: string, refreshToken: string): void => {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } catch {
      /* storage unavailable (private mode / quota) - in-memory state still works */
    }
  },

  setUser: (user: unknown): void => {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
  },

  clear: (): void => {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(AUTH_STORE_KEY);
    } catch {
      /* ignore */
    }
  },
};

export default tokenStorage;
