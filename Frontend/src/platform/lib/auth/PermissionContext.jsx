import { createContext, useContext, useMemo } from "react";
import { usePlatformAuth } from "./AuthContext";
import { canPlatform } from "./permissions.js";

const PermissionContext = createContext(null);

export function PermissionProvider({ children }) {
  const { user } = usePlatformAuth();

  const permissions = useMemo(() => {
    if (!user) return new Set();
    if (user.role === "super_admin") {
      // Super admin has wildcard access
      return new Set(["*"]);
    }
    return new Set(Array.isArray(user.permissions) ? user.permissions : []);
  }, [user]);

  const hasPermission = useMemo(
    () => (permissionKey) => canPlatform(user, permissionKey),
    [user]
  );

  const hasRole = useMemo(
    () => (roleName) => {
      if (!user) return false;
      if (Array.isArray(roleName)) return roleName.includes(user.role);
      return user.role === roleName;
    },
    [user]
  );

  const value = {
    permissions,
    hasPermission,
    hasRole,
    role: user?.role || null,
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission(permissionKey) {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error("usePermission must be used within a PermissionProvider");
  }
  return ctx.hasPermission(permissionKey);
}

export function usePlatformRole() {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error("usePlatformRole must be used within a PermissionProvider");
  }
  return { role: ctx.role, hasRole: ctx.hasRole };
}

/**
 * Declarative component guard: <Can permission="tenants.purge"> ... </Can>
 */
export function Can({ permission, role, children, fallback = null }) {
  const ctx = useContext(PermissionContext);
  if (!ctx) return fallback;

  if (permission && !ctx.hasPermission(permission)) {
    return fallback;
  }

  if (role && !ctx.hasRole(role)) {
    return fallback;
  }

  return children;
}
