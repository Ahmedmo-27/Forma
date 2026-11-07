const errorHandler = require("./errorHandler");
const {
  AppError,
  ValidationError,
  FeatureNotInPlanError,
  PlanLimitError,
  SubscriptionError,
  RateLimitError,
} = require("../utils/errors");

function createMockReqRes(overrides = {}) {
  const req = {
    originalUrl: "/api/test",
    method: "POST",
    requestId: "req_test_123456",
    get: vi.fn().mockReturnValue("req_test_123456"),
    ...overrides,
  };
  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  return { req, res };
}

describe("Central errorHandler", () => {
  it("returns 413 for Multer LIMIT_FILE_SIZE errors with unified envelope", () => {
    const err = new Error("File too large");
    err.name = "MulterError";
    err.code = "LIMIT_FILE_SIZE";

    const { req, res } = createMockReqRes({ originalUrl: "/api/members/1/invitations" });

    errorHandler(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "File too large. Maximum size is 15 MB.",
        error: expect.objectContaining({
          code: "UPLOAD_FILE_TOO_LARGE",
          status: 413,
          message: "File too large. Maximum size is 15 MB.",
          requestId: "req_test_123456",
        }),
      })
    );
  });

  it("converts Zod errors into VALIDATION_FAILED with structured fieldErrors", () => {
    const zodError = new Error("Validation error");
    zodError.name = "ZodError";
    zodError.issues = [
      { path: ["email"], message: "Invalid email format" },
      { path: ["password"], message: "Password too short" },
    ];

    const { req, res } = createMockReqRes();
    errorHandler(zodError, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "VALIDATION_FAILED",
          status: 400,
          fieldErrors: {
            email: ["Invalid email format"],
            password: ["Password too short"],
          },
          requestId: "req_test_123456",
        }),
      })
    );
  });

  it("converts Mongoose duplicate key (11000) to CONFLICT_DUPLICATE with field name only", () => {
    const mongoError = new Error("E11000 duplicate key error collection: leap.members index: phones_1 dup key: { phones: \"01012345678\" }");
    mongoError.code = 11000;
    mongoError.keyPattern = { phones: 1, tenantId: 1 };

    const { req, res } = createMockReqRes();
    errorHandler(mongoError, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "CONFLICT_DUPLICATE",
          status: 409,
          message: "A record with this phones already exists.",
          details: { field: "phones" },
          requestId: "req_test_123456",
        }),
      })
    );
  });

  it("converts Mongoose CastError into INVALID_ID without leaking internal cast messages", () => {
    const castError = new Error("Cast to ObjectId failed for value 'invalid-id' at path '_id'");
    castError.name = "CastError";
    castError.path = "memberId";

    const { req, res } = createMockReqRes();
    errorHandler(castError, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "INVALID_ID",
          status: 400,
          message: "The provided identifier is invalid.",
          details: { field: "memberId" },
        }),
      })
    );
  });

  it("converts JWT TokenExpiredError into AUTH_TOKEN_EXPIRED (401)", () => {
    const jwtError = new Error("jwt expired");
    jwtError.name = "TokenExpiredError";

    const { req, res } = createMockReqRes();
    errorHandler(jwtError, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "AUTH_TOKEN_EXPIRED",
          status: 401,
          message: "Your session has expired. Please sign in again.",
        }),
      })
    );
  });

  it("converts JWT JsonWebTokenError into AUTH_TOKEN_INVALID (401)", () => {
    const jwtError = new Error("invalid signature");
    jwtError.name = "JsonWebTokenError";

    const { req, res } = createMockReqRes();
    errorHandler(jwtError, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "AUTH_TOKEN_INVALID",
          status: 401,
          message: "Authentication token is invalid or corrupted.",
        }),
      })
    );
  });

  it("converts unexpected 500 error to generic INTERNAL_ERROR with zero stack or query leak", () => {
    const fatalError = new Error("SQLSTATE[HY000]: Database secret error: password was 'secret_123'");
    fatalError.stack = "Error: at /var/app/db.js:42:15";

    const { req, res } = createMockReqRes();
    errorHandler(fatalError, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    const sent = res.json.mock.calls[0][0];

    // Must NEVER leak the internal error message or stack to the client
    expect(sent.error.message).not.toContain("password");
    expect(sent.error.message).not.toContain("secret_123");
    expect(sent.error.message).not.toContain("SQLSTATE");
    expect(sent.error.code).toBe("INTERNAL_ERROR");
    expect(sent.error.status).toBe(500);
    expect(sent.error.stack).toBeUndefined();
    expect(sent.stack).toBeUndefined();
  });

  it("correctly handles AppError subclasses with safe details", () => {
    const planError = new PlanLimitError("maxMembers", 300, 300);
    const { req, res } = createMockReqRes();
    errorHandler(planError, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "PLAN_LIMIT_REACHED",
        error: expect.objectContaining({
          code: "PLAN_LIMIT_REACHED",
          status: 403,
          details: { limit: "maxMembers", current: 300, max: 300 },
          requestId: "req_test_123456",
        }),
      })
    );
  });

  it("attaches retryAfter on RateLimitError", () => {
    const rateLimitError = new RateLimitError(90);
    const { req, res } = createMockReqRes();
    errorHandler(rateLimitError, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "RATE_LIMITED",
          status: 429,
          retryAfter: 90,
        }),
      })
    );
  });
});
