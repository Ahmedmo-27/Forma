import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getTenantMe } from '../api/endpoints';
import { useAuth } from './AuthContext';
import { isValidHexColor, normalizeHexColor } from '../lib/validation';

const TenantContext = createContext(null);

const DEFAULT_ACTIVITIES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];
const EMPTY_OBJECT = {};
const EMPTY_LIST = [];

function clearBrandingOverrides() {
  const root = document.documentElement;
  [
    '--nav-bg', '--nav-tab-bg', '--navy', '--blue',
    '--navy-2', '--navy-3', '--blue-dark', '--accent', '--bg', '--t1', '--icon',
  ].forEach((name) => root.style.removeProperty(name));
  if (document.body) {
    document.body.style.backgroundColor = '';
    document.body.style.color = '';
  }
}

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyBranding = useCallback((branding) => {
    const palette = branding?.palette;
    if (!palette) {
      clearBrandingOverrides();
      return;
    }
    const { navbar, primary, secondary, accent, background, text, icon } = palette;
    const root = document.documentElement;

    const normNav = normalizeHexColor(navbar);
    if (normNav) {
      root.style.setProperty('--nav-bg', normNav);
      root.style.setProperty('--nav-tab-bg', `color-mix(in srgb, ${normNav} 82%, #000000)`);
    }
    const normPrimary = normalizeHexColor(primary);
    if (normPrimary) {
      root.style.setProperty('--navy', normPrimary);
      root.style.setProperty('--blue', normPrimary);
    }
    const normSecondary = normalizeHexColor(secondary);
    if (normSecondary) {
      root.style.setProperty('--navy-2', normSecondary);
      root.style.setProperty('--navy-3', normSecondary);
      root.style.setProperty('--blue-dark', normSecondary);
    }
    const normAccent = normalizeHexColor(accent);
    if (normAccent) {
      root.style.setProperty('--accent', normAccent);
    }
    const normBg = normalizeHexColor(background);
    if (normBg) {
      root.style.setProperty('--bg', normBg);
      if (document.body) {
        document.body.style.backgroundColor = normBg;
      }
    }
    const normText = normalizeHexColor(text);
    if (normText) {
      root.style.setProperty('--t1', normText);
      if (document.body) {
        document.body.style.color = normText;
      }
    }
    const normIcon = normalizeHexColor(icon) || normPrimary || normText;
    if (normIcon) {
      root.style.setProperty('--icon', normIcon);
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
      clearBrandingOverrides();
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

  const currency = tenant?.settings?.locale?.currency || 'EGP';
  const countryCode = tenant?.settings?.locale?.countryCode || '20';
  const timezone = tenant?.settings?.locale?.timezone || 'Africa/Cairo';

  const formatMoney = useCallback((amount) => {
    const num = Number(amount) || 0;
    return `${num.toLocaleString()} ${currency}`;
  }, [currency]);

  const value = {
    tenant,
    loading,
    refreshTenant: fetchTenant,
    applyTenant,
    applyBranding,
    hasFeature,
    enabledActivities,
    currency,
    countryCode,
    timezone,
    formatMoney,
    branding: tenant?.settings?.branding || {},
    plan: tenant?.plan,
    limits: tenant?.limits || tenant?.effectiveLimits || {},
    usage: tenant?.usage || {},
    roleAccess: tenant?.roleAccess || EMPTY_OBJECT,
    roleLocationAccess: tenant?.roleLocationAccess || EMPTY_OBJECT,
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
