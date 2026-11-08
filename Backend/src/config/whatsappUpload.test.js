const http = require("http");
const express = require("express");
const { runWithTenant, getTenantId } = require("../context/tenantContext");
const { uploadWhatsAppImage } = require("./whatsappUpload");

function postImage(port) {
    const boundary = "----leapwhatsapp";
    const body = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="check-in.png"\r\nContent-Type: image/png\r\n\r\n`
        ),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: "127.0.0.1",
            port,
            path: "/image",
            method: "POST",
            headers: {
                "content-type": `multipart/form-data; boundary=${boundary}`,
                "content-length": body.length,
            },
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                resolve({
                    status: res.statusCode,
                    body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
                });
            });
        });
        req.on("error", reject);
        req.end(body);
    });
}

describe("whatsapp image upload", () => {
    it("keeps the gym tenant context after multer finishes the file", async () => {
        const tenantId = "6aebcd2931c7687fac8d6003";
        const app = express();
        app.post(
            "/image",
            (req, res, next) => runWithTenant({ tenantId }, () => next()),
            uploadWhatsAppImage,
            (req, res) => {
                res.json({ tenantId: getTenantId(), bytes: req.file?.buffer?.length || 0 });
            }
        );
        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        try {
            const result = await postImage(server.address().port);
            expect(result.status).toBe(200);
            expect(result.body.tenantId).toBe(tenantId);
            expect(result.body.bytes).toBeGreaterThan(0);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
