const TenantMetricSnapshot = require("../models/TenantMetricSnapshot");
const Objective = require("../models/Objective");
const ObjectiveProgress = require("../models/ObjectiveProgress");
const Insight = require("../models/Insight");
const { getEffectiveFeatures } = require("../models/Tenant");
const { writeAudit } = require("../utils/audit");
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require("../utils/errors");
const { localDateKey, addLocalDays } = require("../services/bi/time");
const {
    METRICS,
    TEMPLATES,
    windowRates,
    suggestTarget,
    forecastFrom,
    quietHourShare,
    MIN_RATE_SAMPLE,
} = require("../services/bi/metrics");
const { snapshotTenant } = require("../services/bi/snapshotJob");

const ROLE_OK = {
    members: ["Owner", "General Manager", "Accountant", "Sales Manager", "Sales", "Receptionist", "Coach", "Coach Manager"],
    checkin: ["Owner", "General Manager", "Receptionist", "Sales Manager", "Sales"],
    pt_tracking: ["Owner", "General Manager", "Coach", "Coach Manager", "Accountant"],
    accounting: ["Owner", "General Manager", "Accountant", "Sales Manager"],
    funnels: ["Owner", "General Manager", "Sales Manager", "Sales", "Accountant"],
    exec_analytics: ["Owner", "General Manager", "Accountant", "Sales Manager", "Coach Manager"],
    business_intelligence: ["Owner", "General Manager", "Accountant", "Sales Manager", "Coach Manager"],
};

function featuresOf(req) {
    return getEffectiveFeatures(req.tenant, req.plan);
}

function canSee(role, feature, features) {
    return features.includes(feature) && (ROLE_OK[feature] || []).includes(role);
}

function privateCache(res) {
    res.set("Cache-Control", "private, max-age=60");
}

async function loadDays(limit = 120) {
    return TenantMetricSnapshot.find({ grain: "day" }).sort({ localDate: 1 }).limit(limit).lean();
}

function sum(days, key) {
    return days.reduce((total, day) => total + (Number(day.metrics?.[key]) || 0), 0);
}

function delta(current, previous) {
    if (previous == null) return null;
    return current - previous;
}

function kpi(key, value, previous, extra = {}) {
    const def = METRICS[key] || {};
    return {
        key,
        name: def.name || key,
        meaning: def.meaning || "",
        formula: def.formula || "",
        source: def.source || "",
        grain: def.grain || "day",
        unit: def.unit || extra.unit || "count",
        value,
        previous,
        delta: delta(value, previous),
        ...extra,
    };
}

function sliceWindow(days, from, to) {
    return days.filter((day) => (!from || day.localDate >= from) && (!to || day.localDate <= to));
}

