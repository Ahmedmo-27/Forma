import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog";
import AuditDeadLetter from "../models/AuditDeadLetter";
import { writeAudit, writePlatformAudit, replayDeadLetters, _stats } from "../utils/audit";
import { createRequire } from "module";

// Same CommonJS instance audit.js uses, so the AsyncLocalStorage store is shared.
const { runWithTenant } = createRequire(import.meta.url)("../context/tenantContext");

const SRC_DIR = path.join(__dirname, "..");
const TENANT_ID = "64b000000000000000000001";

function sourceFiles(dir) {
    const out = [];
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            if (name !== "tests" && name !== "node_modules") out.push(...sourceFiles(full));
        } else if (full.endsWith(".js") && !full.endsWith(".test.js")) {
            out.push(full);
        }
    }
    return out;
}

describe("audit reliability", () => {
    let readyState;

    beforeEach(() => {
        vi.restoreAllMocks();
        readyState = vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    });

    afterEach(() => {
        readyState.mockRestore();
    });

    it("every literal audit action in the source is allowed by the AuditLog enum", () => {
        const allowed = new Set(AuditLog.schema.path("action").enumValues);
        const callRe = /(writeAudit|writePlatformAudit|AuditLog\.create)\(\{([\s\S]*?)\}\)/g;
        const unknown = [];
        let scanned = 0;
        for (const file of sourceFiles(SRC_DIR)) {
            const src = fs.readFileSync(file, "utf8");
            let match;
            while ((match = callRe.exec(src))) {
                const action = /^\s*action:\s*["']([a-z_]+)["']/m.exec(match[2]);
                if (!action) continue;
                scanned += 1;
                if (!allowed.has(action[1])) unknown.push(`${action[1]} (${path.relative(SRC_DIR, file)})`);
            }
        }
        expect(scanned).toBeGreaterThan(20);
        expect(unknown).toEqual([]);
    });

    it("stamps the tenant from context and retries transient failures", async () => {
        const create = vi
            .spyOn(AuditLog, "create")
            .mockRejectedValueOnce(new Error("socket hang up"))
            .mockResolvedValueOnce({});

        const ok = await runWithTenant({ tenantId: TENANT_ID }, () =>
            writeAudit({ action: "member_updated", actor: TENANT_ID, targetType: "member", targetId: "m1" })
        );

        expect(ok).toBe(true);
        expect(create).toHaveBeenCalledTimes(2);
        expect(String(create.mock.calls[0][0].tenantId)).toBe(TENANT_ID);
    });

    it("does not retry validation errors and moves the row to the dead-letter store", async () => {
        const validation = Object.assign(new Error("bad action"), { name: "ValidationError" });
        const create = vi.spyOn(AuditLog, "create").mockRejectedValue(validation);
        const deadLetter = vi.spyOn(AuditDeadLetter, "create").mockResolvedValue({});
        const before = _stats.deadLettered;

        const ok = await writePlatformAudit({ action: "plan_archived", actor: TENANT_ID, targetType: "plan" });

        expect(ok).toBe(false);
        expect(create).toHaveBeenCalledTimes(1);
        expect(deadLetter).toHaveBeenCalledWith(
            expect.objectContaining({
                attempts: 1,
                payload: expect.objectContaining({ action: "plan_archived", scope: "platform", tenantId: null }),
            })
        );
        expect(_stats.deadLettered).toBe(before + 1);
    });

    it("gives up after three attempts and never throws when the dead-letter write also fails", async () => {
        const create = vi.spyOn(AuditLog, "create").mockRejectedValue(new Error("primary down"));
        vi.spyOn(AuditDeadLetter, "create").mockRejectedValue(new Error("fallback down"));
        const before = _stats.lost;

        await expect(
            writePlatformAudit({ tenantId: TENANT_ID, action: "tenant_status_updated", actor: TENANT_ID })
        ).resolves.toBe(false);
        expect(create).toHaveBeenCalledTimes(3);
        expect(_stats.lost).toBe(before + 1);
    });

    it("tags platform rows by scope", async () => {
        const create = vi.spyOn(AuditLog, "create").mockResolvedValue({});
        await writePlatformAudit({ tenantId: TENANT_ID, action: "tenant_marked_past_due", actor: TENANT_ID });
        await writePlatformAudit({ action: "platform_user_created", actor: TENANT_ID });

        expect(create.mock.calls[0][0]).toMatchObject({ scope: "tenant", tenantId: TENANT_ID, actorRole: "PlatformUser" });
        expect(create.mock.calls[1][0]).toMatchObject({ scope: "platform", tenantId: null });
    });

    it("replays dead-lettered rows and keeps the ones that still fail", async () => {
        const good = { payload: { action: "plan_archived" }, save: vi.fn().mockResolvedValue({}), attempts: 1 };
        const bad = { payload: { action: "plan_archived" }, save: vi.fn().mockResolvedValue({}), attempts: 1 };
        vi.spyOn(AuditDeadLetter, "find").mockReturnValue({
            sort: () => ({ limit: () => Promise.resolve([good, bad]) }),
        });
        vi.spyOn(AuditLog, "create").mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("still down"));

        const result = await replayDeadLetters();

        expect(result).toEqual({ scanned: 2, replayed: 1 });
        expect(good.replayedAt).toBeInstanceOf(Date);
        expect(bad.replayedAt).toBeUndefined();
        expect(bad.attempts).toBe(2);
    });
});
