const { toWhatsAppDigits, toWhatsAppJid, phoneFromJid } = require("./phone");

describe("WhatsApp phone normalization", () => {
    it("turns a local Egyptian mobile into a 20-prefixed number", () => {
        expect(toWhatsAppDigits("01001234567")).toBe("201001234567");
        expect(toWhatsAppJid("01001234567")).toBe("201001234567@s.whatsapp.net");
    });

    it("keeps an existing country code and strips separators", () => {
        expect(toWhatsAppDigits("+20 100 123 4567")).toBe("201001234567");
        expect(toWhatsAppDigits("00201001234567")).toBe("201001234567");
        expect(toWhatsAppDigits("201001234567")).toBe("201001234567");
    });

    it("rejects hidden, empty, and too-short numbers", () => {
        expect(toWhatsAppDigits("hidden")).toBeNull();
        expect(toWhatsAppDigits("")).toBeNull();
        expect(toWhatsAppDigits(null)).toBeNull();
        expect(toWhatsAppDigits("0")).toBeNull();
        expect(toWhatsAppDigits("12")).toBeNull();
        expect(toWhatsAppJid("hidden")).toBeNull();
    });

    it("reads the phone from a linked-device jid", () => {
        expect(phoneFromJid("201001234567:17@s.whatsapp.net")).toBe("201001234567");
        expect(phoneFromJid("")).toBeNull();
    });
});
