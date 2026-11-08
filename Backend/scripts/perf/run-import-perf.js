const fs = require("fs");
const path = require("path");

const { buildRows, spreadsheetFor, SPREADSHEET_MAX_BYTES } = require("./generate-members-sheet");
const { requireConfig, login, uploadSpreadsheet } = require("./perf-client");
const { sampleApis } = require("./run-api-perf");
const {
    countPerfMembers,
    cleanupPerfMembers,
    readSystemSeq,
    disconnectDb,
} = require("./cleanup-perf-members");

const PROBE_ROWS = 200;
const FULL_ROWS = 50000;
const PROBE_PREFIX = "0198";
const FULL_PREFIX = "0199";
const BROWSER_TIMEOUT_MS = 15000;
const SINGLE_SHOT_CLIENT_MS = 15 * 60 * 1000;
const SINGLE_SHOT_CAP_MS = 45 * 60 * 1000;
const CHUNK_TARGET_MS = 2 * 60 * 1000;
const SLOW_THOUSAND_MS = 15 * 60 * 1000;
const IDLE_LIMIT_MS = 3 * 60 * 60 * 1000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function stamp() {
    return new Date().toISOString();
}

function log(message) {
    console.log(`[${stamp()}] ${message}`);
}

function noteUpload(result) {
    return {
        status: result.status,
        elapsedMs: result.elapsedMs,
        responseBytes: result.bytes,
        timedOut: result.timedOut,
        code: result.code,
        message: result.message,
        summary: result.summary,
        browserWouldAbort: result.elapsedMs > BROWSER_TIMEOUT_MS,
        fileBytes: result.fileBytes,
        format: result.format,
    };
}

function fileNote(file) {
    return {
        format: file.format,
        bytes: file.bytes,
        xlsxBytes: file.xlsxBytes,
        overLimit: Boolean(file.overLimit),
        phoneRoundTrip: file.phoneRoundTrip,
        limitBytes: SPREADSHEET_MAX_BYTES,
    };
}

function chooseChunkSize(perRowMs) {
    if (!Number.isFinite(perRowMs) || perRowMs <= 0) return 500;
    return Math.min(1000, Math.max(500, Math.round(CHUNK_TARGET_MS / perRowMs)));
}

async function uploadOnce(config, token, file, timeoutMs) {
    let result = await uploadSpreadsheet(config, token, file, timeoutMs);
    if (result.status === 0) {
        log(`Upload did not reach the server (${result.message}). Retrying once.`);
        await sleep(3000);
        result = await uploadSpreadsheet(config, token, file, timeoutMs);
    }
    return result;
}

