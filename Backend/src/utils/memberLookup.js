const mongoose = require("mongoose");
const Member = require("../models/Member");
const { isBarcode } = require("./barcodeHelper");

function isObjectIdString(id) {
    const value = String(id).trim();
    if (!mongoose.Types.ObjectId.isValid(value)) return false;
    return String(new mongoose.Types.ObjectId(value)) === value;
}

/**
 * Build a MongoDB filter to find a member by any identifier:
 * - ObjectId (_id)
 * - Barcode string (e.g. "FF000105")
 * - Numeric systemId or memberId
 */
function buildMemberFilter(id) {
    const value = String(id).trim();
    if (!value) return null;

    // MongoDB ObjectId
    if (isObjectIdString(value)) {
        return { _id: value };
    }

    // Barcode format (starts with "FF")
    if (isBarcode(value)) {
        return { barcode: value.toUpperCase() };
    }

    // Numeric system id or member id. "S100" is the displayed system id.
    const numeric = value.replace(/^[sS]/, "");
    if (/^\d+$/.test(numeric)) {
        const numId = Number(numeric);
        return { $or: [{ systemId: numId }, { memberId: numId }] };
    }

    return null;
}

function findMemberByIdentifier(id) {
    const filter = buildMemberFilter(id);
    if (!filter) {
        return Promise.resolve(null);
    }
    return Member.findOne(filter);
}

module.exports = {
    isObjectIdString,
    buildMemberFilter,
    findMemberByIdentifier,
};
