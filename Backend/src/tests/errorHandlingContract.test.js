const { ERROR_CODES } = require("../utils/errorCodes");
const {
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
} = require("../utils/errors");
const errorHandler = require("../middleware/errorHandler");
const { sanitizeForLog } = require("../utils/sanitizeLog");

describe("Phase 5: Unified Error Handling Contract & Parity Suite", () => {
  describe("1. AppError Hierarchy & Status Codes", () => {
    it("maps each AppError subclass to its declared code, status and envelope structure", () => {
      const cases = [
        { err: new ValidationError("Bad data", { email: ["Invalid email"] }), expectedCode: "VALIDATION_FAILED", expectedStatus: 400 },
        { err: new AuthError("AUTH_TOKEN_EXPIRED"), expectedCode: "AUTH_TOKEN_EXPIRED", expectedStatus: 401 },
        { err: new ForbiddenError(), expectedCode: "AUTH_FORBIDDEN", expectedStatus: 403 },
        { err: new FeatureNotInPlanError("analytics", "Analytics not in plan", "Gold"), expectedCode: "FEATURE_NOT_IN_PLAN", expectedStatus: 403 },
        { err: new PlanLimitError("maxMembers", 300, 300), expectedCode: "PLAN_LIMIT_REACHED", expectedStatus: 403 },
        { err: new SubscriptionError("TENANT_SUSPENDED"), expectedCode: "TENANT_SUSPENDED", expectedStatus: 403 },
        { err: new NotFoundError("Member not found"), expectedCode: "RESOURCE_NOT_FOUND", expectedStatus: 404 },
        { err: new ConflictError("Slug taken"), expectedCode: "CONFLICT_DUPLICATE", expectedStatus: 409 },
        { err: new RateLimitError(30), expectedCode: "RATE_LIMITED", expectedStatus: 429 },
        { err: new PaymentError("BILLING_PAYMENT_FAILED"), expectedCode: "BILLING_PAYMENT_FAILED", expectedStatus: 402 },
        { err: new UploadError("UPLOAD_FILE_TOO_LARGE"), expectedCode: "UPLOAD_FILE_TOO_LARGE", expectedStatus: 413 },
        { err: new MaintenanceError("Maintenance in progress"), expectedCode: "MAINTENANCE_MODE", expectedStatus: 503 },
        { err: new UpstreamError("WhatsApp", "API unreachable"), expectedCode: "UPSTREAM_UNAVAILABLE", expectedStatus: 502 },
        { err: new InternalError("Fatal database crash"), expectedCode: "INTERNAL_ERROR", expectedStatus: 500 },
      ];

      for (const { err, expectedCode, expectedStatus } of cases) {
        expect(err.code).toBe(expectedCode);
        expect(err.status).toBe(expectedStatus);
        expect(err.name).toBe(err.constructor.name);

        const req = { originalUrl: "/test", method: "GET", requestId: "req_test_abc" };
        const res = {
          headersSent: false,
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        };

        errorHandler(err, req, res, () => {});

        expect(res.status).toHaveBeenCalledWith(expectedStatus);
        const payload = res.json.mock.calls[0][0];
        expect(payload.error).toBeDefined();
        expect(payload.error.code).toBe(expectedCode);
        expect(payload.error.status).toBe(expectedStatus);
        expect(payload.error.requestId).toBe("req_test_abc");
      }
    });
  });

  describe("2. Security: Anti-Enumeration & Zero Internals Leak", () => {
    it("ensures unhandled 500 exceptions never leak stack or sensitive database info to clients", () => {
      const sensitiveDbError = new Error("MongoError: connection to 192.168.1.50 failed: auth with password 'SecretPass99'");
      sensitiveDbError.stack = "Error at Object.<anonymous> (/var/app/models/Secret.js:14:11)";

      const req = { originalUrl: "/api/members/123", method: "GET", requestId: "req_sec_01" };
      const res = {
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      errorHandler(sensitiveDbError, req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(500);
      const body = res.json.mock.calls[0][0];

      // Verifications
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.status).toBe(500);
      expect(body.error.message).not.toContain("SecretPass99");
      expect(body.error.message).not.toContain("192.168.1.50");
      expect(body.error.message).not.toContain("/var/app");
      expect(body.error.stack).toBeUndefined();
      expect(body.stack).toBeUndefined();
    });

    it("verifies logs never contain passwords, tokens or secrets", () => {
      const sensitivePayload = {
        username: "admin",
        password: "SuperSecretPassword!",
        token: "jwt_ey...",
        secret: "app_secret",
        nationalId: "29801011234567",
        phones: "01000000000",
      };

      const sanitized = sanitizeForLog(sensitivePayload);
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.token).toBe("[REDACTED]");
      expect(sanitized.secret).toBe("[REDACTED]");
      expect(sanitized.nationalId).toBe("[REDACTED]");
      expect(sanitized.phones).toBe("[REDACTED]");
      expect(sanitized.username).toBe("admin");
    });
  });

  describe("3. Error Codes & Catalog Parity", () => {
    it("ensures every ERROR_CODES entry has category, retryable boolean, and status", () => {
      for (const [codeKey, def] of Object.entries(ERROR_CODES)) {
        expect(def.code).toBe(codeKey);
        expect(typeof def.status).toBe("number");
        expect(typeof def.category).toBe("string");
        expect(typeof def.retryable).toBe("boolean");
        expect(typeof def.message).toBe("string");
      }
    });
  });
});
