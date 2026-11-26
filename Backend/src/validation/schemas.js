const { z } = require("zod");
const { sanitizePlainText } = require("../utils/sanitizeText");
const {
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH,
    validatePasswordStrength,
} = require("../utils/passwordUtils");

/** Shared Zod field for create / setup / staff passwords (not login). */
const strongPassword = z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH)
    .superRefine((value, ctx) => {
        const result = validatePasswordStrength(value);
        if (!result.valid) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
        }
    });

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
const accessType = z.enum(["unlimited", "sessions"]);

function refinePackageAccessType(data, ctx) {
    if (data.accessType === "sessions") {
        const limit = Number(data.sessionLimit);
        if (!Number.isFinite(limit) || limit < 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Session limit must be at least 1 for session packages",
                path: ["sessionLimit"],
            });
        }
    }
}

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

const selectTenantSchema = z.object({
    selectionToken: z.string().trim().min(20).max(2000),
    tenantId: z.string().trim().min(1).max(64),
});

const setupPasswordSchema = z.object({
    token: z.string().trim().min(20).max(200),
    password: strongPassword,
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
    name: z.string().trim().min(1).max(120).optional(),
    phones: z.string().trim().min(5).max(40).optional(),
    gender: z.preprocess(emptyToNull, z.enum(["male", "female"]).nullable().optional()),
    birthdate: z.preprocess(emptyToNull, z.string().max(40).nullable().optional()),
    source: z.preprocess(emptyToNull, memberSource.nullable().optional()),
    locationId: nullableObjectId,
}).superRefine((data, ctx) => {
    const hasLocation = data.locationId !== undefined && data.locationId !== null && data.locationId !== "";
    const hasPersonal =
        data.name !== undefined
        || data.phones !== undefined
        || data.gender !== undefined
        || data.birthdate !== undefined
        || data.source !== undefined;
    if (!hasLocation && !hasPersonal) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one field is required", path: ["name"] });
        return;
    }
    if (hasPersonal && (data.name === undefined || data.name === null || String(data.name).trim() === "")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Name is required", path: ["name"] });
    }
});

const assignMemberLocationSchema = z.object({
    locationId: objectId,
});

const freezeMemberSchema = z.object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
});

const blockMemberSchema = z.object({
    reason: z.preprocess(emptyToNull, plainText(500).nullable().optional()),
});

