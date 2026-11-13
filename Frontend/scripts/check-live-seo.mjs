const urls = [
  "https://www.forma-official.com/",
  "https://www.forma-official.com/plans",
  "https://api.forma-official.com/api/public/site-config",
];

for (const url of urls) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  });
  const text = await res.text();
  console.log("\n===", url, res.status, "===");
  if (url.includes("site-config")) {
    console.log(text);
    continue;
  }
  const title = (text.match(/<title>([^<]*)<\/title>/i) || [])[1];
  const robots = [...text.matchAll(/<meta[^>]*name=["']robots["'][^>]*>/gi)].map((m) => m[0]);
  const canonical = (text.match(/<link[^>]*rel=["']canonical["'][^>]*>/i) || [])[0];
  console.log("title:", title);
  console.log("robots tags:", robots.length ? robots : "(none in HTML)");
  console.log("canonical:", canonical || "(none)");
  console.log("has noindex:", /noindex/i.test(text));
  console.log("has coming soon:", /Under development|taking shape/i.test(text));
  console.log("has seo-prerender:", /seo-prerender/i.test(text));
  console.log("bytes:", text.length);
}
