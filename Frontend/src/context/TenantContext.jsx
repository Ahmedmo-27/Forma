import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getTenantMe } from '../api/endpoints';
import { useAuth } from './AuthContext';
import { isValidHexColor } from '../lib/validation';

const TenantContext = createContext(null);

const DEFAULT_ACTIVITIES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];
const EMPTY_OBJECT = {};
const EMPTY_LIST = [];

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyBranding = useCallback((branding) => {
    if (!branding?.palette) return;
    const { primary, secondary, accent, background, text } = branding.palette;
    const root = document.documentElement;

    if (primary && isValidHexColor(primary)) {
      root.style.setProperty('--navy', primary);
      root.style.setProperty('--blue', primary);
    }
    if (secondary && isValidHexColor(secondary)) {
      root.style.setProperty('--navy-2', secondary);
      root.style.setProperty('--navy-3', secondary);
      root.style.setProperty('--blue-dark', secondary);
    }
    if (accent && isValidHexColor(accent)) {
      root.style.setProperty('--accent', accent);
    }
    if (background && isValidHexColor(background)) {
      root.style.setProperty('--bg', background);
      if (document.body) {
        document.body.style.backgroundColor = background;
      }
    }
    if (text && isValidHexColor(text)) {
      root.style.setProperty('--t1', text);
      if (document.body) {
        document.body.style.color = text;
      }
    }
  }, []);

  const applyTenant = useCallback((tenantData) => {
    if (!tenantData || !(tenantData.id || tenantData._id || tenantData.name)) return;
    setTenant((prev) => {
      const next = { ...(prev || {}), ...tenantData };
      if (prev?.settings || tenantData.settings) {
        next.settings = {
          ...(prev?.settings || {}),
          ...(tenantData.settings || {}),
          branding: {
            ...(prev?.settings?.branding || {}),
            ...(tenantData.settings?.branding || {}),
          },
        };
      }
      return next;
    });
    applyBranding(tenantData.settings?.branding);
    if (tenantData.slug) {
      localStorage.setItem('ff_tenant_slug', tenantData.slug);
    }
  }, [applyBranding]);

  const fetchTenant = useCallback(async () => {
    if (!user) {
      setTenant(null);
      setLoading(false);
      return;
    }
    try {
      const res = await getTenantMe();
      applyTenant(res.data?.tenant || res.data);
    } catch (err) {
      console.warn('[TenantContext] Failed to load tenant details', err.message);
    } finally {
      setLoading(false);
    }
  }, [user, applyTenant]);

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

  const currency = 'EGP';
  const timezone = tenant?.settings?.locale?.timezone || 'Africa/Cairo';

  const value = {
    tenant,
    loading,
    refreshTenant: fetchTenant,
    applyTenant,
    applyBranding,
    hasFeature,
    enabledActivities,
    currency,
    timezone,
    branding: tenant?.settings?.branding || {},
    plan: tenant?.plan,
    limits: tenant?.effectiveLimits || {},
    usage: tenant?.usage || {},
    roleAccess: tenant?.roleAccess || EMPTY_OBJECT,
    accessCatalog: tenant?.accessCatalog || EMPTY_LIST,
    checklistRoles: tenant?.checklistRoles || EMPTY_LIST,
    roleDefaults: tenant?.roleDefaults || EMPTY_OBJECT,
    effectiveAccess: tenant?.effectiveAccess || EMPTY_LIST,
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
