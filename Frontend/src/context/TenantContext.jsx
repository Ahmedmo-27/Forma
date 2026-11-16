import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { getTenantMe } from '../api/endpoints';
import { useAuth } from './AuthContext';
import {  normalizeHexColor } from '../lib/validation';
import WorkspaceBoot from '../components/WorkspaceBoot';

const TenantContext = createContext(null);

const DEFAULT_ACTIVITIES = ['gym', 'crossfit', 'box', 'mma', 'kickboxing', 'calisthenics'];
const FORMA_PALETTE = {
  navbar: '#142843',
  primary: '#142843',
  secondary: '#1E3A5F',
  accent: '#1E3A5F',
  background: '#FCF3E2',
  text: '#142843',
  icon: '#142843',
};
const LEAP_STARTER = new Set(['#44298c', '#1e1535', '#5b38ba', '#6d47cc', '#160f2a', '#f4f5f7']);

function workspacePalette(palette) {
  if (!palette) return FORMA_PALETTE;
  const primary = String(palette.primary || '').trim().toLowerCase();
  const navbar = String(palette.navbar || '').trim().toLowerCase();
  if ((!primary && !navbar) || LEAP_STARTER.has(primary) || LEAP_STARTER.has(navbar)) {
    return FORMA_PALETTE;
  }
  return palette;
}
const EMPTY_OBJECT = {};
const EMPTY_LIST = [];

function signedInUserId(user) {
  if (!user) return null;
  return String(user._id || user.id || 'signed-in');
}

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
  const userId = signedInUserId(user);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paletteUserId, setPaletteUserId] = useState(null);

  const applyBranding = useCallback((branding) => {
    const palette = workspacePalette(branding?.palette);
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
            palette: workspacePalette(
              tenantData.settings?.branding?.palette || prev?.settings?.branding?.palette
            ),
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
    const requestUserId = signedInUserId(user);
    if (!requestUserId) {
      setTenant(null);
      clearBrandingOverrides();
      setPaletteUserId(null);
      setLoading(false);
      return;
    }
    try {
      const res = await getTenantMe();
      if (userIdRef.current !== requestUserId) return;
      applyTenant(res.data?.tenant || res.data);
    } catch (err) {
      console.warn('[TenantContext] Failed to load tenant details', err.message);
    } finally {
      if (userIdRef.current === requestUserId) {
        setPaletteUserId(requestUserId);
        setLoading(false);
      }
    }
  }, [user, applyTenant]);

  useLayoutEffect(() => {
    if (userId) return;
    clearBrandingOverrides();
    setPaletteUserId(null);
  }, [userId]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  const hasFeature = useCallback((featureKey) => {
    if (!tenant) return true; // optimistic fallback while loading or single-tenant mode
    return Array.isArray(tenant.effectiveFeatures) && tenant.effectiveFeatures.includes(featureKey);
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

  const brandingPending = Boolean(userId) && paletteUserId !== userId;

  return (
    <TenantContext.Provider value={value}>
      {brandingPending ? <WorkspaceBoot /> : children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside TenantProvider');
  return ctx;
}
