/**
 * Egypt-oriented phone normalization, matching Frontend/src/utils/whatsapp.jsx.
 * Stored numbers are often local (010…) and messages go out as 20…
 */
function toWhatsAppDigits(phone, defaultCountryCode = "20") {
    if (!phone || phone === "hidden") return null;
    let digits = String(phone).replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("0")) digits = digits.slice(1);
    if (!digits) return null;
    const cc = String(defaultCountryCode || "20").replace(/\D/g, "");
    if (cc && !digits.startsWith(cc) && digits.length <= 11) digits = `${cc}${digits}`;
    if (digits.length < 8 || digits.length > 15) return null;
    return digits;
}

function toWhatsAppJid(phone, defaultCountryCode = "20") {
    const digits = toWhatsAppDigits(phone, defaultCountryCode);
    if (!digits) return null;
    return `${digits}@s.whatsapp.net`;
}

function phoneFromJid(jid) {
    if (!jid) return null;
    const user = String(jid).split("@")[0].split(":")[0];
    return /^\d{8,15}$/.test(user) ? user : null;
}

module.exports = {
    toWhatsAppDigits,
    toWhatsAppJid,
    phoneFromJid,
};
