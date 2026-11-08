/** Stored system ids are numbers. The product shows them as S100, S101, … */
export function formatSystemId(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (/^s\d+$/i.test(raw)) return `S${raw.slice(1)}`;
  if (/^\d+$/.test(raw)) return `S${raw}`;
  return raw;
}

/** Value encoded in a member QR and accepted by check-in search. */
export function memberQrPayload(systemId) {
  return formatSystemId(systemId);
}
