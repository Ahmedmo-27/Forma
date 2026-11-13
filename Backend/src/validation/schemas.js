const { z } = require("zod");
const { sanitizePlainText } = require("../utils/sanitizeText");
const { MIN_PASSWORD_LENGTH } = require("../utils/passwordUtils");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const emptyToNull = (v) => (v === "" || v === undefined ? null : v);
const nullableObjectId = z.preprocess(emptyToNull, objectId.nullable().optional());

/** Accept systemId/memberId as number or string (frontend often sends numeric systemId). */
const memberIdInput = z.preprocess(
    (v) => (typeof v === "number" && Number.isFinite(v) ? String(v) : v),
    z.union([objectId, z.string().trim().min(1).max(40)])
);

const plainText = (maxLen) =>
    z.string()
        .trim()
        .min(1)
        .max(maxLen)
        .transform(sanitizePlainText)
        .refine((val) => val.length >= 1, "Text is required");

const activityType = z.enum([
    "gym", "crossfit", "box", "mma", "kickboxing", "calisthenics",
]);
const duration = z.enum(["1 month", "3 months", "6 months", "1 year"]);
const memberSource = z.enum([
    "Social media", "Walk in", "Word of mouth", "referral", "sales call", "data entry", "others",
]);

const loginSchema = z.object({
    username: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().min(1).max(200).optional(),
    password: z.string().min(1).max(200),
}).refine((data) => Boolean(data.username || data.email), {
    message: "Username and password are required",
});

const setupPasswordSchema = z.object({
    token: z.string().trim().min(20).max(200),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

const forgotPasswordSchema = z.object({
    email: z.string().trim().email().max(200),
});

const createMemberSchema = z.object({
    name: z.string().trim().min(1).max(120),
    phones: z.string().trim().min(5).max(40),
    nationalId: z.preprocess(emptyToNull, z.string().trim().max(40).nullable().optional()),
    // photo is intentionally omitted — only set via PATCH /members/:id/photo
    gender: z.preprocess(emptyToNull, z.enum(["male", "female"]).nullable().optional()),
    birthdate: z.preprocess(emptyToNull, z.string().max(40).nullable().optional()),
    source: z.preprocess(emptyToNull, memberSource.nullable().optional()),
    packageId: nullableObjectId,
    assignedSales: nullableObjectId,
    coachId: nullableObjectId,
    locationId: nullableObjectId,
});

const updateMemberSchema = z.object({
    name: z.string().trim().min(1).max(120),
    phones: z.string().trim().min(5).max(40).optional(),
    gender: z.preprocess(emptyToNull, z.enum(["male", "female"]).nullable().optional()),
    birthdate: z.preprocess(emptyToNull, z.string().max(40).nullable().optional()),
    source: z.preprocess(emptyToNull, memberSource.nullable().optional()),
    locationId: nullableObjectId,
});

const freezeMemberSchema = z.object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
});

const addNoteSchema = z.object({
    text: plainText(2000),
});

const addAlertSchema = z.object({
    text: plainText(2000),
});

const invitationSchema = z.object({
    invitedName: z.string().trim().min(1).max(120),
    invitedPhone: z
        .string()
        .trim()
        .max(40)
        .optional()
        .transform((v) => (v && v.length ? v : null)),
});

const assignPackageSchema = z.object({
    packageId: objectId,
    name: z.string().trim().min(1).max(120),
    activityType: activityType.optional(),
    duration,
    price: z.coerce.number().nonnegative().optional(),
    freezeLimitDays: z.coerce.number().int().nonnegative().optional(),
    invitationLimit: z.coerce.number().int().nonnegative().optional(),
    renewalDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    pricePaid: z.coerce.number().positive("Price paid must be greater than zero"),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    startDate: z.string().max(40).nullable().optional(),
});