const suspendMemberSchema = z.object({
    suspendedUntil: z.string().min(1, "Suspension end date is required"),
    reason: z.preprocess(emptyToNull, plainText(500).nullable().optional()),
}).superRefine((data, ctx) => {
    const end = new Date(data.suspendedUntil);
    if (Number.isNaN(end.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid suspension end date", path: ["suspendedUntil"] });
        return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (end < today) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Suspension end date must be today or later", path: ["suspendedUntil"] });
    }
});

const addNoteSchema = z.object({
    text: plainText(2000),
});

const addAlertSchema = z.object({
    text: plainText(2000),
});

const invitationSchema = z.object({
    invitedName: z.string().trim().min(1).max(120),
    invitedPhone: z.string().trim().min(5, "Invited phone is required").max(40),
});

const assignPackageSchema = z.object({
    packageId: objectId,
    name: z.string().trim().min(1).max(120),
    activityType: activityType.optional(),
    duration,
    accessType: accessType.optional(),
    sessionLimit: z.coerce.number().int().nonnegative().optional(),
    price: z.coerce.number().nonnegative().optional(),
    freezeLimitDays: z.coerce.number().int().nonnegative().optional(),
    invitationLimit: z.coerce.number().int().nonnegative().optional(),
    renewalDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    pricePaid: z.coerce.number().positive("Price paid must be greater than zero"),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    startDate: z.string().max(40).nullable().optional(),
    endDate: z.string().max(40).nullable().optional(),
    locationId: nullableObjectId,
    upgrade: z.preprocess(
        (v) => v === true || v === "true" || v === 1 || v === "1",
        z.boolean()
    ).optional(),
}).superRefine(refinePackageAccessType);

/** Partial update of an already-assigned subscription (Owner / GM / Sales Manager). */
const updateSubscriptionSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    activityType: activityType.optional(),
    duration: duration.optional(),
    accessType: accessType.optional(),
    sessionLimit: z.coerce.number().int().nonnegative().optional(),
    price: z.coerce.number().nonnegative().optional(),
    freezeLimitDays: z.coerce.number().int().nonnegative().optional(),
    invitationLimit: z.coerce.number().int().nonnegative().optional(),
    renewalDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    pricePaid: z.coerce.number().nonnegative().optional(),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    startDate: z.string().max(40).nullable().optional(),
    endDate: z.string().max(40).nullable().optional(),
    /** Sales / Sales Manager credited on this contract. Empty string clears. */
    salesPersonId: z.preprocess(emptyToNull, objectId.nullable().optional()),
    reason: z.string().trim().max(1000).nullable().optional(),
}).refine(
    (data) => Object.prototype.hasOwnProperty.call(data, "salesPersonId")
        || Object.entries(data).some(([key, value]) => key !== "salesPersonId" && value !== undefined && value !== null && value !== ""),
    { message: "At least one field is required" }
).superRefine((data, ctx) => {
    if (data.accessType === "sessions") {
        refinePackageAccessType(data, ctx);
    }
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
    accessType: accessType.optional(),
    sessionLimit: z.coerce.number().int().nonnegative().optional(),
    price: z.coerce.number().nonnegative().optional(),
    freezeLimitDays: z.coerce.number().int().nonnegative().optional(),
    invitationLimit: z.coerce.number().int().nonnegative().optional(),
    renewalDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    pricePaid: z.coerce.number().nonnegative().optional(),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    startDate: z.string().max(40).nullable().optional(),
    endDate: z.string().max(40).nullable().optional(),
    reason: z.string().trim().max(1000).nullable().optional(),
    upgrade: z.preprocess(
        (v) => v === true || v === "true" || v === 1 || v === "1",
        z.boolean()
    ).optional(),
}).superRefine((data, ctx) => {
    if (data.accessType === "sessions") {
        refinePackageAccessType(data, ctx);
    }
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

const GYM_ROLES = ["Owner", "General Manager", "Receptionist", "Coach", "Head Coach", "Accountant", "Sales", "Sales Manager", "Retail"];

const createStaffSchema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    password: strongPassword,
    mobile_number: z.string().trim().min(5).max(40).optional(),
    username: z.preprocess(
        (value) => (value == null || String(value).trim() === "" ? undefined : String(value).trim()),
        z.string().min(3).max(30).optional()
    ),
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
    accessType: accessType.optional(),
    sessionLimit: z.coerce.number().int().nonnegative().optional(),
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

const createPackageSchema = packageFieldsSchema
    .superRefine(refinePackageLocationScope)
    .superRefine(refinePackageAccessType);

const updatePackageSchema = packageFieldsSchema.partial().extend({
    isActive: z.boolean().optional(),
}).superRefine(refinePackageLocationScope).superRefine((data, ctx) => {
    if (data.accessType === "sessions" || (data.sessionLimit !== undefined && data.accessType !== "unlimited")) {
        refinePackageAccessType(
            { accessType: data.accessType ?? "sessions", sessionLimit: data.sessionLimit },
            ctx,
        );
    }
});

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
        "Coach", "Head Coach", "Retail",
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
// Plan keys are free-form slugs so super admin can create any tier.
const planKeySchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,31}$/, "Plan key must be 2-32 lowercase letters, numbers, hyphens or underscores");

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

const brandingDisplayName = z.preprocess(
    (v) => (v == null || v === "" ? v : sanitizePlainText(String(v)).slice(0, 120) || null),
    z.string().nullable().optional()
);

const profileText = (max) => z.preprocess(
    (v) => (v == null ? v : sanitizePlainText(String(v)).trim().slice(0, max) || null),
    z.string().nullable().optional()
);

const tenantNotificationSettingsSchema = z.object({
    weeklyDigest: z.boolean().optional(),
}).optional();

const tenantOnboardingSettingsSchema = z.object({
    dismissed: z.boolean().optional(),
}).optional();

