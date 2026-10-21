// Rendu des visuels de lancement, hors de l'application (outillage à part : voir package.json de ce dossier).
//   node render.mjs serve               : sert le dossier pour l'aperçu (http://127.0.0.1:4310/video.html)
//   node render.mjs stills 1.2 3.5 ...  : images fixes de la vidéo aux instants donnés (export/still-*.png)
//   node render.mjs video               : vidéo MP4 1080 × 1920, 60 images/s (export/elegance-lancement.mp4)
//   node render.mjs poster <adresse>    : affiche A4 en PDF et PNG, QR code vers <adresse>/reservation
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const out = join(here, "export");
const require = createRequire(join(here, "../../package.json"));
const { chromium } = require("@playwright/test");
const local = createRequire(join(here, "package.json"));

const types = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".js": "text/javascript" };
function serve(port = 0) {
  const server = createServer(async (req, res) => {
    const path = normalize(join(here, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!path.startsWith(normalize(here))) return res.writeHead(403).end();
    let body;
    try {
      body = await readFile(path);
    } catch {
      return res.writeHead(404).end();
    }
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(body);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

async function openVideo(server) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.address().port}/video.html?render`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60_000 });
  return { browser, page };
}

const [mode, ...args] = process.argv.slice(2);
await mkdir(out, { recursive: true });

if (mode === "serve") {
  const server = await serve(4310);
  console.log(`Aperçu : http://127.0.0.1:${server.address().port}/video.html`);
} else if (mode === "stills") {
  const server = await serve();
  const { browser, page } = await openVideo(server);
  for (const t of args.map(Number)) {
    await page.evaluate((s) => window.__seek(s), t);
    await page.screenshot({ path: join(out, `still-${t.toFixed(2)}.png`) });
  }
  await browser.close();
  server.close();
} else if (mode === "video") {
  const fps = 60;
  const server = await serve();
  const { browser, page } = await openVideo(server);
  const duration = await page.evaluate(() => window.__duration);
  const file = join(out, "elegance-lancement.mp4");
  const ffmpeg = spawn(local("ffmpeg-static"), [
    "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-movflags", "+faststart", file,
  ], { stdio: ["pipe", "ignore", "inherit"] });
  const frames = Math.round(duration * fps);
  for (let f = 0; f <= frames; f++) {
    await page.evaluate((s) => window.__seek(s), f / fps);
    const png = await page.screenshot({ type: "png" });
    if (!ffmpeg.stdin.write(png)) await new Promise((ok) => ffmpeg.stdin.once("drain", ok));
    if (f % 120 === 0) console.log(`image ${f}/${frames}`);
  }
  ffmpeg.stdin.end();
  await new Promise((ok, ko) => ffmpeg.on("close", (code) => (code === 0 ? ok() : ko(new Error(`ffmpeg ${code}`)))));
  await browser.close();
  server.close();
  console.log(file);
} else if (mode === "poster") {
  const site = (args[0] ?? "").replace(/\/$/, "");
  if (!/^https:\/\//.test(site)) throw new Error("Adresse du site attendue, par exemple https://exemple.fr");
  const QRCode = local("qrcode");
  const target = `${site}/reservation`;
  await writeFile(join(here, "qr.svg"), await QRCode.toString(target, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b0a09", light: "#00000000" } }));
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3 });
  await page.goto(`http://127.0.0.1:${server.address().port}/affiche.html?url=${encodeURIComponent(site.replace(/^https:\/\//, ""))}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60_000 });
  await page.pdf({ path: join(out, "elegance-affiche-A4.pdf"), width: "210mm", height: "297mm", printBackground: true, pageRanges: "1" });
  await page.screenshot({ path: join(out, "elegance-affiche-A4.png"), fullPage: false });
  await browser.close();
  server.close();
  console.log(`QR code : ${target}`);
} else {
  console.log("Modes : serve | stills <t...> | video | poster <adresse>");
}
