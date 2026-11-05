const { randomBytes } = require("crypto");

/**
 * Sanitizes or generates a request tracking ID (prefixed with req_).
 * Attaches to req.requestId and outgoing X-Request-Id response header.
 */
function requestId(req, res, next) {
  const incoming = req.get("X-Request-Id") || req.get("x-request-id");
  let validId = null;

  if (incoming && typeof incoming === "string") {
    // Only allow alphanumeric, dash, and underscore, max 64 chars
    const cleaned = incoming.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    if (cleaned.length >= 4 && cleaned.length <= 64) {
      validId = cleaned.startsWith("req_") ? cleaned : `req_${cleaned}`;
    }
  }

  if (!validId) {
    validId = `req_${randomBytes(8).toString("hex")}`;
  }

  req.requestId = validId;
  res.setHeader("X-Request-Id", validId);
  next();
}

module.exports = requestId;
