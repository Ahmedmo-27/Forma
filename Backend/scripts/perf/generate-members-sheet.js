const SPREADSHEET_MAX_BYTES = 5 * 1024 * 1024;

function buildRows(count, prefix, start = 1) {
    const rows = [];
    for (let n = start; n < start + count; n += 1) {
        rows.push({
            name: `Perf Test ${n}`,
            phone: `${prefix}${String(n).padStart(7, "0")}`,
        });
    }
    return rows;
}

function csvBuffer(rows) {
    const lines = ["name,phone", ...rows.map((row) => `${row.name},${row.phone}`)];
    return Buffer.from(lines.join("\n"), "utf8");
}

function readPhone(buffer) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return "";
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const phoneIdx = headers.findIndex((h) => ["phone", "number", "mobile", "phones"].includes(h));
    const cols = lines[1].split(",");
    return String(cols[phoneIdx >= 0 ? phoneIdx : 1] ?? "").trim();
}

function spreadsheetFor(rows) {
    const expectedPhone = rows[0]?.phone || "";
    const csv = csvBuffer(rows);
    const csvPhone = readPhone(csv);
    const csvFits = csv.length <= SPREADSHEET_MAX_BYTES && csvPhone === expectedPhone;
    return {
        buffer: csv,
        filename: "members.csv",
        bytes: csv.length,
        format: "csv",
        csvBytes: csv.length,
        overLimit: !csvFits,
        phoneRoundTrip: csvPhone,
    };
}

if (require.main === module) {
    const count = Number(process.argv[2] || 200);
    const prefix = process.argv[3] || "0199";
    const sheet = spreadsheetFor(buildRows(count, prefix));
    console.log(JSON.stringify({
        rows: count,
        format: sheet.format,
        bytes: sheet.bytes,
        phoneRoundTrip: sheet.phoneRoundTrip,
        overLimit: sheet.overLimit,
    }, null, 2));
}

module.exports = {
    buildRows,
    csvBuffer,
    spreadsheetFor,
    SPREADSHEET_MAX_BYTES,
};
