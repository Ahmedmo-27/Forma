import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiGetMe } from "../api/endpoints";

const PlatformAuthContext = createContext(null);

const STORAGE_TOKEN = "leap_platform_token";
const STORAGE_REFRESH = "leap_platform_refresh_token";
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

  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN));
  const [loading, setLoading] = useState(true);
  const [mfaSession, setMfaSession] = useState(null); // { tempToken, user, step: "challenge" | "setup" }

  const [impersonation, setImpersonation] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_IMPERSONATION);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Verify and sync current platform identity on load
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    apiGetMe()
      .then((res) => {
        if (active && res.data?.user) {
          setUser(res.data.user);
          localStorage.setItem(STORAGE_USER, JSON.stringify(res.data.user));
        }
      })
      .catch(() => {
        // Handled by 401 interceptor
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const loginSuccess = useCallback((authData) => {
    const { token: nextToken, refreshToken, user: nextUser } = authData;

    setToken(nextToken);
    setUser(nextUser);
    setMfaSession(null);

    localStorage.setItem(STORAGE_TOKEN, nextToken);
    if (refreshToken) {
      localStorage.setItem(STORAGE_REFRESH, refreshToken);
    }
    if (nextUser) {
      localStorage.setItem(STORAGE_USER, JSON.stringify(nextUser));
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_REFRESH);
    localStorage.removeItem(STORAGE_USER);
    localStorage.removeItem(STORAGE_IMPERSONATION);

    setToken(null);
    setUser(null);
    setMfaSession(null);
    setImpersonation(null);

    const isNext = window.location.pathname.startsWith("/platform");
    window.location.href = isNext ? "/platform/login" : "/platform/login";
  }, []);

  const startImpersonation = useCallback((impersonationData) => {
    setImpersonation(impersonationData);
    localStorage.setItem(STORAGE_IMPERSONATION, JSON.stringify(impersonationData));
  }, []);

  const exitImpersonation = useCallback(() => {
    setImpersonation(null);
    localStorage.removeItem(STORAGE_IMPERSONATION);
    localStorage.removeItem("token"); // clear tenant token
  }, []);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(token && user),
    mfaSession,
    setMfaSession,
    clearMfaSession: () => setMfaSession(null),
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
