const logger = require("../utils/logger");
const { sanitizeForLog } = require("../utils/sanitizeLog");

const SENSITIVE_PATHS = ["/api/users/login", "/api/users/register", "/api/users/staff", "/api/platform/auth"];

function requestLogger(req, res, next) {
  const start = Date.now();
  const isAuthRoute = SENSITIVE_PATHS.some((p) => req.originalUrl.startsWith(p));

  let responseBody;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const errorCode = responseBody?.error?.code || responseBody?.code || (res.statusCode >= 400 ? `HTTP_${res.statusCode}` : null);
    const tenantId = req.user?.tenantId || req.tenant?._id?.toString() || req.get("x-tenant-slug") || null;
    const userId = req.user?.id || req.platformUser?.id || null;

    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.get("user-agent"),
      userId,
      userRole: req.user?.role || req.platformUser?.role,
      tenantId,
      code: errorCode,
    };

    if (Object.keys(req.query || {}).length) {
      meta.query = sanitizeForLog(req.query);
    }

    if (res.statusCode >= 400) {
      const reason = responseBody?.error?.message || responseBody?.message;
      if (reason) meta.reason = reason;
      if (responseBody?.error?.details) meta.details = sanitizeForLog(responseBody.error.details);
    }

    if (res.statusCode >= 500) {
      if (req.body && typeof req.body === "object") {
        meta.body = sanitizeForLog(req.body);
      }
      if (req._lastErrorStack) {
        meta.stack = req._lastErrorStack;
      }
    }

    if (isAuthRoute) {
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger.auth(level, "Auth HTTP request", meta);
      return;
    }

    if (res.statusCode >= 500) {
      logger.error("http", "Request failed", meta);
    } else if (res.statusCode >= 400) {
      logger.warn("http", "Request rejected", meta);
    } else {
      logger.info("http", "Request completed", meta);
    }
  });

  next();
}

module.exports = requestLogger;
