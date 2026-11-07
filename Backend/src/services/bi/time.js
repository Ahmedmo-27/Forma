/**
 * Tenant-local dates. Africa/Cairo is UTC+2 with no DST; the helpers still
 * use the IANA zone so a zone change does not require a code change.
 */

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad(n) {
    return String(n).padStart(2, "0");
}

function asDate(value) {
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function zonedParts(date, timeZone) {
    const instant = asDate(date);
    if (!instant) {
        throw new RangeError("Invalid time value");
    }
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "short",
        hourCycle: "h23",
    });
    const map = {};
    for (const part of fmt.formatToParts(instant)) map[part.type] = part.value;
    let hour = Number(map.hour);
    if (hour === 24) hour = 0;
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour,
        minute: Number(map.minute),
        second: Number(map.second),
        weekday: WEEKDAY[String(map.weekday || "").slice(0, 3)] ?? 0,
    };
}

function localDateKey(date, timeZone) {
    const p = zonedParts(date, timeZone);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function offsetMs(date, timeZone) {
    const p = zonedParts(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - date.getTime();
}

function zonedMidnightUtc(dateKey, timeZone) {
    const [y, m, d] = dateKey.split("-").map(Number);
    let utc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    for (let i = 0; i < 4; i += 1) {
        const next = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs(utc, timeZone));
        if (next.getTime() === utc.getTime()) break;
        utc = next;
    }
    return utc;
}

function addLocalDays(dateKey, days) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d + days));
    return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function weekdayOfKey(dateKey, timeZone) {
    const mid = new Date(zonedMidnightUtc(dateKey, timeZone).getTime() + 12 * 60 * 60 * 1000);
    return zonedParts(mid, timeZone).weekday;
}

function monthKeyOf(dateKey) {
    return dateKey.slice(0, 7);
}

function dayRange(dateKey, timeZone) {
    const start = zonedMidnightUtc(dateKey, timeZone);
    const end = zonedMidnightUtc(addLocalDays(dateKey, 1), timeZone);
    return { start, end };
}

function inRange(value, start, end) {
    if (!value) return false;
    const t = new Date(value).getTime();
    return t >= start.getTime() && t < end.getTime();
}

module.exports = {
    zonedParts,
    localDateKey,
    zonedMidnightUtc,
    addLocalDays,
    weekdayOfKey,
    monthKeyOf,
    dayRange,
    inRange,
};
