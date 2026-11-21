import { hasAccess } from './access.js';
import { featureKeys, guardForPath } from './canSeeRoute.js';

export const FEATURE_TRIAL_ACCESS_KEY = 'request_feature_trials';

const DEFAULT_ROLES = new Set(['Owner', 'General Manager']);

/** Owner/GM always; others need Access Control grant. */
export function canRequestFeatureTrials(user) {
  if (!user) return false;
  if (DEFAULT_ROLES.has(user.role)) return true;
  return hasAccess(user, FEATURE_TRIAL_ACCESS_KEY);
}

/**
 * Who may browse locked (out-of-plan) modules at all.
 * Actual nav visibility also requires the feature key in showOutOfPlan.
 */
export function canSeeLockedFeatures(user) {
  return canRequestFeatureTrials(user);
}

/** True when platform allow-listed this out-of-plan feature for gym preview. */
export function isOutOfPlanVisible(featureKey, showOutOfPlanKeys) {
  if (!featureKey) return false;
  const allowed = Array.isArray(showOutOfPlanKeys) ? showOutOfPlanKeys : [];
  return allowed.includes(featureKey);
}

/**
 * Keep a locked nav item only when the user may request trials and at least
 * one of the route's plan feature keys is in the platform allow-list.
 * Default (empty list) = hide all out-of-plan items.
 */
export function canShowLockedNavTarget(user, target, showOutOfPlanKeys) {
  if (!canSeeLockedFeatures(user)) return false;
  const guard = typeof target === 'string' ? guardForPath(target) : target;
  const keys = featureKeys(guard?.feature);
  if (!keys.length) return false;
  const allowed = Array.isArray(showOutOfPlanKeys) ? showOutOfPlanKeys : [];
  if (!allowed.length) return false;
  return keys.some((key) => allowed.includes(key));
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
