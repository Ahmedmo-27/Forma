"use strict";

const { normalizePhone, toWhatsAppJid } = require("../../src/services/whatsapp/phone");

const ALLOWED_TEST_PHONE = "01229004551";
const ALLOWED_E164 = "201229004551";
const ALLOWED_JID = `${ALLOWED_E164}@s.whatsapp.net`;

class SafetyViolationError extends Error {
    constructor(attemptedRecipient) {
        super(
            `[SAFETY VIOLATION BLOCKED] Attempted to dispatch WhatsApp message to unauthorized phone: "${attemptedRecipient}". ` +
            `Safety policy strictly permits ONLY: "${ALLOWED_TEST_PHONE}".`
        );
        this.name = "SafetyViolationError";
        this.code = "SAFETY_VIOLATION_BLOCKED";
        this.attemptedRecipient = attemptedRecipient;
    }
}

/**
 * Validates whether the given phone or JID matches the single permitted test recipient.
 * Throws SafetyViolationError if any other recipient is targeted.
 */
function assertAllowedRecipient(phoneOrJid) {
    if (!phoneOrJid) {
        throw new SafetyViolationError(phoneOrJid);
    }

    const raw = String(phoneOrJid).trim();
    const cleanDigits = raw.replace(/\D/g, "");

    const isMatch =
        raw === ALLOWED_TEST_PHONE ||
        raw === `+${ALLOWED_E164}` ||
        cleanDigits === ALLOWED_E164 ||
        cleanDigits === ALLOWED_TEST_PHONE ||
        raw === ALLOWED_JID ||
        toWhatsAppJid(raw) === ALLOWED_JID;

    if (!isMatch) {
        throw new SafetyViolationError(phoneOrJid);
    }
    return true;
}

function isAllowedRecipient(phoneOrJid) {
    try {
        return assertAllowedRecipient(phoneOrJid);
    } catch {
        return false;
    }
}

module.exports = {
    ALLOWED_TEST_PHONE,
    ALLOWED_E164,
    ALLOWED_JID,
    SafetyViolationError,
    assertAllowedRecipient,
    isAllowedRecipient,
};
