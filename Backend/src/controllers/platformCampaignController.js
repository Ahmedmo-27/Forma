const Tenant = require("../models/Tenant");
const Campaign = require("../models/Campaign");
const { AUDIENCE_STATUSES } = require("../models/Campaign");
const mailer = require("../services/mailer");
const { appOrigin, offerUrl } = require("../services/ownerMail");
const { campaignStarter, CAMPAIGN_TEMPLATE_KEYS } = require("../services/emailTemplates");
const { parsePagination, buildPagination } = require("../utils/pagination");
const logger = require("../utils/logger");

function parseStatuses(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(",");
    const statuses = [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
    if (!statuses.length || statuses.some((status) => !AUDIENCE_STATUSES.includes(status))) {
        return null;
    }
    return statuses;
}

function starterLinks() {
    return { appUrl: appOrigin(), offerUrl: offerUrl() };
}

async function ownersFor(statuses) {
    const tenants = await Tenant.find({ status: { $in: statuses } })
        .select("name status ownerUserId")
        .populate("ownerUserId", "name email");
    return tenants.map((tenant) => ({
        tenantId: tenant._id,
        gymName: tenant.name,
        name: tenant.ownerUserId?.name || "",
        email: tenant.ownerUserId?.email || "",
    }));
}

async function getCampaignTemplates(req, res) {
    const links = starterLinks();
    res.json({
        templates: CAMPAIGN_TEMPLATE_KEYS.map((key) => campaignStarter(key, links)),
        statuses: AUDIENCE_STATUSES,
    });
}

async function getCampaignAudience(req, res) {
    const statuses = parseStatuses(req.query.status || req.query.statuses);
    if (!statuses) {
        return res.status(400).json({ message: "Choose at least one gym status" });
    }
    const owners = await ownersFor(statuses);
    const reachable = owners.filter((owner) => owner.email);
    res.json({
        statuses,
        count: reachable.length,
        skipped: owners.length - reachable.length,
    });
}

async function getCampaigns(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
        const [campaigns, total] = await Promise.all([
            Campaign.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Campaign.countDocuments(),
        ]);
        res.json({ campaigns, pagination: buildPagination(page, limit, total) });
    } catch (error) {
        logger.error("platform", "getCampaigns error", { error: error.message });
        res.status(500).json({ message: "Server error" });
    }
}

async function sendCampaign(req, res) {
    try {
        const statuses = parseStatuses(req.body.statuses);
        const templateKey = String(req.body.templateKey || "");
        const subject = String(req.body.subject || "").trim();
        const message = String(req.body.message || "").trim();
        const ctaLabel = String(req.body.ctaLabel || "").trim();
        const ctaUrl = String(req.body.ctaUrl || "").trim();

        if (!CAMPAIGN_TEMPLATE_KEYS.includes(templateKey)) {
            return res.status(400).json({ message: "Choose a campaign template" });
        }
        if (!statuses) {
            return res.status(400).json({ message: "Choose at least one gym status" });
        }
        if (!subject || !message) {
            return res.status(400).json({ message: "Subject and message are required" });
        }
        if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) {
            return res.status(400).json({ message: "A button needs both a label and a link" });
        }
        if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
            return res.status(400).json({ message: "The button link must start with http:// or https://" });
        }

        const owners = await ownersFor(statuses);
        let sentCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        for (const owner of owners) {
            if (!owner.email) {
                skippedCount += 1;
                continue;
            }
            try {
                const result = await mailer.sendCampaign({
                    to: owner.email,
                    name: owner.name,
                    gymName: owner.gymName,
                    subject,
                    message,
                    ctaLabel,
                    ctaUrl,
                });
                if (result.skipped) skippedCount += 1;
                else sentCount += 1;
            } catch (error) {
                failedCount += 1;
                logger.warn("mail", "Campaign email failed", { error: error.message });
            }
        }

        const campaign = await Campaign.create({
            templateKey,
            subject,
            message,
            ctaLabel,
            ctaUrl,
            audience: { statuses },
            sentCount,
            failedCount,
            skippedCount,
            createdBy: req.platformUser?.id || null,
        });

        res.status(201).json({
            message: `Sent to ${sentCount} gym owners`,
            campaign,
        });
    } catch (error) {
        logger.error("platform", "sendCampaign error", { error: error.message });
        res.status(500).json({ message: "Server error" });
    }
}

module.exports = {
    getCampaignTemplates,
    getCampaignAudience,
    getCampaigns,
    sendCampaign,
};
