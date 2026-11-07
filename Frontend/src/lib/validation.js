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

/** Intake cap for images and PDFs. The server compresses them down to the stored limit. */
export const UPLOAD_INTAKE_MB = 15;

export const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
export const DOCUMENT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
export const LOGO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
export const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
export const DOCUMENT_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.pdf';
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg';

const CODE_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'pht',
  'html', 'htm', 'xhtml', 'svg', 'xml',
  'exe', 'dll', 'so', 'bat', 'cmd', 'ps1', 'sh', 'bash',
  'py', 'rb', 'pl', 'cgi', 'asp', 'aspx', 'jsp', 'jar', 'wasm',
  'vbs', 'wsf', 'hta', 'scr', 'com', 'msi',
]);

function fileBaseName(name) {
  return String(name || '').replace(/\\/g, '/').split('/').pop() || '';
}

function dangerousNameError(name, { allowSvg = false } = {}) {
  const base = fileBaseName(name);
  if (!base || base.includes('\0')) return 'Invalid file name';
  const parts = base.toLowerCase().split('.');
  if (parts.length < 2 || !parts[0]) return 'This file type is not allowed';
  const extensions = parts.slice(1);
  const finalExt = extensions[extensions.length - 1];
  for (const ext of extensions) {
    if (!CODE_EXTENSIONS.has(ext)) continue;
    if (ext === 'svg' && allowSvg && finalExt === 'svg') continue;
    return 'This file type is not allowed';
  }
  return null;
}

/**
 * Validate a file before upload.
 * Images and PDFs may be larger than the stored limit; the server compresses those.
 * Code extensions are refused even when they are hidden before a safe extension.
 * @param {File} file
 * @param {Object} options
 * @param {number} [options.maxSizeMB=15]
 * @param {string[]} [options.allowedExtensions]
 * @param {boolean} [options.allowSvg]
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFile(file, { maxSizeMB = UPLOAD_INTAKE_MB, allowedExtensions = [], allowSvg = false } = {}) {
  if (!file) {
    return { valid: false, error: 'Please select a file' };
  }

  const nameError = dangerousNameError(file.name, { allowSvg });
  if (nameError) return { valid: false, error: nameError };

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds the ${maxSizeMB} MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB selected)`
    };
  }

  if (allowedExtensions.length > 0) {
    const finalExt = `.${fileBaseName(file.name).toLowerCase().split('.').pop()}`;
    const extMatches = allowedExtensions.some(ext => ext.toLowerCase() === finalExt);
    if (!extMatches) {
      return {
        valid: false,
        error: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`
      };
    }
  }

  return { valid: true };
}
