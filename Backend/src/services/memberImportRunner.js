const mongoose = require("mongoose");
const Member = require("../models/Member");
const MemberImportJob = require("../models/MemberImportJob");
const { runWithTenant, runAsPlatform, getTenantId } = require("../context/tenantContext");
const { reserveSystemIds, systemIdFloor } = require("../utils/sequence");
const { resolveSalesAssignee } = require("../utils/salesAssignment");
const { invalidateTenantCache } = require("../utils/cacheInvalidator");
const logger = require("../utils/logger");
const {
    CHUNK_SIZE,
    MAX_STORED_ERRORS,
    parseSpreadsheetBuffer,
    chunkCountFor,
} = require("./memberImportRows");
const {
    normalizePhone,
    takenPhoneSet,
    phoneAlreadyUsed,
} = require("../utils/identityUniqueness");

function presentJob(job) {
    const total = job.totalRows || 0;
    const processed = job.processedRows || 0;
    return {
        jobId: String(job._id),
        status: job.status,
        stage: job.stage,
        fileName: job.fileName || "",
        totalRows: total,
        processedRows: processed,
        percent: total ? Math.min(100, Math.round((processed / total) * 100)) : 0,
        chunkSize: job.chunkSize || CHUNK_SIZE,
        chunkIndex: job.chunkIndex || 0,
        chunkCount: job.chunkCount || 0,
        summary: {
            total,
            created: job.createdCount || 0,
            skipped: job.skippedCount || 0,
            errors: job.errorCount || 0,
        },
        errors: job.rowErrors || [],
        errorMessage: job.errorMessage || null,
    };
}

function rememberError(bucket, entry) {
    bucket.count += 1;
    if (bucket.samples.length < MAX_STORED_ERRORS) bucket.samples.push(entry);
}

async function importChunk(slice, { userId, salesAssignee, seenPhones, floor }) {
    const outcome = { created: 0, skipped: 0, errors: { count: 0, samples: [] }, processed: slice.length };
    const candidates = [];

    for (const row of slice) {
        if (row.error) {
            rememberError(outcome.errors, { line: row.line, name: row.name, phone: row.phone, reason: row.error });
            continue;
        }
        const phoneKey = normalizePhone(row.phone);
        if (!phoneKey) {
            rememberError(outcome.errors, { line: row.line, name: row.name, phone: row.phone, reason: "Invalid phone number" });
            continue;
        }
        if (seenPhones.has(phoneKey)) {
            outcome.skipped += 1;
            continue;
        }
        seenPhones.add(phoneKey);
        candidates.push({ ...row, phone: String(row.phone).trim(), phoneKey });
    }

    if (!candidates.length) return outcome;

    const taken = await takenPhoneSet(candidates.map((row) => row.phoneKey));
    const fresh = [];
    for (const row of candidates) {
        if (phoneAlreadyUsed(taken, row.phoneKey)) {
            outcome.skipped += 1;
            continue;
        }
        fresh.push(row);
    }

    if (!fresh.length) return outcome;

    const { start } = await reserveSystemIds(fresh.length, floor);
    const tenantId = new mongoose.Types.ObjectId(getTenantId());
    const docs = fresh.map((row, index) => ({
        tenantId,
        systemId: start + index,
        name: row.name,
        phones: row.phone,
        phoneKey: row.phoneKey,
        photo: null,
        status: "guest",
        isMember: false,
        source: "data entry",
        assignedSales: salesAssignee || null,
        createdBy: userId,
    }));

    try {
        const inserted = await Member.insertMany(docs, { ordered: false });
        outcome.created += inserted.length;
    } catch (error) {
        const inserted = Number(error?.result?.insertedCount ?? error?.insertedDocs?.length ?? 0);
        outcome.created += inserted;
        const failed = Math.max(0, docs.length - inserted);
        for (let index = 0; index < failed; index += 1) {
            const row = fresh[Math.min(inserted + index, fresh.length - 1)];
            rememberError(outcome.errors, {
                line: row.line,
                name: row.name,
                phone: row.phone,
                reason: error.message || "Could not save this row",
            });
        }
    }

    return outcome;
}

