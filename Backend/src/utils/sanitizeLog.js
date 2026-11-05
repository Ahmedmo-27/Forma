/**
 * Sensitive fields that must NEVER appear in logs or client-facing errors.
 */
const SENSITIVE_KEY_REGEX = /^(password|newPassword|confirmPassword|currentPassword|token|refreshToken|tempToken|authorization|secret|secretEncrypted|jwtSecret|nationalId|national_id|phones|phone|mobile|cardNumber|cvv|creditCard)$/i;

function sanitizeForLog(data, depth = 0) {
  if (depth > 5) return "[MaxDepth]";
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLog(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (value && typeof value === "object") {
      sanitized[key] = sanitizeForLog(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

module.exports = { sanitizeForLog };