async function getDashboard(req, res, next) {
    try {
        privateCache(res);
        const role = req.user.role;
        const features = featuresOf(req);
        const timeZone = req.tenant?.settings?.locale?.timezone || "Africa/Cairo";
        const today = localDateKey(new Date(), timeZone);
        const yesterday = addLocalDays(today, -1);
        const days = await loadDays(180);
        if (!days.length) {
            return res.json({
                empty: true,
                stale: true,
                timezone: timeZone,
                asOf: null,
                message: "Not enough data yet. The daily snapshot runs after the gym's local midnight. Nothing here is estimated.",
                kpis: [],
                definitions: METRICS,
            });
        }
        const latest = days[days.length - 1];
        const stale = latest.localDate < yesterday;
        const monthStart = `${today.slice(0, 7)}-01`;
        const month = days.filter((day) => day.localDate >= monthStart && day.localDate <= today);
        const priorStart = addLocalDays(monthStart, -30);
        const prior = days.filter((day) => day.localDate >= priorStart && day.localDate < monthStart);
        const rates = windowRates(month);
        const kpis = [];
        if (canSee(role, "members", features)) {
            kpis.push(kpi("activeMembers", latest.metrics?.statusActive ?? latest.metrics?.coveredMembers ?? 0, null));
            kpis.push(kpi("newJoins", sum(month, "newJoins"), sum(prior, "newJoins")));
        }
        if (["Owner", "General Manager", "Accountant", "Sales Manager"].includes(role) && features.includes("members")) {
            kpis.push(kpi("membershipSalesPiasters", sum(month, "membershipSalesPiasters"), sum(prior, "membershipSalesPiasters")));
        }
        if (canSee(role, "checkin", features) || role === "Receptionist") {
            const todayRow = days.find((day) => day.localDate === today);
            kpis.push(kpi("checkIns", todayRow?.metrics?.checkIns || 0, days.find((day) => day.localDate === yesterday)?.metrics?.checkIns || 0));
        }
        if (canSee(role, "pt_tracking", features)) {
            kpis.push(kpi("ptSessionsSold", sum(month, "ptSessionsSold"), sum(prior, "ptSessionsSold")));
            kpis.push(kpi("ptSessionsUsed", sum(month, "ptSessionsUsed"), sum(prior, "ptSessionsUsed")));
            kpis.push(kpi("ptSalesPiasters", sum(month, "ptSalesPiasters"), sum(prior, "ptSalesPiasters")));
        }
        if (canSee(role, "accounting", features)) {
            kpis.push(kpi("refundsPiasters", sum(month, "refundsPiasters"), sum(prior, "refundsPiasters")));
            kpis.push(kpi("discountGapPiasters", sum(month, "discountGapPiasters"), null, { rate: rates.discountShare }));
        }
        if (canSee(role, "funnels", features)) {
            kpis.push(kpi("peopleAdded", sum(month, "peopleAdded"), sum(prior, "peopleAdded")));
            kpis.push(kpi("peopleConverted", sum(month, "peopleConverted"), sum(prior, "peopleConverted"), { rate: rates.conversionRate }));
        }
        if (canSee(role, "exec_analytics", features)) {
            const recent = days.filter((day) => day.localDate > addLocalDays(today, -90));
            kpis.push(kpi("renewalRate", windowRates(recent).renewalRate.value, null, { rate: windowRates(recent).renewalRate }));
            kpis.push(kpi("churnEvents", sum(month, "churnEvents"), sum(prior, "churnEvents")));
        }

        const operational = role === "Receptionist";
        res.json({
            empty: false,
            stale,
            timezone: timeZone,
            asOf: latest.computedAt,
            localDate: latest.localDate,
            jobStatus: latest.jobStatus,
            quality: latest.quality || {},
            kpis: operational
                ? kpis.filter((row) => row.key === "checkIns" || row.key === "activeMembers")
                : kpis,
            series: operational ? {} : {
                membershipSalesPiasters: days.slice(-30).map((day) => ({ date: day.localDate, value: day.metrics?.membershipSalesPiasters || 0 })),
                checkIns: days.slice(-30).map((day) => ({ date: day.localDate, value: day.metrics?.checkIns || 0 })),
                newJoins: days.slice(-30).map((day) => ({ date: day.localDate, value: day.metrics?.newJoins || 0 })),
            },
            segments: canSee(role, "accounting", features) ? latest.segments : { byActivity: [], byPackage: [] },
            funnel: canSee(role, "funnels", features) ? rates : null,
            lists: operational
                ? { frozenDue: latest.lists?.frozenDue || [], expiring: (latest.lists?.expiring || []).slice(0, 20) }
                : {
                    expiring: latest.lists?.expiring || [],
                    atRisk: canSee(role, "exec_analytics", features) ? (latest.lists?.atRisk || []) : [],
                    declining: canSee(role, "exec_analytics", features) ? (latest.lists?.declining || []) : [],
                    ptExpiring: canSee(role, "pt_tracking", features) ? (latest.lists?.ptExpiring || []) : [],
                },
            pending: canSee(role, "accounting", features) || role === "Owner" ? latest.pending : null,
            forecast: canSee(role, "exec_analytics", features) ? forecastFrom(latest, days.filter((day) => day.localDate > addLocalDays(today, -90))) : null,
            definitions: METRICS,
            minSample: MIN_RATE_SAMPLE,
        });
    } catch (error) {
        next(error);
    }
}

