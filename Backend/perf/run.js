/**
 * Local gym API latency harness.
 * One Owner login, cold bypass, warm cache hit, light concurrency on critical GETs,
 * one check-in. Writes results.json and report.md next to this file.
 *
 * Usage: node perf/run.js
 * Env: PERF_BASE_URL, PERF_USERNAME, PERF_PASSWORD
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.PERF_BASE_URL || "http://127.0.0.1:5000";
const USERNAME = process.env.PERF_USERNAME || "owner@test.com";
const PASSWORD = process.env.PERF_PASSWORD || "password123";
const OUT_DIR = __dirname;
const TIMEOUT_MS = 120000;
const LOAD_CONCURRENCY = 5;
const LOAD_SAMPLES = 10;

const BANDS = {
    door: { good: 300, moderate: 800 },
    login: { good: 800, moderate: 2000 },
    normal: { good: 500, moderate: 1500 },
    large: { good: 1500, moderate: 4000 },
    bi: { good: 400, moderate: 1200 },
    write: { good: 400, moderate: 1000 },
};

function grade(className, ms, status) {
    if (status === 401 || status === 403 || status === 404) return "Skipped";
    if (status === 429) return "RateLimited";
    if (!status || status < 200 || status >= 300) return "Error";
    const band = BANDS[className] || BANDS.normal;
    if (ms < band.good) return "Good";
    if (ms <= band.moderate) return "Moderate";
    return "Bad";
}

function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return round(sorted[idx]);
}

function round(ms) {
    return Math.round(ms * 10) / 10;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function request({ method = "GET", urlPath, headers = {}, body = null }) {
    const target = new URL(urlPath, BASE);
    const payload = body == null ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const reqHeaders = { ...headers };
    if (payload) {
        reqHeaders["Content-Type"] = "application/json";
        reqHeaders["Content-Length"] = String(payload.length);
    }

    return new Promise((resolve) => {
        const start = process.hrtime.bigint();
        const req = http.request(
            {
                protocol: target.protocol,
                hostname: target.hostname,
                port: target.port,
                path: `${target.pathname}${target.search}`,
                method,
                headers: reqHeaders,
            },
            (res) => {
                const ttfbMs = Number(process.hrtime.bigint() - start) / 1e6;
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => {
                    const buf = Buffer.concat(chunks);
                    const totalMs = Number(process.hrtime.bigint() - start) / 1e6;
                    const text = buf.toString("utf8");
                    let json = null;
                    try {
                        json = text ? JSON.parse(text) : null;
                    } catch {
                        json = null;
                    }
                    resolve({
                        status: res.statusCode,
                        ms: round(totalMs),
                        ttfb: round(ttfbMs),
                        bytes: buf.length,
                        cache: res.headers["x-cache"] || null,
                        json,
                        errorMessage: json?.message || json?.error?.message || null,
                    });
                });
            }
        );
        req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("timeout")));
        req.on("error", (error) => {
            const totalMs = Number(process.hrtime.bigint() - start) / 1e6;
            resolve({
                status: 0,
                ms: round(totalMs),
                ttfb: null,
                bytes: 0,
                cache: null,
                json: null,
                errorMessage: error.message,
            });
        });
        if (payload) req.write(payload);
        req.end();
    });
}

function retryAfterSeconds(sample) {
    const value = Number(sample.json?.retryAfter || sample.json?.error?.retryAfter);
    if (Number.isFinite(value) && value > 0) return value;
    return 15;
}

async function timed(spec, { token, bypass }) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (bypass) headers["Cache-Control"] = "no-cache";
    let sample = await request({
        method: spec.method || "GET",
        urlPath: spec.path,
        headers,
        body: spec.body || null,
    });
    if (sample.status === 429) {
        const wait = retryAfterSeconds(sample);
        console.log(`429 on ${spec.method || "GET"} ${spec.path} — pausing ${wait}s`);
        await sleep(wait * 1000);
        sample = await request({
            method: spec.method || "GET",
            urlPath: spec.path,
            headers,
            body: spec.body || null,
        });
        sample.retriedAfter429 = true;
    }
    return sample;
}

function summarizeSample(sample, className) {
    return {
        status: sample.status,
        ms: sample.ms,
        ttfb: sample.ttfb,
        bytes: sample.bytes,
        cache: sample.cache,
        grade: grade(className, sample.ms, sample.status),
        error: sample.status >= 200 && sample.status < 300 ? null : sample.errorMessage,
    };
}

function catalog(ctx) {
    const member = ctx.memberId;
    const sales = ctx.salesId;
    const coach = ctx.coachId;
    const user = ctx.userId;
    return [
        { id: "users.profile", path: "/api/users/profile", className: "normal", critical: false },
        { id: "users.me", path: "/api/users/me", className: "normal", critical: false },
        { id: "users.access-search", path: "/api/users/access/search?q=a", className: "normal", critical: false },
        { id: "users.access-by-role", path: "/api/users/access/search?role=Sales", className: "normal", critical: false },
        { id: "users.sales-revenue", path: "/api/users/sales-revenue", className: "large", critical: false },
        { id: "users.manager-revenue", path: "/api/users/sales-manager/revenue", className: "large", critical: true },
        { id: "users.manager-subscriptions", path: "/api/users/sales-manager/subscriptions", className: "large", critical: true },
        { id: "users.my-subscriptions", path: "/api/users/my-subscriptions", className: "large", critical: false },
        { id: "users.sales-reps", path: "/api/users/sales-reps", className: "normal", critical: false },
        { id: "users.sales", path: "/api/users/sales", className: "normal", critical: false, capture: "sales" },
        { id: "users.receptionists", path: "/api/users/receptionists", className: "normal", critical: false },
        { id: "users.team", path: "/api/users/team", className: "large", critical: false },
        { id: "users.team-profile", path: sales ? `/api/users/team/${sales}` : null, className: "large", critical: false },
        { id: "users.coach-team", path: "/api/users/coach-team", className: "large", critical: false, capture: "coaches" },
        { id: "users.coach-profile", path: coach ? `/api/users/coach-team/${coach}` : null, className: "large", critical: false },
        { id: "users.receptionist-team", path: "/api/users/receptionist-team", className: "normal", critical: false },
        { id: "users.all-teams", path: "/api/users/allTeams", className: "normal", critical: false },
        { id: "users.access", path: user ? `/api/users/${user}/access` : null, className: "normal", critical: false },
        { id: "users.by-id", path: user ? `/api/users/${user}` : null, className: "normal", critical: false },
        { id: "members.page", path: "/api/members?limit=20", className: "normal", critical: true },
        { id: "members.dashboard-limit", path: "/api/members?limit=10000", className: "large", critical: true },
        { id: "members.dashboard-all", path: "/api/members?all=true", className: "large", critical: true },
        { id: "members.search-all", path: "/api/members/all?limit=10000", className: "large", critical: true },
        { id: "members.all-notes", path: "/api/members/all-notes", className: "large", critical: true },
        { id: "members.today-checkins", path: "/api/members/today-checkins", className: "door", critical: true },
        { id: "members.today-coach-transfers", path: "/api/members/today-coach-transfers", className: "normal", critical: false },
        { id: "members.profile", path: member ? `/api/members/${member}` : null, className: "normal", critical: true },
        { id: "members.by-id", path: member ? `/api/members/by/${member}` : null, className: "normal", critical: true },
        { id: "analytics.churn", path: "/api/analytics/churn", className: "large", critical: true },
        { id: "analytics.forecast", path: "/api/analytics/forecast", className: "large", critical: true },
        { id: "analytics.cohorts", path: "/api/analytics/cohorts", className: "large", critical: true },
        { id: "analytics.attendance", path: "/api/analytics/attendance", className: "large", critical: true },
        { id: "analytics.funnel", path: "/api/analytics/funnel", className: "large", critical: true },
        { id: "analytics.executive", path: "/api/analytics/executive", className: "large", critical: true },
        { id: "bi.dashboard", path: "/api/bi/dashboard", className: "bi", critical: true },
        { id: "bi.cohorts", path: "/api/bi/cohorts", className: "bi", critical: true },
        { id: "bi.heatmap", path: "/api/bi/heatmap", className: "bi", critical: true },
        { id: "bi.forecast", path: "/api/bi/forecast", className: "bi", critical: true },
        { id: "bi.funnel", path: "/api/bi/funnel", className: "bi", critical: true },
        { id: "bi.insights", path: "/api/bi/insights", className: "bi", critical: true },
        { id: "bi.objectives", path: "/api/bi/objectives", className: "bi", critical: true },
        { id: "bi.export", path: "/api/bi/export?metric=activeMembers", className: "bi", critical: false },
        { id: "notifications.list", path: "/api/notifications", className: "normal", critical: true },
        { id: "notifications.unread", path: "/api/notifications/unread-count", className: "door", critical: true },
        { id: "accounting.contracts", path: "/api/accounting/contracts", className: "large", critical: true },
        { id: "packages.list", path: "/api/packages", className: "normal", critical: true },
        { id: "tenant.me", path: "/api/tenant/me", className: "normal", critical: true },
        { id: "tenant.billing-prices", path: "/api/tenant/billing/prices", className: "normal", critical: false },
        { id: "requests.list", path: "/api/requests", className: "normal", critical: true },
        { id: "coach-requests.list", path: "/api/coach-requests", className: "normal", critical: false },
        { id: "whatsapp.list", path: "/api/whatsapp-templates", className: "normal", critical: false },
        { id: "exceptions.list", path: "/api/package-exceptions", className: "normal", critical: false },
        { id: "exceptions.member", path: member ? `/api/package-exceptions/member/${member}` : null, className: "normal", critical: false },
    ];
}

function capture(kind, json, ctx) {
    if (!json) return;
    if (kind === "sales") {
        const list = json.salesUsers || [];
        if (list[0]?._id) ctx.salesId = String(list[0]._id);
    }
    if (kind === "coaches") {
        const list = json.team || [];
        if (list[0]?._id) ctx.coachId = String(list[0]._id);
    }
}

function pickMember(json) {
    const members = json?.members || [];
    const active = members.find((member) => member.status === "active" && !member.isBlocked);
    const chosen = active || members.find((member) => !member.isBlocked) || members[0];
    if (!chosen) return null;
    return {
        id: String(chosen._id),
        systemId: chosen.systemId ?? null,
        status: chosen.status || null,
        blocked: Boolean(chosen.isBlocked),
    };
}

function logLine(phase, sample, urlPath) {
    const cache = sample.cache ? ` ${sample.cache}` : "";
    console.log(`[${phase}] ${sample.status} ${sample.ms}ms ${sample.bytes}b${cache} ${urlPath}`);
}

async function measureRoute(route, token) {
    if (!route.path) {
        const skipped = {
            status: 404,
            ms: 0,
            ttfb: 0,
            bytes: 0,
            cache: null,
            grade: "Skipped",
            error: "No id available for this route",
        };
        return { cold: skipped, warm: skipped };
    }
    const coldRaw = await timed(route, { token, bypass: true });
    logLine("cold", coldRaw, route.path);
    if (coldRaw.status === 0) {
        throw new Error(`API connection lost during cold ${route.path}: ${coldRaw.errorMessage}`);
    }
    const fill = await timed(route, { token, bypass: false });
    logLine("fill", fill, route.path);
    const warmRaw = await timed(route, { token, bypass: false });
    logLine("warm", warmRaw, route.path);
    return {
        cold: summarizeSample(coldRaw, route.className),
        warm: summarizeSample(warmRaw, route.className),
        fillCache: fill.cache,
        coldJson: coldRaw.json,
    };
}

async function runPool(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    let stop = false;
    async function loop() {
        while (!stop) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            const outcome = await worker(items[index], index);
            results[index] = outcome;
            if (outcome && outcome.stop) stop = true;
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => loop()));
    return results;
}

function worstGrade(grades) {
    const rank = { Bad: 4, Error: 4, Moderate: 3, RateLimited: 2, Good: 1, Skipped: 0 };
    return grades.reduce((worst, current) => ((rank[current] || 0) > (rank[worst] || 0) ? current : worst), "Skipped");
}

function recommendationFor(route) {
    const path = route.path || "";
    if (route.id === "members.page" || route.id.startsWith("members.dashboard") || route.id === "members.search-all") {
        return "Page the owner and sales dashboards (limit 20 plus the stats already returned by the list). getAllMembers in Backend/src/controllers/memberController.js also runs processExpiryCycles and assignOpenMembersToSalesManager on every list; move both onto the existing scheduler. For limit=10000 and all=true, add the compound index { tenantId: 1, createdAt: -1 } if the explain plan sorts in memory.";
    }
    if (route.id.startsWith("analytics.")) {
        return "gymAnalyticsService.loadMembers() loads every member into Node, and check-in counts $filter the whole userlog array. Read TenantMetricSnapshot rows, or aggregate in Mongo with a date bound. These routes already cache for 120 seconds; the cold miss is the cost that matters after a member write invalidates that cache.";
    }
    if (route.id === "users.manager-revenue" || route.id === "users.manager-subscriptions" || route.id === "users.sales-revenue" || route.id === "users.my-subscriptions") {
        return "These handlers load members (the manager ones load every member) and sum subscriptions in JavaScript. Aggregate on subscriptions.startDate, which is already indexed as { tenantId: 1, \"subscriptions.startDate\": 1 }, or serve the snapshot metric membershipSalesPiasters.";
    }
    if (route.id === "members.all-notes") {
        return "getAllNotes $unwinds every note and runs two $lookups before $sort and $skip. Sort and page before the lookups. If this stays Bad, store notes in their own collection.";
    }
    if (route.id === "members.today-checkins") {
        return "getTodayCheckIns matches userlog with $elemMatch, then populates userlog.createdBy for the whole history of those members. Project only today's check-in log instead of hydrating the array.";
    }
    if (route.id === "members.profile" || route.id === "members.by-id") {
        return "getMemberProfile populates 16 paths, including every userlog.createdBy, and may save() when a freeze has ended. Select the fields the screen renders, populate only the latest subscription's authors, and let the scheduler unfreeze.";
    }
    if (route.id.startsWith("bi.")) {
        return "These reads use TenantMetricSnapshot and are not wrapped in cacheResponse, unlike /api/analytics. Add the same 120-second tagged cache. If a single route is still slow, the handler is doing more than a snapshot read and should stay on the precomputed rows.";
    }
    if (route.id === "users.team" || route.id === "users.team-profile") {
        return "getSalesTeam loads every member, populates each subscription package, and totals stats in Node. Count and sum with an aggregation grouped by assignedSales.";
    }
    if (route.id === "users.coach-team" || route.id === "users.coach-profile") {
        return "getCoachTeam loads every member who has a coach, then counts them in Node. Aggregate a count grouped by current_couch.";
    }
    if (route.id === "accounting.contracts") {
        return "getContracts loads every member who has a subscription, populates package and staff on each subscription, and builds the contract list in Node. Page that query in Mongo and stop populating authors the table does not show.";
    }
    if (route.id === "check-in") {
        return "checkInMember loads the full member, pushes onto userlog, and save() rewrites the document. Use an update that only $push-es the new log entry. A separate check-in collection is the follow-up if this stays Bad.";
    }
    if (route.id === "notifications.unread" || route.id === "notifications.list") {
        return "Unread count is a countDocuments on recipient and read, and the list is already paged. Add a short server cache (the door poll does not have one today) if the measured time stays above the door band.";
    }
    return null;
}

function latencyGrade(entry) {
    const grades = [entry.cold?.grade, entry.load?.grade].filter((value) => value === "Good" || value === "Moderate" || value === "Bad" || value === "Error");
    if (!grades.length) return entry.cold?.grade || "Skipped";
    return worstGrade(grades);
}

async function explainLargeList(tenantId) {
    const dotenv = require("dotenv");
    dotenv.config({ path: path.resolve(__dirname, "../.env") });
    const mongoose = require("mongoose");
    const connectMongo = require("../src/config/connectMongo");
    const Member = require("../src/models/Member");
    const { runWithTenant } = require("../src/context/tenantContext");
    await connectMongo();
    try {
        return await runWithTenant({ tenantId }, async () => {
            const explained = await Member.find({})
                .sort({ createdAt: -1, _id: -1 })
                .limit(5000)
                .explain("executionStats");
            const stats = explained?.executionStats || {};
            const plan = stats.executionStages || explained?.queryPlanner?.winningPlan || {};
            const stages = [];
            const walk = (node) => {
                if (!node || typeof node !== "object") return;
                if (node.stage) stages.push(node.stage);
                if (node.inputStage) walk(node.inputStage);
                if (Array.isArray(node.inputStages)) node.inputStages.forEach(walk);
            };
            walk(plan);
            return {
                executionTimeMillis: stats.executionTimeMillis ?? null,
                totalDocsExamined: stats.totalDocsExamined ?? null,
                totalKeysExamined: stats.totalKeysExamined ?? null,
                stages,
                sortsInMemory: stages.includes("SORT"),
            };
        });
    } finally {
        await mongoose.disconnect();
    }
}

function mdEscape(value) {
    return String(value ?? "").replace(/\|/g, "\\|");
}

function writeReport(report) {
    const lines = [];
    lines.push("# API response times");
    lines.push("");
    lines.push(`Measured ${report.ranAt} against ${report.baseUrl} as Owner (${report.tenantSlug || "tenant"}).`);
    lines.push("Cold is one request with Cache-Control: no-cache. Warm is the next request after a fill, so X-Cache HIT means the in-memory cache served it. Load is p95 of 10 samples at 5-way concurrency with the cache left on.");
    lines.push("");
    lines.push("## Bands");
    lines.push("");
    lines.push("- Door (check-ins, unread count): Good under 300 ms, Moderate 300–800 ms, Bad over 800 ms.");
    lines.push("- Login: Good under 800 ms, Moderate 800–2000 ms, Bad over 2000 ms. Password checks use 12 bcrypt rounds.");
    lines.push("- Normal screens: Good under 500 ms, Moderate 500–1500 ms, Bad over 1500 ms.");
    lines.push("- Large reads: Good under 1500 ms, Moderate 1500–4000 ms, Bad over 4000 ms.");
    lines.push("- Snapshot BI: Good under 400 ms, Moderate 400–1200 ms, Bad over 1200 ms.");
    lines.push("- Check-in write: Good under 400 ms, Moderate 400–1000 ms, Bad over 1000 ms.");
    lines.push("- A warm HIT over 50 ms is payload size, not the database.");
    lines.push("");
    lines.push("## Counts");
    lines.push("");
    const counts = report.summary;
    lines.push(`- Good ${counts.Good}, Moderate ${counts.Moderate}, Bad ${counts.Bad}, Error ${counts.Error}, Skipped ${counts.Skipped}.`);
    lines.push(`- Requests sent: ${report.requestCount}. Rate limited: ${report.rateLimited ? "yes" : "no"}.`);
    lines.push("");
    lines.push("## Critical");
    lines.push("");
    lines.push("| Endpoint | Class | Cold ms | Warm ms | Warm cache | Load p95 | Grade |");
    lines.push("| --- | --- | ---: | ---: | --- | ---: | --- |");
    for (const row of report.endpoints.filter((entry) => entry.critical || entry.id === "login" || entry.id === "check-in")) {
        lines.push(`| ${mdEscape(row.label)} | ${row.className} | ${row.cold?.ms ?? ""} | ${row.warm?.ms ?? ""} | ${row.warm?.cache || ""} | ${row.load?.p95 ?? ""} | ${row.grade} |`);
    }
    lines.push("");
    lines.push("## Every endpoint");
    lines.push("");
    lines.push("| Endpoint | Class | Status | Cold ms | Cold cache | Warm ms | Warm cache | Bytes | Load p50 | Load p95 | Load max | Grade |");
    lines.push("| --- | --- | ---: | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: | --- |");
    for (const row of report.endpoints) {
        lines.push(`| ${mdEscape(row.label)} | ${row.className} | ${row.cold?.status ?? ""} | ${row.cold?.ms ?? ""} | ${row.cold?.cache || ""} | ${row.warm?.ms ?? ""} | ${row.warm?.cache || ""} | ${row.cold?.bytes ?? ""} | ${row.load?.p50 ?? ""} | ${row.load?.p95 ?? ""} | ${row.load?.max ?? ""} | ${row.grade} |`);
    }
    lines.push("");
    lines.push("## What to change");
    lines.push("");
    if (!report.recommendations.length) {
        lines.push("No Moderate or Bad route had a handler change that the measurement supports.");
    } else {
        for (const item of report.recommendations) {
            lines.push(`- **${item.label}** (${item.grade}, cold ${item.coldMs} ms${item.loadP95 != null ? `, load p95 ${item.loadP95} ms` : ""}). ${item.change}`);
        }
    }
    lines.push("");
    if (report.explain) {
        lines.push("## Large member list explain");
        lines.push("");
        lines.push(`- Stages: ${report.explain.stages.join(" -> ") || "none"}.`);
        lines.push(`- Docs examined: ${report.explain.totalDocsExamined}. Keys examined: ${report.explain.totalKeysExamined}. Execution: ${report.explain.executionTimeMillis} ms.`);
        lines.push(`- In-memory sort: ${report.explain.sortsInMemory ? "yes" : "no"}.`);
        lines.push("");
    }
    lines.push("## Warm hits over 50 ms");
    lines.push("");
    const fat = report.endpoints.filter((entry) => entry.warm?.cache === "HIT" && entry.warm.ms >= 50);
    if (!fat.length) lines.push("None.");
    else {
        for (const entry of fat) {
            lines.push(`- ${entry.label}: ${entry.warm.ms} ms, ${entry.warm.bytes} bytes.`);
        }
    }
    lines.push("");
    fs.writeFileSync(path.join(OUT_DIR, "report.md"), lines.join("\n"), "utf8");
}

async function main() {
    const ping = await request({ urlPath: "/" });
    if (ping.status === 0) {
        throw new Error(`API not reachable at ${BASE}: ${ping.errorMessage}`);
    }
    console.log(`API ${ping.status} in ${ping.ms}ms`);

    const loginStarted = Date.now();
    const loginRaw = await timed(
        {
            method: "POST",
            path: "/api/users/login",
            body: { username: USERNAME, email: USERNAME, password: PASSWORD },
        },
        { token: null, bypass: false }
    );
    logLine("login", loginRaw, "/api/users/login");
    if (loginRaw.status !== 200 || !loginRaw.json?.token) {
        throw new Error(`Login failed (${loginRaw.status}): ${loginRaw.errorMessage || "no token"}`);
    }
    const token = loginRaw.json.token;
    const user = loginRaw.json.user || {};
    const ctx = {
        userId: String(user.id || user._id || ""),
        tenantId: user.tenantId ? String(user.tenantId) : null,
        tenantSlug: user.tenantSlug || null,
        memberId: null,
        systemId: null,
        memberStatus: null,
        salesId: null,
        coachId: null,
    };

    const discovery = await timed(
        { path: "/api/members?status=active&limit=20" },
        { token, bypass: true }
    );
    logLine("discover", discovery, "/api/members?status=active&limit=20");
    const chosen = pickMember(discovery.json);
    if (chosen) {
        ctx.memberId = chosen.id;
        ctx.systemId = chosen.systemId;
        ctx.memberStatus = chosen.status;
    }

    let requestCount = 2;
    const rows = [];
    const loginRow = {
        id: "login",
        label: "POST /api/users/login",
        path: "/api/users/login",
        className: "login",
        critical: true,
        cold: summarizeSample(loginRaw, "login"),
        warm: null,
        load: null,
        grade: grade("login", loginRaw.ms, loginRaw.status),
    };
    rows.push(loginRow);

    let routes = catalog(ctx);
    const measured = [];
    for (let index = 0; index < routes.length; index += 1) {
        let route = routes[index];
        if (!route.path) {
            routes = catalog(ctx);
            route = routes[index];
        }
        const result = await measureRoute(route, token);
        requestCount += route.path ? 3 : 0;
        if (route.capture) capture(route.capture, result.coldJson, ctx);
        if (route.capture) {
            routes = catalog(ctx);
        }
        measured.push({ route: routes[index], result });
        if (result.cold?.status === 429 || result.warm?.status === 429) {
            console.log("Stopping catalog early because the rate limiter is still returning 429.");
            break;
        }
    }

    for (const { route, result } of measured) {
        rows.push({
            id: route.id,
            label: `GET ${route.path || route.id}`,
            path: route.path,
            className: route.className,
            critical: route.critical,
            cold: result.cold,
            warm: result.warm,
            load: null,
            grade: result.cold.grade,
        });
    }

    const critical = rows.filter((row) => row.critical && row.id !== "login" && row.cold?.status >= 200 && row.cold?.status < 300);
    const jobs = [];
    for (const row of critical) {
        for (let sample = 0; sample < LOAD_SAMPLES; sample += 1) jobs.push(row);
    }
    let rateLimited = rows.some((row) => row.cold?.grade === "RateLimited" || row.warm?.grade === "RateLimited");
    const loadSamples = new Map();
    if (!rateLimited && jobs.length) {
        console.log(`Load phase: ${critical.length} routes x ${LOAD_SAMPLES} at concurrency ${LOAD_CONCURRENCY}`);
        await runPool(jobs, LOAD_CONCURRENCY, async (row) => {
            if (rateLimited) return { stop: true };
            const sample = await timed({ path: row.path }, { token, bypass: false });
            requestCount += 1;
            logLine("load", sample, row.path);
            if (!loadSamples.has(row.id)) loadSamples.set(row.id, []);
            loadSamples.get(row.id).push(sample);
            if (sample.status === 429) {
                rateLimited = true;
                return { stop: true };
            }
            return { stop: false };
        });
    }

    for (const row of rows) {
        const samples = loadSamples.get(row.id) || [];
        const ok = samples.filter((sample) => sample.status >= 200 && sample.status < 300);
        const times = ok.map((sample) => sample.ms);
        if (samples.length) {
            row.load = {
                samples: samples.length,
                ok: ok.length,
                p50: percentile(times, 0.5),
                p95: percentile(times, 0.95),
                max: times.length ? round(Math.max(...times)) : null,
                grade: times.length ? grade(row.className, percentile(times, 0.95), 200) : grade(row.className, samples[0].ms, samples[0].status),
                caches: [...new Set(samples.map((sample) => sample.cache || "none"))],
            };
        }
        row.grade = latencyGrade(row);
    }

    let checkIn = null;
    if (!rateLimited && ctx.memberId && ctx.memberStatus === "active") {
        const identifier = ctx.memberId;
        const sample = await timed(
            { method: "POST", path: "/api/members/check-in", body: { identifier } },
            { token, bypass: false }
        );
        requestCount += 1;
        logLine("write", sample, "/api/members/check-in");
        checkIn = {
            id: "check-in",
            label: "POST /api/members/check-in",
            path: "/api/members/check-in",
            className: "write",
            critical: true,
            cold: summarizeSample(sample, "write"),
            warm: null,
            load: null,
            grade: grade("write", sample.ms, sample.status),
            memberStatus: ctx.memberStatus,
        };
        rows.push(checkIn);
    } else {
        rows.push({
            id: "check-in",
            label: "POST /api/members/check-in",
            path: "/api/members/check-in",
            className: "write",
            critical: true,
            cold: {
                status: 0,
                ms: 0,
                ttfb: 0,
                bytes: 0,
                cache: null,
                grade: "Skipped",
                error: rateLimited ? "Skipped because the rate limiter fired" : "No active member to check in",
            },
            warm: null,
            load: null,
            grade: "Skipped",
        });
    }

    const summary = { Good: 0, Moderate: 0, Bad: 0, Error: 0, Skipped: 0, RateLimited: 0 };
    for (const row of rows) {
        const key = summary[row.grade] == null ? "Error" : row.grade;
        summary[key] += 1;
    }

    const recommendations = [];
    for (const row of rows) {
        if (row.grade !== "Moderate" && row.grade !== "Bad") continue;
        const change = recommendationFor(row);
        if (!change) continue;
        recommendations.push({
            label: row.label,
            grade: row.grade,
            coldMs: row.cold?.ms ?? null,
            loadP95: row.load?.p95 ?? null,
            change,
        });
    }

    let explain = null;
    const large = rows.find((row) => row.id === "members.dashboard-limit");
    if (large && (large.grade === "Moderate" || large.grade === "Bad") && ctx.tenantId) {
        try {
            console.log("Explaining large member list sort");
            explain = await explainLargeList(ctx.tenantId);
            console.log(JSON.stringify(explain));
        } catch (error) {
            explain = { error: error.message, stages: [], sortsInMemory: null, totalDocsExamined: null, totalKeysExamined: null, executionTimeMillis: null };
        }
    }

    const report = {
        ranAt: new Date(loginStarted).toISOString(),
        baseUrl: BASE,
        role: user.role || null,
        tenantSlug: ctx.tenantSlug,
        requestCount,
        rateLimited,
        summary,
        explain,
        recommendations,
        endpoints: rows.map((row) => ({
            id: row.id,
            label: row.label,
            path: row.path,
            className: row.className,
            critical: row.critical,
            grade: row.grade,
            cold: row.cold,
            warm: row.warm,
            load: row.load,
        })),
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(report, null, 2), "utf8");
    writeReport(report);
    console.log(`Wrote ${path.join(OUT_DIR, "results.json")}`);
    console.log(JSON.stringify(summary));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
