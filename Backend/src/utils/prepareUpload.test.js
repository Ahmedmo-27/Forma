const crypto = require("crypto");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const { prepareUpload, INTAKE_MAX_BYTES, PHOTO_MAX_BYTES } = require("./prepareUpload");
const { detectMimeFromBuffer } = require("./fileMagic");

async function jpegBuffer(width = 8, height = 8) {
    return sharp({
        create: { width, height, channels: 3, background: { r: 200, g: 20, b: 20 } },
    }).jpeg().toBuffer();
}

describe("prepareUpload", () => {
    it("rejects JavaScript bytes named as a png", async () => {
        await expect(prepareUpload({
            originalname: "photo.png",
            buffer: Buffer.from("console.log(1)"),
        }, "photo")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("accepts a script-free SVG logo", async () => {
        const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#111"/></svg>');
        const file = { originalname: "logo.svg", filename: "logo-abc.svg", buffer: svg };
        await prepareUpload(file, "logo");
        expect(file.mimetype).toBe("image/svg+xml");
        expect(file.buffer.toString("utf8")).toContain("<rect");
    });

    it("accepts a small photo, PDF, and csv", async () => {
        const photo = { originalname: "photo.jpg", filename: "photo-abc.jpg", buffer: await jpegBuffer() };
        await prepareUpload(photo, "photo");
        expect(detectMimeFromBuffer(photo.buffer)).toBe("image/jpeg");
        expect(photo.buffer.length).toBeLessThanOrEqual(PHOTO_MAX_BYTES);

        const pdfDoc = await PDFDocument.create();
        pdfDoc.addPage([200, 200]);
        const pdf = {
            originalname: "id.pdf",
            filename: "nid-abc.pdf",
            buffer: Buffer.from(await pdfDoc.save()),
        };
        await prepareUpload(pdf, "document");
        expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
        expect(pdf.buffer.length).toBeLessThanOrEqual(5 * 1024 * 1024);

        const sheet = {
            originalname: "members.csv",
            buffer: Buffer.from("name,phone\nAda,0100\n"),
        };
        await prepareUpload(sheet, "spreadsheet");
        expect(sheet.mimetype).toBe("text/csv");
    });

    it("compresses an oversized PDF under the document limit", async () => {
        const edge = 2500;
        const raw = crypto.randomBytes(edge * edge * 3);
        const jpeg = await sharp(raw, { raw: { width: edge, height: edge, channels: 3 } }).jpeg({ quality: 98 }).toBuffer();
        const doc = await PDFDocument.create();
        const image = await doc.embedJpg(jpeg);
        const page = doc.addPage([600, 600]);
        page.drawImage(image, { x: 0, y: 0, width: 600, height: 600 });
        const file = {
            originalname: "scan.pdf",
            filename: "nid-scan.pdf",
            buffer: Buffer.from(await doc.save()),
        };
        expect(file.buffer.length).toBeGreaterThan(5 * 1024 * 1024);

        await prepareUpload(file, "document");

        expect(file.buffer.length).toBeLessThanOrEqual(5 * 1024 * 1024);
        expect(file.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }, 20000);

    it("compresses an oversized JPEG under the photo limit", async () => {
        const edge = 1700;
        const raw = crypto.randomBytes(edge * edge * 3);
        const big = await sharp(raw, { raw: { width: edge, height: edge, channels: 3 } }).jpeg({ quality: 98 }).toBuffer();
        expect(big.length).toBeGreaterThan(PHOTO_MAX_BYTES);
        expect(big.length).toBeLessThanOrEqual(INTAKE_MAX_BYTES);

        const file = { originalname: "huge.jpg", filename: "photo-huge.jpg", buffer: big };
        await prepareUpload(file, "photo");

        expect(file.buffer.length).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
        expect(detectMimeFromBuffer(file.buffer)).toBe("image/jpeg");
        expect(file.buffer.includes(Buffer.from("<?php"))).toBe(false);
    }, 20000);

    it("rejects a PDF that contains JavaScript", async () => {
        const pdfDoc = await PDFDocument.create();
        pdfDoc.addPage([200, 200]);
        const bytes = Buffer.from(await pdfDoc.save());
        const evil = Buffer.concat([bytes, Buffer.from("\n/JavaScript (app.alert(1))")]);
        await expect(prepareUpload({
            originalname: "id.pdf",
            buffer: evil,
        }, "document")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("accepts a plain csv and rejects xlsx extensions", async () => {
        const csv = { originalname: "members.csv", buffer: Buffer.from("name,phone\nAda,0100\n") };
        await prepareUpload(csv, "spreadsheet");
        expect(csv.mimetype).toBe("text/csv");

        await expect(prepareUpload({
            originalname: "members.xlsx",
            buffer: Buffer.from("name,phone\nAda,0100\n"),
        }, "spreadsheet")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a csv that is script text", async () => {
        await expect(prepareUpload({
            originalname: "members.csv",
            buffer: Buffer.from("<script>alert(1)</script>"),
        }, "spreadsheet")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a file over the 15 MB intake cap", async () => {
        const huge = Buffer.alloc(INTAKE_MAX_BYTES + 1, 0x61);
        await expect(prepareUpload({
            originalname: "big.jpg",
            buffer: huge,
        }, "photo")).rejects.toMatchObject({ statusCode: 413 });
    });
});
