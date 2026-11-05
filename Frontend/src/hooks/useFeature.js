import { useTenant } from '../context/TenantContext';

/**
 * Hook to check if a specific feature is enabled in the current tenant's plan.
 * @param {string} featureKey
 * @returns {boolean}
 */
export function useFeature(featureKey) {
  const { hasFeature } = useTenant();
  return hasFeature(featureKey);
}

export default useFeature;
