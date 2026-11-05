const logger = require("../utils/logger");
const { ERROR_CODES } = require("../utils/errorCodes");
const { sanitizeForLog } = require("../utils/sanitizeLog");

/**
 * Normalizes field errors from Zod issues into { [field]: string[] }
 */
function formatZodFieldErrors(issues = []) {
  const fieldErrors = {};
  for (const issue of issues) {
    const fieldPath = issue.path?.join(".") || "_form";
    if (!fieldErrors[fieldPath]) {
      fieldErrors[fieldPath] = [];
    }
    fieldErrors[fieldPath].push(issue.message || "Invalid value");
  }
  return fieldErrors;
}

/**
 * Central Express Error Middleware
 * Catches all errors, formats them into the standard error envelope,
 * prevents internal leakage, and maintains transitional compatibility.
 */
function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    return;
  }

  const requestId = req.requestId || (typeof req.get === "function" && req.get("x-request-id")) || "req_unknown";
  req._lastErrorStack = err.stack;

  let code = "INTERNAL_ERROR";
  let status = 500;
  let safeMessage = ERROR_CODES.INTERNAL_ERROR.message;
  let safeDetails = {};
  let fieldErrors = null;
  let retryAfter = null;
  let docsKey = null;

  // 1. AppError and subclasses
  if (err.isOperational && err.code) {
    code = err.code;
    status = err.status || ERROR_CODES[code]?.status || 400;
    safeMessage = err.message || ERROR_CODES[code]?.message || "Request failed";
    safeDetails = err.details ? sanitizeForLog(err.details) : {};
    if (err.fieldErrors) fieldErrors = err.fieldErrors;
    if (err.retryAfter != null) retryAfter = err.retryAfter;
    if (err.docsKey) docsKey = err.docsKey;
  }
  // 2. Zod Validation Error
  else if (err.name === "ZodError" || (err.issues && Array.isArray(err.issues))) {
    code = "VALIDATION_FAILED";
    status = 400;
    safeMessage = "Validation failed. Please correct the invalid fields.";
    fieldErrors = formatZodFieldErrors(err.issues);
    safeDetails = { count: err.issues?.length || 0 };
  }
  // 3. Mongoose Duplicate Key (E11000)
  else if (err.code === 11000 || (err.name === "MongoServerError" && err.code === 11000)) {
    code = "CONFLICT_DUPLICATE";
    status = 409;
    const rawKeys = err.keyPattern ? Object.keys(err.keyPattern) : [];
    const duplicateField = rawKeys.filter((k) => k !== "tenantId")[0] || "record";
    safeMessage = `A record with this ${duplicateField} already exists.`;
    safeDetails = { field: duplicateField };
  }
  // 4. Mongoose CastError (e.g. invalid ObjectId)
  else if (err.name === "CastError") {
    code = "INVALID_ID";
    status = 400;
    safeMessage = "The provided identifier is invalid.";
    safeDetails = { field: err.path || "id" };
  }
  // 5. Mongoose ValidationError
  else if (err.name === "ValidationError" && err.errors) {
    code = "VALIDATION_FAILED";
    status = 400;
    safeMessage = "Validation failed. Please correct the invalid fields.";
    fieldErrors = {};
    for (const [key, val] of Object.entries(err.errors)) {
      fieldErrors[key] = [val.message || "Invalid value"];
    }
  }
  // 6. JWT Errors
  else if (err.name === "TokenExpiredError") {
    code = "AUTH_TOKEN_EXPIRED";
    status = 401;
    safeMessage = "Your session has expired. Please sign in again.";
  } else if (err.name === "JsonWebTokenError" || err.name === "NotBeforeError") {
    code = "AUTH_TOKEN_INVALID";
    status = 401;
    safeMessage = "Authentication token is invalid or corrupted.";
  }
  // 7. Multer Upload Errors
  else if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      code = "UPLOAD_FILE_TOO_LARGE";
      status = 413;
      safeMessage = "File too large. Maximum size is 5 MB.";
    } else {
      code = "UPLOAD_INVALID_TYPE";
      status = 400;
      safeMessage = err.message || "Invalid file upload.";
    }
    safeDetails = { multerCode: err.code };
  }
  // 8. JSON Body Parse Syntax Error
  else if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    code = "INVALID_JSON";
    status = 400;
    safeMessage = "Malformed JSON payload in request body.";
  }
  // 9. Legacy explicit status on error (e.g., from other libraries)
  else if (err.status && typeof err.status === "number" && err.status < 500) {
    status = err.status;
    code = status === 404 ? "RESOURCE_NOT_FOUND" : status === 403 ? "AUTH_FORBIDDEN" : "REQUEST_FAILED";
    safeMessage = err.message || "Request failed";
  }
  // 10. Unknown / 500 Unhandled Error
  else {
    code = "INTERNAL_ERROR";
    status = 500;
    safeMessage = ERROR_CODES.INTERNAL_ERROR.message;
  }

  // Structured Server Logging
  const logMeta = {
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    status,
    code,
    userId: req.user?.id || req.platformUser?.id,
    userRole: req.user?.role || req.platformUser?.role,
    tenantId: req.user?.tenantId || req.tenant?._id?.toString() || (typeof req.get === "function" ? req.get("x-tenant-slug") : undefined),
    error: err.message,
    ...(status >= 500 && { stack: err.stack }),
  };

  if (status >= 500) {
    logger.error("http", "Unhandled request error", logMeta);
  } else {
    logger.warn("http", "Request operational rejection", logMeta);
  }

  // Construct Standard Error Envelope
  const errorEnvelope = {
    code,
    message: safeMessage,
    status,
    requestId,
    ...(safeDetails && Object.keys(safeDetails).length > 0 && { details: safeDetails }),
    ...(fieldErrors && Object.keys(fieldErrors).length > 0 && { fieldErrors }),
    ...(retryAfter != null && { retryAfter }),
    ...(docsKey && { docsKey }),
  };

  // Transitional Compatibility Response Payload:
  // Includes envelope under .error and keeps top-level fields for legacy tests / clients
  const responsePayload = {
    error: errorEnvelope,
    message: safeMessage,
    code,
    ...safeDetails,
    ...(fieldErrors && { errors: fieldErrors, fieldErrors }),
    ...(retryAfter != null && { retryAfter }),
  };

  return res.status(status).json(responsePayload);
}

module.exports = errorHandler;
