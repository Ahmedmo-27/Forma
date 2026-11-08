const { assignPackageSchema, addNoteSchema, createExceptionSchema, salesRequestSchema, updateMemberSchema } = require("./schemas");

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
});
