const ENDPOINTS = [
    { key: "members-page", path: "/api/members?page=1&limit=20" },
    { key: "members-large", path: "/api/members?limit=5000" },
    { key: "member-profile", path: null },
    { key: "today-checkins", path: "/api/members/today-checkins" },
    { key: "notifications-unread", path: "/api/notifications/unread-count" },
    { key: "packages", path: "/api/packages" },
    { key: "users-me", path: "/api/users/me" },
    { key: "bi-dashboard", path: "/api/bi/dashboard" },
    { key: "analytics-executive", path: "/api/analytics/executive" },
];

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
}

async function timedGet(baseUrl, token, tenantSlug, path, timeoutMs = 120000) {
    const started = Date.now();
    try {
        const response = await fetch(`${baseUrl}${path}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                "x-tenant-slug": tenantSlug,
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = null;
        }
        const code = body?.code || body?.error?.code || null;
        return {
            status: response.status,
            elapsedMs: Date.now() - started,
            bytes: Buffer.byteLength(text),
            code,
            featureOff: response.status === 403 && code === "FEATURE_NOT_IN_PLAN",
            body,
        };
    } catch (error) {
        return {
            status: 0,
            elapsedMs: Date.now() - started,
            bytes: 0,
            code: error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK",
            featureOff: false,
            message: [error.message, error.cause?.code, error.cause?.message].filter(Boolean).join(": ").slice(0, 300),
        };
    }
}

function slimSample(sample) {
    return {
        status: sample.status,
        elapsedMs: sample.elapsedMs,
        bytes: sample.bytes,
        code: sample.code,
        featureOff: sample.featureOff,
        message: sample.status === 0 ? sample.message : undefined,
    };
}

async function sampleApis({ baseUrl, token, tenantSlug, cold = false, systemId = null }) {
    let profileId = systemId;
    if (!profileId) {
        const discovery = await timedGet(baseUrl, token, tenantSlug, "/api/members?page=1&limit=1");
        profileId = discovery.body?.members?.[0]?.systemId ?? null;
    }

    const endpoints = {};
    for (const endpoint of ENDPOINTS) {
        const path = endpoint.key === "member-profile"
            ? (profileId ? `/api/members/${profileId}` : null)
            : endpoint.path;
        if (!path) {
            endpoints[endpoint.key] = { skipped: "no member id available" };
            continue;
        }

        const coldSample = cold ? slimSample(await timedGet(baseUrl, token, tenantSlug, path)) : null;
        await timedGet(baseUrl, token, tenantSlug, path);
        const samples = [];
        for (let i = 0; i < 5; i += 1) {
            samples.push(slimSample(await timedGet(baseUrl, token, tenantSlug, path)));
        }
        const times = samples.map((sample) => sample.elapsedMs);
        endpoints[endpoint.key] = {
            path,
            cold: coldSample,
            samples,
            min: Math.min(...times),
            median: median(times),
            max: Math.max(...times),
        };
        console.log(
            `[api] ${endpoint.key} median=${endpoints[endpoint.key].median}ms`
            + (coldSample ? ` cold=${coldSample.elapsedMs}ms` : "")
            + ` status=${samples[0].status}`
        );
    }

    return { cold, systemId: profileId, endpoints };
}

if (require.main === module) {
    const { login, requireConfig } = require("./perf-client");
    (async () => {
        const config = requireConfig();
        const auth = await login(config);
        const report = await sampleApis({
            baseUrl: config.baseUrl,
            token: auth.token,
            tenantSlug: auth.tenantSlug,
            cold: process.argv.includes("--cold"),
        });
        console.log(JSON.stringify(report, null, 2));
    })().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = { sampleApis };
