import { useEffect } from 'react';
import { useLocationScope } from '../context/LocationContext';

/**
 * Like useEffect, but also re-runs when the navbar branch selector changes
 * (selectedLocationId / version from LocationContext).
 */
export default function useLocationEffect(effect, deps = []) {
  const { selectedLocationId, version } = useLocationScope();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, [...deps, selectedLocationId, version]);
}