const createExceptionSchema = z.object({
    memberId: memberIdInput,
    basePackageId: objectId,
    hasException: z.preprocess(
        (v) => v === true || v === "true" || v === 1 || v === "1",
        z.boolean()
    ).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    activityType: activityType.optional(),
    duration: duration.optional(),
    price: z.coerce.number().nonnegative().optional(),
    freezeLimitDays: z.coerce.number().int().nonnegative().optional(),
    invitationLimit: z.coerce.number().int().nonnegative().optional(),
    renewalDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    pricePaid: z.coerce.number().nonnegative().optional(),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    startDate: z.string().max(40).nullable().optional(),
    reason: z.string().trim().max(1000).nullable().optional(),
});

const exceptionStatusSchema = z.object({
    status: z.enum(["accepted", "rejected"]),
    reviewNote: z.string().trim().max(500).nullable().optional(),
});

const salesRequestSchema = z.object({
    memberId: memberIdInput,
});

const salesRequestStatusSchema = z.object({
    status: z.enum(["accepted", "rejected"]),
});

const GYM_ROLES = ["Owner", "General Manager", "Receptionist", "Coach", "Head Coach", "Accountant", "Sales", "Sales Manager"];

const createStaffSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    password: z.string().min(8).max(200),
    mobile_number: z.string().trim().min(5).max(40).optional(),
    role: z.enum(GYM_ROLES),
    canAccessAllLocations: z.boolean().optional(),
    allowedLocationIds: z.array(z.string().trim().min(1)).optional(),
}).superRefine((data, ctx) => {
    if (
        data.canAccessAllLocations === false
        && Array.isArray(data.allowedLocationIds)
        && data.allowedLocationIds.length === 0
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Select at least one branch, or enable access to all locations",
            path: ["allowedLocationIds"],
        });
    }
});

// Zod v4: .partial() cannot run on schemas that already have refinements — keep the
// object shape separate, then attach superRefine to create/update variants.
const packageFieldsSchema = z.object({
    name: z.string().trim().min(1).max(120),
    activityType,
    duration,
    price: z.coerce.number().nonnegative(),
    freezeLimitDays: z.coerce.number().int().nonnegative().optional(),
    invitationLimit: z.coerce.number().int().nonnegative().optional(),
    renewalDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    locationScope: z.enum(["all", "branches"]).optional(),
    eligibleLocationIds: z.array(z.string().trim().min(1)).optional(),
});

function refinePackageLocationScope(data, ctx) {
    if (data.locationScope === "branches" && (!data.eligibleLocationIds || data.eligibleLocationIds.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Select at least one branch when location scope is branches",
            path: ["eligibleLocationIds"],
        });
    }
}

const createPackageSchema = packageFieldsSchema.superRefine(refinePackageLocationScope);

const updatePackageSchema = packageFieldsSchema.partial().extend({
    isActive: z.boolean().optional(),
}).superRefine(refinePackageLocationScope);

const optionalText = (maxLen) =>
    z.preprocess(
        emptyToNull,
        z.string().trim().max(maxLen).nullable().optional()
    );

const createWhatsAppTemplateSchema = z.object({
    name: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(60),
    introText: optionalText(2000),
    bodyText: optionalText(4000),
    introTextAr: optionalText(2000),
    bodyTextAr: optionalText(4000),
    includeLiveData: z.preprocess(
        (v) => {
            if (v === undefined || v === null || v === "") return undefined;
            if (v === true || v === "true" || v === 1 || v === "1") return true;
            if (v === false || v === "false" || v === 0 || v === "0") return false;
            return Boolean(v);
        },
        z.boolean().optional()
    ),
    defaultPackageIds: z.array(objectId).optional(),
    defaultDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    allowedRoles: z.array(z.enum([
        "Owner", "General Manager", "Sales Manager", "Sales", "Receptionist", "Accountant",
        "Coach", "Head Coach",
    ])).optional(),
    isDefault: z.preprocess(
        (v) => {
            if (v === undefined || v === null || v === "") return undefined;
            if (v === true || v === "true" || v === 1 || v === "1") return true;
            if (v === false || v === "false" || v === 0 || v === "0") return false;
            return Boolean(v);
        },
        z.boolean().optional()
    ),
});

