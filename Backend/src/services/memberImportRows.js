const CHUNK_SIZE = 200;
const MAX_ROWS = 100000;
const MAX_STORED_ERRORS = 25;

const NAME_KEYS = ["name", "اسم", "الاسم"];
const PHONE_KEYS = ["phone", "number", "رقم", "phones", "mobile"];

function cell(row, keys) {
    for (const key of keys) {
        const value = row[key];
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return "";
}

function normalizeSheetRows(rawRows) {
    return rawRows.map((row, index) => {
        const normalized = {};
        for (const [key, value] of Object.entries(row || {})) {
            normalized[String(key).toLowerCase().trim()] = value;
        }
        const name = cell(normalized, NAME_KEYS);
        const phone = cell(normalized, PHONE_KEYS);
        const line = index + 2;
        if (!name) return { line, name, phone, error: "Missing name" };
        if (!phone) return { line, name, phone, error: "Missing phone number" };
        return { line, name, phone };
    });
}

function parseSpreadsheetBuffer(buffer) {
    const XLSX = require("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
        const error = new Error("Excel file is empty");
        error.statusCode = 400;
        throw error;
    }
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rawRows.length) {
        const error = new Error("Excel file is empty");
        error.statusCode = 400;
        throw error;
    }
    if (rawRows.length > MAX_ROWS) {
        const error = new Error(`This sheet has ${rawRows.length} rows. The maximum is ${MAX_ROWS}.`);
        error.statusCode = 400;
        throw error;
    }
    return normalizeSheetRows(rawRows);
}

function chunkCountFor(total, chunkSize = CHUNK_SIZE) {
    return Math.max(1, Math.ceil(total / chunkSize));
}

module.exports = {
    CHUNK_SIZE,
    MAX_ROWS,
    MAX_STORED_ERRORS,
    normalizeSheetRows,
    parseSpreadsheetBuffer,
    chunkCountFor,
};
