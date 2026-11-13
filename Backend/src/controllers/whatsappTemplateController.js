const WhatsAppTemplate = require("../models/WhatsAppTemplate");
const { parsePagination, buildPagination } = require("../utils/pagination");
const { writeAudit } = require("../utils/audit");
const { hasAccess, hasExplicitGrant } = require("../utils/accessControl");
const { incrementCachedAllowance } = require("../utils/whatsappTracking");
const { invalidateTenantCache } = require("../utils/cacheInvalidator");

const MANAGER_ROLES = new Set(["Owner", "Sales Manager", "Accountant", "Head Coach"]);

const STARTER_TEMPLATES = [
    {
        name: "Our packages",
        type: "packages",
        introText: "Hi {{name}}!\nHere are our current membership packages:",
        bodyText: "Tell me which package you prefer and I’ll help you get started.",
        introTextAr: "مرحباً {{name}}!\nهذه باقات العضوية الحالية لدينا:",
        bodyTextAr: "أخبرني أي باقة تفضل وسأساعدك على البدء.",
        includeLiveData: true,
        isDefault: true,
    },
    {
        name: "Special discount",
        type: "discounts",
        introText: "Hi {{name}}!\nI have a special discount for you:",
        bodyText: "This offer is available for a limited time — reply if you’d like to lock it in.",
        introTextAr: "مرحباً {{name}}!\nلدي خصم خاص لك:",
        bodyTextAr: "هذا العرض متاح لفترة محدودة — رد عليّ إذا حابب تثبّته.",
        includeLiveData: true,
        defaultDiscountPercent: 50,
        isDefault: true,
    },
];

async function ensureStarterTemplates(createdBy) {
    const existing = await WhatsAppTemplate.find({
        $or: STARTER_TEMPLATES.map((starter) => ({ name: starter.name, type: starter.type })),
    }).select("name type").lean();
    if (existing.length >= STARTER_TEMPLATES.length) return 0;
    const present = new Set(existing.map((row) => `${row.type}:${row.name}`));
    let created = 0;

    for (const starter of STARTER_TEMPLATES) {
        if (present.has(`${starter.type}:${starter.name}`)) continue;
        created += 1;
        if (starter.isDefault) {
            await WhatsAppTemplate.updateMany(
                { type: starter.type, isDefault: true },
                { $set: { isDefault: false } }
            );
        }
        await WhatsAppTemplate.create({
            ...starter,
            createdBy,
            isActive: true,
            allowedRoles: [],
            defaultPackageIds: [],
        });
    }
    return created;
}

function normalizePackageIds(ids) {
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => String(id)).filter((id) => /^[a-f\d]{24}$/i.test(id));
}

function normalizeAllowedRoles(roles) {
    if (!Array.isArray(roles)) return [];
    const allowed = new Set([
        "Owner", "Sales Manager", "Sales", "Receptionist", "Accountant",
        "Coach", "Head Coach",
    ]);
    return roles.filter((r) => allowed.has(r));
}

async function clearOtherDefaults(type, exceptId) {
    const filter = { type, isDefault: true };
    if (exceptId) filter._id = { $ne: exceptId };
    await WhatsAppTemplate.updateMany(filter, { $set: { isDefault: false } });
}

