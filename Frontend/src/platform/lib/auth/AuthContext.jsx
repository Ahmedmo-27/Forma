import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { apiGetMe } from "../api/endpoints";
import platformClient from "../api/client";
import { clearWwwPreviewCookie } from "../../../marketing/previewCookie";

const PlatformAuthContext = createContext(null);

const STORAGE_USER = "leap_platform_user";
const STORAGE_IMPERSONATION = "leap_impersonation_meta";

export function PlatformAuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_USER);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);
  // Bumped on login so an in-flight boot /auth/me 401 cannot wipe a fresh session.
  const sessionEpoch = useRef(0);

  const [impersonation, setImpersonation] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_IMPERSONATION);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let active = true;
    const epoch = sessionEpoch.current;
    apiGetMe()
      .then((res) => {
        if (!active || epoch !== sessionEpoch.current) return;
        if (res.data?.user) {
          setUser(res.data.user);
          localStorage.setItem(STORAGE_USER, JSON.stringify(res.data.user));
        }
      })
      .catch(() => {
        if (!active || epoch !== sessionEpoch.current) return;
        setUser(null);
        localStorage.removeItem(STORAGE_USER);
        localStorage.removeItem("leap_platform_token");
        localStorage.removeItem("leap_platform_refresh_token");
      })
      .finally(() => {
        if (active && epoch === sessionEpoch.current) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const loginSuccess = useCallback((authData) => {
    const { user: nextUser } = authData;
    sessionEpoch.current += 1;
    setLoading(false);
    setUser(nextUser);
    if (nextUser) {
      localStorage.setItem(STORAGE_USER, JSON.stringify(nextUser));
    }
    localStorage.removeItem("leap_platform_token");
    localStorage.removeItem("leap_platform_refresh_token");
    clearWwwPreviewCookie();
  }, []);

  const logout = useCallback(async () => {
    try {
      await platformClient.post("/auth/logout", {}, { skipGlobalError: true });
    } catch (_) {}
    localStorage.removeItem(STORAGE_USER);
    localStorage.removeItem(STORAGE_IMPERSONATION);
    localStorage.removeItem("leap_platform_token");
    localStorage.removeItem("leap_platform_refresh_token");
    clearWwwPreviewCookie();

    setUser(null);
    setImpersonation(null);

    window.location.href = "/platform/login";
  }, []);

  const startImpersonation = useCallback((impersonationData) => {
    setImpersonation(impersonationData);
    localStorage.setItem(STORAGE_IMPERSONATION, JSON.stringify(impersonationData));
  }, []);

  const exitImpersonation = useCallback(async () => {
    setImpersonation(null);
    localStorage.removeItem(STORAGE_IMPERSONATION);
    try {
      const { default: api } = await import("../../../api/axios");
      await api.post("/users/logout", {}, { skipGlobalError: true });
    } catch (_) {}
  }, []);

  const value = {
    user,
    token: null,
    loading,
    isAuthenticated: Boolean(user),
    loginSuccess,
    logout,
    impersonation,
    startImpersonation,
    exitImpersonation,
  };

  return (
    <PlatformAuthContext.Provider value={value}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) {
    throw new Error("usePlatformAuth must be used within a PlatformAuthProvider");
  }
  return ctx;
}
