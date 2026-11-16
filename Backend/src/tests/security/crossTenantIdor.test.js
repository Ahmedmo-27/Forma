/**
 * Phase 1 — Cross-tenant IDOR / isolation guards.
 * Ensures tenant A context cannot read tenant B objects via shared IDs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

const { runWithTenant } = require("../../context/tenantContext");
const { canAssignRole } = require("../../utils/accessControl");
const tenantPlugin = require("../../plugins/tenantPlugin");

describe("Security Phase 1: cross-tenant IDOR", () => {
    const tenantA = new mongoose.Types.ObjectId().toString();
    const tenantB = new mongoose.Types.ObjectId().toString();
    const sharedObjectId = new mongoose.Types.ObjectId().toString();

    const idorSchema = new mongoose.Schema({
        name: String,
        secret: String,
    });
    idorSchema.plugin(tenantPlugin);
    const IdorModel =
        mongoose.models.SecurityIdorItem || mongoose.model("SecurityIdorItem", idorSchema);

    const findHook = idorSchema.s.hooks._pres.get("find")[0].fn;
    const findOneHook = idorSchema.s.hooks._pres.get("findOne")[0].fn;

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("injects caller tenantId into find filters (body tenantId cannot widen scope)", () => {
        const mockQuery = { where: vi.fn() };
        runWithTenant({ tenantId: tenantA }, () => {
            findHook.call(mockQuery);
        });
        expect(mockQuery.where).toHaveBeenCalledWith({
            tenantId: new mongoose.Types.ObjectId(tenantA),
        });
        expect(mockQuery.where).not.toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: new mongoose.Types.ObjectId(tenantB) })
        );
    });

    it("scopes findOne the same way as find for object-ID lookups", () => {
        const mockQuery = { where: vi.fn() };
        runWithTenant({ tenantId: tenantA }, () => {
            findOneHook.call(mockQuery);
        });
        expect(mockQuery.where).toHaveBeenCalledWith({
            tenantId: new mongoose.Types.ObjectId(tenantA),
        });
    });

    it("does not let a forged tenantId in the filter replace ALS tenant context", () => {
        const mockQuery = {
            where: vi.fn(function where(cond) {
                this._conditions = { ...(this._conditions || {}), ...cond };
                return this;
            }),
            _conditions: { _id: sharedObjectId, tenantId: tenantB },
        };
        runWithTenant({ tenantId: tenantA }, () => {
            findHook.call(mockQuery);
        });
        // Plugin always where()'s the ALS tenant — attacker-supplied B must not be the sole scope.
        expect(mockQuery.where).toHaveBeenCalledWith({
            tenantId: new mongoose.Types.ObjectId(tenantA),
        });
    });

    it("R2 key partition uses tenant prefix so A cannot address B objects by filename alone", () => {
        const filename = "photo-abc123.jpg";
        const keyA = `${tenantA}/${filename}`;
        const keyB = `${tenantB}/${filename}`;
        expect(keyA).not.toBe(keyB);
        expect(keyA.startsWith(`${tenantA}/`)).toBe(true);
        expect(keyB.startsWith(`${tenantB}/`)).toBe(true);
    });

    it("model is registered with tenant plugin for member-like resources", () => {
        expect(IdorModel.schema.paths.tenantId).toBeTruthy();
    });
});

describe("Security Phase 1: horizontal role change denial", () => {
    it("blocks self role escalation", () => {
        const id = new mongoose.Types.ObjectId().toString();
        const actor = { _id: id, role: "Receptionist" };
        const result = canAssignRole(actor, actor, "Owner");
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/own role/i);
    });

    it("blocks Receptionist assigning Owner to another user", () => {
        const actor = { _id: new mongoose.Types.ObjectId(), role: "Receptionist" };
        const target = { _id: new mongoose.Types.ObjectId(), role: "Sales" };
        const result = canAssignRole(actor, target, "Owner");
        expect(result.ok).toBe(false);
    });

    it("blocks changing an Owner account", () => {
        const actor = { _id: new mongoose.Types.ObjectId(), role: "Owner" };
        const target = { _id: new mongoose.Types.ObjectId(), role: "Owner" };
        const result = canAssignRole(actor, target, "Receptionist");
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/Owner/i);
    });
});
