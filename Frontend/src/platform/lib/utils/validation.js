/**
 * Platform Superadmin Application Validation Helpers
 */

import { isValidEmail, isValidPhone, isPositiveNumber, isNonNegativeNumber, isPositiveInteger, isNonNegativeInteger } from '../../../lib/validation.js';

export { isValidEmail, isValidPhone, isPositiveNumber, isNonNegativeNumber, isPositiveInteger, isNonNegativeInteger };

// Tenant slug: 2 to 50 lowercase alphanumeric characters and hyphens
const SLUG_REGEX = /^[a-z0-9-]+$/;

export function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const trimmed = slug.trim().toLowerCase();
  return trimmed.length >= 2 && trimmed.length <= 50 && SLUG_REGEX.test(trimmed);
}

// Programmatic key format: lowercase alphanumeric, hyphens, and underscores
const KEY_REGEX = /^[a-z0-9-_]+$/;

export function isValidProgrammaticKey(key) {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim().toLowerCase();
  return trimmed.length >= 2 && trimmed.length <= 60 && KEY_REGEX.test(trimmed);
}

// Audit reasons require at least 5 non-whitespace characters
export function isValidAuditReason(reason) {
  if (!reason || typeof reason !== 'string') return false;
  return reason.trim().length >= 5;
}
