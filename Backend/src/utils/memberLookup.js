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

    // QR codes encode the displayed system id ("S100"). That prefix is this
    // member's system id only, so a scan cannot land on someone else's member id.
    if (/^s\d+$/i.test(value)) {
        return { systemId: Number(value.slice(1)) };
    }

    // QR codes or input for members with M prefix (e.g. "M100")
    if (/^m\d+$/i.test(value)) {
        return { memberId: Number(value.slice(1)) };
    }

    // A bare number can be either id. Staff still type both at the desk.
    // Checks memberId first for subscribers, then systemId.
    if (/^\d+$/.test(value)) {
        const numId = Number(value);
        return { $or: [{ memberId: numId }, { systemId: numId }] };
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
