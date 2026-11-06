const RENDER_LOGS_URL = "https://api.render.com/v1/logs";
const VERCEL_API = "https://api.vercel.com";
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const STREAM_TIMEOUT_MS = 4000;
const STREAM_MAX_LINES = 100;
const KNOWN_LEVELS = new Set(["error", "warn", "info", "debug"]);
const BACKEND_TYPES = new Set(["app", "request", "build"]);

class HostLogError extends Error {
    constructor(message) {
        super(message);
        this.name = "HostLogError";
        this.statusCode = 502;
    }
}

function missingVars(names) {
    return names.filter((name) => !String(process.env[name] || "").trim());
}

function clampLimit(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
    return Math.min(parsed, MAX_LIMIT);
}

function cleanText(value) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001F]/g, "").trim().slice(0, 200);
}

function cleanIso(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 40 || Number.isNaN(Date.parse(trimmed))) return "";
    return trimmed;
}

function normalizeLevel(level) {
    const value = String(level || "").toLowerCase();
    if (value === "warning") return "warn";
    if (value === "fatal" || value === "critical") return "error";
    if (KNOWN_LEVELS.has(value)) return value;
    return "info";
}

function requestedLevel(level) {
    const value = String(level || "").trim().toLowerCase();
    if (!value) return "";
    const normalized = value === "warning" ? "warn" : value;
    return KNOWN_LEVELS.has(normalized) ? normalized : "";
}

function labelsToMap(labels) {
    const map = {};
    if (!Array.isArray(labels)) return map;
    for (const label of labels) {
        if (label && label.name != null) map[String(label.name)] = label.value;
    }
    return map;
}

function emptyPage() {
    return { hasMore: false, nextStartTime: null, nextEndTime: null };
}

function normalizeRenderLog(entry, index) {
    const labels = labelsToMap(entry?.labels);
    const timestamp = entry?.timestamp || labels.timestamp || new Date(0).toISOString();
    return {
        id: String(entry?.id || `${timestamp}-${index}`),
        timestamp,
        level: normalizeLevel(entry?.level || labels.level),
        message: String(entry?.message || ""),
        type: String(entry?.type || labels.type || "app"),
        requestMethod: entry?.requestMethod || labels.method || labels.requestMethod || null,
        requestPath: entry?.requestPath || labels.path || labels.requestPath || null,
        statusCode: entry?.statusCode ?? labels.statusCode ?? null,
    };
}

function normalizeVercelLog(entry, index) {
    const timestamp = entry?.timestampInMs
        ? new Date(Number(entry.timestampInMs)).toISOString()
        : entry?.timestamp || new Date(0).toISOString();
    return {
        id: String(entry?.rowId || entry?.id || `${timestamp}-${index}`),
        timestamp,
        level: normalizeLevel(entry?.level),
        message: String(entry?.message || ""),
        type: String(entry?.source || "runtime"),
        requestMethod: entry?.requestMethod || null,
        requestPath: entry?.requestPath || null,
        statusCode: entry?.responseStatusCode ?? null,
    };
}

async function readJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

async function readBoundedLines(response, { maxLines, timeoutMs }) {
    if (!response.body || typeof response.body.getReader !== "function") {
        const text = typeof response.text === "function" ? await response.text() : "";
        return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, maxLines);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const lines = [];
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        reader.cancel().catch(() => {});
    }, timeoutMs);

    try {
        while (lines.length < maxLines) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split(/\r?\n/);
            buffer = parts.pop() ?? "";
            for (const part of parts) {
                const trimmed = part.trim();
                if (!trimmed) continue;
                lines.push(trimmed);
                if (lines.length >= maxLines) break;
            }
        }
    } catch (err) {
        if (!timedOut) throw err;
    } finally {
        clearTimeout(timer);
        try {
            await reader.cancel();
        } catch {
            // The reader is already closed after a timeout or completion.
        }
    }

    if (buffer.trim() && lines.length < maxLines) lines.push(buffer.trim());
    return lines;
}

