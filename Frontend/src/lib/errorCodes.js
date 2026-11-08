/**
 * ERROR_CODES - Client-side Error Codes definitions
 * Shared taxonomy between API backend and Frontend client.
 */

export const ERROR_CODES = {
  // Auth
  AUTH_INVALID_CREDENTIALS: {
    code: "AUTH_INVALID_CREDENTIALS",
    status: 401,
    category: "auth",
    retryable: true,
  },
  AUTH_ACCOUNT_LOCKED: {
    code: "AUTH_ACCOUNT_LOCKED",
    status: 429,
    category: "auth",
    retryable: false,
  },
  AUTH_MFA_REQUIRED: {
    code: "AUTH_MFA_REQUIRED",
    status: 401,
    category: "auth",
    retryable: true,
  },
  AUTH_MFA_INVALID_CODE: {
    code: "AUTH_MFA_INVALID_CODE",
    status: 400,
    category: "auth",
    retryable: true,
  },
  AUTH_MFA_RECOVERY_USED: {
    code: "AUTH_MFA_RECOVERY_USED",
    status: 200,
    category: "auth",
    retryable: false,
  },
  AUTH_TOKEN_EXPIRED: {
    code: "AUTH_TOKEN_EXPIRED",
    status: 401,
    category: "auth",
    retryable: true,
  },
  AUTH_TOKEN_INVALID: {
    code: "AUTH_TOKEN_INVALID",
    status: 401,
    category: "auth",
    retryable: false,
  },
  AUTH_WRONG_AUDIENCE: {
    code: "AUTH_WRONG_AUDIENCE",
    status: 401,
    category: "auth",
    retryable: false,
  },
  AUTH_SESSION_REVOKED: {
    code: "AUTH_SESSION_REVOKED",
    status: 401,
    category: "auth",
    retryable: false,
  },
  AUTH_IP_NOT_ALLOWED: {
    code: "AUTH_IP_NOT_ALLOWED",
    status: 403,
    category: "auth",
    retryable: false,
  },
  AUTH_FORBIDDEN: {
    code: "AUTH_FORBIDDEN",
    status: 403,
    category: "auth",
    retryable: false,
  },

  // Tenant / Plan
  TENANT_NOT_FOUND: {
    code: "TENANT_NOT_FOUND",
    status: 404,
    category: "tenant",
    retryable: false,
  },
  TENANT_SUSPENDED: {
    code: "TENANT_SUSPENDED",
    status: 403,
    category: "tenant",
    retryable: false,
  },
  TENANT_CANCELLED: {
    code: "TENANT_CANCELLED",
    status: 403,
    category: "tenant",
    retryable: false,
  },
  SUBSCRIPTION_PAST_DUE: {
    code: "SUBSCRIPTION_PAST_DUE",
    status: 403,
    category: "tenant",
    retryable: false,
  },
  TRIAL_EXPIRED: {
    code: "TRIAL_EXPIRED",
    status: 403,
    category: "tenant",
    retryable: false,
  },
  MAINTENANCE_MODE: {
    code: "MAINTENANCE_MODE",
    status: 503,
    category: "tenant",
    retryable: true,
  },
  FEATURE_NOT_IN_PLAN: {
    code: "FEATURE_NOT_IN_PLAN",
    status: 403,
    category: "tenant",
    retryable: false,
  },
  PLAN_LIMIT_REACHED: {
    code: "PLAN_LIMIT_REACHED",
    status: 403,
    category: "tenant",
    retryable: false,
  },
  ROLE_NOT_IN_PLAN: {
    code: "ROLE_NOT_IN_PLAN",
    status: 403,
    category: "tenant",
    retryable: false,
  },

  // Billing
  BILLING_PAYMENT_PENDING: {
    code: "BILLING_PAYMENT_PENDING",
    status: 402,
    category: "billing",
    retryable: true,
  },
  BILLING_PAYMENT_FAILED: {
    code: "BILLING_PAYMENT_FAILED",
    status: 402,
    category: "billing",
    retryable: true,
  },
  BILLING_DUPLICATE_PAYMENT_REF: {
    code: "BILLING_DUPLICATE_PAYMENT_REF",
    status: 409,
    category: "billing",
    retryable: false,
  },
  BILLING_SEATS_SOLD_OUT: {
    code: "BILLING_SEATS_SOLD_OUT",
    status: 409,
    category: "billing",
    retryable: false,
  },
  BILLING_COUPON_INVALID: {
    code: "BILLING_COUPON_INVALID",
    status: 400,
    category: "billing",
    retryable: true,
  },
  BILLING_DOWNGRADE_DISALLOWED: {
    code: "BILLING_DOWNGRADE_DISALLOWED",
    status: 400,
    category: "billing",
    retryable: false,
  },
  BILLING_REFUND_WINDOW_CLOSED: {
    code: "BILLING_REFUND_WINDOW_CLOSED",
    status: 400,
    category: "billing",
    retryable: false,
  },
  BILLING_INVOICE_NOT_FOUND: {
    code: "BILLING_INVOICE_NOT_FOUND",
    status: 404,
    category: "billing",
    retryable: false,
  },

  // Front Desk Check-in
  CHECKIN_MEMBER_BLOCKED: {
    code: "CHECKIN_MEMBER_BLOCKED",
    status: 403,
    category: "front_desk",
    retryable: false,
  },
  CHECKIN_MEMBERSHIP_EXPIRED: {
    code: "CHECKIN_MEMBERSHIP_EXPIRED",
    status: 400,
    category: "front_desk",
    retryable: false,
  },
  CHECKIN_NO_SESSIONS_LEFT: {
    code: "CHECKIN_NO_SESSIONS_LEFT",
    status: 400,
    category: "front_desk",
    retryable: false,
  },
  CHECKIN_UNKNOWN_BARCODE: {
    code: "CHECKIN_UNKNOWN_BARCODE",
    status: 404,
    category: "front_desk",
    retryable: true,
  },
  CHECKIN_SCANNER_PERMISSION: {
    code: "CHECKIN_SCANNER_PERMISSION",
    status: 400,
    category: "front_desk",
    retryable: true,
  },

  // Data & Conflict
  VALIDATION_FAILED: {
    code: "VALIDATION_FAILED",
    status: 400,
    category: "data",
    retryable: true,
  },
  CONFLICT_DUPLICATE: {
    code: "CONFLICT_DUPLICATE",
    status: 409,
    category: "data",
    retryable: true,
  },
  WHATSAPP_NOT_CONNECTED: {
    code: "WHATSAPP_NOT_CONNECTED",
    status: 409,
    category: "data",
    retryable: true,
  },
  WHATSAPP_NOT_ON_WHATSAPP: {
    code: "WHATSAPP_NOT_ON_WHATSAPP",
    status: 400,
    category: "data",
    retryable: false,
  },
  RESOURCE_NOT_FOUND: {
    code: "RESOURCE_NOT_FOUND",
    status: 404,
    category: "data",
    retryable: false,
  },
  VERSION_CONFLICT: {
    code: "VERSION_CONFLICT",
    status: 409,
    category: "data",
    retryable: true,
  },
  CANNOT_DELETE_IN_USE: {
    code: "CANNOT_DELETE_IN_USE",
    status: 409,
    category: "data",
    retryable: false,
  },
  INVALID_ID: {
    code: "INVALID_ID",
    status: 400,
    category: "data",
    retryable: false,
  },

  // Files & Imports
  UPLOAD_FILE_TOO_LARGE: {
    code: "UPLOAD_FILE_TOO_LARGE",
    status: 413,
    category: "files",
    retryable: true,
  },
  UPLOAD_INVALID_TYPE: {
    code: "UPLOAD_INVALID_TYPE",
    status: 400,
    category: "files",
    retryable: true,
  },
  UPLOAD_MAGIC_MISMATCH: {
    code: "UPLOAD_MAGIC_MISMATCH",
    status: 400,
    category: "files",
    retryable: true,
  },
  STORAGE_UNAVAILABLE: {
    code: "STORAGE_UNAVAILABLE",
    status: 503,
    category: "files",
    retryable: true,
  },
  IMPORT_ROW_ERRORS: {
    code: "IMPORT_ROW_ERRORS",
    status: 422,
    category: "files",
    retryable: true,
  },

  // Platform Console Operations
  PLATFORM_REASON_REQUIRED: {
    code: "PLATFORM_REASON_REQUIRED",
    status: 400,
    category: "platform",
    retryable: true,
  },
  IMPERSONATION_EXPIRED: {
    code: "IMPERSONATION_EXPIRED",
    status: 401,
    category: "platform",
    retryable: false,
  },
  IMPERSONATION_READ_ONLY: {
    code: "IMPERSONATION_READ_ONLY",
    status: 403,
    category: "platform",
    retryable: false,
  },
  LAST_SUPERADMIN_PROTECTED: {
    code: "LAST_SUPERADMIN_PROTECTED",
    status: 400,
    category: "platform",
    retryable: false,
  },
  CONFIRMATION_SLUG_MISMATCH: {
    code: "CONFIRMATION_SLUG_MISMATCH",
    status: 400,
    category: "platform",
    retryable: true,
  },
  PURGE_RETENTION_BLOCKED: {
    code: "PURGE_RETENTION_BLOCKED",
    status: 400,
    category: "platform",
    retryable: false,
  },

  // System & Network
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    status: 429,
    category: "system",
    retryable: true,
  },
  NETWORK_OFFLINE: {
    code: "NETWORK_OFFLINE",
    status: 0,
    category: "system",
    retryable: true,
  },
  REQUEST_TIMEOUT: {
    code: "REQUEST_TIMEOUT",
    status: 408,
    category: "system",
    retryable: true,
  },
  UPSTREAM_UNAVAILABLE: {
    code: "UPSTREAM_UNAVAILABLE",
    status: 502,
    category: "system",
    retryable: true,
  },
  ROUTE_NOT_FOUND: {
    code: "ROUTE_NOT_FOUND",
    status: 404,
    category: "system",
    retryable: false,
  },
  INVALID_JSON: {
    code: "INVALID_JSON",
    status: 400,
    category: "system",
    retryable: true,
  },
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    status: 500,
    category: "system",
    retryable: true,
  },
};
