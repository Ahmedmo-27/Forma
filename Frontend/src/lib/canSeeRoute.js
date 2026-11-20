import { TENANT_GUARDS } from './tenantGuards.js';
import { canEnterRoute } from './routeAccess.js';

/** A guard's `feature` may be one plan feature key or a list where any one unlocks the page. */
export function featureKeys(feature) {
  if (!feature) return [];
  return Array.isArray(feature) ? feature : [feature];
}

/** True when the gym has the feature, or any of them for a list. No feature means always allowed. */
export function featureAllowed(hasFeature, feature) {
  const keys = featureKeys(feature);
  if (!keys.length) return true;
  const check = typeof hasFeature === 'function' ? hasFeature : () => true;
  return keys.some((key) => check(key));
}

const EXACT = new Map(TENANT_GUARDS.map((guard) => [guard.path, guard]));
const PATTERNS = TENANT_GUARDS
  .filter((guard) => guard.path.includes(':'))
  .map((guard) => ({
    guard,
    pattern: new RegExp(`^${guard.path.replace(/:[^/]+/g, '[^/]+')}$`),
  }));

/** The guard that protects a path (static routes first, then `:param` routes). */
export function guardForPath(path) {
  const clean = String(path || '').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (EXACT.has(clean)) return EXACT.get(clean);
  const match = PATTERNS.find((entry) => entry.pattern.test(clean));
  return match ? match.guard : null;
}

/**
 * Plan check for a path or guard. Paths with no guard (custom nav extras)
 * are not plan-gated here.
 */
export function routeFeatureAllowed(hasFeature, target) {
  const guard = typeof target === 'string' ? guardForPath(target) : target;
  if (!guard) return true;
  return featureAllowed(hasFeature, guard.feature);
}

/**
 * One check for "may this person see and open this page": signed in, role and
 * access keys, and the gym's plan features. Used by nav, hubs, and route guards.
 */
export function canSeeRoute(user, hasFeature, target) {
  if (!user) return false;
  const guard = typeof target === 'string' ? guardForPath(target) : target;
  if (!guard) return true;
  return canEnterRoute(user, guard) && featureAllowed(hasFeature, guard.feature);
}
