import { hasAccess } from './access.js';

export const FEATURE_TRIAL_ACCESS_KEY = 'request_feature_trials';

const DEFAULT_ROLES = new Set(['Owner', 'General Manager']);

/** Owner/GM always; others need Access Control grant. */
export function canRequestFeatureTrials(user) {
  if (!user) return false;
  if (DEFAULT_ROLES.has(user.role)) return true;
  return hasAccess(user, FEATURE_TRIAL_ACCESS_KEY);
}

export function canSeeLockedFeatures(user) {
  return canRequestFeatureTrials(user);
}

export function lockedCatalogEntry(catalog, featureKey) {
  if (!featureKey || !Array.isArray(catalog)) return null;
  return catalog.find((row) => row.key === featureKey) || null;
}

export function formatTrialEndsAt(endsAt) {
  if (!endsAt) return '';
  try {
    return new Date(endsAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(endsAt);
  }
}
