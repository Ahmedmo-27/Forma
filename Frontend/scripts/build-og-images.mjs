/**
 * Compose 1200×630 OG / Twitter cards from brand assets.
 * Uses forma-horizontal.jpeg + gym photo — not the favicon alone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const WIDTH = 1200;
const HEIGHT = 630;
const NAVY = { r: 20, g: 40, b: 67, alpha: 1 };
const CREAM = "#FCF3E2";

async function loadGymBackground() {
  const candidates = [
    path.join(publicDir, "marketing", "hero-gym-floor.jpg"),
    path.join(publicDir, "marketing", "band-floor.jpg"),
    path.join(publicDir, "og-share.jpg"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textSvg({ headline, sub, rtl = false }) {
  const anchor = rtl ? "end" : "start";
  const x = rtl ? 564 : 56;
  const fontHead = rtl ? 36 : 42;
  const fontSub = rtl ? 20 : 22;
  const dir = rtl ? "rtl" : "ltr";
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="620" height="630" viewBox="0 0 620 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="620" height="630" fill="#142843"/>
  <g direction="${dir}">
    <text x="${x}" y="300" fill="${CREAM}" font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="${fontHead}" font-weight="750" text-anchor="${anchor}">
      ${escapeXml(headline[0])}
    </text>
    <text x="${x}" y="348" fill="${CREAM}" font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="${fontHead}" font-weight="750" text-anchor="${anchor}">
      ${escapeXml(headline[1] || "")}
    </text>
    <text x="${x}" y="410" fill="#E6DCC8" font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="${fontSub}" font-weight="500" text-anchor="${anchor}">
      ${escapeXml(sub[0])}
    </text>
    <text x="${x}" y="440" fill="#E6DCC8" font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="${fontSub}" font-weight="500" text-anchor="${anchor}">
      ${escapeXml(sub[1] || "")}
    </text>
  </g>
</svg>`);
}

async function buildCard({ outName, headline, sub, rtl = false }) {
  const logoPath = path.join(publicDir, "forma-horizontal.jpeg");
  const gymPath = await loadGymBackground();
  if (!fs.existsSync(logoPath)) {
    throw new Error(`Missing logo: ${logoPath}`);
  }

  const textPanel = await sharp(textSvg({ headline, sub, rtl }))
    .png()
    .toBuffer();

  const logoChipBg = await sharp({
    create: { width: 320, height: 96, channels: 4, background: { r: 252, g: 243, b: 226, alpha: 1 } },
  })
    .png()
    .toBuffer();

  const logoResized = await sharp(logoPath)
    .resize({ width: 280, height: 64, fit: "contain", background: { r: 252, g: 243, b: 226, alpha: 1 } })
    .png()
    .toBuffer();

  const logoChip = await sharp(logoChipBg)
    .composite([{ input: logoResized, gravity: "center" }])
    .png()
    .toBuffer();

  // EN: text left / gym right. AR: gym left / text right (natural RTL reading).
  const textLeft = rtl ? 580 : 0;
  const gymLeft = rtl ? 0 : 620;
  const logoLeft = rtl ? 580 + (620 - 56 - 320) : 56;

  const layers = [
    { input: textPanel, left: textLeft, top: 0 },
    { input: logoChip, left: logoLeft, top: 72 },
  ];

  if (gymPath) {
    const gym = await sharp(gymPath)
      .resize(580, HEIGHT, { fit: "cover", position: "centre" })
      .modulate({ brightness: 0.85, saturation: 0.9 })
      .toBuffer();
    layers.push({ input: gym, left: gymLeft, top: 0 });
  } else {
    const fallback = await sharp({
      create: { width: 580, height: HEIGHT, channels: 3, background: { r: 30, g: 58, b: 95 } },
    })
      .jpeg()
      .toBuffer();
    layers.push({ input: fallback, left: gymLeft, top: 0 });
  }

  const outPath = path.join(publicDir, outName);
  await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: NAVY },
  })
    .composite(layers)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outPath);

  console.log(`Wrote ${outPath}`);
}

async function buildAppleTouch() {
  const mark = path.join(publicDir, "forma-favicon.png");
  const out = path.join(publicDir, "apple-touch-icon.png");
  if (!fs.existsSync(mark)) {
    console.warn("Skip apple-touch-icon — forma-favicon.png missing");
    return;
  }
  await sharp(mark)
    .resize(180, 180, { fit: "cover" })
    .png()
    .toFile(out);
  console.log(`Wrote ${out}`);
}

await buildCard({
  outName: "og-share.jpg",
  headline: ["The operating system", "for serious gyms."],
  sub: ["Gym management software for Egypt —", "members, check-ins, sales & billing."],
  rtl: false,
});

await buildCard({
  outName: "og-share-ar.jpg",
  headline: ["نظام تشغيل الجيم", "للمشغّلين الجادّين"],
  sub: ["برنامج إدارة الجيم في مصر", "أعضاء · حضور · مبيعات · فوترة"],
  rtl: true,
});

await buildAppleTouch();