async function saveProgress(jobId, fields) {
    await MemberImportJob.updateOne({ _id: jobId }, { $set: fields });
}

async function runJob(jobId, rows, userId) {
    const salesAssignee = await resolveSalesAssignee(null);
    const top = await Member.findOne({ systemId: { $type: "number" } })
        .sort({ systemId: -1 })
        .select("systemId")
        .lean();
    const floor = systemIdFloor(top?.systemId || 0);
    const seenPhones = new Set();
    const parts = chunkCountFor(rows.length);
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errorSamples = [];

    for (let index = 0; index < parts; index += 1) {
        const slice = rows.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        await saveProgress(jobId, {
            status: "processing",
            stage: `Importing part ${index + 1} of ${parts}`,
            chunkIndex: index + 1,
            chunkCount: parts,
        });

        const outcome = await importChunk(slice, { userId, salesAssignee, seenPhones, floor });
        createdCount += outcome.created;
        skippedCount += outcome.skipped;
        errorCount += outcome.errors.count;
        for (const sample of outcome.errors.samples) {
            if (errorSamples.length < MAX_STORED_ERRORS) errorSamples.push(sample);
        }

        await saveProgress(jobId, {
            processedRows: Math.min(rows.length, (index + 1) * CHUNK_SIZE),
            createdCount,
            skippedCount,
            errorCount,
            rowErrors: errorSamples,
            stage: `Importing part ${index + 1} of ${parts}`,
            chunkIndex: index + 1,
        });
        await new Promise((resolve) => setImmediate(resolve));
    }

    await saveProgress(jobId, {
        status: "completed",
        stage: "Import complete",
        processedRows: rows.length,
        chunkIndex: parts,
        createdCount,
        skippedCount,
        errorCount,
        rowErrors: errorSamples,
    });
    invalidateTenantCache(getTenantId(), "members", "revenue");
}

function scheduleJob(jobId, rows, context) {
    setImmediate(() => {
        runWithTenant(context, async () => {
            try {
                await runJob(jobId, rows, context.userId);
            } catch (error) {
                logger.error("import", "Member import failed", { jobId: String(jobId), error: error.message });
                await saveProgress(jobId, {
                    status: "failed",
                    stage: "Import stopped",
                    errorMessage: error.message || "Import failed",
                });
                invalidateTenantCache(context.tenantId, "members", "revenue");
            }
        }).catch((error) => {
            logger.error("import", "Member import could not start", { jobId: String(jobId), error: error.message });
        });
    });
}

async function startMemberImport({ buffer, fileName, userId, tenantId, tenantSlug }) {
    const rows = parseSpreadsheetBuffer(buffer);
    const parts = chunkCountFor(rows.length);
    const job = await MemberImportJob.create({
        status: "processing",
        stage: `Divided into ${parts} ${parts === 1 ? "part" : "parts"}`,
        fileName: fileName || "members.xlsx",
        totalRows: rows.length,
        processedRows: 0,
        chunkSize: CHUNK_SIZE,
        chunkIndex: 0,
        chunkCount: parts,
        createdBy: userId,
    });

    scheduleJob(job._id, rows, { tenantId, tenantSlug, userId });
    return presentJob(job);
}

async function getMemberImport(jobId) {
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
        const error = new Error("Import not found");
        error.statusCode = 404;
        throw error;
    }
    const job = await MemberImportJob.findById(jobId).lean();
    if (!job) return null;
    return presentJob(job);
}

async function failInterruptedImports() {
    const result = await runAsPlatform(async () => {
        return MemberImportJob.updateMany(
            { status: "processing" },
            {
                $set: {
                    status: "failed",
                    stage: "Import stopped",
                    errorMessage: "The import stopped because the server restarted. Upload the file again.",
                },
            }
        );
    });
    if (result.modifiedCount) {
        logger.info("import", "Marked interrupted member imports as failed", { count: result.modifiedCount });
    }
}

module.exports = {
    startMemberImport,
    getMemberImport,
    failInterruptedImports,
    presentJob,
};
