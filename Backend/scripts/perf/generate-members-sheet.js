const XLSX = require("xlsx");

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

function workbookBuffer(rows) {
    const sheet = XLSX.utils.aoa_to_sheet([
        ["name", "phone"],
        ...rows.map((row) => [row.name, row.phone]),
    ]);
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
        for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
            if (!sheet[address]) continue;
            sheet[address].t = "s";
            sheet[address].v = String(sheet[address].v);
        }
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Members");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
}

function csvBuffer(rows) {
    const lines = ["name,phone", ...rows.map((row) => `${row.name},${row.phone}`)];
    return Buffer.from(lines.join("\n"), "utf8");
}

function readPhone(buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer", bookVBA: false, cellFormula: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const [row] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    return String(row?.phone ?? "").trim();
}

function spreadsheetFor(rows) {
    const expectedPhone = rows[0]?.phone || "";
    const xlsx = workbookBuffer(rows);
    const xlsxPhone = readPhone(xlsx);
    if (xlsx.length <= SPREADSHEET_MAX_BYTES && xlsxPhone === expectedPhone) {
        return {
            buffer: xlsx,
            filename: "members.xlsx",
            bytes: xlsx.length,
            format: "xlsx",
            xlsxBytes: xlsx.length,
            phoneRoundTrip: xlsxPhone,
        };
    }

    const csv = csvBuffer(rows);
    const csvPhone = readPhone(csv);
    const csvFits = csv.length <= SPREADSHEET_MAX_BYTES && csvPhone === expectedPhone;
    return {
        buffer: csvFits ? csv : xlsx,
        filename: csvFits ? "members.csv" : "members.xlsx",
        bytes: csvFits ? csv.length : xlsx.length,
        format: csvFits ? "csv" : "xlsx",
        xlsxBytes: xlsx.length,
        csvBytes: csv.length,
        overLimit: !csvFits,
        phoneRoundTrip: csvFits ? csvPhone : xlsxPhone,
        xlsxPhone,
    };
}

if (require.main === module) {
    const count = Number(process.argv[2] || 200);
    const prefix = process.argv[3] || "0199";
    const file = spreadsheetFor(buildRows(count, prefix, 1));
    process.stdout.write(JSON.stringify({
        count,
        prefix,
        format: file.format,
        bytes: file.bytes,
        xlsxBytes: file.xlsxBytes,
        overLimit: Boolean(file.overLimit),
        phoneRoundTrip: file.phoneRoundTrip,
    }, null, 2));
}

module.exports = {
    SPREADSHEET_MAX_BYTES,
    buildRows,
    spreadsheetFor,
};
