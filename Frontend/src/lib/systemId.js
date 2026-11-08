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
 * Sends the numeric member ID (e.g. "100") for members, or the system ID (e.g. "S100") for non-members.
 */
export function memberQrPayload(memberOrId) {
  if (!memberOrId) return "";
  if (typeof memberOrId === "object") {
    const isMember = Boolean(memberOrId.memberId != null || memberOrId.isMember);
    if (isMember && memberOrId.memberId != null) {
      return formatMemberId(memberOrId.memberId);
    }
    return formatSystemId(memberOrId.systemId);
  }
  const raw = String(memberOrId).trim();
  if (/^m\d+$/i.test(raw)) return formatMemberId(raw);
  if (/^s\d+$/i.test(raw)) return formatSystemId(raw);
  return raw;
}
