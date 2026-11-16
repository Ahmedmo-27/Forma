import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { login as loginApi } from '../api/endpoints';
import api from '../api/axios';
import WorkspaceBoot from '../components/WorkspaceBoot';

const AuthContext = createContext(null);

function _parseUser() {
  try {
    const raw = localStorage.getItem('ff_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Drop poisoned legacy tokens left by the pre-cookie SPA (e.g. literal "undefined"). */
function _scrubLegacyToken() {
  const token = localStorage.getItem('ff_token');
  if (token == null) return;
  if (!token || token === 'undefined' || token === 'null' || token.split('.').length !== 3) {
    localStorage.removeItem('ff_token');
  }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [checked, setChecked] = useState(false); // true once session is verified

  // On mount — verify cookie session via /users/me
  useEffect(() => {
    _scrubLegacyToken();
    const cached = _parseUser();
    api.get('/users/me', { skipGlobalError: true })
      .then(res => {
        const u = res.data;
        localStorage.setItem('ff_user', JSON.stringify(u));
        if (u.tenantSlug) localStorage.setItem('ff_tenant_slug', u.tenantSlug);
        setUser(u);
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem('ff_user');
          localStorage.removeItem('ff_token');
          setUser(null);
        } else if (cached) {
          setUser(cached);
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
      const { user: u } = res.data;
      localStorage.setItem('ff_user', JSON.stringify(u));
      localStorage.removeItem('ff_token');
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

  const signOut = useCallback(async () => {
    try {
      await api.post('/users/logout', {}, { skipGlobalError: true });
    } catch (_) {}
    localStorage.removeItem('ff_token');
    localStorage.removeItem('ff_user');
    localStorage.removeItem('ff_tenant_slug');
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

  // Don't render children until session is checked — prevents flash of protected content.
  if (!checked) {
    return user || localStorage.getItem('ff_user') ? <WorkspaceBoot /> : null;
  }

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
