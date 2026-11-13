/**
 * Compose 1200×630 OG / Twitter cards from brand assets.
 *
 * WhatsApp uses a ~square crop (usually the left of the image). The left 630×630
 * must read as a complete card by itself — logo + short lines fully inside that square.
 * Do not use the favicon alone as og:image.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const WIDTH = 1200;
const HEIGHT = 630;
const SQUARE = 630;
const NAVY = { r: 20, g: 40, b: 67, alpha: 1 };
const CREAM = "#FCF3E2";
const MUTED = "#E6DCC8";

async function loadGymBackground() {
  const candidates = [
    path.join(publicDir, "marketing", "hero-gym-floor.jpg"),
    path.join(publicDir, "marketing", "band-floor.jpg"),
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

/** Self-contained 630×630 brand panel (WhatsApp-safe). */
function brandSquareSvg({ lines, rtl = false }) {
  const anchor = "middle";
  const x = SQUARE / 2;
  const dir = rtl ? "rtl" : "ltr";
  const [l1, l2, l3, l4] = lines;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SQUARE}" height="${SQUARE}" viewBox="0 0 ${SQUARE} ${SQUARE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SQUARE}" height="${SQUARE}" fill="#142843"/>
  <g direction="${dir}">
    <text x="${x}" y="320" fill="${CREAM}" font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="34" font-weight="750" text-anchor="${anchor}">
      ${escapeXml(l1)}
    </text>
    <text x="${x}" y="366" fill="${CREAM}" font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="34" font-weight="750" text-anchor="${anchor}">
      ${escapeXml(l2 || "")}
    </text>
    <text x="${x}" y="430" fill="${MUTED}" font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="20" font-weight="500" text-anchor="${anchor}">
      ${escapeXml(l3 || "")}
    </text>
    <text x="${x}" y="462" fill="${MUTED}" font-family="Segoe UI, Tahoma, Arial, sans-serif" font-size="20" font-weight="500" text-anchor="${anchor}">
      ${escapeXml(l4 || "")}
    </text>
  </g>
</svg>`);
}

async function buildCard({ outName, lines, rtl = false }) {
  const logoPath = path.join(publicDir, "forma-horizontal.jpeg");
  const gymPath = await loadGymBackground();
  if (!fs.existsSync(logoPath)) {
    throw new Error(`Missing logo: ${logoPath}`);
  }

  const brandPanel = await sharp(brandSquareSvg({ lines, rtl })).png().toBuffer();

  const logoChipBg = await sharp({
    create: {
      width: 360,
      height: 108,
      channels: 4,
      background: { r: 252, g: 243, b: 226, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const logoResized = await sharp(logoPath)
    .resize({
      width: 300,
      height: 72,
      fit: "contain",
      background: { r: 252, g: 243, b: 226, alpha: 1 },
    })
    .png()
    .toBuffer();

  const logoChip = await sharp(logoChipBg)
    .composite([{ input: logoResized, gravity: "center" }])
    .png()
    .toBuffer();

  // Square brand block always on the left so WhatsApp’s crop is complete.
  const brandLeft = 0;
  const gymLeft = SQUARE;
  const gymWidth = WIDTH - SQUARE;
  const logoLeft = Math.round((SQUARE - 360) / 2);

  const layers = [
    { input: brandPanel, left: brandLeft, top: 0 },
    { input: logoChip, left: logoLeft, top: 120 },
  ];

  if (gymPath) {
    const gym = await sharp(gymPath)
      .resize(gymWidth, HEIGHT, { fit: "cover", position: "centre" })
      .modulate({ brightness: 0.85, saturation: 0.9 })
      .toBuffer();
    layers.push({ input: gym, left: gymLeft, top: 0 });
  }

  const outPath = path.join(publicDir, outName);
  await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: NAVY },
  })
    .composite(layers)
    .jpeg({ quality: 90, mozjpeg: true })
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
  lines: [
    "The operating system",
    "for serious gyms",
    "Members · check-ins · sales · billing",
    "Built for operators in Egypt",
  ],
  rtl: false,
});

await buildCard({
  outName: "og-share-ar.jpg",
  lines: [
    "نظام تشغيل الجيم",
    "للمشغّلين الجادّين",
    "برنامج إدارة الجيم في مصر",
    "أعضاء · حضور · مبيعات · فوترة",
  ],
  rtl: true,
});

await buildAppleTouch();