const updateWhatsAppTemplateSchema = createWhatsAppTemplateSchema.partial().extend({
    isActive: z.boolean().optional(),
});

const logWhatsAppTemplateSendSchema = z.object({
    memberId: z.union([objectId, z.string().trim().min(1).max(40)]).optional().nullable(),
    memberName: z.string().trim().max(120).optional().nullable(),
    kind: z.string().trim().max(50).optional().nullable(),
    code: z.string().trim().max(100).optional().nullable(),
    templateId: objectId.optional().nullable(),
});

const sendWhatsAppMessageSchema = z.object({
    phone: z.string().trim().min(3).max(32),
    text: plainText(4000),
    memberId: z.preprocess(emptyToNull, memberIdInput.nullable().optional()),
    memberName: z.string().trim().max(120).optional().nullable(),
    kind: z.string().trim().max(50).optional().nullable(),
    code: z.string().trim().max(100).optional().nullable(),
    templateId: nullableObjectId,
});

const sendWhatsAppImageSchema = z.object({
    phone: z.string().trim().min(3).max(32),
    caption: z.string().trim().max(1000).optional().default(""),
    memberId: z.preprocess(emptyToNull, memberIdInput.nullable().optional()),
    memberName: z.string().trim().max(120).optional().nullable(),
    kind: z.string().trim().max(50).optional().nullable(),
    code: z.string().trim().max(100).optional().nullable(),
});

const egpCurrency = z.preprocess(() => "EGP", z.literal("EGP"));
const planKeySchema = z.enum(["basic", "gold", "platinum"]);

const createPlanSchema = z.object({
    key: planKeySchema,
    name: z.string().trim().min(1).max(100),
    priceMonthly: z.coerce.number().min(0),
    priceYearly: z.coerce.number().min(0),
    currency: egpCurrency,
    features: z.array(z.string()).default([]),
    allowedRoles: z.array(z.string()).default([]),
    limits: z.object({
        maxMembers: z.coerce.number().min(1).default(500),
        maxStaff: z.coerce.number().min(1).default(10),
        maxBranches: z.coerce.number().min(1).default(1),
    }).default({}),
    isActive: z.boolean().optional(),
});

const updatePlanSchema = createPlanSchema.partial();

const tenantSlugSchema = z.string().trim().min(2).max(50).toLowerCase().regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase alphanumeric characters and dashes");

const tenantSettingsSchema = z.object({
    branding: z.object({
        logoKey: z.string().nullable().optional(),
        displayName: z.string().nullable().optional(),
        palette: z.object({
            navbar: z.string().optional(),
            primary: z.string().optional(),
            secondary: z.string().optional(),
            accent: z.string().optional(),
            background: z.string().optional(),
            text: z.string().optional(),
            icon: z.string().optional(),
        }).optional(),
    }).optional(),
    locale: z.object({
        currency: z.string().trim().length(3).toUpperCase().optional(),
        countryCode: z.string().trim().max(6).optional(),
        timezone: z.string().trim().max(100).optional(),
        language: z.string().trim().max(10).optional(),
    }).optional(),
    enabledActivities: z.array(z.string().trim().min(1)).optional(),
    whatsapp: z.object({
        phoneNumberId: z.string().trim().nullable().optional(),
        businessAccountId: z.string().trim().nullable().optional(),
        accessToken: z.string().trim().nullable().optional(),
    }).optional(),
    featureConfig: z.record(z.string(), z.any()).optional(),
    settings: z.object({
        branding: z.object({
            logoKey: z.string().nullable().optional(),
            displayName: z.string().nullable().optional(),
            palette: z.object({
                navbar: z.string().optional(),
                primary: z.string().optional(),
                secondary: z.string().optional(),
                accent: z.string().optional(),
                background: z.string().optional(),
                text: z.string().optional(),
                icon: z.string().optional(),
            }).optional(),
        }).optional(),
        locale: z.object({
            currency: z.string().trim().length(3).toUpperCase().optional(),
            countryCode: z.string().trim().max(6).optional(),
            timezone: z.string().trim().max(100).optional(),
            language: z.string().trim().max(10).optional(),
        }).optional(),
        enabledActivities: z.array(z.string().trim().min(1)).optional(),
        whatsapp: z.object({
            phoneNumberId: z.string().trim().nullable().optional(),
            businessAccountId: z.string().trim().nullable().optional(),
            accessToken: z.string().trim().nullable().optional(),
        }).optional(),
        featureConfig: z.record(z.string(), z.any()).optional(),
    }).optional(),
});

