import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getTenantMe } from '../api/endpoints';
import { useAuth } from './AuthContext';

const TenantContext = createContext(null);

const DEFAULT_ACTIVITIES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyBranding = useCallback((branding) => {
    if (!branding?.palette) return;
    const { primary, secondary, accent, background, text } = branding.palette;
    const root = document.documentElement;

    if (primary) {
      root.style.setProperty('--navy', primary);
      root.style.setProperty('--blue', primary);
    }
    if (secondary) {
      root.style.setProperty('--navy-2', secondary);
      root.style.setProperty('--navy-3', secondary);
      root.style.setProperty('--blue-dark', secondary);
    }
    if (accent) {
      root.style.setProperty('--accent', accent);
    }
    if (background) {
      root.style.setProperty('--bg', background);
    }
    if (text) {
      root.style.setProperty('--t1', text);
    }
  }, []);

  const fetchTenant = useCallback(async () => {
    if (!user) {
      setTenant(null);
      setLoading(false);
      return;
    }
    try {
      const res = await getTenantMe();
      if (res.data?.tenant) {
        setTenant(res.data.tenant);
        applyBranding(res.data.tenant.settings?.branding);
        if (res.data.tenant.slug) {
          localStorage.setItem('ff_tenant_slug', res.data.tenant.slug);
        }
      }
    } catch (err) {
      console.warn('[TenantContext] Failed to load tenant details', err.message);
    } finally {
      setLoading(false);
    }
  }, [user, applyBranding]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  const hasFeature = useCallback((featureKey) => {
    if (!tenant) return true; // optimistic fallback while loading or single-tenant mode
    return tenant.effectiveFeatures?.includes(featureKey) ?? true;
  }, [tenant]);

  const enabledActivities = tenant?.settings?.enabledActivities?.length > 0
    ? tenant.settings.enabledActivities
    : DEFAULT_ACTIVITIES;

  const currency = tenant?.settings?.locale?.currency || 'EGP';
  const timezone = tenant?.settings?.locale?.timezone || 'Africa/Cairo';

  const value = {
    tenant,
    loading,
    refreshTenant: fetchTenant,
    hasFeature,
    enabledActivities,
    currency,
    timezone,
    branding: tenant?.settings?.branding || {},
    plan: tenant?.plan,
    limits: tenant?.effectiveLimits || {},
    usage: tenant?.usage || {},
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside TenantProvider');
  return ctx;
}
