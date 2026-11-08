/**
 * Parse and normalize a raw scanned QR or barcode into an identifier suitable for check-in.
 * Supports:
 * - Direct System IDs (e.g. "S100", "s100")
 * - Direct Member IDs (e.g. "M100", "m100", "100")
 * - Barcode strings (e.g. "FF000105")
 * - JSON payloads (e.g. {"systemId": 105} or {"memberId": 200})
 * - URLs (e.g. ".../members/S105" or "?id=S105" or "?systemId=105")
 * - Mode overrides ('auto', 'systemId', 'memberId')
 */
export function parseScannedIdentifier(raw, mode = 'auto') {
  if (raw == null) return '';
  let str = String(raw).trim();
  if (!str) return '';

  // 1. If JSON payload
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object') {
        if (parsed.systemId != null) {
          str = /^s/i.test(String(parsed.systemId))
            ? String(parsed.systemId).toUpperCase()
            : `S${parsed.systemId}`;
        } else if (parsed.memberId != null) {
          str = /^m/i.test(String(parsed.memberId))
            ? String(parsed.memberId).toUpperCase()
            : `M${parsed.memberId}`;
        } else if (parsed.barcode) {
          str = String(parsed.barcode).trim();
        } else if (parsed.id || parsed.code) {
          str = String(parsed.id || parsed.code).trim();
        }
      }
    } catch {
      // not valid JSON, proceed
    }
  }

  // 2. If URL
  if (/^https?:\/\//i.test(str)) {
    try {
      const url = new URL(str);
      const systemParam = url.searchParams.get('systemId') || url.searchParams.get('system_id');
      const memberParam = url.searchParams.get('memberId') || url.searchParams.get('member_id');
      const idParam = url.searchParams.get('id') || url.searchParams.get('code');

      if (systemParam) {
        str = /^s/i.test(systemParam) ? systemParam.toUpperCase() : `S${systemParam}`;
      } else if (memberParam) {
        str = /^m/i.test(memberParam) ? memberParam.toUpperCase() : `M${memberParam}`;
      } else if (idParam) {
        str = idParam.trim();
      } else {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
          str = parts[parts.length - 1];
        }
      }
    } catch {
      // not valid URL, proceed
    }
  }

  // 3. Labeled strings like "system: 105", "sys: 105", "systemId: 105"
  const systemMatch = str.match(/^(?:system(?:Id|_id)?|sys)[\s:=]+(\d+)/i);
  if (systemMatch) {
    return `S${systemMatch[1]}`;
  }

  const memberMatch = str.match(/^(?:member(?:Id|_id)?|mem)[\s:=]+(\d+)/i);
  if (memberMatch) {
    return `M${memberMatch[1]}`;
  }

  // 4. Normalize casing for standard S and M prefixes
  if (/^s\d+$/i.test(str)) {
    return `S${str.slice(1)}`;
  }
  if (/^m\d+$/i.test(str)) {
    return `M${str.slice(1)}`;
  }

  // 5. Apply explicit mode overrides if bare number was scanned
  if (/^\d+$/.test(str)) {
    if (mode === 'systemId') return `S${str}`;
    if (mode === 'memberId') return `M${str}`;
    return str;
  }

  // 6. Barcodes
  if (/^ff\d+$/i.test(str)) {
    return str.toUpperCase();
  }

  return str;
}
