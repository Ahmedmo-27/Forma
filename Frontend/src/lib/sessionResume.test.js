import { describe, it, expect, vi, afterEach } from "vitest";
import { emitSessionResume, subscribeSessionResume } from "./sessionResume";

describe("sessionResume", () => {
  afterEach(() => {
    // no persistent listeners if tests unsubscribe
  });

  it("delivers resume payloads to subscribers", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeSessionResume(handler);

    emitSessionResume({
      surface: "tenant",
      user: { id: "u1", role: "Owner", tenantSlug: "acme" },
      tokens: { token: "t" },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({
      surface: "tenant",
      user: { id: "u1", role: "Owner", tenantSlug: "acme" },
      tokens: { token: "t" },
    });

    unsubscribe();
    emitSessionResume({ surface: "tenant", user: { id: "u2" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