const tenantBillingProfileSchema = z.object({
    legalName: profileText(160),
    taxNumber: profileText(40),
    commercialRegistration: profileText(40),
    addressLine1: profileText(200),
    addressLine2: profileText(200),
    city: profileText(80),
    region: profileText(80),
    postalCode: profileText(20),
    country: profileText(80),
    billingEmail: z.preprocess(
        (v) => (v == null || v === "" ? null : String(v).trim().toLowerCase()),
        z.string().email("Enter a valid billing email").max(160).nullable().optional()
    ),
    phone: profileText(30),
}).optional();

const contractTermsText = z.preprocess(
    (v) => (v == null ? v : sanitizePlainText(String(v))),
    z.string().max(20000, "Contract terms must be under 20,000 characters").optional()
);

const tenantSettingsSchema = z.object({
    notifications: tenantNotificationSettingsSchema,
    onboarding: tenantOnboardingSettingsSchema,
    billingProfile: tenantBillingProfileSchema,
    contractTerms: contractTermsText,
    branding: z.object({
        logoKey: z.string().nullable().optional(),
        displayName: brandingDisplayName,
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
    packageTransferFee: z.coerce.number().min(0).optional(),
    settings: z.object({
        notifications: tenantNotificationSettingsSchema,
        onboarding: tenantOnboardingSettingsSchema,
        contractTerms: contractTermsText,
        branding: z.object({
            logoKey: z.string().nullable().optional(),
            displayName: brandingDisplayName,
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
        packageTransferFee: z.coerce.number().min(0).optional(),
    }).optional(),
});

const packageTransferFeeSchema = z.object({
    packageTransferFee: z.coerce.number().min(0),
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

const updateTenantNameSchema = z.object({
    name: z.string().trim().min(1, "Gym name is required").max(120),
});

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

const maintenanceIntervalUnit = z.enum(["hour", "day", "week", "month"]);

const createMaintenanceItemSchema = z.object({
    title: plainText(200),
    description: z.string().trim().max(1000).optional().default(""),
    intervalValue: z.coerce.number().int().min(1).max(999),
    intervalUnit: maintenanceIntervalUnit,
    locationId: objectId.optional(),
    targetLocationIds: z.array(objectId).optional(),
    allLocations: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
    if (data.allLocations) return;
    if (Array.isArray(data.targetLocationIds) && data.targetLocationIds.length) return;
    if (data.locationId) return;
    ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "locationId, targetLocationIds, or allLocations is required",
        path: ["locationId"],
    });
});

const updateMaintenanceItemSchema = z.object({
    title: plainText(200).optional(),
    description: z.string().trim().max(1000).optional(),
    intervalValue: z.coerce.number().int().min(1).max(999).optional(),
    intervalUnit: maintenanceIntervalUnit.optional(),
    active: z.boolean().optional(),
}).refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one field is required" }
);

const copyMaintenanceItemSchema = z.object({
    targetLocationIds: z.array(objectId).optional(),
    allLocations: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
    if (data.allLocations) return;
    if (Array.isArray(data.targetLocationIds) && data.targetLocationIds.length) return;
    ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetLocationIds or allLocations is required",
        path: ["targetLocationIds"],
    });
});

const completeMaintenanceItemSchema = z.object({
    notes: z.string().trim().max(1000).optional().default(""),
});

// ── Retail, inventory and bar POS ────────────────────────────────────────────
const retailText = (maxLen) =>
    z.string().trim().max(maxLen).transform(sanitizePlainText).optional();
const money = z.coerce.number().finite().min(0).max(10_000_000);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const requireAnyField = (data) => Object.keys(data).length > 0;

const createVendorSchema = z.object({
    name: plainText(120),
    type: z.enum(["in_house", "external"]).optional().default("external"),
    contactName: retailText(120),
    phone: retailText(40),
    email: z.string().trim().max(160).optional(),
    notes: retailText(500),
    commissionPercent: z.coerce.number().min(0).max(100).optional().default(0),
    locationId: objectId.optional(),
});

const updateVendorSchema = z.object({
    name: plainText(120).optional(),
    contactName: retailText(120),
    phone: retailText(40),
    email: z.string().trim().max(160).optional(),
    notes: retailText(500),
    commissionPercent: z.coerce.number().min(0).max(100).optional(),
    active: z.boolean().optional(),
}).refine(requireAnyField, { message: "At least one field is required" });

const createProductCategorySchema = z.object({
    name: plainText(80),
    section: z.enum(["retail", "bar"]),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

const updateProductCategorySchema = z.object({
    name: plainText(80).optional(),
    section: z.enum(["retail", "bar"]).optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    active: z.boolean().optional(),
}).refine(requireAnyField, { message: "At least one field is required" });

const createProductSchema = z.object({
    name: plainText(160),
    categoryId: objectId,
    vendorId: objectId.optional(),
    price: money,
    sku: retailText(64),
    trackStock: z.boolean().optional(),
    stockQty: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
    lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
    imageUrl: z.string().trim().max(500).optional(),
    locationId: objectId.optional(),
});

const updateProductSchema = z.object({
    name: plainText(160).optional(),
    categoryId: objectId.optional(),
    vendorId: objectId.optional(),
    price: money.optional(),
    sku: retailText(64),
    trackStock: z.boolean().optional(),
    lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).optional(),
    imageUrl: z.string().trim().max(500).optional(),
    active: z.boolean().optional(),
}).refine(requireAnyField, { message: "At least one field is required" });

const stockChangeSchema = z.object({
    mode: z.enum(["restock", "adjust"]),
    qty: z.coerce.number().int().min(-1_000_000).max(1_000_000),
    reason: retailText(300),
}).superRefine((data, ctx) => {
    if (data.qty === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Quantity cannot be zero", path: ["qty"] });
    }
    if (data.mode === "restock" && data.qty < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Restock quantity must be positive", path: ["qty"] });
    }
});

const createSaleSchema = z.object({
    items: z.array(z.object({
        productId: objectId,
        qty: z.coerce.number().int().min(1).max(999),
    })).min(1).max(100),
    discount: money.optional().default(0),
    paymentMethod: z.enum(["cash", "card", "wallet"]).optional().default("cash"),
    memberId: nullableObjectId,
    note: retailText(300),
    locationId: objectId.optional(),
});

const refundSaleSchema = z.object({
    items: z.array(z.object({
        itemId: objectId,
        qty: z.coerce.number().int().min(1).max(999),
    })).min(1).optional(),
    reason: retailText(300),
});

const createVendorPayoutSchema = z.object({
    vendorId: objectId,
    periodFrom: dateKey,
    periodTo: dateKey,
    note: retailText(300),
});

const inboxReplySchema = z.object({
    text: plainText(4000),
});

// emptyToNull would turn an omitted field into null and silently unassign or
// unlink, so a patch must keep "missing" distinct from "clear".
const clearableObjectId = z
    .union([objectId, z.literal(""), z.null()])
    .optional()
    .transform((value) => (value === "" ? null : value));

const inboxConversationPatchSchema = z.object({
    assignedTo: clearableObjectId,
    status: z.enum(["open", "done", "snoozed"]).optional(),
    snoozedUntil: z.coerce.date().optional(),
    memberId: clearableObjectId,
    markRead: z.boolean().optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field is required",
});

module.exports = {
    inboxReplySchema,
    inboxConversationPatchSchema,
    loginSchema,
    selectTenantSchema,
    setupPasswordSchema,
    forgotPasswordSchema,
    createMemberSchema,
    updateMemberSchema,
    assignMemberLocationSchema,
    freezeMemberSchema,
    blockMemberSchema,
    suspendMemberSchema,
    // Staff account lock/suspend reuse the same body shape as members.
    blockStaffSchema: blockMemberSchema,
    suspendStaffSchema: suspendMemberSchema,
    addNoteSchema,
    addAlertSchema,
    invitationSchema,
    assignPackageSchema,
    updateSubscriptionSchema,
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
    updateTenantNameSchema,
    tenantSettingsSchema,
    packageTransferFeeSchema,
    updateEntitlementPolicySchema,
    planPriceSchema,
    publicSignupSchema,
    createMaintenanceItemSchema,
    updateMaintenanceItemSchema,
    copyMaintenanceItemSchema,
    completeMaintenanceItemSchema,
    createVendorSchema,
    updateVendorSchema,
    createProductCategorySchema,
    updateProductCategorySchema,
    createProductSchema,
    updateProductSchema,
    stockChangeSchema,
    createSaleSchema,
    refundSaleSchema,
    createVendorPayoutSchema,
};
