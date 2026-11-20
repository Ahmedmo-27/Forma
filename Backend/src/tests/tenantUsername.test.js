import { describe, it, expect, vi, afterEach } from "vitest";
import mongoose from "mongoose";

const {
    usernameFromEmail,
    usernameFromName,
    tenantUsername,
} = require("../utils/username");

/** Minimal stand-in for the User model: findOne matches only on `username`. */
function fakeUserModel(takenUsernames = []) {
    const taken = new Set(takenUsernames);
    return {
        findOne: vi.fn(async (query) => (taken.has(query.username) ? { username: query.username } : null)),
    };
}

describe("usernameFromName", () => {
    it("uses the first and last name", () => {
        expect(usernameFromName("Ahmed Hassan")).toBe("ahmed.hassan");
        expect(usernameFromName("Ahmed Mohamed Hassan")).toBe("ahmed.hassan");
    });

    it("handles a single word, extra spaces and case", () => {
        expect(usernameFromName("  AHMED  ")).toBe("ahmed");
    });

    it("drops punctuation but keeps hyphens inside a word", () => {
        expect(usernameFromName("O'Brien Smith")).toBe("obrien.smith");
        expect(usernameFromName("Mary-Jane Lee")).toBe("mary-jane.lee");
    });

    it("keeps Arabic letters", () => {
        expect(usernameFromName("أحمد محمد حسن")).toBe("أحمد.حسن");
    });

    it("returns an empty string when there is nothing usable", () => {
        expect(usernameFromName("")).toBe("");
        expect(usernameFromName("!!! ???")).toBe("");
    });
});

describe("usernameFromEmail", () => {
    it("uses the email local-part", () => {
        expect(usernameFromEmail("Ahmed.Ali@example.com")).toBe("ahmed.ali");
    });
});

describe("tenant-scoped usernames", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("builds <gym slug>.<first.last> from the name", async () => {
        const User = fakeUserModel();
        const username = await tenantUsername(
            User,
            { slug: "fouda-gym" },
            { name: "Ahmed Mohamed Hassan", email: "a.hassan.92@gmail.com" }
        );
        expect(username).toBe("fouda-gym.ahmed.hassan");
    });

    it("gives the same name different usernames in different gyms", async () => {
        const User = fakeUserModel();
        const gymA = await tenantUsername(User, { slug: "gym-a" }, { name: "Ahmed Hassan", email: "x@x.com" });
        const gymB = await tenantUsername(User, { slug: "gym-b" }, { name: "Ahmed Hassan", email: "x@x.com" });
        expect(gymA).toBe("gym-a.ahmed.hassan");
        expect(gymB).toBe("gym-b.ahmed.hassan");
    });

    it("adds a numeric suffix when the same name already exists in the gym", async () => {
        const User = fakeUserModel(["fouda-gym.ahmed.hassan", "fouda-gym.ahmed.hassan2"]);
        const username = await tenantUsername(
            User,
            { slug: "fouda-gym" },
            { name: "Ahmed Hassan", email: "x@x.com" }
        );
        expect(username).toBe("fouda-gym.ahmed.hassan3");
    });

    it("uses the email local-part when the name has no usable letters", async () => {
        const User = fakeUserModel();
        const username = await tenantUsername(
            User,
            { slug: "fouda-gym" },
            { name: "!!!", email: "coach.sara@x.com" }
        );
        expect(username).toBe("fouda-gym.coach.sara");
    });

    it("falls back to the email-only username when the tenant has no slug", async () => {
        const User = fakeUserModel();
        const username = await tenantUsername(User, {}, { name: "Ahmed Hassan", email: "ahmed@x.com" });
        expect(username).toBe("ahmed");
    });

    it("excludes the user being updated from the collision check", async () => {
        const User = fakeUserModel();
        const excludeId = new mongoose.Types.ObjectId();
        await tenantUsername(
            User,
            { slug: "fouda-gym" },
            { name: "Ahmed Hassan", email: "x@x.com" },
            { excludeId }
        );
        expect(User.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ username: "fouda-gym.ahmed.hassan", _id: { $ne: excludeId } })
        );
    });
});