async function health(baseUrl) {
    const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Server health check returned ${response.status}`);
}

async function removeIfPresent({ tenantId, userId, prefix, maxRows }) {
    const existing = await countPerfMembers({ tenantId, userId, prefix });
    if (existing === 0) return { counted: 0, deleted: 0 };
    log(`Removing ${existing} leftover ${prefix} perf members`);
    return cleanupPerfMembers({ tenantId, userId, prefix, expected: existing, maxRows });
}

async function waitUntilIdle({ tenantId, userId, prefix, startedAt }) {
    let last = -1;
    let stableSince = 0;
    const samples = [];
    let noted = false;

    while (true) {
        const count = await countPerfMembers({ tenantId, userId, prefix });
        const elapsedMs = Date.now() - startedAt;
        samples.push({ elapsedMs, count });
        log(`Poll ${prefix}: ${count} members stored after ${Math.round(elapsedMs / 1000)}s`);
        if (!noted && elapsedMs > SINGLE_SHOT_CAP_MS) {
            noted = true;
            log("Past the 45-minute mark. Waiting until inserts stop before cleanup.");
        }
        if (count === last) {
            if (!stableSince) stableSince = Date.now();
            if (Date.now() - stableSince >= 30000) {
                return {
                    count,
                    stable: true,
                    exceededCap: elapsedMs > SINGLE_SHOT_CAP_MS,
                    samples,
                };
            }
        } else {
            last = count;
            stableSince = 0;
        }
        if (elapsedMs > IDLE_LIMIT_MS) {
            return { count, stable: false, exceededCap: true, samples };
        }
        await sleep(10000);
    }
}

async function deleteStored({ tenantId, userId, prefix, expected, maxRows }) {
    return cleanupPerfMembers({ tenantId, userId, prefix, expected, maxRows });
}

function timingLine(sample) {
    if (!sample || sample.skipped) return sample?.skipped || "skipped";
    const cold = sample.cold ? `, cold ${sample.cold.elapsedMs} ms` : "";
    return `min ${sample.min} ms, median ${sample.median} ms, max ${sample.max} ms${cold}`;
}

function renderMarkdown(report) {
    const probe = report.probe;
    const single = report.singleShot;
    const lines = [
        "# Phase 1 performance results",
        "",
        `Gym slug: ${report.gym}`,
        `Role: ${report.role || "unknown"}`,
        `Started: ${report.startedAt}`,
        `Finished: ${report.finishedAt || ""}`,
        report.error ? `Error: ${report.error}` : "",
        "",
        "## Probe (200 rows)",
        "",
    ];

    if (!probe) {
        lines.push("Not run.");
    } else {
        lines.push(`Status ${probe.status} in ${probe.elapsedMs} ms. Created ${probe.summary?.created ?? 0}. Stored ${probe.stored ?? 0}.`);
        lines.push(probe.perRowMs != null
            ? `About ${probe.perRowMs} ms per created row. A 1,000-row file would take about ${Math.round((probe.estimate1000Ms || 0) / 1000)} seconds.`
            : "No per-row rate, because the probe created no members.");
        lines.push(`The browser client would have aborted: ${probe.browserWouldAbort}.`);
    }

    lines.push("", "## Single 50,000-row upload", "");
    if (!single) {
        lines.push("Not run.");
    } else {
        lines.push(`File: ${single.file?.format}, ${single.file?.bytes} bytes. Limit ${SPREADSHEET_MAX_BYTES} bytes. Phone read back as ${single.file?.phoneRoundTrip}.`);
        lines.push(`Client result: ${single.upload?.code || single.upload?.status} in ${single.upload?.elapsedMs} ms.`);
        lines.push(`Rows stored before cleanup: ${single.stored}.`);
        lines.push(`Browser client (15 seconds) would have aborted: ${single.upload?.browserWouldAbort}.`);
        if (single.poll) {
            lines.push(`Server inserts settled at ${single.poll.count}. Stable: ${single.poll.stable}. Passed the 45-minute cap: ${single.poll.exceededCap}.`);
        } else {
            lines.push("The request returned before the client timeout.");
        }
    }

    lines.push("", "## Phased uploads", "");
    if (!report.phased?.ran) {
        lines.push(report.phased?.reason || "Not run.");
    } else {
        lines.push(`Chunk size ${report.phased.chunkSize}. Files sent: ${report.phased.chunks.length}. Wall clock ${report.phased.wallClockMs} ms.`);
        lines.push(`Created ${report.phased.created}, skipped ${report.phased.skipped}, errors ${report.phased.errors}. Stored ${report.phased.stored}.`);
        if (report.phased.stoppedEarly) lines.push(`Stopped early: ${report.phased.stoppedEarly}.`);
        if (report.phased.duplicate) {
            lines.push(`Duplicate first chunk: status ${report.phased.duplicate.status}, created ${report.phased.duplicate.summary?.created ?? 0}, skipped ${report.phased.duplicate.summary?.skipped ?? 0}, ${report.phased.duplicate.elapsedMs} ms.`);
        }
    }

    lines.push("", "## API timings", "");
    for (const [label, sampleSet] of Object.entries(report.apis || {})) {
        lines.push(`### ${label}`, "");
        if (sampleSet.skipped) {
            lines.push(sampleSet.skipped);
        } else {
            for (const [key, sample] of Object.entries(sampleSet.endpoints || {})) {
                lines.push(`- ${key}: ${timingLine(sample)}`);
            }
        }
        lines.push("");
    }

    lines.push("## Cleanup and system id", "");
    lines.push(`Probe deleted ${report.cleanup?.probe?.deleted ?? 0}. Single-shot deleted ${report.cleanup?.single?.deleted ?? 0}. Phased deleted ${report.cleanup?.phased?.deleted ?? 0}.`);
    lines.push(`systemId counter: start ${report.systemId?.before}, after probe ${report.systemId?.afterProbe}, after single shot ${report.systemId?.afterSingle}, end ${report.systemId?.final}. The counter was not moved backwards.`);
    lines.push("");
    lines.push("The Import Members page times out at 15 seconds and was not used for these files.");
    lines.push("Bulk import does not enforce the plan member cap. There is no resume token. Phased means separate smaller files, uploaded one after another.");
    return lines.filter((line) => line !== undefined).join("\n");
}

