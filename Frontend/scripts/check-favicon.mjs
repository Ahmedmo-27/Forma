const checks = [
  "https://www.forma-official.com/",
  "https://www.forma-official.com/forma-favicon.png",
  "https://www.forma-official.com/apple-touch-icon.png",
  "https://www.forma-official.com/favicon.ico",
  "https://www.forma-official.com/favicon.svg",
];

for (const url of checks) {
  const res = await fetch(url, { redirect: "follow" });
  if (url.endsWith("/")) {
    const html = await res.text();
    const icons = [...html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)].map(
      (m) => m[0]
    );
    console.log("HOME", res.status);
    console.log(icons.length ? icons.join("\n") : "(no icon link tags)");
  } else {
    console.log(url, res.status, res.headers.get("content-type"));
  }
}
