// Mesure ponctuelle de la vitrine (mobile, connexion « 4G lente ») : poids transféré, FCP, LCP, CLS.
// Usage : pnpm build && pnpm start -p 3300, puis node scripts/measure-vitrine.mjs [adresse]
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3300";
const browser = await chromium.launch();
for (const path of ["/", "/prestations", "/salon", "/conditions"]) {
  const context = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let bytes = 0;
  let js = 0;
  let images = 0;
  cdp.on("Network.loadingFinished", () => {});
  page.on("response", async (response) => {
    try {
      const body = await response.body();
      bytes += body.length;
      const type = response.headers()["content-type"] ?? "";
      if (type.includes("javascript")) js += body.length;
      if (type.startsWith("image/")) images += body.length;
    } catch {}
  });
  await page.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__m.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => ({
    ...window.__m,
    fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0,
    ttfb: performance.getEntriesByType("navigation")[0].responseStart,
  }));
  console.log(
    `${path.padEnd(14)} TTFB ${Math.round(m.ttfb)} ms · FCP ${Math.round(m.fcp)} ms · LCP ${Math.round(m.lcp)} ms · CLS ${m.cls.toFixed(3)} · ${Math.round(bytes / 1024)} Ko (JS ${Math.round(js / 1024)} Ko, images ${Math.round(images / 1024)} Ko)`,
  );
  await context.close();
}
await browser.close();
