const os = require("os");
const path = require("path");
const http = require("http");
const { StorageService } = require("./storageService");
const app = require("../app");

const R2_KEYS = [
    "STORAGE_DRIVER",
    "R2_ACCOUNT_ID",
    "R2_BUCKET_NAME",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "AWS_REGION",
    "AWS_S3_ENDPOINT",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_BUCKET",
];

const ORIGINAL = Object.fromEntries(R2_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
    for (const key of R2_KEYS) {
        if (ORIGINAL[key] === undefined) delete process.env[key];
        else process.env[key] = ORIGINAL[key];
    }
}

function r2Env() {
    process.env.STORAGE_DRIVER = "r2";
    process.env.R2_ACCOUNT_ID = "f7cd61e729b00936ed5f88b6833f5aa8";
    process.env.R2_BUCKET_NAME = "forma";
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_S3_ENDPOINT = "https://example.invalid/forma";
}

describe("R2 storage configuration", () => {
    afterEach(() => {
        restoreEnv();
    });

    it("fails closed when the R2 token or bucket settings are missing", () => {
        process.env.STORAGE_DRIVER = "r2";
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_BUCKET_NAME;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;

        const service = new StorageService(path.join(os.tmpdir(), "leap-r2-missing"));

        expect(() => service.assertConfigured()).toThrow(
            "StorageService: STORAGE_DRIVER=r2 requires R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
        );
    });

    it("builds the forma bucket client without default CRC32 checksums", () => {
        r2Env();
        const service = new StorageService(path.join(os.tmpdir(), "leap-r2-client"));

        expect(() => service.assertConfigured()).not.toThrow();
        expect(service.bucketName()).toBe("forma");

        const options = service.buildClientOptions();
        expect(options.region).toBe("auto");
        expect(options.endpoint).toBe("https://f7cd61e729b00936ed5f88b6833f5aa8.r2.cloudflarestorage.com");
        expect(options.requestChecksumCalculation).toBe("WHEN_REQUIRED");
        expect(options.responseChecksumValidation).toBe("WHEN_REQUIRED");
        expect(options.credentials.accessKeyId).toBe("test-access-key");
        expect(options.credentials.secretAccessKey).toBe("test-secret-key");
    });

    it("does not require R2 settings for local storage", () => {
        process.env.STORAGE_DRIVER = "local";
        delete process.env.R2_ACCESS_KEY_ID;

        const service = new StorageService(path.join(os.tmpdir(), "leap-r2-local"));
        expect(() => service.assertConfigured()).not.toThrow();
    });
});

describe("authorized upload reads", () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, "127.0.0.1", () => {
                baseUrl = `http://127.0.0.1:${server.address().port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    it("requires a staff session before reading a stored upload", async () => {
        const res = await fetch(`${baseUrl}/uploads/photo-private.png`);
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.message).toBe("Not authorized, no token");
    });
});
