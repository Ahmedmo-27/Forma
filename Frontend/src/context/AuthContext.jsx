import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { login as loginApi } from '../api/endpoints';
import api from '../api/axios';

const AuthContext = createContext(null);

function _parseUser() {
  try {
    const raw = localStorage.getItem('ff_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [checked, setChecked] = useState(false); // true once token is verified

  // On mount — check for impersonation query token and verify stored token
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const impToken = params.get('impersonation_token');
      if (impToken) {
        localStorage.setItem('ff_token', impToken);
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (_) {}

    const token = localStorage.getItem('ff_token');
    if (!token) {
      setChecked(true);
      return;
    }
    api.get('/users/me')
      .then(res => {
        // Token is valid — use fresh user data from backend
        const u = res.data;
        localStorage.setItem('ff_user', JSON.stringify(u));
        setUser(u);
      })
      .catch((err) => {
        // Only wipe credentials on actual 401 unauthenticated response
        if (err.response?.status === 401) {
          localStorage.removeItem('ff_token');
          localStorage.removeItem('ff_user');
          setUser(null);
        } else {
          // If network is offline or 5xx, preserve cached user from localStorage
          try {
            const cached = localStorage.getItem('ff_user');
            if (cached) setUser(JSON.parse(cached));
          } catch (_) {}
        }
      })
      .finally(() => setChecked(true));
  }, []);

  const signIn = useCallback(async (username, password) => {
    const apiUrl = import.meta.env.BACKEND_ORIGIN || import.meta.env.VITE_API_URL;
    console.info('[auth] Login attempt', {
      apiUrl: apiUrl || '(missing BACKEND_ORIGIN)',
      username: username?.trim(),
      passwordLength: password?.length ?? 0,
    });

    try {
      const res = await loginApi(username, password);
      const { token, user: u } = res.data;
      localStorage.setItem('ff_token', token);
      localStorage.setItem('ff_user', JSON.stringify(u));
      if (u.tenantSlug) {
        localStorage.setItem('ff_tenant_slug', u.tenantSlug);
      }
      setUser(u);
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

  const signOut = useCallback(() => {
    localStorage.removeItem('ff_token');
    localStorage.removeItem('ff_user');
    localStorage.removeItem('ff_tenant_slug');
    setUser(null);
  }, []);

  const refreshUser = useCallback(() => {
    api.get('/users/me')
      .then(res => setUser(res.data))
      .catch(() => {});
  }, []);

  // Don't render children until token is verified — prevents flash of protected content
  if (!checked) return null;

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
