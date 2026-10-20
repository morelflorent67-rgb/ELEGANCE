import { expect, test } from "@playwright/test";
import { refreshVitrine, resetData, sql } from "./helpers";

// Lot 6 : l'accueil. Les parcours de la vitrine (menu, barre collante, Prestations) sont dans vitrine.spec.ts.

test.beforeEach(async () => {
  await resetData();
});

const noHorizontalScroll = async (page: import("@playwright/test").Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);

test("l'accueil montre le logo, la signature et un bouton Réserver", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /Elegance Strasbourg.*barbier sur rendez-vous/ }),
  ).toBeAttached();
  await expect(page.getByRole("img", { name: "Elegance Strasbourg" }).first()).toBeVisible();
  await expect(page.getByText("Bien plus qu'une coupe")).toBeVisible();
  await expect(page.getByText("Barbier sur rendez-vous · Schiltigheim")).toBeVisible();
  await expect(page.getByRole("link", { name: "Réserver", exact: true }).first()).toHaveAttribute(
    "href",
    "/reservation",
  );
  // Barre collante (mobile) ou numéro dans l'en-tête (grand écran) : toujours un lien d'appel.
  await expect(page.locator('a[href="tel:+33388977468"]').first()).toBeAttached();
});

test("aucun défilement horizontal", async ({ page }) => {
  await page.goto("/");
  await noHorizontalScroll(page);
});

test("le site de test n'est pas indexable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("les valeurs, les prestations phares, l'équipe et les horaires viennent de la base (R-01)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Orhan, Enes, Kaan et Taha vous reçoivent du mardi au samedi, uniquement sur rendez-vous."),
  ).toBeVisible();
  for (const word of ["Style", "Soin", "Confiance"]) {
    await expect(page.getByText(word, { exact: true })).toBeVisible();
  }
  // Prestations phares : les trois premières réservables en ligne, réalisées par les coiffeurs.
  const phares = page.getByRole("heading", { name: "Prestations phares" }).locator("xpath=../..");
  for (const [name, price] of [
    ["Coupe homme", "18 €"],
    ["Coupe & taille de barbe", "28 €"],
    ["Taillage barbe", "12 €"],
  ]) {
    const line = phares.getByRole("link", { name: new RegExp(`^${name}`) });
    await expect(line).toContainText(price);
    await expect(line).toHaveAttribute("href", "/reservation");
  }
  await expect(page.getByRole("link", { name: "Voir les 10 prestations" })).toHaveAttribute(
    "href",
    "/prestations",
  );

  const team = page.getByRole("heading", { name: "L'équipe" }).locator("xpath=../..");
  for (const name of ["Orhan", "Enes", "Kaan", "Taha"]) await expect(team).toContainText(name);
  await expect(team.getByText("Apprenti")).toHaveCount(2);

  const hours = page.getByRole("heading", { name: "Horaires et accès" }).locator("xpath=../..");
  await expect(hours.getByText("Mardi – samedi")).toBeVisible();
  await expect(hours.getByText("10 h – 12 h")).toBeVisible();
  await expect(hours.getByText("13 h – 19 h")).toBeVisible();
  await expect(hours.getByText("Dimanche, lundi")).toBeVisible();
  await expect(hours.getByText("Uniquement sur rendez-vous")).toBeVisible();
  await expect(hours.getByText("162 route de Bischwiller")).toBeVisible();
  await expect(hours.getByRole("link", { name: "Itinéraire" })).toHaveAttribute(
    "href",
    /google\.com\/maps/,
  );
  await expect(hours.getByRole("link", { name: "Appeler" })).toHaveAttribute(
    "href",
    "tel:+33388977468",
  );
});

test("un membre retiré de l'équipe disparaît de la vitrine", async ({ page }) => {
  await sql`update staff set active = false where first_name = 'Kaan'`;
  await refreshVitrine();
  await page.goto("/");
  await expect(
    page.getByText("Orhan, Enes et Taha vous reçoivent du mardi au samedi"),
  ).toBeVisible();
});

test("R-03 : des horaires modifiés et une fermeture à venir sont annoncés", async ({ page }) => {
  await sql`delete from opening_hours where weekday = 6`;
  await sql`insert into opening_hours (weekday, opens_at, closes_at) values (6, '10:00', '17:00')`;
  await sql`insert into closure (starts_on, ends_on, reason) values ('2099-12-24', '2099-12-26', 'Fêtes')`;
  await refreshVitrine();
  await page.goto("/");
  const hours = page.getByRole("heading", { name: "Horaires et accès" }).locator("xpath=../..");
  await expect(hours.getByText("Mardi – vendredi")).toBeVisible();
  await expect(hours.getByText("Samedi", { exact: true })).toBeVisible();
  await expect(hours.getByText("10 h – 17 h")).toBeVisible();
  await expect(
    hours.getByText("Fermeture exceptionnelle du 24 au 26 décembre (Fêtes)."),
  ).toBeVisible();
});

test("l'ouverture ne se rejoue pas dans la même session", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveClass(/opening-skip/);
  await page.goto("/prestations");
  await page.goto("/");
  // Deuxième visite de la session : l'état final est posé avant l'affichage.
  await expect(page.locator("html")).toHaveClass(/opening-skip/);
});

test("premier geste : l'ouverture passe à l'état final", async ({ page }) => {
  await page.goto("/");
  // Le premier geste n'est écouté qu'une fois la page hydratée : on réessaie jusqu'à ce qu'il compte.
  await expect(async () => {
    await page.keyboard.press("Tab");
    await expect(page.locator("html")).toHaveClass(/opening-skip/, { timeout: 500 });
  }).toPass({ timeout: 8000 });
});

test("prefers-reduced-motion : tout est visible tout de suite", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3100/");
  await expect(page.getByText("Bien plus qu'une coupe")).toBeVisible();
  const opacity = await page
    .getByText("Bien plus qu'une coupe")
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe("1");
  await context.close();
});
