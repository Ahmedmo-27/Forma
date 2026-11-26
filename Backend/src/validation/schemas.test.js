const {
    assignPackageSchema,
    updateSubscriptionSchema,
    addNoteSchema,
    createExceptionSchema,
    salesRequestSchema,
    updateMemberSchema,
    tenantSettingsSchema,
    createPackageSchema,
} = require("./schemas");

const basePayload = {
    packageId: "507f1f77bcf86cd799439011",
    name: "Gold",
    duration: "1 month",
};

describe("assignPackageSchema", () => {
    it("rejects zero pricePaid", () => {
        const result = assignPackageSchema.safeParse({ ...basePayload, pricePaid: 0 });
        expect(result.success).toBe(false);
    });

    it("accepts positive pricePaid", () => {
        const result = assignPackageSchema.safeParse({ ...basePayload, pricePaid: 100 });
        expect(result.success).toBe(true);
    });

    it("accepts a custom endDate override", () => {
        const result = assignPackageSchema.safeParse({
            ...basePayload,
            pricePaid: 100,
            endDate: "2026-07-31",
        });
        expect(result.success).toBe(true);
        expect(result.data.endDate).toBe("2026-07-31");
    });

    it("requires sessionLimit when accessType is sessions", () => {
        const missing = assignPackageSchema.safeParse({
            ...basePayload,
            pricePaid: 100,
            accessType: "sessions",
        });
        expect(missing.success).toBe(false);

        const ok = assignPackageSchema.safeParse({
            ...basePayload,
            pricePaid: 100,
            accessType: "sessions",
            sessionLimit: 10,
        });
        expect(ok.success).toBe(true);
    });
});

describe("createPackageSchema", () => {
    it("accepts unlimited packages without sessionLimit", () => {
        const result = createPackageSchema.safeParse({
            name: "Gold",
            activityType: "gym",
            duration: "1 month",
            price: 1000,
            accessType: "unlimited",
        });
        expect(result.success).toBe(true);
    });

    it("requires sessionLimit for session packages", () => {
        const missing = createPackageSchema.safeParse({
            name: "10 Pack",
            activityType: "gym",
            duration: "1 month",
            price: 500,
            accessType: "sessions",
        });
        expect(missing.success).toBe(false);

        const ok = createPackageSchema.safeParse({
            name: "10 Pack",
            activityType: "gym",
            duration: "1 month",
            price: 500,
            accessType: "sessions",
            sessionLimit: 10,
        });
        expect(ok.success).toBe(true);
    });
});

describe("updateSubscriptionSchema", () => {
    it("rejects an empty body", () => {
        expect(updateSubscriptionSchema.safeParse({}).success).toBe(false);
    });

    it("accepts partial term updates including zero pricePaid", () => {
        const result = updateSubscriptionSchema.safeParse({
            freezeLimitDays: 12,
            pricePaid: 0,
            endDate: "2026-06-01",
        });
        expect(result.success).toBe(true);
        expect(result.data.freezeLimitDays).toBe(12);
        expect(result.data.pricePaid).toBe(0);
    });
});

describe("addNoteSchema", () => {
    it("strips script tags from note text", () => {
        const result = addNoteSchema.safeParse({
            text: '<script>alert("xss")</script>Hello',
        });
        expect(result.success).toBe(true);
        expect(result.data.text).toBe('alert("xss")Hello');
    });
});

describe("memberId coercion for request schemas", () => {
    const basePackageId = "507f1f77bcf86cd799439011";

    it("createExceptionSchema accepts numeric systemId", () => {
        const result = createExceptionSchema.safeParse({
            memberId: 105,
            basePackageId,
            hasException: false,
            name: "Gym",
            pricePaid: 500,
        });
        expect(result.success).toBe(true);
        expect(result.data.memberId).toBe("105");
    });

    it("salesRequestSchema accepts numeric systemId", () => {
        const result = salesRequestSchema.safeParse({ memberId: 100 });
        expect(result.success).toBe(true);
        expect(result.data.memberId).toBe("100");
    });

    it("salesRequestSchema still accepts string systemId", () => {
        const result = salesRequestSchema.safeParse({ memberId: "100" });
        expect(result.success).toBe(true);
        expect(result.data.memberId).toBe("100");
    });
});

describe("updateMemberSchema", () => {
    it("accepts personal details and empty optional fields", () => {
        const result = updateMemberSchema.safeParse({
            name: "Nour Mahmoud",
            phones: "01000000000",
            gender: "",
            birthdate: "",
            source: "Walk in",
        });
        expect(result.success).toBe(true);
        expect(result.data.gender).toBeNull();
        expect(result.data.birthdate).toBeNull();
        expect(result.data.source).toBe("Walk in");
    });

    it("rejects a blank name", () => {
        const result = updateMemberSchema.safeParse({ name: "  ", phones: "01000000000" });
        expect(result.success).toBe(false);
    });

    it("accepts location-only updates without a name", () => {
        const result = updateMemberSchema.safeParse({ locationId: "507f1f77bcf86cd799439011" });
        expect(result.success).toBe(true);
        expect(result.data.locationId).toBe("507f1f77bcf86cd799439011");
        expect(result.data.name).toBeUndefined();
    });

    it("requires a name when personal fields are sent", () => {
        const result = updateMemberSchema.safeParse({ gender: "male" });
        expect(result.success).toBe(false);
    });
});


describe("tenantSettingsSchema", () => {
    it("accepts top-level branding with palette", () => {
        const payload = {
            branding: {
                displayName: "Acme Gym Pro",
                palette: {
                    primary: "#123456",
                    secondary: "#654321",
                    accent: "#abcdef",
                    background: "#f0f0f0",
                    text: "#111111",
                    icon: "#445566",
                },
            },
            locale: {
                timezone: "Africa/Cairo",
                language: "en",
            },
            enabledActivities: ["gym", "crossfit"],
        };
        const result = tenantSettingsSchema.safeParse(payload);
        expect(result.success).toBe(true);
        expect(result.data.branding.palette.primary).toBe("#123456");
    });

    it("accepts nested settings.branding with palette", () => {
        const payload = {
            settings: {
                branding: {
                    displayName: "Nested Gym",
                    palette: {
                        primary: "#001122",
                        secondary: "#334455",
                    },
                },
            },
        };
        const result = tenantSettingsSchema.safeParse(payload);
        expect(result.success).toBe(true);
        expect(result.data.settings.branding.palette.primary).toBe("#001122");
    });
});
