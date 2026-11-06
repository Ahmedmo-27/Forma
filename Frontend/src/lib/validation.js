/**
 * Core Gym Application Validation Helpers
 * Provides standardized, reusable validation functions aligned with backend schemas.
 */

// Email regex matching standard RFC 5322 simplified pattern
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Standard phone format allowing digits, +, -, spaces, parentheses (5-40 chars)
const PHONE_CHARS_REGEX = /^[+0-9\s\-()]+$/;

// Hex color regex (#RGB, #RRGGBB)
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.length <= 200 && EMAIL_REGEX.test(trimmed);
}

export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  return trimmed.length >= 5 && trimmed.length <= 40 && PHONE_CHARS_REGEX.test(trimmed);
}

export function isValidHexColor(color) {
  if (!color || typeof color !== 'string') return false;
  return HEX_COLOR_REGEX.test(color.trim());
}

export function isValidDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export function isDateInFuture(dateStr) {
  if (!isValidDate(dateStr)) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getTime() > now.getTime();
}

export function isPositiveNumber(val) {
  if (val === '' || val === null || val === undefined) return false;
  const n = Number(val);
  return !isNaN(n) && Number.isFinite(n) && n > 0;
}

export function isNonNegativeNumber(val) {
  if (val === '' || val === null || val === undefined) return false;
  const n = Number(val);
  return !isNaN(n) && Number.isFinite(n) && n >= 0;
}

export function isPositiveInteger(val) {
  if (!isPositiveNumber(val)) return false;
  const n = Number(val);
  return Number.isInteger(n);
}

export function isNonNegativeInteger(val) {
  if (!isNonNegativeNumber(val)) return false;
  const n = Number(val);
  return Number.isInteger(n);
}

/**
 * Validate a file before upload
 * @param {File} file
 * @param {Object} options
 * @param {number} [options.maxSizeMB=5] - Maximum size in megabytes
 * @param {string[]} [options.allowedMimePrefixes] - E.g. ['image/']
 * @param {string[]} [options.allowedExtensions] - E.g. ['.xlsx', '.xls', '.csv', '.pdf']
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFile(file, { maxSizeMB = 5, allowedMimePrefixes = [], allowedExtensions = [] } = {}) {
  if (!file) {
    return { valid: false, error: 'Please select a file' };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds the ${maxSizeMB} MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB selected)`
    };
  }

  if (allowedMimePrefixes.length > 0) {
    const mimeMatches = allowedMimePrefixes.some(prefix => file.type && file.type.startsWith(prefix));
    const extMatches = allowedExtensions.some(ext => file.name && file.name.toLowerCase().endsWith(ext.toLowerCase()));

    if (!mimeMatches && !extMatches) {
      return {
        valid: false,
        error: `Invalid file type. Allowed: ${[...allowedMimePrefixes, ...allowedExtensions].join(', ')}`
      };
    }
  } else if (allowedExtensions.length > 0) {
    const extMatches = allowedExtensions.some(ext => file.name && file.name.toLowerCase().endsWith(ext.toLowerCase()));
    if (!extMatches) {
      return {
        valid: false,
        error: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`
      };
    }
  }

  return { valid: true };
}
