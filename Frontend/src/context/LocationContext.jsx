import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listLocations } from '../api/endpoints';
import { useAuth } from './AuthContext';
import { useTenant } from './TenantContext';

const LocationContext = createContext(null);
const STORAGE_KEY = 'ff_location_id';
export const ALL_LOCATIONS = 'all';

export function LocationProvider({ children }) {
  const { user } = useAuth();
  const { hasFeature, loading: tenantLoading, tenant, plan } = useTenant();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [canManageLocations, setCanManageLocations] = useState(false);
  const [canAccessAllLocations, setCanAccessAllLocations] = useState(false);
  const [selectedLocationId, setSelectedLocationIdState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || ALL_LOCATIONS;
    } catch {
      return ALL_LOCATIONS;
    }
  });
  const [version, setVersion] = useState(0);

  const planKey = String(plan?.key || tenant?.plan?.key || '').toLowerCase();
  const multiEnabled = Boolean(
    user && (hasFeature?.('multi_branches') || planKey === 'gold' || planKey === 'platinum')
  );

  const refreshLocations = useCallback(async () => {
    if (!user || !multiEnabled) {
      setLocations([]);
      setCanManageLocations(false);
      setCanAccessAllLocations(user?.role === 'Owner' || user?.canAccessAllLocations === true);
      return [];
    }
    setLoading(true);
    try {
      const { data } = await listLocations();
      const list = data?.locations || [];
      setLocations(list);
      setCanManageLocations(Boolean(data?.canManage));
      setCanAccessAllLocations(Boolean(data?.canAccessAllLocations) || user?.role === 'Owner');
      return list;
    } catch {
      setLocations([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user, multiEnabled]);

  useEffect(() => {
    if (tenantLoading) return;
    refreshLocations();
  }, [tenantLoading, refreshLocations]);

  // Validate selection against available locations
  useEffect(() => {
    if (!multiEnabled) {
      if (selectedLocationId !== ALL_LOCATIONS) {
        setSelectedLocationIdState(ALL_LOCATIONS);
        try { localStorage.setItem(STORAGE_KEY, ALL_LOCATIONS); } catch { /* ignore */ }
      }
      return;
    }
    if (selectedLocationId === ALL_LOCATIONS) return;
    if (!locations.length) return;
    const ok = locations.some((loc) => String(loc._id) === String(selectedLocationId));
    if (!ok) {
      setSelectedLocationIdState(ALL_LOCATIONS);
      try { localStorage.setItem(STORAGE_KEY, ALL_LOCATIONS); } catch { /* ignore */ }
    }
  }, [locations, multiEnabled, selectedLocationId]);

  const setSelectedLocationId = useCallback((id) => {
    const next = id == null || id === '' ? ALL_LOCATIONS : String(id);
    setSelectedLocationIdState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    setVersion((v) => v + 1);
  }, []);

  const selectedLocation = useMemo(() => {
    if (selectedLocationId === ALL_LOCATIONS) return null;
    return locations.find((loc) => String(loc._id) === String(selectedLocationId)) || null;
  }, [locations, selectedLocationId]);

  const showSwitcher = multiEnabled && (canAccessAllLocations || locations.length > 0);

  const value = useMemo(() => ({
    locations,
    loading,
    multiEnabled,
    showSwitcher,
    canManageLocations,
    canAccessAllLocations,
    selectedLocationId,
    selectedLocation,
    setSelectedLocationId,
    refreshLocations,
    version,
    ALL_LOCATIONS,
  }), [
    locations,
    loading,
    multiEnabled,
    showSwitcher,
    canManageLocations,
    canAccessAllLocations,
    selectedLocationId,
    selectedLocation,
    setSelectedLocationId,
    refreshLocations,
    version,
  ]);

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationScope() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    return {
      locations: [],
      loading: false,
      multiEnabled: false,
      showSwitcher: false,
      canManageLocations: false,
      canAccessAllLocations: false,
      selectedLocationId: ALL_LOCATIONS,
      selectedLocation: null,
      setSelectedLocationId: () => {},
      refreshLocations: async () => [],
      version: 0,
      ALL_LOCATIONS,
    };
  }
  return ctx;
}
