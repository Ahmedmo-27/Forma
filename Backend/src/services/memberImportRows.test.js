const { normalizeSheetRows, chunkCountFor, CHUNK_SIZE } = require("./memberImportRows");

describe("member import rows", () => {
    it("reads English and Arabic headers and reports missing cells", () => {
        const rows = normalizeSheetRows([
            { Name: "Ada", Phone: "01000000001" },
            { اسم: "Mona", رقم: "01000000002" },
            { name: "   ", phone: "01000000003" },
            { name: "No Phone", mobile: "" },
        ]);

        expect(rows).toEqual([
            { line: 2, name: "Ada", phone: "01000000001" },
            { line: 3, name: "Mona", phone: "01000000002" },
            { line: 4, name: "", phone: "01000000003", error: "Missing name" },
            { line: 5, name: "No Phone", phone: "", error: "Missing phone number" },
        ]);
    });

    it("counts parts of 200 rows", () => {
        expect(CHUNK_SIZE).toBe(200);
        expect(chunkCountFor(1)).toBe(1);
        expect(chunkCountFor(200)).toBe(1);
        expect(chunkCountFor(201)).toBe(2);
        expect(chunkCountFor(50000)).toBe(250);
    });
});
