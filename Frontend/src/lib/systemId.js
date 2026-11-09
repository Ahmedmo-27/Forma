/** Stored system ids are numbers. The product shows them as S100, S101, … */
export function formatSystemId(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (/^s\d+$/i.test(raw)) return `S${raw.slice(1)}`;
  if (/^\d+$/.test(raw)) return `S${raw}`;
  return raw;
}

/** Stored member ids are numbers starting from 100 with no letter prefix. */
export function formatMemberId(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (/^m\d+$/i.test(raw)) return raw.slice(1);
  return raw;
}

/**
 * Value encoded in a QR and accepted by check-in search.
 * Only members who have a member ID are allowed to have QR codes.
 * Returns the numeric member ID (e.g. "100") for members.
 * Returns "" for guests, profiles without a member ID, or system IDs.
 */
export function memberQrPayload(memberOrId) {
  if (!memberOrId) return "";
  if (typeof memberOrId === "object") {
    const isGuest = memberOrId.status === "guest" || memberOrId.isMember === false;
    if (isGuest || memberOrId.memberId == null || String(memberOrId.memberId).trim() === "") {
      return "";
    }
    return formatMemberId(memberOrId.memberId);
  }
  const raw = String(memberOrId).trim();
  if (/^s\d+$/i.test(raw)) return "";
  if (/^m\d+$/i.test(raw)) return formatMemberId(raw);
  return raw;
}
