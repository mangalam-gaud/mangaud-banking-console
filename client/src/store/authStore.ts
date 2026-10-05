import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, AuthState } from '../types';
import { api } from '../services/api';
import { tokenStorage } from '../services/tokenStorage';

interface AuthStore extends AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (data: any) => Promise<void>;
  changePassword: (data: { currentPassword: string; newPassword: string }) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  setUser: (user: User | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => {
        if (user) tokenStorage.setUser(user);
        else tokenStorage.clear();
        set({ user, isAuthenticated: !!user });
      },

      setTokens: (accessToken, refreshToken) => {
        tokenStorage.setTokens(accessToken, refreshToken);
        set({ accessToken, refreshToken });
      },

      clearAuth: () => {
        tokenStorage.clear();
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      login: async (email, password, rememberMe = false) => {
        set({ isLoading: true });
        try {
          const response = await api.login(email, password, rememberMe);
          if (response.success && response.data) {
            set({
              user: response.data.user,
              accessToken: response.data.tokens.accessToken,
              refreshToken: response.data.tokens.refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            throw new Error(response.error || 'Login failed');
          }
        } catch (error: any) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          const response = await api.register(data);
          if (response.success && response.data) {
            set({
              user: response.data.user,
              accessToken: response.data.tokens.accessToken,
              refreshToken: response.data.tokens.refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            throw new Error(response.error || 'Registration failed');
          }
        } catch (error: any) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await api.logout();
        } finally {
          get().clearAuth();
          set({ isLoading: false });
        }
      },

      refreshUser: async () => {
        // Read the token from tokenStorage, not from this store: on a fresh
        // page load the store's in-memory copy is null while the persisted
        // token is still valid, so checking `get()` cleared a good session.
        if (!tokenStorage.getAccessToken()) {
          get().clearAuth();
          return;
        }

        set({ isLoading: true });
        try {
          const response = await api.getProfile();
          if (response.success && response.data) {
            set({ user: response.data.user, isAuthenticated: true, isLoading: false });
          } else {
            get().clearAuth();
            set({ isLoading: false });
          }
        } catch (error) {
          get().clearAuth();
          set({ isLoading: false });
          /*
           * Re-throw after clearing.
           *
           * Swallowing this was why an API outage looked like a broken app:
           * a dead API returns 404/500 through the dev proxy, this caught it,
           * and the caller could only conclude "session invalid" - so every
           * page load landed on /login with a login form that could not work
           * either, and nothing anywhere said the server was down. The caller
           * needs to tell 401 (sign out) from 404/5xx (server is gone).
           */
          throw error;
        }
      },

      updateProfile: async (data) => {
        set({ isLoading: true });
        try {
          const response = await api.updateProfile(data);
          if (response.success && response.data) {
            set({ user: response.data.user, isLoading: false });
          } else {
            throw new Error(response.error || 'Failed to update profile');
          }
        } catch (error: any) {
          set({ isLoading: false });
          throw error;
        }
      },

      changePassword: async (data) => {
        set({ isLoading: true });
        try {
          const response = await api.changePassword(data);
          if (!response.success) {
            throw new Error(response.error || 'Failed to change password');
          }
          set({ isLoading: false });
        } catch (error: any) {
          set({ isLoading: false });
          throw error;
        }
      },

      forgotPassword: async (email) => {
        set({ isLoading: true });
        try {
          const response = await api.forgotPassword(email);
          if (!response.success) {
            throw new Error(response.error || 'Failed to send reset link');
          }
          set({ isLoading: false });
        } catch (error: any) {
          set({ isLoading: false });
          throw error;
        }
      },

      resetPassword: async (token, newPassword) => {
        set({ isLoading: true });
        try {
          const response = await api.resetPassword(token, newPassword);
          if (!response.success) {
            throw new Error(response.error || 'Failed to reset password');
          }
          set({ isLoading: false });
        } catch (error: any) {
          set({ isLoading: false });
          throw error;
        }
      },
    }),
    {
      // Must match AUTH_STORE_KEY in services/tokenStorage, which clears this
      // key alongside the tokens. If the two ever diverge, a stale
      // isAuthenticated:true survives a logout and the app 401-loops.
      name: 'auth-storage',
      // Tokens are intentionally NOT persisted here. They live in the flat
      // `accessToken` / `refreshToken` keys owned by tokenStorage so that the
      // axios interceptor and this store never disagree.
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // Re-hydrate the in-memory token fields from the flat keys on startup.
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.accessToken = tokenStorage.getAccessToken();
          state.refreshToken = tokenStorage.getRefreshToken();
        }
      },
    }
  )
);