async function fetchBackendLogs(query = {}, { fetchImpl = globalThis.fetch } = {}) {
    const missing = missingVars(["RENDER_API_KEY", "RENDER_OWNER_ID", "RENDER_SERVICE_ID"]);
    if (missing.length) {
        return { configured: false, missing, logs: [], page: emptyPage() };
    }

    const params = new URLSearchParams();
    params.set("ownerId", process.env.RENDER_OWNER_ID.trim());
    params.append("resource", process.env.RENDER_SERVICE_ID.trim());
    params.set("direction", "backward");
    params.set("limit", String(clampLimit(query.limit)));

    const level = requestedLevel(query.level);
    if (level) params.append("level", level === "warn" ? "warning" : level);

    const type = String(query.type || "").trim().toLowerCase();
    if (BACKEND_TYPES.has(type)) params.append("type", type);

    const text = cleanText(query.text);
    if (text) params.append("text", text);

    const startTime = cleanIso(query.startTime);
    const endTime = cleanIso(query.endTime);
    if (startTime) params.set("startTime", startTime);
    if (endTime) params.set("endTime", endTime);

    let response;
    try {
        response = await fetchImpl(`${RENDER_LOGS_URL}?${params.toString()}`, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${process.env.RENDER_API_KEY.trim()}`,
            },
        });
    } catch {
        throw new HostLogError("Render logs are temporarily unavailable");
    }

    if (!response.ok) {
        throw new HostLogError("Render logs request failed");
    }

    const body = await readJson(response);
    const logs = Array.isArray(body.logs) ? body.logs.map(normalizeRenderLog) : [];
    return {
        configured: true,
        missing: [],
        logs,
        page: {
            hasMore: Boolean(body.hasMore),
            nextStartTime: body.nextStartTime || null,
            nextEndTime: body.nextEndTime || null,
        },
    };
}

async function fetchFrontendLogs(query = {}, { fetchImpl = globalThis.fetch } = {}) {
    const missing = missingVars(["VERCEL_TOKEN", "VERCEL_PROJECT_ID"]);
    if (missing.length) {
        return { configured: false, missing, logs: [], page: emptyPage() };
    }

    const teamId = String(process.env.VERCEL_TEAM_ID || "").trim();
    const projectId = process.env.VERCEL_PROJECT_ID.trim();
    const headers = {
        Authorization: `Bearer ${process.env.VERCEL_TOKEN.trim()}`,
        Accept: "application/json",
    };

    const deploymentParams = new URLSearchParams({
        projectId,
        target: "production",
        limit: "1",
    });
    if (teamId) deploymentParams.set("teamId", teamId);

    let deploymentResponse;
    try {
        deploymentResponse = await fetchImpl(`${VERCEL_API}/v6/deployments?${deploymentParams}`, { headers });
    } catch {
        throw new HostLogError("Vercel logs are temporarily unavailable");
    }
    if (!deploymentResponse.ok) {
        throw new HostLogError("Vercel logs request failed");
    }

    const deploymentBody = await readJson(deploymentResponse);
    const deployment = Array.isArray(deploymentBody.deployments) ? deploymentBody.deployments[0] : null;
    const deploymentId = deployment?.uid || deployment?.id;
    if (!deploymentId) {
        return { configured: true, missing: [], logs: [], page: emptyPage() };
    }

    const logParams = new URLSearchParams();
    if (teamId) logParams.set("teamId", teamId);
    const queryString = logParams.toString();
    const logUrl = `${VERCEL_API}/v1/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/runtime-logs${queryString ? `?${queryString}` : ""}`;

    let logResponse;
    try {
        logResponse = await fetchImpl(logUrl, {
            headers: { ...headers, Accept: "application/stream+json" },
        });
    } catch {
        throw new HostLogError("Vercel logs are temporarily unavailable");
    }
    if (!logResponse.ok) {
        throw new HostLogError("Vercel logs request failed");
    }

    const lines = await readBoundedLines(logResponse, {
        maxLines: STREAM_MAX_LINES,
        timeoutMs: STREAM_TIMEOUT_MS,
    });

    let logs = lines
        .map((line, index) => {
            try {
                return normalizeVercelLog(JSON.parse(line), index);
            } catch {
                return normalizeVercelLog({ message: line, rowId: `raw-${index}` }, index);
            }
        })
        .filter((log) => log.message || log.requestPath);

    const level = requestedLevel(query.level);
    if (level) logs = logs.filter((log) => log.level === level);

    const text = cleanText(query.text).toLowerCase();
    if (text) logs = logs.filter((log) => String(log.message).toLowerCase().includes(text));

    return { configured: true, missing: [], logs, page: emptyPage() };
}

module.exports = {
    HostLogError,
    fetchBackendLogs,
    fetchFrontendLogs,
};