async function getCohorts(req, res, next) {
    try {
        privateCache(res);
        const doc = await TenantMetricSnapshot.findOne({ grain: "cohort", localDate: "cohort" }).lean();
        if (!doc) {
            return res.json({ empty: true, message: "No cohort snapshot yet.", cohorts: [], definition: METRICS.renewalRate });
        }
        res.json({ empty: false, asOf: doc.computedAt, cohorts: doc.cohorts || [], definition: METRICS.renewalRate });
    } catch (error) {
        next(error);
    }
}

async function getHeatmap(req, res, next) {
    try {
        privateCache(res);
        const days = (await loadDays(40)).slice(-28);
        const heat = quietHourShare(days);
        res.json({
            empty: heat.total === 0,
            days: days.length,
            total: heat.total,
            share: heat.total >= 200 ? heat.share : null,
            insufficient: heat.total < 200,
            grid: heat.grid || [],
            definition: METRICS.checkIns,
            asOf: days.at(-1)?.computedAt || null,
        });
    } catch (error) {
        next(error);
    }
}

async function getForecast(req, res, next) {
    try {
        privateCache(res);
        const timeZone = req.tenant?.settings?.locale?.timezone || "Africa/Cairo";
        const today = localDateKey(new Date(), timeZone);
        const days = await loadDays(120);
        const latest = days.at(-1);
        res.json({
            forecast: latest ? forecastFrom(latest, days.filter((day) => day.localDate > addLocalDays(today, -90))) : { revenuePiasters: null, insufficient: true },
            definition: "Expiring memberships on the latest list × this gym's 90-day renewal rate × the median renewal amount in piasters. Hidden below 20 ended memberships.",
            asOf: latest?.computedAt || null,
        });
    } catch (error) {
        next(error);
    }
}

async function getFunnel(req, res, next) {
    try {
        privateCache(res);
        const { from, to } = req.query;
        const days = sliceWindow(await loadDays(400), from, to);
        const rates = windowRates(days);
        const byAssignee = new Map();
        for (const day of days) {
            for (const row of day.segments?.byAssignee || []) {
                const cur = byAssignee.get(row.key) || { key: row.key, added: 0, converted: 0 };
                cur.added += row.added || 0;
                cur.converted += row.converted || 0;
                byAssignee.set(row.key, cur);
            }
        }
        const mine = req.user.role === "Sales" ? String(req.user.id) : null;
        res.json({
            empty: sum(days, "peopleAdded") === 0,
            from: days[0]?.localDate || null,
            to: days.at(-1)?.localDate || null,
            added: sum(days, "peopleAdded"),
            converted: sum(days, "peopleConverted"),
            rate: rates.conversionRate,
            guestCheckIns: sum(days, "guestCheckIns"),
            medianHoursToNote: rates.medianHoursToNote,
            byAssignee: [...byAssignee.values()].filter((row) => !mine || row.key === mine),
            definition: METRICS.peopleConverted,
            note: "Assignee groups are the current owner of the person, for follow-up. Revenue is not credited to a rep.",
        });
    } catch (error) {
        next(error);
    }
}

async function getInsights(req, res, next) {
    try {
        privateCache(res);
        const rows = await Insight.find({ role: { $in: [req.user.role, "Owner"] }, status: { $ne: "dismissed" } })
            .sort({ impact: -1 })
            .limit(20)
            .lean();
        const visible = req.user.role === "Owner" || req.user.role === "General Manager"
            ? rows
            : rows.filter((row) => row.role === req.user.role || row.role === "Owner");
        res.json({ insights: visible });
    } catch (error) {
        next(error);
    }
}

async function dismissInsight(req, res, next) {
    try {
        const row = await Insight.findById(req.params.id);
        if (!row) throw new NotFoundError("Insight not found");
        row.status = "dismissed";
        row.dismissReason = String(req.body?.reason || "").slice(0, 300);
        await row.save();
        res.json({ insight: row });
    } catch (error) {
        next(error);
    }
}