const createTemplate = async (req, res) => {
    try {
        const {
            name,
            type,
            introText,
            bodyText,
            introTextAr,
            bodyTextAr,
            includeLiveData,
            defaultPackageIds,
            defaultDiscountPercent,
            allowedRoles,
            isDefault,
        } = req.body;

        if (!name?.trim() || !type?.trim()) {
            return res.status(400).json({ message: "Name and type are required" });
        }

        const normalizedType = String(type).trim().toLowerCase();
        const isBuiltin = normalizedType === "packages" || normalizedType === "discounts";
        const wantDefault = isDefault === true || isDefault === "true";

        if (wantDefault) await clearOtherDefaults(normalizedType);

        const template = await WhatsAppTemplate.create({
            name: name.trim(),
            type: normalizedType,
            introText: introText?.trim() || "",
            bodyText: bodyText?.trim() || "",
            introTextAr: introTextAr?.trim() || "",
            bodyTextAr: bodyTextAr?.trim() || "",
            includeLiveData: isBuiltin
                ? (includeLiveData !== false && includeLiveData !== "false")
                : false,
            defaultPackageIds: isBuiltin ? normalizePackageIds(defaultPackageIds) : [],
            defaultDiscountPercent: normalizedType === "discounts"
                ? Math.min(100, Math.max(0, Number(defaultDiscountPercent) || 0))
                : 0,
            allowedRoles: normalizeAllowedRoles(allowedRoles),
            isDefault: wantDefault,
            isActive: true,
            createdBy: req.user.id,
        });

        res.status(201).json({ message: "Template created", template });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTemplates = async (req, res) => {
    try {
        const isManager = MANAGER_ROLES.has(req.user.role);

        if ((req.user.role === "Sales" || hasExplicitGrant(req.user, "whatsapp_send")) && !hasAccess(req.user, "whatsapp_send")) {
            const { page, limit } = parsePagination(req.query, { defaultLimit: 50 });
            return res.status(200).json({
                count: 0,
                templates: [],
                pagination: buildPagination(page, limit, 0),
            });
        }

        const countExists = await WhatsAppTemplate.exists({});
        if (!countExists) {
            await ensureStarterTemplates(req.user.id);
        }

        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
        let filter;
        if (isManager && req.query.all === "true") {
            filter = {};
        } else {
            filter = {
                isActive: true,
                $or: [
                    { allowedRoles: { $exists: false } },
                    { allowedRoles: { $size: 0 } },
                    { allowedRoles: req.user.role },
                ],
            };
        }

        const [count, rows] = await Promise.all([
            WhatsAppTemplate.countDocuments(filter),
            WhatsAppTemplate.aggregate([
                { $match: filter },
                { $sort: { isDefault: -1, createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $lookup: {
                        from: "users",
                        localField: "createdBy",
                        foreignField: "_id",
                        pipeline: [{ $project: { name: 1, role: 1 } }],
                        as: "createdBy",
                    },
                },
                {
                    $lookup: {
                        from: "packages",
                        localField: "defaultPackageIds",
                        foreignField: "_id",
                        pipeline: [{ $project: { name: 1, duration: 1, price: 1, renewalDiscountPercent: 1 } }],
                        as: "defaultPackageIds",
                    },
                },
                { $set: { createdBy: { $arrayElemAt: ["$createdBy", 0] } } },
            ]),
        ]);

        res.status(200).json({
            count,
            templates: rows,
            pagination: buildPagination(page, limit, count),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTemplate = async (req, res) => {
    try {
        const {
            type,
            name,
            introText,
            bodyText,
            introTextAr,
            bodyTextAr,
            includeLiveData,
            defaultPackageIds,
            allowedRoles,
            defaultDiscountPercent,
            isDefault,
        } = req.body;

        const updates = {};
        if (type != null) updates.type = String(type).trim().toLowerCase();
        if (name != null) updates.name = String(name).trim();
        if (introText != null) updates.introText = String(introText).trim();
        if (bodyText != null) updates.bodyText = String(bodyText).trim();
        if (introTextAr != null) updates.introTextAr = String(introTextAr).trim();
        if (bodyTextAr != null) updates.bodyTextAr = String(bodyTextAr).trim();
        if (includeLiveData != null) updates.includeLiveData = Boolean(includeLiveData);
        if (defaultPackageIds != null) {
            updates.defaultPackageIds = normalizePackageIds(defaultPackageIds);
        }
        if (allowedRoles != null) {
            updates.allowedRoles = normalizeAllowedRoles(allowedRoles);
        }
        if (defaultDiscountPercent != null) {
            updates.defaultDiscountPercent = Math.min(
                100,
                Math.max(0, Number(defaultDiscountPercent) || 0)
            );
        }

        const nextType = updates.type;
        if (nextType != null) {
            const isBuiltin = nextType === "packages" || nextType === "discounts";
            if (!isBuiltin) {
                updates.includeLiveData = false;
                updates.defaultPackageIds = [];
                updates.defaultDiscountPercent = 0;
            }
        }

        if (isDefault === true || isDefault === "true") {
            updates.isDefault = true;
            const existing = await WhatsAppTemplate.findById(req.params.id).select("type");
            if (!existing) return res.status(404).json({ message: "Template not found" });
            await clearOtherDefaults(nextType || existing.type, existing._id);
        } else if (isDefault === false || isDefault === "false") {
            updates.isDefault = false;
        }

        const template = await WhatsAppTemplate.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );
        if (!template) return res.status(404).json({ message: "Template not found" });
        res.status(200).json({ message: "Template updated", template });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteTemplate = async (req, res) => {
    try {
        const template = await WhatsAppTemplate.findByIdAndUpdate(
            req.params.id,
            { isActive: false, isDefault: false },
            { new: true }
        );
        if (!template) return res.status(404).json({ message: "Template not found" });
        res.status(200).json({ message: "Template deactivated" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const logTemplateSend = async (req, res) => {
    try {
        if ((req.user.role === "Sales" || hasExplicitGrant(req.user, "whatsapp_send")) && !hasAccess(req.user, "whatsapp_send")) {
            return res.status(403).json({ message: "You are not allowed to send WhatsApp template messages" });
        }

        const { memberId, memberName, templateId } = req.body;
        const template = templateId
            ? await WhatsAppTemplate.findById(templateId).select("name type")
            : null;

        await writeAudit({
            action: "whatsapp_template_sent",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "member",
            targetId: memberId != null ? String(memberId) : null,
            meta: {
                memberName: memberName || null,
                templateId: template?._id?.toString() || templateId || null,
                templateName: template?.name || null,
                templateType: template?.type || null,
            },
            req,
        });

        incrementCachedAllowance(req.user?.tenantId);
        invalidateTenantCache(req.user?.tenantId, "tenant");

        res.status(200).json({ message: "Logged" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createTemplate,
    getTemplates,
    updateTemplate,
    deleteTemplate,
    logTemplateSend,
    ensureStarterTemplates,
};
