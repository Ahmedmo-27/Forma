import { describe, it, expect, vi, afterEach } from "vitest";
import { requirePlatformPermission } from "../middleware/platformRbac";
import { PERMISSIONS } from "../config/platformPermissions";
import { fetchBackendLogs, fetchFrontendLogs } from "../services/platformLogsService";
import { getBackendLogs } from "../controllers/platformLogsController";

const ENV_KEYS = [
    "RENDER_API_KEY",
    "RENDER_OWNER_ID",
    "RENDER_SERVICE_ID",
    "VERCEL_TOKEN",
    "VERCEL_PROJECT_ID",
    "VERCEL_TEAM_ID",
];

function saveEnv() {
    return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved) {
    for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
    }
}

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function streamResponse(lines, status = 200) {
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
            controller.close();
        },
    });
    return new Response(stream, {
        status,
        headers: { "content-type": "application/stream+json" },
    });
}

describe("Platform runtime logs", () => {
    const saved = saveEnv();

    afterEach(() => {
        restoreEnv(saved);
        vi.unstubAllGlobals();
    });

    it("denies runtime logs to roles without system.health", () => {
        const middleware = requirePlatformPermission(PERMISSIONS.SYSTEM_HEALTH);
        const req = {
            platformUser: { id: "user-1", email: "billing@leap.test", role: "billing" },
            originalUrl: "/api/platform/system/logs/backend",
            method: "GET",
        };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ requiredPermission: "system.health", userRole: "billing" })
        );
    });

    it("returns the missing variable names when a host is not configured", async () => {
        for (const key of ENV_KEYS) delete process.env[key];

        const backend = await fetchBackendLogs({});
        const frontend = await fetchFrontendLogs({});

        expect(backend).toEqual({
            configured: false,
            missing: ["RENDER_API_KEY", "RENDER_OWNER_ID", "RENDER_SERVICE_ID"],
            logs: [],
            page: { hasMore: false, nextStartTime: null, nextEndTime: null },
        });
        expect(frontend.configured).toBe(false);
        expect(frontend.missing).toEqual(["VERCEL_TOKEN", "VERCEL_PROJECT_ID"]);
    });

    it("maps Render and Vercel payloads into the shared log shape", async () => {
        process.env.RENDER_API_KEY = "render-secret";
        process.env.RENDER_OWNER_ID = "tea-1";
        process.env.RENDER_SERVICE_ID = "srv-1";
        process.env.VERCEL_TOKEN = "vercel-secret";
        process.env.VERCEL_PROJECT_ID = "prj-1";
        process.env.VERCEL_TEAM_ID = "team-1";

        const renderFetch = vi.fn(async (url, init) => {
            expect(url).toContain("https://api.render.com/v1/logs?");
            expect(url).toContain("ownerId=tea-1");
            expect(url).toContain("resource=srv-1");
            expect(url).toContain("level=error");
            expect(url).toContain("type=app");
            expect(init.headers.Authorization).toBe("Bearer render-secret");
            return jsonResponse({
                hasMore: true,
                nextStartTime: "2026-11-06T10:00:00.000Z",
                nextEndTime: "2026-11-06T12:00:00.000Z",
                logs: [
                    {
                        id: "log-1",
                        timestamp: "2026-11-06T12:00:00.000Z",
                        message: "payment worker failed",
                        labels: [
                            { name: "level", value: "error" },
                            { name: "type", value: "app" },
                            { name: "method", value: "POST" },
                            { name: "path", value: "/api/billing" },
                            { name: "statusCode", value: 500 },
                        ],
                    },
                ],
            });
        });

        const backend = await fetchBackendLogs(
            { level: "error", type: "app", text: "payment", limit: "500" },
            { fetchImpl: renderFetch }
        );

        expect(backend.configured).toBe(true);
        expect(backend.page).toEqual({
            hasMore: true,
            nextStartTime: "2026-11-06T10:00:00.000Z",
            nextEndTime: "2026-11-06T12:00:00.000Z",
        });
        expect(backend.logs).toEqual([
            {
                id: "log-1",
                timestamp: "2026-11-06T12:00:00.000Z",
                level: "error",
                message: "payment worker failed",
                type: "app",
                requestMethod: "POST",
                requestPath: "/api/billing",
                statusCode: 500,
            },
        ]);
        expect(renderFetch.mock.calls[0][0]).toContain("limit=100");

        const vercelFetch = vi.fn(async (url) => {
            if (url.includes("/v6/deployments")) {
                expect(url).toContain("projectId=prj-1");
                expect(url).toContain("teamId=team-1");
                return jsonResponse({ deployments: [{ uid: "dpl_123" }] });
            }
            expect(url).toContain("/v1/projects/prj-1/deployments/dpl_123/runtime-logs");
            expect(url).toContain("teamId=team-1");
            return streamResponse([
                JSON.stringify({
                    rowId: "row-1",
                    level: "warning",
                    message: "static asset miss",
                    source: "request",
                    timestampInMs: Date.parse("2026-11-06T12:01:00.000Z"),
                    requestMethod: "GET",
                    requestPath: "/assets/app.js",
                    responseStatusCode: 404,
                }),
                JSON.stringify({
                    rowId: "row-2",
                    level: "info",
                    message: "healthy",
                    source: "delimiter",
                    timestampInMs: Date.parse("2026-11-06T12:02:00.000Z"),
                }),
            ]);
        });

        const frontend = await fetchFrontendLogs(
            { level: "warn", text: "asset" },
            { fetchImpl: vercelFetch }
        );

        expect(frontend.logs).toEqual([
            {
                id: "row-1",
                timestamp: "2026-11-06T12:01:00.000Z",
                level: "warn",
                message: "static asset miss",
                type: "request",
                requestMethod: "GET",
                requestPath: "/assets/app.js",
                statusCode: 404,
            },
        ]);
    });

    it("returns a short 502 and does not echo the host credential", async () => {
        process.env.RENDER_API_KEY = "super-secret-key";
        process.env.RENDER_OWNER_ID = "tea-1";
        process.env.RENDER_SERVICE_ID = "srv-1";
        vi.stubGlobal("fetch", vi.fn(async () => new Response("super-secret-key", { status: 401 })));

        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        await getBackendLogs({ query: {} }, res);

        expect(res.status).toHaveBeenCalledWith(502);
        const body = res.json.mock.calls[0][0];
        expect(body.message).toBe("Render logs request failed");
        expect(JSON.stringify(body)).not.toContain("super-secret-key");
    });
});
