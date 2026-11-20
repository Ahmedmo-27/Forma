const crypto = require("crypto");
const ContractSignature = require("../models/ContractSignature");
const Tenant = require("../models/Tenant");
const { findMemberByIdentifier } = require("../utils/memberLookup");
const { forbidIfOutOfLocationScope } = require("../utils/locationScope");
const { resolveSubscriptionPackage } = require("../utils/packageSnapshot");
const { sanitizePlainText } = require("../utils/sanitizeText");
const { runAsPlatform } = require("../context/tenantContext");
const { writeAudit } = require("../utils/audit");
const { BILLING_CURRENCY } = require("../config/currency");

const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Base64 of this must stay under the app-wide 100kb JSON body limit.
const MAX_IMAGE_BYTES = 60 * 1024;

/** Accepts only a PNG data URL of sensible size; returns the bytes or null. */
function decodeSignatureImage(dataUrl) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_PREFIX)) return null;
    const base64 = dataUrl.slice(PNG_PREFIX.length);
    if (base64.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4) return null;
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length < 64 || bytes.length > MAX_IMAGE_BYTES) return null;
    if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) return null;
    return bytes;
}

function hashTerms(terms) {
    return crypto.createHash("sha256").update(terms || "", "utf8").digest("hex");
}

async function loadTenant(tenantId) {
    return runAsPlatform(() =>
        Tenant.findById(tenantId)
            .select("name settings.branding.displayName settings.contractTerms settings.locale billingProfile.legalName")
            .lean()
    );
}

async function loadContract(req) {
    const member = await findMemberByIdentifier(req.params.memberId);
    if (!member) return { status: 404, message: "Member not found" };
    const forbidden = forbidIfOutOfLocationScope(req, member);
    if (forbidden) return { status: forbidden.status, message: forbidden.message, code: forbidden.code };

    await member.populate("subscriptions.package", "name duration activityType price");
    const ref = String(req.params.subscriptionId);
    const sub = (member.subscriptions || []).find(
        (s) => String(s._id) === ref || (s.subscriptionId != null && String(s.subscriptionId) === ref)
    );
    if (!sub) return { status: 404, message: "Membership not found for this member" };
    return { member, sub };
}

function contractSnapshot({ member, sub, tenant }) {
    const pkg = resolveSubscriptionPackage(sub);
    return {
        gymName: tenant?.settings?.branding?.displayName || tenant?.name || "",
        legalName: tenant?.billingProfile?.legalName || "",
        memberName: member.name,
        memberSystemId: member.systemId ?? null,
        memberId: member.memberId ?? null,
        subscriptionId: sub.subscriptionId ?? null,
        packageName: pkg?.name || "",
        activityType: pkg?.activityType || "",
        startDate: sub.startDate,
        endDate: sub.endDate,
        pricePaid: sub.pricePaid,
        currency: tenant?.settings?.locale?.currency || BILLING_CURRENCY,
    };
}

/** Mongoose docs hold a Buffer; lean reads hold a BSON Binary. */
function imageBytes(value) {
    if (Buffer.isBuffer(value)) return value;
    if (value?._bsontype === "Binary") return Buffer.from(value.buffer.subarray(0, value.position));
    return Buffer.from(value || []);
}

function presentSignature(doc) {
    return {
        signerName: doc.signerName,
        signedAt: doc.signedAt,
        capturedBy: doc.capturedBy && typeof doc.capturedBy === "object"
            ? { _id: doc.capturedBy._id, name: doc.capturedBy.name }
            : doc.capturedBy,
        image: `${PNG_PREFIX}${imageBytes(doc.image).toString("base64")}`,
        terms: doc.terms,
        termsHash: doc.termsHash,
        contract: doc.contractSnapshot,
    };
}

/**
 * GET /api/members/:memberId/subscriptions/:subscriptionId/signature
 * The signed contract, or what the member would sign right now.
 */
const getContractSignature = async (req, res) => {
    try {
        const loaded = await loadContract(req);
        if (loaded.status) return res.status(loaded.status).json({ message: loaded.message, code: loaded.code });
        const { member, sub } = loaded;

        const existing = await ContractSignature.findOne({ subscription: sub._id }).populate("capturedBy", "name");
        if (existing) {
            return res.json({ signed: true, signature: presentSignature(existing) });
        }

        const tenant = await loadTenant(req.user.tenantId);
        res.json({
            signed: false,
            terms: tenant?.settings?.contractTerms || "",
            contract: contractSnapshot({ member, sub, tenant }),
        });
    } catch (error) {
        res.status(500).json({ message: error.message || "Server error" });
    }
};

/**
 * POST /api/members/:memberId/subscriptions/:subscriptionId/signature
 * Body: { signerName, image: "data:image/png;base64,...", acceptTerms: true }
 */
const signContract = async (req, res) => {
    try {
        const signerName = sanitizePlainText(String(req.body?.signerName || "")).slice(0, 120);
        if (signerName.length < 2) {
            return res.status(400).json({ message: "Enter the full name of the person signing" });
        }
        if (req.body?.acceptTerms !== true) {
            return res.status(400).json({ message: "The member must accept the contract terms before signing" });
        }
        const image = decodeSignatureImage(req.body?.image);
        if (!image) {
            return res.status(400).json({ message: "The signature is missing or invalid. Ask the member to sign again." });
        }

        const loaded = await loadContract(req);
        if (loaded.status) return res.status(loaded.status).json({ message: loaded.message, code: loaded.code });
        const { member, sub } = loaded;

        if (await ContractSignature.exists({ subscription: sub._id })) {
            return res.status(409).json({ code: "CONTRACT_ALREADY_SIGNED", message: "This membership contract is already signed" });
        }

        const tenant = await loadTenant(req.user.tenantId);
        const terms = tenant?.settings?.contractTerms || "";
        let doc;
        try {
            doc = await ContractSignature.create({
                member: member._id,
                subscription: sub._id,
                subscriptionId: sub.subscriptionId ?? null,
                signerName,
                image,
                terms,
                termsHash: hashTerms(terms),
                contractSnapshot: contractSnapshot({ member, sub, tenant }),
                signedAt: new Date(),
                capturedBy: req.user.id,
                ip: req.ip || null,
                userAgent: String(req.headers?.["user-agent"] || "").slice(0, 400) || null,
            });
        } catch (error) {
            if (error?.code === 11000) {
                return res.status(409).json({ code: "CONTRACT_ALREADY_SIGNED", message: "This membership contract is already signed" });
            }
            throw error;
        }

        await writeAudit({
            action: "contract_signed",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "member",
            targetId: member._id,
            meta: { subscriptionId: sub.subscriptionId ?? String(sub._id), signerName, termsHash: doc.termsHash },
            req,
        });

        res.status(201).json({ signed: true, signature: presentSignature({ ...doc.toObject(), capturedBy: { _id: req.user.id, name: req.user.name } }) });
    } catch (error) {
        res.status(500).json({ message: error.message || "Server error" });
    }
};

module.exports = {
    getContractSignature,
    signContract,
    decodeSignatureImage,
    hashTerms,
};
