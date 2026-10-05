import { create } from 'zustand';
import { useEffect } from 'react';
import { api } from '../services/api';
import { useAuthStore } from './authStore';

/**
 * The signed-in user's capability list, mirrored from the server.
 *
 * The server owns the permission matrix (`server/src/config/permissions.ts`).
 * The client asks for the resulting list rather than keeping its own copy of
 * the role table, because two copies of a permission matrix drift: someone adds
 * `kyc:review` to the server, the client still hides the button, and the bug
 * looks like a backend problem until you read both files.
 *
 * Kept out of the persisted auth store on purpose. Permissions change when a
 * role changes; a stale copy in `localStorage` would survive a reload and keep
 * showing controls the user can no longer use. This is re-fetched per session
 * instead, which is one cheap request behind the login call.
 */
interface PermissionStore {
  permissions: Set<string>;
  role: string;
  roleLabel: string;
  branchCode: string;
  isStaff: boolean;
  isLoading: boolean;
  /** True once a fetch has completed, so `can` stops answering "no" while loading. */
  isResolved: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

export const usePermissionStore = create<PermissionStore>((set, get) => ({
  permissions: new Set<string>(),
  role: '',
  roleLabel: '',
  branchCode: '',
  isStaff: false,
  isLoading: false,
  isResolved: false,

  load: async () => {
    // Already loaded for this session; do not re-fetch on every mount.
    if (get().isResolved && !get().isLoading) return;

    set({ isLoading: true });
    try {
      const response = await api.getPermissions();
      if (response.success && response.data) {
        set({
          permissions: new Set(response.data.permissions),
          role: response.data.role,
          roleLabel: response.data.roleLabel,
          branchCode: response.data.branchCode,
          isStaff: response.data.isStaff,
          isLoading: false,
          isResolved: true,
        });
      } else {
        set({ isLoading: false, isResolved: true });
      }
    } catch {
      // A failed capability read must not sign anyone out or trap them on a
      // spinner. Fall back to "resolved, no permissions" — the UI hides
      // capability-gated controls and the server still enforces everything.
      set({ isLoading: false, isResolved: true });
    }
  },

  reset: () =>
    set({
      permissions: new Set<string>(),
      role: '',
      roleLabel: '',
      branchCode: '',
      isStaff: false,
      isLoading: false,
      isResolved: false,
    }),
}));

/**
 * Permission-aware view of the current user.
 *
 * `can` is deliberately optimistic while the list is still loading: a control
 * gated on a permission renders as available until the server says otherwise,
 * rather than flickering into view a frame later. Everything is enforced server
 * side regardless, so the worst case is a button that 403s rather than one the
 * user cannot find.
 */
export function usePermissions(): {
  can: (...permissions: string[]) => boolean;
  canAny: (...permissions: string[]) => boolean;
  role: string;
  roleLabel: string;
  branchCode: string;
  isStaff: boolean;
  isResolved: boolean;
} {
  const permissions = usePermissionStore((s) => s.permissions);
  const role = usePermissionStore((s) => s.role);
  const roleLabel = usePermissionStore((s) => s.roleLabel);
  const branchCode = usePermissionStore((s) => s.branchCode);
  const isStaff = usePermissionStore((s) => s.isStaff);
  const isResolved = usePermissionStore((s) => s.isResolved);

  const can = (...required: string[]) =>
    isResolved ? required.every((p) => permissions.has(p)) : true;

  /**
   * True when the user holds at least one of `anyOf`.
   *
   * An **empty list means "no permission required"**, not "holds none of
   * nothing". `[].some()` is `false`, so the naive version silently filtered out
   * every unrestricted item — which is what pushed "Home" to the end of the
   * mobile bar. Getting this wrong fails quietly: the item is still reachable,
   * just in the wrong place.
   */
  const canAny = (...anyOf: string[]) =>
    isResolved ? anyOf.length === 0 || anyOf.some((p) => permissions.has(p)) : true;

  return { can, canAny, role, roleLabel, branchCode, isStaff, isResolved };
}

/** Loads the permission list once authenticated, and clears it on sign-out. */
export function usePermissionLoader(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const load = usePermissionStore((s) => s.load);
  const reset = usePermissionStore((s) => s.reset);

  useEffect(() => {
    if (isAuthenticated) {
      void load();
    } else {
      reset();
    }
  }, [isAuthenticated, load, reset]);
}
