/**
 * Barcode helper for gym member cards.
 * Format: "FF" + zero-padded memberId (6 digits) → e.g. FF000105
 *
 * This produces a Code128-compatible alphanumeric string suitable for:
 * - USB barcode scanners (act as keyboard input)
 * - Printed membership cards, key tags, key holders
 * - Future RFID/NFC card encoding
 */

const BARCODE_PREFIX = "FF";
const PAD_LENGTH = 6;

/**
 * Generate a barcode string from a numeric memberId.
 * @param {number} memberId - The member's numeric ID (e.g. 105)
 * @returns {string} The barcode string (e.g. "FF000105")
 */
function generateBarcode(memberId) {
    if (!memberId || isNaN(memberId)) return null;
    return `${BARCODE_PREFIX}${String(memberId).padStart(PAD_LENGTH, "0")}`;
}

/**
 * Check if a given string looks like a member barcode.
 * @param {string} value
 * @returns {boolean}
 */
function isBarcode(value) {
    if (!value || typeof value !== "string") return false;
    return value.toUpperCase().startsWith(BARCODE_PREFIX) && value.length >= BARCODE_PREFIX.length + 1;
}

/**
 * Extract the numeric memberId from a barcode string.
 * @param {string} barcode - e.g. "FF000105"
 * @returns {number|null} - e.g. 105
 */
function extractMemberIdFromBarcode(barcode) {
    if (!isBarcode(barcode)) return null;
    const numStr = barcode.slice(BARCODE_PREFIX.length);
    const num = parseInt(numStr, 10);
    return isNaN(num) ? null : num;
}

module.exports = {
    BARCODE_PREFIX,
    generateBarcode,
    isBarcode,
    extractMemberIdFromBarcode,
};
