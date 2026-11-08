function requireConfig() {
    const baseUrl = (process.env.PERF_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
    const email = process.env.PERF_EMAIL;
    const password = process.env.PERF_PASSWORD;
    const gym = process.env.PERF_GYM;
    if (!email || !password || !gym) {
        throw new Error("Set PERF_EMAIL, PERF_PASSWORD, and PERF_GYM before running the performance scripts.");
    }
    return { baseUrl, email, password, gym };
}

async function login(config) {
    const response = await fetch(`${config.baseUrl}/api/users/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-tenant-slug": config.gym,
        },
        body: JSON.stringify({
            email: config.email,
            password: config.password,
            gymSlug: config.gym,
        }),
        signal: AbortSignal.timeout(30000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = body.message || body.error?.message || `Login failed with ${response.status}`;
        throw new Error(message);
    }
    return {
        token: body.token,
        userId: body.user?._id || body.user?.id,
        tenantId: body.user?.tenantId,
        tenantSlug: body.user?.tenantSlug || config.gym,
        role: body.user?.role,
    };
}

async function uploadSpreadsheet(config, token, file, timeoutMs) {
    const form = new FormData();
    const type = file.filename.endsWith(".csv")
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    form.append("file", new Blob([file.buffer], { type }), file.filename);

    const started = Date.now();
    try {
        const response = await fetch(`${config.baseUrl}/api/members/bulk-import`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "x-tenant-slug": config.gym,
            },
            body: form,
            signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await response.text();
        let body = {};
        try {
            body = text ? JSON.parse(text) : {};
        } catch {
            body = { message: text.slice(0, 300) };
        }
        const detail = typeof body.error === "string" ? body.error : body.error?.message;
        return {
            status: response.status,
            elapsedMs: Date.now() - started,
            bytes: Buffer.byteLength(text),
            timedOut: false,
            message: [body.message, detail].filter(Boolean).join(": ").slice(0, 500) || null,
            code: body.code || body.error?.code || null,
            summary: body.summary || null,
            firstSystemId: body.created?.[0]?.systemId ?? null,
            fileBytes: file.bytes,
            format: file.format,
        };
    } catch (error) {
        const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
        return {
            status: 0,
            elapsedMs: Date.now() - started,
            bytes: 0,
            timedOut,
            message: [error.message, error.cause?.code, error.cause?.message].filter(Boolean).join(": ").slice(0, 500),
            code: timedOut ? "CLIENT_TIMEOUT" : "NETWORK",
            summary: null,
            firstSystemId: null,
            fileBytes: file.bytes,
            format: file.format,
        };
    }
}

module.exports = {
    requireConfig,
    login,
    uploadSpreadsheet,
};
