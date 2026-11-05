const { sanitizeForLog } = require("./sanitizeLog");

describe("sanitizeForLog", () => {
  it("redacts sensitive fields like passwords, tokens, secrets, nationalId and cards", () => {
    const input = {
      email: "user@example.com",
      password: "SuperSecretPassword123!",
      newPassword: "AnotherSecretPassword456!",
      token: "jwt.header.payload.signature",
      refreshToken: "refresh.token.xyz",
      secret: "api_secret_key",
      nationalId: "29801011234567",
      phone: "01012345678",
      phones: "01234567890",
      mobile: "+201012345678",
      cardNumber: "4111222233334444",
      cvv: "123",
      authorization: "Bearer eyJhbGciOi...",
      profile: {
        name: "Test User",
        password: "nestedPassword",
        token: "nestedToken",
      },
      items: [
        { id: 1, secret: "item_secret" },
        { id: 2, note: "safe note" },
      ],
    };

    const sanitized = sanitizeForLog(input);

    expect(sanitized.email).toBe("user@example.com");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.newPassword).toBe("[REDACTED]");
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.refreshToken).toBe("[REDACTED]");
    expect(sanitized.secret).toBe("[REDACTED]");
    expect(sanitized.nationalId).toBe("[REDACTED]");
    expect(sanitized.phone).toBe("[REDACTED]");
    expect(sanitized.phones).toBe("[REDACTED]");
    expect(sanitized.mobile).toBe("[REDACTED]");
    expect(sanitized.cardNumber).toBe("[REDACTED]");
    expect(sanitized.cvv).toBe("[REDACTED]");
    expect(sanitized.authorization).toBe("[REDACTED]");

    expect(sanitized.profile.name).toBe("Test User");
    expect(sanitized.profile.password).toBe("[REDACTED]");
    expect(sanitized.profile.token).toBe("[REDACTED]");

    expect(sanitized.items[0].secret).toBe("[REDACTED]");
    expect(sanitized.items[1].note).toBe("safe note");
  });

  it("handles null, primitives, and circular or deep structures safely", () => {
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog("plain string")).toBe("plain string");
    expect(sanitizeForLog(12345)).toBe(12345);
    expect(sanitizeForLog(true)).toBe(true);
  });
});
