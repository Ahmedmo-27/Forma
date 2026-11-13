const mongoose = require("mongoose");
const { getTenantId, isPlatformContext } = require("../context/tenantContext");

/**
 * Inject tenantId into every bulkWrite operation filter/document.
 * Throws if a document tenantId conflicts with the active context.
 */
function scopeBulkWriteOps(ops, tenantId) {
    const tenantObjId = new mongoose.Types.ObjectId(tenantId);
    if (!Array.isArray(ops)) {
        throw new Error("TenantIsolationViolationError: bulkWrite ops must be an array.");
    }

    return ops.map((op) => {
        if (!op || typeof op !== "object") {
            throw new Error("TenantIsolationViolationError: invalid bulkWrite operation.");
        }

        const keyed = { ...op };

        if (keyed.insertOne?.document) {
            const doc = { ...keyed.insertOne.document };
            if (!doc.tenantId) {
                doc.tenantId = tenantObjId;
            } else if (String(doc.tenantId) !== String(tenantId)) {
                throw new Error(
                    "TenantIsolationViolationError: bulkWrite insertOne tenantId mismatch."
                );
            }
            keyed.insertOne = { ...keyed.insertOne, document: doc };
            return keyed;
        }

        for (const key of ["updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany"]) {
            if (!keyed[key]) continue;
            const body = { ...keyed[key] };
            body.filter = { ...(body.filter || {}), tenantId: tenantObjId };
            if (key === "replaceOne" && body.replacement) {
                const replacement = { ...body.replacement };
                if (!replacement.tenantId) {
                    replacement.tenantId = tenantObjId;
                } else if (String(replacement.tenantId) !== String(tenantId)) {
                    throw new Error(
                        "TenantIsolationViolationError: bulkWrite replaceOne tenantId mismatch."
                    );
                }
                body.replacement = replacement;
            }
            keyed[key] = body;
            return keyed;
        }

        throw new Error(
            "TenantIsolationViolationError: unsupported bulkWrite operation under tenant context."
        );
    });
}

/**
 * Mongoose plugin providing strict multi-tenant isolation.
 *
 * Guarantees:
 * 1. Adds tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true }
 * 2. Auto-injects tenantId into all query filters (find, findOne, update, delete, count, distinct)
 * 3. Auto-injects { $match: { tenantId } } at the beginning of all aggregation pipelines
 * 4. Auto-stamps tenantId on document save and insertMany
 * 5. Scopes bulkWrite filters/documents to the active tenant (Model.bulkWrite override)
 * 6. THROWS TenantContextMissingError if an operation is executed without an active
 *    tenant context, preventing accidental cross-tenant data leakage or unscoped mutations.
 * 7. Supports explicit runAsPlatform(fn) bypass for platform administration and migrations.
 */
function tenantPlugin(schema) {
    // 1. Add required, indexed tenantId field if not already defined
    if (!schema.path("tenantId")) {
        schema.add({
            tenantId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Tenant",
                required: true,
                index: true,
            },
        });
    }

    // 2. Pre-validate: enforce and stamp tenantId
    schema.pre("validate", function () {
        if (isPlatformContext()) {
            return;
        }

        const tenantId = getTenantId();
        if (!tenantId) {
            throw new Error(
                "TenantContextMissingError: Cannot save document without an active tenant context."
            );
        }

        if (!this.tenantId) {
            this.tenantId = new mongoose.Types.ObjectId(tenantId);
        } else if (String(this.tenantId) !== String(tenantId)) {
            throw new Error(
                `TenantIsolationViolationError: Document tenantId (${this.tenantId}) does not match active context tenantId (${tenantId}).`
            );
        }
    });

    // 3. Query middleware: auto-scope find, findOne, update, delete, count, distinct
    const queryMethods = [
        "find",
        "findOne",
        "findOneAndUpdate",
        "findOneAndDelete",
        "findOneAndReplace",
        "updateOne",
        "updateMany",
        "deleteOne",
        "deleteMany",
        "countDocuments",
        "distinct",
    ];

    schema.pre(queryMethods, function () {
        if (isPlatformContext()) {
            return;
        }

        const tenantId = getTenantId();
        if (!tenantId) {
            throw new Error(
                "TenantContextMissingError: Query operation executed without active tenant context."
            );
        }

        const tenantObjId = new mongoose.Types.ObjectId(tenantId);
        this.where({ tenantId: tenantObjId });
    });

    // 4. Aggregation middleware: prepend $match stage
    schema.pre("aggregate", function () {
        if (isPlatformContext()) {
            return;
        }

        const tenantId = getTenantId();
        if (!tenantId) {
            throw new Error(
                "TenantContextMissingError: Aggregate pipeline executed without active tenant context."
            );
        }

        const tenantObjId = new mongoose.Types.ObjectId(tenantId);
        this.pipeline().unshift({ $match: { tenantId: tenantObjId } });
    });

    // 5. insertMany middleware: stamp tenantId on all documents
    schema.pre("insertMany", function (docs) {
        if (isPlatformContext()) {
            return;
        }

        const tenantId = getTenantId();
        if (!tenantId) {
            throw new Error(
                "TenantContextMissingError: insertMany executed without active tenant context."
            );
        }

        const tenantObjId = new mongoose.Types.ObjectId(tenantId);
        if (Array.isArray(docs)) {
            for (const doc of docs) {
                if (!doc.tenantId) {
                    doc.tenantId = tenantObjId;
                } else if (String(doc.tenantId) !== String(tenantId)) {
                    throw new Error(
                        "TenantIsolationViolationError: Document tenantId does not match active context tenantId in insertMany."
                    );
                }
            }
        }
    });

    // 6. bulkWrite: Mongoose does not run query middleware on bulkWrite — override static
    schema.statics.bulkWrite = function tenantScopedBulkWrite(ops, options) {
        if (isPlatformContext()) {
            return mongoose.Model.bulkWrite.call(this, ops, options);
        }

        const tenantId = getTenantId();
        if (!tenantId) {
            throw new Error(
                "TenantContextMissingError: bulkWrite executed without active tenant context."
            );
        }

        const scopedOps = scopeBulkWriteOps(ops, tenantId);
        return mongoose.Model.bulkWrite.call(this, scopedOps, options);
    };
}

tenantPlugin.scopeBulkWriteOps = scopeBulkWriteOps;

module.exports = tenantPlugin;
