/**
 * Flip public_site.published via platform API (super_admin Bearer token required).
 *
 * Usage:
 *   PLATFORM_TOKEN=… node scripts/publish-public-site.mjs
 *   PLATFORM_TOKEN=… node scripts/publish-public-site.mjs --unpublish
 *
 * API: POST {API}/api/platform/system/public-site
 */
const API =
  process.env.API_ORIGIN ||
  process.env.VITE_API_URL ||
  "https://api.forma-official.com";
const token = process.env.PLATFORM_TOKEN || process.env.PLATFORM_JWT;
const unpublish = process.argv.includes("--unpublish");

if (!token) {
  console.error("Set PLATFORM_TOKEN (platform super_admin JWT) to publish.");
  process.exit(1);
}

const url = `${String(API).replace(/\/$/, "")}/api/platform/system/public-site`;
const body = {
  published: !unpublish,
  message: unpublish
    ? "Forma’s public site is under development. Check back soon."
    : "Forma public marketing is live.",
};

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = text;
}

if (!res.ok) {
  console.error("Publish failed", res.status, data);
  process.exit(1);
}

console.log("OK", data);
console.log(
  unpublish
    ? "Site unpublished — ComingSoon noindex is active for guests."
    : "Site published — marketing pages are indexable for guests."
);
