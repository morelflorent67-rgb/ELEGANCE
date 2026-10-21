// Mesure ponctuelle de la tablette sur un build local (serveur des tests de bout en bout : `node scripts/e2e-server.mjs`).
// Pour chaque geste : durée jusqu'à l'affichage, requêtes envoyées au serveur, leur durée et leur poids.
// Usage : node scripts/measure-tablet.mjs [adresse] (par défaut http://127.0.0.1:3100).
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices["iPad Pro 11"],
  viewport: { width: 1194, height: 834 },
  baseURL: base,
});
const page = await context.newPage();

let log = [];
page.on("requestfinished", async (request) => {
  if (!request.url().startsWith(base)) return;
  const timing = request.timing();
  const sizes = await request.sizes().catch(() => ({ responseBodySize: 0 }));
  const url = new URL(request.url());
  const kind = request.headers()["next-router-prefetch"]
    ? "préchargement"
    : request.headers()["next-action"]
      ? "action"
      : request.headers()["rsc"]
        ? "rsc"
        : request.resourceType();
  log.push({
    kind,
    path: url.pathname + url.search,
    ms: Math.round(timing.responseEnd),
    kb: Math.round(sizes.responseBodySize / 102.4) / 10,
  });
});

async function step(name, action) {
  log = [];
  const start = Date.now();
  await action();
  const total = Date.now() - start;
  await page.waitForTimeout(1500); // laisse partir les préchargements
  const server = log.filter((l) => l.kind !== "script" && l.kind !== "stylesheet" && l.kind !== "font");
  console.log(`\n${name} : ${total} ms`);
  for (const l of server) console.log(`  ${l.kind.padEnd(13)} ${String(l.ms).padStart(5)} ms ${String(l.kb).padStart(7)} ko  ${l.path}`);
}

await step("Connexion", async () => {
  await page.goto("/equipe/connexion");
  await page.getByLabel("Email").fill("equipe@elegance.test");
  await page.getByLabel("Mot de passe").fill("mot-de-passe-equipe");
  await page.getByRole("button", { name: "Ouvrir la tablette" }).click();
  await page.waitForURL(/\/equipe$/);
  await page.getByText("Chargement du planning…").waitFor({ state: "hidden" });
});

await step("Jour suivant", async () => {
  await page.getByRole("link", { name: /suivant/i }).first().click();
  await page.waitForURL(/jour=/);
  await page.getByText("Chargement du planning…").waitFor({ state: "hidden" });
});

await step("Absences", async () => {
  await page.getByRole("link", { name: "Absences" }).first().click();
  await page.waitForURL(/absences/);
  await page.getByRole("heading").first().waitFor();
});

await step("Retour au planning", async () => {
  await page.getByRole("link", { name: "Planning" }).first().click();
  await page.waitForURL(/\/equipe$/);
  await page.getByText("Chargement du planning…").waitFor({ state: "hidden" });
});

await step("Rafraîchissement automatique (35 s)", async () => {
  await page.waitForTimeout(35_000);
});

await browser.close();
