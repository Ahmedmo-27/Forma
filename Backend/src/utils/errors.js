const { ERROR_CODES } = require("./errorCodes");

/**
 * Base AppError
 * Represents an operational, safe error that can be converted to the unified envelope.
 */
class AppError extends Error {
  constructor(code, customMessage, status, details = {}, isOperational = true) {
    const codeDef = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
    const finalMessage = customMessage || codeDef.message;
    super(finalMessage);
    this.name = this.constructor.name;
    this.code = code || "INTERNAL_ERROR";
    this.status = status || codeDef.status || 500;
    this.details = details || {};
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = "Validation failed", fieldErrors = {}, details = {}) {
    super("VALIDATION_FAILED", message, 400, details);
    this.fieldErrors = fieldErrors;
  }
}

class AuthError extends AppError {
  constructor(code = "AUTH_TOKEN_INVALID", message, details = {}) {
    const status = code === "AUTH_ACCOUNT_LOCKED" ? 429 : 401;
    super(code, message, status, details);
  }
}

class ForbiddenError extends AppError {
  constructor(code = "AUTH_FORBIDDEN", message, details = {}) {
    super(code, message, 403, details);
  }
}

class FeatureNotInPlanError extends AppError {
  constructor(feature, message, requiredPlan = null) {
    const msg = message || `The '${feature}' feature is not included in your current subscription plan.`;
    super("FEATURE_NOT_IN_PLAN", msg, 403, { feature, requiredPlan });
    this.feature = feature;
  }
}

class PlanLimitError extends AppError {
  constructor(limit, current, max, message) {
    const msg = message || `You have reached your plan limit of ${max} for ${limit}. Upgrade your plan to increase limits.`;
    super("PLAN_LIMIT_REACHED", msg, 403, { limit, current, max });
    this.limit = limit;
    this.current = current;
    this.max = max;
  }
}

class SubscriptionError extends AppError {
  constructor(code = "TENANT_SUSPENDED", message, details = {}) {
    super(code, message, code === "TENANT_NOT_FOUND" ? 404 : 403, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = "Resource not found", details = {}) {
    super("RESOURCE_NOT_FOUND", message, 404, details);
  }
}

class ConflictError extends AppError {
  constructor(message = "A conflict occurred with an existing resource", details = {}) {
    super("CONFLICT_DUPLICATE", message, 409, details);
  }
}

class RateLimitError extends AppError {
  constructor(retryAfterSeconds = 60, message) {
    super("RATE_LIMITED", message || "Too many requests. Please slow down.", 429, { retryAfter: retryAfterSeconds });
    this.retryAfter = retryAfterSeconds;
  }
}

class PaymentError extends AppError {
  constructor(code = "BILLING_PAYMENT_FAILED", message, details = {}) {
    super(code, message, 402, details);
  }
}

class UploadError extends AppError {
  constructor(code = "UPLOAD_INVALID_TYPE", message, details = {}) {
    const status = code === "UPLOAD_FILE_TOO_LARGE" ? 413 : 400;
    super(code, message, status, details);
  }
}

class MaintenanceError extends AppError {
  constructor(message, estimatedResumeTime = null) {
    super("MAINTENANCE_MODE", message || "System is under scheduled maintenance.", 503, { estimatedResumeTime });
  }
}

class UpstreamError extends AppError {
  constructor(serviceName, message) {
    super("UPSTREAM_UNAVAILABLE", message || `Upstream service ${serviceName} is unavailable.`, 502, { serviceName });
  }
}

class InternalError extends AppError {
  constructor(message, details = {}) {
    super("INTERNAL_ERROR", message || "An internal error occurred.", 500, details, false);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  FeatureNotInPlanError,
  PlanLimitError,
  SubscriptionError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  PaymentError,
  UploadError,
  MaintenanceError,
  UpstreamError,
  InternalError,
};
