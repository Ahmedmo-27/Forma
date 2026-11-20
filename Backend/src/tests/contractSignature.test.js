import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";
import mongoose from "mongoose";

const require = createRequire(import.meta.url);
const Member = require("../models/Member");
const Tenant = require("../models/Tenant");
const ContractSignature = require("../models/ContractSignature");
const AuditLog = require("../models/AuditLog");
const { runWithTenant } = require("../context/tenantContext");
const {
    getContractSignature,
    signContract,
    decodeSignatureImage,
    hashTerms,
} = require("../controllers/contractSignatureController");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const tenantId = new mongoose.Types.ObjectId();
const staff = { id: new mongoose.Types.ObjectId().toString(), name: "Mona", role: "Receptionist", tenantId: String(tenantId) };

function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

function memberWithSubscription() {
    const subId = new mongoose.Types.ObjectId();
    const member = {
        _id: new mongoose.Types.ObjectId(),
        name: "Omar Adel",
        systemId: 1042,
        memberId: 77,
        subscriptions: [
            {
                _id: subId,
                subscriptionId: 501,
                packageSnapshot: { name: "Gold 3 Months", activityType: "gym" },
                startDate: new Date("2026-11-01"),
                endDate: new Date("2027-02-01"),
                pricePaid: 3500,
            },
        ],
        populate: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(Member, "findOne").mockResolvedValue(member);
    return { member, subId };
}

function stubTenant(terms = "No refunds after 14 days.") {
    vi.spyOn(Tenant, "findById").mockReturnValue({
        select: () => ({
            lean: () => Promise.resolve({ name: "Nile Gym", settings: { contractTerms: terms, locale: { currency: "EGP" } } }),
        }),
    });
}

const inTenant = (fn) => runWithTenant({ tenantId: String(tenantId) }, fn);

describe("contract signatures", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(AuditLog, "create").mockResolvedValue({});
    });

    describe("decodeSignatureImage", () => {
        it("accepts a PNG data URL", () => {
            const bytes = decodeSignatureImage(PNG);
            expect(Buffer.isBuffer(bytes)).toBe(true);
            expect(bytes.subarray(1, 4).toString()).toBe("PNG");
        });

        it("rejects other formats, fake PNGs, and oversized images", () => {
            expect(decodeSignatureImage("data:image/jpeg;base64,/9j/4AAQ")).toBeNull();
            expect(decodeSignatureImage(`data:image/png;base64,${Buffer.alloc(200, 1).toString("base64")}`)).toBeNull();
            const huge = Buffer.concat([decodeSignatureImage(PNG), Buffer.alloc(70 * 1024)]);
            expect(decodeSignatureImage(`data:image/png;base64,${huge.toString("base64")}`)).toBeNull();
            expect(decodeSignatureImage(null)).toBeNull();
        });
    });

    it("shows the unsigned contract with the gym's current terms", async () => {
        const { subId } = memberWithSubscription();
        stubTenant();
        vi.spyOn(ContractSignature, "findOne").mockReturnValue({ populate: () => Promise.resolve(null) });
        const res = mockRes();

        await inTenant(() => getContractSignature({ params: { memberId: "1042", subscriptionId: String(subId) }, user: staff }, res));

        const body = res.json.mock.calls[0][0];
        expect(body.signed).toBe(false);
        expect(body.terms).toBe("No refunds after 14 days.");
        expect(body.contract).toMatchObject({ gymName: "Nile Gym", memberName: "Omar Adel", packageName: "Gold 3 Months", pricePaid: 3500, currency: "EGP" });
    });

    it("stores the signature with frozen terms, a hash, and an audit row", async () => {
        const { member, subId } = memberWithSubscription();
        stubTenant();
        vi.spyOn(ContractSignature, "exists").mockResolvedValue(null);
        const create = vi.spyOn(ContractSignature, "create").mockImplementation(async (doc) => ({ ...doc, toObject: () => doc }));
        const res = mockRes();

        await inTenant(() =>
            signContract(
                {
                    params: { memberId: "1042", subscriptionId: "501" },
                    body: { signerName: "Omar Adel", image: PNG, acceptTerms: true },
                    user: staff,
                    ip: "10.0.0.5",
                    headers: { "user-agent": "Tablet" },
                },
                res
            )
        );

        expect(res.status).toHaveBeenCalledWith(201);
        const saved = create.mock.calls[0][0];
        expect(saved).toMatchObject({
            member: member._id,
            subscription: subId,
            subscriptionId: 501,
            signerName: "Omar Adel",
            terms: "No refunds after 14 days.",
            termsHash: hashTerms("No refunds after 14 days."),
            capturedBy: staff.id,
            ip: "10.0.0.5",
            userAgent: "Tablet",
        });
        expect(Buffer.isBuffer(saved.image)).toBe(true);
        expect(saved.contractSnapshot).toMatchObject({ memberName: "Omar Adel", packageName: "Gold 3 Months" });
        expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: "contract_signed" }));
        expect(res.json.mock.calls[0][0].signature.image).toBe(PNG);
    });

    it("refuses to sign twice", async () => {
        memberWithSubscription();
        stubTenant();
        vi.spyOn(ContractSignature, "exists").mockResolvedValue({ _id: 1 });
        const create = vi.spyOn(ContractSignature, "create");
        const res = mockRes();

        await inTenant(() =>
            signContract({ params: { memberId: "1042", subscriptionId: "501" }, body: { signerName: "Omar", image: PNG, acceptTerms: true }, user: staff, headers: {} }, res)
        );

        expect(res.status).toHaveBeenCalledWith(409);
        expect(create).not.toHaveBeenCalled();
    });

    it("requires accepted terms, a name, and a real signature", async () => {
        const cases = [
            { signerName: "Omar", image: PNG, acceptTerms: false },
            { signerName: "O", image: PNG, acceptTerms: true },
            { signerName: "Omar", image: "data:image/png;base64,AAAA", acceptTerms: true },
        ];
        for (const body of cases) {
            const res = mockRes();
            await signContract({ params: { memberId: "1042", subscriptionId: "501" }, body, user: staff, headers: {} }, res);
            expect(res.status).toHaveBeenCalledWith(400);
        }
    });

    it("404s for a membership that is not on this member", async () => {
        memberWithSubscription();
        const res = mockRes();
        await inTenant(() =>
            signContract({ params: { memberId: "1042", subscriptionId: "999" }, body: { signerName: "Omar", image: PNG, acceptTerms: true }, user: staff, headers: {} }, res)
        );
        expect(res.status).toHaveBeenCalledWith(404);
    });
});