function writeReport(report) {
    const dir = path.join(__dirname, "results");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "phase1-report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(dir, "phase1-report.md"), renderMarkdown(report));
}

async function main() {
    const config = requireConfig();
    const report = {
        startedAt: stamp(),
        gym: config.gym,
        baseUrl: config.baseUrl,
        apis: {},
        cleanup: {},
        systemId: {},
        phased: { ran: false, reason: null, chunks: [] },
    };
    let exitCode = 0;

    try {
        log("Checking the dev server");
        await health(config.baseUrl);
        const auth = await login(config);
        report.role = auth.role;
        report.userId = auth.userId;
        report.tenantId = auth.tenantId;
        if (!auth.tenantId || !auth.userId) throw new Error("Login did not return a tenant and user id.");
        log(`Signed in as ${auth.role} for ${auth.tenantSlug}`);

        const scope = { tenantId: auth.tenantId, userId: auth.userId };
        report.systemId.before = await readSystemSeq(auth.tenantId);
        await removeIfPresent({ ...scope, prefix: PROBE_PREFIX, maxRows: PROBE_ROWS });
        await removeIfPresent({ ...scope, prefix: FULL_PREFIX, maxRows: FULL_ROWS });

        log("Baseline API sample");
        report.apis.baseline = await sampleApis({
            baseUrl: config.baseUrl,
            token: auth.token,
            tenantSlug: auth.tenantSlug,
            cold: false,
        });

        log("Importing the 200-row probe");
        const probeRows = buildRows(PROBE_ROWS, PROBE_PREFIX, 1);
        const probeFile = spreadsheetFor(probeRows);
        if (probeFile.phoneRoundTrip !== probeRows[0].phone) {
            throw new Error(`Probe phone round-trip failed: ${probeFile.phoneRoundTrip}`);
        }
        const probeStarted = Date.now();
        const probeUpload = await uploadOnce(config, auth.token, probeFile, 5 * 60 * 1000);
        report.probe = { ...noteUpload(probeUpload), file: fileNote(probeFile) };

        if (probeUpload.status === 403) {
            report.phased.reason = probeUpload.message || "Import is not allowed for this account or plan.";
            report.error = report.phased.reason;
            report.cleanup.probe = await deleteStored({ ...scope, prefix: PROBE_PREFIX, expected: 0, maxRows: PROBE_ROWS });
            exitCode = 1;
            return;
        }

        let probeStored = probeUpload.summary?.created ?? 0;
        if (probeUpload.timedOut || probeUpload.status === 0 || probeUpload.status >= 500) {
            const poll = await waitUntilIdle({ ...scope, prefix: PROBE_PREFIX, startedAt: probeStarted });
            report.probe.poll = poll;
            probeStored = poll.count;
            if (!poll.stable) throw new Error("Probe inserts did not settle. Cleanup was not run.");
        }
        report.probe.stored = probeStored;
        const probeElapsed = report.probe.poll
            ? (report.probe.poll.samples.find((sample) => sample.count === probeStored)?.elapsedMs || probeUpload.elapsedMs)
            : probeUpload.elapsedMs;
        report.probe.perRowMs = probeStored ? Math.round(probeElapsed / probeStored) : null;
        report.probe.estimate1000Ms = report.probe.perRowMs != null ? report.probe.perRowMs * 1000 : null;
        report.cleanup.probe = await deleteStored({
            ...scope,
            prefix: PROBE_PREFIX,
            expected: probeStored,
            maxRows: PROBE_ROWS,
        });
        report.systemId.afterProbe = await readSystemSeq(auth.tenantId);
        log(`Probe stored ${probeStored} in ${probeUpload.elapsedMs} ms, then deleted ${report.cleanup.probe.deleted}`);

        const probeFailed = probeUpload.timedOut || probeUpload.status === 0 || probeUpload.status >= 500;
        const probeEmpty = !probeFailed && probeStored === 0;
        const slowProbe = probeFailed || report.probe.estimate1000Ms == null || report.probe.estimate1000Ms > SLOW_THOUSAND_MS;
        if (probeEmpty) {
            report.phased.reason = "The probe finished without creating any members, so the 50,000-row runs were skipped.";
            report.error = report.phased.reason;
            exitCode = 1;
            return;
        }
        if (probeFailed) {
            report.phased.reason = "The 200-row probe did not finish cleanly. The single 50,000-row upload still runs; the phased run does not.";
        } else if (slowProbe) {
            report.phased.reason = "A 1,000-row file would take more than 15 minutes. The single 50,000-row upload still runs; the phased run does not.";
        }

        log("Building the 50,000-row sheet");
        const fullRows = buildRows(FULL_ROWS, FULL_PREFIX, 1);
        const fullFile = spreadsheetFor(fullRows);
        if (fullFile.phoneRoundTrip !== fullRows[0].phone) {
            throw new Error(`Full-sheet phone round-trip failed: ${fullFile.phoneRoundTrip}`);
        }
        const singleStarted = Date.now();
        log(`Uploading one ${fullFile.format} of ${fullFile.bytes} bytes`);
        const singleUpload = await uploadOnce(config, auth.token, fullFile, SINGLE_SHOT_CLIENT_MS);
        report.singleShot = { file: fileNote(fullFile), upload: noteUpload(singleUpload) };
        log(`Single shot ${singleUpload.code || singleUpload.status} in ${singleUpload.elapsedMs} ms`);

        let singleStored = singleUpload.summary?.created ?? 0;
        const singleIncomplete = singleUpload.timedOut || singleUpload.status === 0 || singleUpload.status >= 500;
        if (singleIncomplete) {
            const poll = await waitUntilIdle({ ...scope, prefix: FULL_PREFIX, startedAt: singleStarted });
            report.singleShot.poll = poll;
            singleStored = poll.count;
            if (!poll.stable) throw new Error("Single-shot inserts did not settle. Cleanup was not run.");
            report.phased.reason = report.phased.reason || "The single upload did not return a completed response, so the phased run was skipped.";
        }
        report.singleShot.stored = singleStored;
        report.systemId.afterSingle = await readSystemSeq(auth.tenantId);

        if (singleStored > 0) {
            let profileId = singleUpload.firstSystemId;
            if (!profileId) {
                const Member = require("../../src/models/Member");
                const { runWithTenant } = require("../../src/context/tenantContext");
                const found = await runWithTenant({ tenantId: auth.tenantId }, async () => {
                    return Member.findOne({
                        phones: new RegExp(`^${FULL_PREFIX}\\d{7}$`),
                        name: /^Perf Test /,
                        createdBy: auth.userId,
                    }).select("systemId").lean();
                });
                profileId = found?.systemId ?? null;
            }
            log("API sample with the imported members still in the gym");
            report.apis.afterImport = await sampleApis({
                baseUrl: config.baseUrl,
                token: auth.token,
                tenantSlug: auth.tenantSlug,
                cold: true,
                systemId: profileId,
            });
        } else {
            report.apis.afterImport = { skipped: "No perf members were stored, so there was no loaded gym to sample." };
        }

        report.cleanup.single = await deleteStored({
            ...scope,
            prefix: FULL_PREFIX,
            expected: singleStored,
            maxRows: FULL_ROWS,
        });
        log(`Deleted ${report.cleanup.single.deleted} single-shot members`);

        if (report.phased.reason) return;

        const chunkSize = chooseChunkSize(report.probe.perRowMs);
        report.phased = {
            ran: true,
            reason: null,
            chunkSize,
            chunks: [],
            created: 0,
            skipped: 0,
            errors: 0,
        };
        const phasedStarted = Date.now();
        log(`Phased import in chunks of ${chunkSize}`);
        for (let index = 0; index < FULL_ROWS; index += chunkSize) {
            const count = Math.min(chunkSize, FULL_ROWS - index);
            const chunkRows = buildRows(count, FULL_PREFIX, index + 1);
            const chunkFile = spreadsheetFor(chunkRows);
            const chunkUpload = await uploadOnce(config, auth.token, chunkFile, 10 * 60 * 1000);
            report.phased.chunks.push({
                index: report.phased.chunks.length + 1,
                rows: count,
                ...noteUpload(chunkUpload),
            });
            report.phased.created += chunkUpload.summary?.created || 0;
            report.phased.skipped += chunkUpload.summary?.skipped || 0;
            report.phased.errors += chunkUpload.summary?.errors || 0;
            log(`Chunk ${report.phased.chunks.length} status ${chunkUpload.status} created ${chunkUpload.summary?.created ?? 0} in ${chunkUpload.elapsedMs} ms`);
            if (chunkUpload.timedOut || chunkUpload.status === 0 || chunkUpload.status >= 500) {
                report.phased.stoppedEarly = chunkUpload.code || `HTTP_${chunkUpload.status}`;
                const poll = await waitUntilIdle({ ...scope, prefix: FULL_PREFIX, startedAt: phasedStarted });
                report.phased.poll = poll;
                if (!poll.stable) throw new Error("Phased inserts did not settle. Cleanup was not run.");
                break;
            }
        }
        report.phased.wallClockMs = Date.now() - phasedStarted;

        if (!report.phased.stoppedEarly) {
            const duplicateFile = spreadsheetFor(buildRows(chunkSize, FULL_PREFIX, 1));
            const duplicateUpload = await uploadOnce(config, auth.token, duplicateFile, 10 * 60 * 1000);
            report.phased.duplicate = noteUpload(duplicateUpload);
            log(`Duplicate chunk status ${duplicateUpload.status} skipped ${duplicateUpload.summary?.skipped ?? 0} in ${duplicateUpload.elapsedMs} ms`);
            if (duplicateUpload.timedOut || duplicateUpload.status === 0 || duplicateUpload.status >= 500) {
                const poll = await waitUntilIdle({ ...scope, prefix: FULL_PREFIX, startedAt: phasedStarted });
                report.phased.duplicatePoll = { count: poll.count, stable: poll.stable };
                if (!poll.stable) throw new Error("Duplicate-chunk inserts did not settle. Cleanup was not run.");
            }
        }

        const phasedStored = await countPerfMembers({ ...scope, prefix: FULL_PREFIX });
        report.phased.stored = phasedStored;
        report.cleanup.phased = await deleteStored({
            ...scope,
            prefix: FULL_PREFIX,
            expected: phasedStored,
            maxRows: FULL_ROWS,
        });
        log(`Deleted ${report.cleanup.phased.deleted} phased members`);
    } catch (error) {
        report.error = error.message;
        exitCode = 1;
        console.error(error.stack || error.message);
    } finally {
        if (!report.cleanup.phased) report.cleanup.phased = { counted: 0, deleted: 0 };
        if (report.tenantId && report.userId) {
            try {
                for (const [prefix, maxRows] of [[PROBE_PREFIX, PROBE_ROWS], [FULL_PREFIX, FULL_ROWS]]) {
                    const first = await countPerfMembers({ tenantId: report.tenantId, userId: report.userId, prefix });
                    if (first === 0) continue;
                    await sleep(2000);
                    const second = await countPerfMembers({ tenantId: report.tenantId, userId: report.userId, prefix });
                    if (first !== second) {
                        log(`Left ${prefix} members in place because the count moved from ${first} to ${second}`);
                        continue;
                    }
                    const removed = await deleteStored({
                        tenantId: report.tenantId,
                        userId: report.userId,
                        prefix,
                        expected: second,
                        maxRows,
                    });
                    report.cleanup.emergency = report.cleanup.emergency || {};
                    report.cleanup.emergency[prefix] = removed;
                    log(`Removed ${removed.deleted} leftover ${prefix} members`);
                }
                report.systemId.final = await readSystemSeq(report.tenantId);
            } catch (error) {
                report.cleanupError = error.message;
                console.error(error.message);
            }
        }
        report.finishedAt = stamp();
        try {
            writeReport(report);
            log("Wrote scripts/perf/results/phase1-report.json");
        } catch (error) {
            console.error(`Could not write the report: ${error.message}`);
        }
        console.log(JSON.stringify({
            error: report.error || null,
            probeMs: report.probe?.elapsedMs ?? null,
            perRowMs: report.probe?.perRowMs ?? null,
            singleStatus: report.singleShot?.upload?.status ?? null,
            singleMs: report.singleShot?.upload?.elapsedMs ?? null,
            singleStored: report.singleShot?.stored ?? null,
            phasedRan: Boolean(report.phased?.ran),
            phasedMs: report.phased?.wallClockMs ?? null,
            cleanup: report.cleanup,
            systemId: report.systemId,
        }, null, 2));
        await disconnectDb();
        process.exitCode = exitCode;
    }
}

main();
