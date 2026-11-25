import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { login as loginApi, selectTenant as selectTenantApi } from '../api/endpoints';
import api from '../api/axios';
import WorkspaceBoot from '../components/WorkspaceBoot';
import { setMonitoringUser } from '../lib/monitoring';
import { adoptTenantAuthTokens, clearTenantBearer } from '../lib/sessionBearer';
import { suppressAuthErrorModals } from '../lib/authErrorGate';
import { subscribeSessionResume } from '../lib/sessionResume';

const AuthContext = createContext(null);

function _parseUser() {
  try {
    const raw = localStorage.getItem('ff_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function adoptSession(resData, setUser, setChecked, sessionEpoch) {
  const { user: u } = resData;
  sessionEpoch.current += 1;
  suppressAuthErrorModals(5000);
  adoptTenantAuthTokens(resData);
  localStorage.setItem('ff_user', JSON.stringify(u));
  localStorage.removeItem('ff_token');
  if (u.tenantSlug) {
    localStorage.setItem('ff_tenant_slug', u.tenantSlug);
  }
  setUser(u);
  setChecked(true);
  return u;
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [checked, setChecked] = useState(false); // true once session is verified
  const [tenantSelection, setTenantSelection] = useState(null); // { selectionToken, memberships }
  // Bumped on login so an in-flight boot /users/me 401 cannot wipe a fresh session.
  const sessionEpoch = useRef(0);

  // On mount — verify cookie/bearer session via /users/me
  useEffect(() => {
    let active = true;
    const epoch = sessionEpoch.current;
    const cached = _parseUser();
    api.get('/users/me', { skipGlobalError: true })
      .then(res => {
        if (!active || epoch !== sessionEpoch.current) return;
        const u = res.data;
        localStorage.setItem('ff_user', JSON.stringify(u));
        if (u.tenantSlug) localStorage.setItem('ff_tenant_slug', u.tenantSlug);
        setUser(u);
      })
      .catch((err) => {
        if (!active || epoch !== sessionEpoch.current) return;
        if (err.response?.status === 401) {
          localStorage.removeItem('ff_user');
          localStorage.removeItem('ff_token');
          clearTenantBearer();
          setUser(null);
        } else if (cached) {
          setUser(cached);
        }
      })
      .finally(() => {
        if (active && epoch === sessionEpoch.current) setChecked(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (username, password, extras = {}) => {
    const apiUrl = import.meta.env.BACKEND_ORIGIN || import.meta.env.VITE_API_URL;
    console.info('[auth] Login attempt', {
      apiUrl: apiUrl || '(missing BACKEND_ORIGIN)',
      username: username?.trim(),
      passwordLength: password?.length ?? 0,
    });

    try {
      const res = await loginApi(username, password, extras);
      if (res.data?.requiresTenantSelection) {
        setTenantSelection({
          selectionToken: res.data.selectionToken,
          memberships: res.data.memberships || [],
        });
        return { requiresTenantSelection: true, memberships: res.data.memberships || [] };
      }
      setTenantSelection(null);
      const u = adoptSession(res.data, setUser, setChecked, sessionEpoch);
      console.info('[auth] Login success', { role: u.role, email: u.email, tenantSlug: u.tenantSlug });
      return u;
    } catch (err) {
      console.error('[auth] Login failed', {
        apiUrl: apiUrl || '(missing BACKEND_ORIGIN)',
        status: err.response?.status,
        message: err.response?.data?.message,
        networkError: !err.response ? err.message : null,
        requestUrl: err.config?.baseURL
          ? `${err.config.baseURL}${err.config.url}`
          : err.config?.url,
      });
      throw err;
    }
  }, []);

  const completeTenantSelection = useCallback(async (tenantId) => {
    if (!tenantSelection?.selectionToken) {
      throw new Error('No gym selection in progress');
    }
    const res = await selectTenantApi(tenantSelection.selectionToken, tenantId);
    setTenantSelection(null);
    const u = adoptSession(res.data, setUser, setChecked, sessionEpoch);
    return u;
  }, [tenantSelection]);

  const cancelTenantSelection = useCallback(() => {
    setTenantSelection(null);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/users/logout', {}, { skipGlobalError: true });
    } catch (_) {}
    sessionEpoch.current += 1;
    localStorage.removeItem('ff_token');
    localStorage.removeItem('ff_user');
    localStorage.removeItem('ff_tenant_slug');
    clearTenantBearer();
    setTenantSelection(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(() => {
    api.get('/users/me', { skipGlobalError: true })
      .then(res => {
        localStorage.setItem('ff_user', JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch(() => {});
  }, []);

  // SessionExpiredModal sits outside this provider — adopt its successful re-login.
  useEffect(() => {
    return subscribeSessionResume((detail) => {
      if (detail.surface === 'platform') return;
      const u = detail.user;
      if (!u) return;
      sessionEpoch.current += 1;
      suppressAuthErrorModals(5000);
      adoptTenantAuthTokens(detail.tokens || {});
      localStorage.setItem('ff_user', JSON.stringify(u));
      localStorage.removeItem('ff_token');
      if (u.tenantSlug) localStorage.setItem('ff_tenant_slug', u.tenantSlug);
      setUser(u);
      setChecked(true);
    });
  }, []);

  useEffect(() => {
    setMonitoringUser(user ? { ...user, surface: 'tenant' } : null);
  }, [user]);

  // Don't render children until session is checked — prevents flash of protected content.
  if (!checked) {
    return user || localStorage.getItem('ff_user') ? <WorkspaceBoot /> : null;
  }

  return (
    <AuthContext.Provider value={{
      user,
      signIn,
      signOut,
      refreshUser,
      tenantSelection,
      completeTenantSelection,
      cancelTenantSelection,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