async function listObjectives(req, res, next) {
    try {
        privateCache(res);
        const objectives = await Objective.find({ archived: false }).sort({ deadline: 1 }).lean();
        const objectiveIds = objectives.map((row) => row._id);
        const progress = objectiveIds.length
            ? await ObjectiveProgress.find({ objectiveId: { $in: objectiveIds } }).sort({ localDate: -1 }).limit(500).lean()
            : [];
        res.json({ objectives, progress });
    } catch (error) {
        next(error);
    }
}

function baselineFrom(template, days) {
    const rates = windowRates(days);
    if (template.metric === "renewalRate") return rates.renewalRate.insufficient ? null : rates.renewalRate.value;
    if (template.metric === "conversionRate") return rates.conversionRate.insufficient ? null : rates.conversionRate.value;
    if (template.metric === "refundRate") return rates.refundRate.insufficient ? null : rates.refundRate.value;
    if (template.metric === "ptUtilization") return rates.ptUtilization.insufficient ? null : rates.ptUtilization.value;
    if (template.metric === "medianHoursToNote") return rates.medianHoursToNote.insufficient ? null : rates.medianHoursToNote.value;
    if (template.metric === "quietHourShare") {
        const heat = quietHourShare(days);
        return heat.total >= 200 ? heat.share : null;
    }
    if (template.metric === "churnRate") {
        const covered = days[0]?.metrics?.coveredMembers || 0;
        const churned = sum(days, "churnEvents");
        if (covered < MIN_RATE_SAMPLE) return null;
        return churned / covered;
    }
    if (template.metric === "membershipSalesPiasters") return sum(days, "membershipSalesPiasters");
    return null;
}

async function suggestObjectives(req, res, next) {
    try {
        const days = await loadDays(120);
        if (days.length < 14) {
            return res.json({
                suggestions: [],
                message: "Not enough history yet. At least 14 daily snapshots are required before a target is suggested.",
            });
        }
        const latest = days[days.length - 1];
        const suggestions = [];
        for (const template of TEMPLATES) {
            const window = days.filter((day) => day.localDate > addLocalDays(latest.localDate, -template.window));
            const baseline = baselineFrom(template, window);
            if (baseline == null) continue;
            if (template.linked) {
                const target = latest.metrics?.targetsSumPiasters || 0;
                if (!target) continue;
                suggestions.push({
                    ...template,
                    baseline,
                    target,
                    band: "custom",
                    targetSource: "user.monthlyTarget",
                    why: `The target is the sum of the sales quotas already stored on each rep (${target} piasters). Recent membership sales were ${baseline} piasters. Sales are not split by person.`,
                });
                continue;
            }
            const bands = suggestTarget(baseline, template.kind);
            suggestions.push({
                ...template,
                baseline,
                achievable: bands.achievable,
                stretch: bands.stretch,
                why: `${template.name}: the baseline over ${template.window} days is ${baseline}. Achievable follows the published band. You can type a different target.`,
            });
        }
        res.json({ suggestions });
    } catch (error) {
        next(error);
    }
}

