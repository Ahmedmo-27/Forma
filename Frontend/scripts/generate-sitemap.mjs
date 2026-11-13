/**
 * Write bilingual sitemap.xml with hreflang alternates + lastmod.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ORIGIN = "https://www.forma-official.com";
const today = new Date().toISOString().slice(0, 10);

const { MARKETING_PATHS, localizedPath } = await import(
  pathToFileURL(path.join(root, "src/marketing/i18n/locales.js")).href
);

function abs(pathname) {
  return `${ORIGIN}${pathname === "/" ? "/" : pathname}`;
}

function priorityFor(barePath) {
  if (barePath === "/") return "1.0";
  if (barePath === "/plans") return "0.9";
  if (barePath.startsWith("/gym") || barePath.includes("whatsapp") || barePath.includes("multi-branch"))
    return "0.85";
  if (barePath === "/why-forma") return "0.8";
  if (barePath === "/technology" || barePath === "/faq") return "0.8";
  return "0.7";
}

function changefreqFor(barePath) {
  if (barePath === "/" || barePath === "/plans") return "weekly";
  return "monthly";
}

const urls = [];
for (const barePath of MARKETING_PATHS) {
  for (const locale of ["en", "ar"]) {
    const loc = localizedPath(barePath, locale);
    const en = abs(localizedPath(barePath, "en"));
    const ar = abs(localizedPath(barePath, "ar"));
    urls.push(`  <url>
    <loc>${abs(loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreqFor(barePath)}</changefreq>
    <priority>${priorityFor(barePath)}</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${en}" />
    <xhtml:link rel="alternate" hreflang="ar" href="${ar}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />
  </url>`);
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;

const outPublic = path.join(root, "public", "sitemap.xml");
fs.writeFileSync(outPublic, xml, "utf8");
console.log(`Wrote ${outPublic} (${MARKETING_PATHS.length * 2} URLs)`);

const distDir = path.join(root, "dist");
if (fs.existsSync(distDir)) {
  const outDist = path.join(distDir, "sitemap.xml");
  fs.writeFileSync(outDist, xml, "utf8");
  console.log(`Wrote ${outDist}`);
}
