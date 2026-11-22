const mongoose = require("mongoose");

/**
 * Deduped string ids for a member's primary + linked branches.
 */
function memberLinkedLocationIds(member) {
    const ids = new Set();
    if (!member) return [];
    if (member.locationId != null) {
        ids.add(String(member.locationId._id || member.locationId));
    }
    for (const raw of member.locationIds || []) {
        if (raw != null) ids.add(String(raw._id || raw));
    }
    return [...ids].filter(Boolean);
}

function memberHasLocation(member, locationId) {
    if (!locationId) return false;
    const target = String(locationId._id || locationId);
    return memberLinkedLocationIds(member).includes(target);
}

function toObjectIdList(ids) {
    return [...new Set((ids || []).map((id) => String(id._id || id)).filter(Boolean))]
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
}

/**
 * Ensure locationId is set and present in locationIds (deduped).
 * When addLocationId is provided it is added without removing other links.
 */
function applyMemberLocations(personOrMember, { primaryLocationId, addLocationId } = {}) {
    const linked = new Set(memberLinkedLocationIds(personOrMember));

    if (primaryLocationId) {
        const primary = String(primaryLocationId._id || primaryLocationId);
        linked.add(primary);
        personOrMember.locationId = primaryLocationId._id || primaryLocationId;
    } else if (personOrMember.locationId) {
        linked.add(String(personOrMember.locationId._id || personOrMember.locationId));
    }

    if (addLocationId) {
        linked.add(String(addLocationId._id || addLocationId));
        if (!personOrMember.locationId) {
            personOrMember.locationId = addLocationId._id || addLocationId;
        }
    }

    personOrMember.locationIds = toObjectIdList([...linked]);
    return personOrMember;
}

/**
 * Mongo clause matching members linked to one or more branch ObjectIds.
 */
function memberLinkedToLocationsClause(locationObjectIds) {
    const ids = toObjectIdList(locationObjectIds);
    if (!ids.length) {
        return { locationId: { $in: [] } };
    }
    if (ids.length === 1) {
        const oid = ids[0];
        return {
            $or: [
                { locationId: oid },
                { locationIds: oid },
            ],
        };
    }
    return {
        $or: [
            { locationId: { $in: ids } },
            { locationIds: { $in: ids } },
        ],
    };
}

module.exports = {
    memberLinkedLocationIds,
    memberHasLocation,
    applyMemberLocations,
    memberLinkedToLocationsClause,
    toObjectIdList,
};