async function createObjective(req, res, next) {
    try {
        const template = TEMPLATES.find((row) => row.key === req.body?.templateKey);
        const metricKey = template?.metric || req.body?.metricKey;
        if (!metricKey) throw new ValidationError("Choose a metric.");
        const days = await loadDays(120);
        if (days.length < 14) throw new ValidationError("At least 14 daily snapshots are required.");
        const latest = days[days.length - 1];
        const windowDays = template?.window || 30;
        const window = days.filter((day) => day.localDate > addLocalDays(latest.localDate, -windowDays));
        const baseline = baselineFrom(template || { metric: metricKey, kind: "count", window: windowDays }, window);
        if (baseline == null) throw new ValidationError("There is not enough of this gym's history to set that target.");
        const deadline = String(req.body?.deadline || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new ValidationError("Deadline must be YYYY-MM-DD.");
        let target = Number(req.body?.target);
        let targetSource = null;
        if (template?.linked) {
            target = latest.metrics?.targetsSumPiasters || 0;
            targetSource = "user.monthlyTarget";
            if (!target) throw new ValidationError("Set rep quotas on the team page first. This goal uses that sum.");
        }
        if (!Number.isFinite(target)) throw new ValidationError("Enter a target.");
        const objective = await Objective.create({
            templateKey: template?.key || null,
            metricKey,
            name: template?.name || String(req.body?.name || metricKey),
            direction: template?.direction || (req.body?.direction === "down" ? "down" : "up"),
            kind: template?.kind || "count",
            baseline,
            baselineWindowDays: windowDays,
            target,
            band: req.body?.band || "custom",
            why: String(req.body?.why || template?.name || ""),
            startDate: latest.localDate,
            deadline,
            ownerRole: req.body?.ownerRole || req.user.role,
            cadence: req.body?.cadence === "monthly" ? "monthly" : "weekly",
            targetSource,
            status: "on_track",
        });
        res.status(201).json({ objective });
    } catch (error) {
        next(error);
    }
}

async function updateObjective(req, res, next) {
    try {
        const objective = await Objective.findById(req.params.id);
        if (!objective) throw new NotFoundError("Objective not found");
        if (req.body?.target != null) {
            if (objective.targetSource) {
                throw new ConflictError("This goal follows the rep quotas. Change those on the team page.");
            }
            const target = Number(req.body.target);
            if (!Number.isFinite(target)) throw new ValidationError("Enter a target.");
            objective.target = target;
            objective.band = "custom";
        }
        if (req.body?.deadline) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.deadline)) throw new ValidationError("Deadline must be YYYY-MM-DD.");
            objective.deadline = req.body.deadline;
        }
        if (req.body?.archived === true) {
            objective.archived = true;
            objective.status = "archived";
        }
        await objective.save();
        res.json({ objective });
    } catch (error) {
        next(error);
    }
}

async function insightToObjective(req, res, next) {
    try {
        const row = await Insight.findById(req.params.id);
        if (!row) throw new NotFoundError("Insight not found");
        const templateByHref = {
            expiring: "grow_renewals",
            heatmap: "fill_quiet_hours",
            funnel: "raise_conversion",
            pt: "raise_pt_utilization",
            accounting: "cut_refunds",
            pending: "cut_refunds",
        };
        req.body = { ...(req.body || {}), templateKey: req.body?.templateKey || templateByHref[row.href] || "grow_renewals" };
        const days = await loadDays(120);
        if (days.length < 14) throw new ValidationError("At least 14 daily snapshots are required.");
        row.status = "actioned";
        await row.save();
        return createObjective(req, res, next);
    } catch (error) {
        next(error);
    }
}

async function exportMetric(req, res, next) {
    try {
        const key = String(req.query.metric || "membershipSalesPiasters");
        const allowed = ["membershipSalesPiasters", "newJoins", "checkIns", "refundsPiasters", "peopleAdded", "peopleConverted", "ptSessionsUsed", "churnEvents"];
        if (!allowed.includes(key)) throw new ForbiddenError("AUTH_FORBIDDEN", "That export is not available.");
        const days = await loadDays(400);
        const header = "date,value";
        const lines = days.slice(0, 2000).map((day) => `${day.localDate},${Number(day.metrics?.[key]) || 0}`);
        await writeAudit({
            action: "bi_exported",
            actor: req.user.id,
            actorRole: req.user.role,
            targetType: "other",
            targetId: key,
            meta: { metric: key, rows: lines.length },
            req,
        });
        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="forma-${key}.csv"`);
        res.set("Cache-Control", "private, no-store");
        res.send([header, ...lines].join("\n"));
    } catch (error) {
        next(error);
    }
}

async function rebuild(req, res, next) {
    try {
        if (!["Owner", "General Manager"].includes(req.user.role)) {
            throw new ForbiddenError("AUTH_FORBIDDEN", "Only the owner can rebuild snapshots.");
        }
        const result = await snapshotTenant(req.tenant, { now: new Date() });
        res.json({ ok: true, days: result.days.length, timezone: result.timeZone });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getDashboard,
    getCohorts,
    getHeatmap,
    getForecast,
    getFunnel,
    getInsights,
    dismissInsight,
    listObjectives,
    suggestObjectives,
    createObjective,
    updateObjective,
    insightToObjective,
    exportMetric,
    rebuild,
    canSee,
};