const createTenantSchema = z.object({
    name: z.string().trim().min(1).max(120),
    slug: tenantSlugSchema,
    planId: objectId,
    status: z.enum(["trial", "active", "past_due", "suspended", "cancelled"]).optional(),
    featureOverrides: z.object({
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
    }).optional(),
    roleOverrides: z.object({
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
    }).optional(),
    limitOverrides: z.object({
        maxMembers: z.coerce.number().nullable().optional(),
        maxStaff: z.coerce.number().nullable().optional(),
        maxBranches: z.coerce.number().nullable().optional(),
    }).optional(),
    trialEndsAt: z.preprocess(emptyToNull, z.string().datetime().nullable().optional()),
    currentPeriodEnd: z.preprocess(emptyToNull, z.string().datetime().nullable().optional()),
    billingProviderCustomerId: z.preprocess(emptyToNull, z.string().nullable().optional()),
    settings: tenantSettingsSchema.optional(),
});

const updateTenantSchema = createTenantSchema.partial();

const updateEntitlementPolicySchema = z.object({
    entitlementPolicy: z.enum(["follow_tier", "snapshot"]),
});

const planPriceSchema = z.object({
    planId: objectId,
    cycle: z.enum(["monthly", "yearly"]),
    intervalCount: z.coerce.number().int().min(1).default(1),
    amount: z.coerce.number().min(0),
    currency: egpCurrency,
    isActive: z.boolean().default(true),
    validFrom: z.preprocess(emptyToNull, z.string().datetime().nullable().optional()),
    validUntil: z.preprocess(emptyToNull, z.string().datetime().nullable().optional()),
});

const publicSignupSchema = z.object({
    name: z.string().trim().min(2).max(120),
    slug: tenantSlugSchema,
    ownerName: z.string().trim().min(2).max(120),
    ownerEmail: z.string().trim().email().toLowerCase(),
    planKey: planKeySchema.default("basic"),
    cycle: z.enum(["monthly", "yearly"]).default("monthly"),
    intervalCount: z.coerce.number().int().min(1).default(1),
    trialDays: z.coerce.number().int().min(1).max(90).optional().default(14),
});

module.exports = {
    loginSchema,
    setupPasswordSchema,
    forgotPasswordSchema,
    createMemberSchema,
    updateMemberSchema,
    freezeMemberSchema,
    addNoteSchema,
    addAlertSchema,
    invitationSchema,
    assignPackageSchema,
    createExceptionSchema,
    exceptionStatusSchema,
    salesRequestSchema,
    salesRequestStatusSchema,
    createStaffSchema,
    createPackageSchema,
    updatePackageSchema,
    createWhatsAppTemplateSchema,
    updateWhatsAppTemplateSchema,
    logWhatsAppTemplateSendSchema,
    sendWhatsAppMessageSchema,
    sendWhatsAppImageSchema,
    createPlanSchema,
    updatePlanSchema,
    createTenantSchema,
    updateTenantSchema,
    tenantSettingsSchema,
    updateEntitlementPolicySchema,
    planPriceSchema,
    publicSignupSchema,
};
