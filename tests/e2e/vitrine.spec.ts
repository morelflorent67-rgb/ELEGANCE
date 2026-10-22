import { expect, test, type Page } from "@playwright/test";
import { refreshVitrine, resetData, sql } from "./helpers";

// Pages publiques autour de la page client (lot 12) : pages légales, référencement, santé, application installable.
// La page client elle-même : accueil.spec.ts ; la carte (R-10, R-11, R-17) : reservation.spec.ts.

test.beforeEach(async () => {
  await resetData();
});

const noHorizontalScroll = async (page: Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);

test.describe("pages légales", () => {
  const docs = [
    ["/mentions-legales", "Mentions légales", "Éditeur du site"],
    ["/confidentialite", "Politique de confidentialité", "Données collectées"],
    ["/conditions", "Conditions d'utilisation", "Modification et annulation"],
  ] as const;

  for (const [path, title, firstSection] of docs) {
    test(`${path} : titre, onglets, sommaire et sections`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText(/Dernière mise à jour : \d+ \w+ 2026/)).toBeVisible();
      const tabs = page.getByRole("navigation", { name: "Documents" });
      await expect(tabs.getByRole("link")).toHaveCount(3);
      await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
      const summary = page.getByRole("navigation", { name: "Sommaire" });
      await expect(summary.getByRole("link", { name: new RegExp(firstSection) })).toBeVisible();
      await summary.getByRole("link").nth(1).click();
      await expect(page).toHaveURL(/#s02$/);
      await expect(page.getByRole("heading", { level: 2 }).nth(1)).toBeInViewport();
      await noHorizontalScroll(page);
    });
  }

  test("les onglets passent d'un document à l'autre", async ({ page }) => {
    await page.goto("/mentions-legales");
    await page
      .getByRole("navigation", { name: "Documents" })
      .getByRole("link", { name: "Conditions" })
      .click();
    await expect(page).toHaveURL(/\/conditions$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Conditions d'utilisation" }),
    ).toBeVisible();
  });

  test("R-25, R-30, R-32 : les conditions citent les réglages du salon, et les suivent", async ({
    page,
  }) => {
    await page.goto("/conditions");
    await expect(page.getByText("au maximum 5 rendez-vous à venir")).toBeVisible();
    await expect(page.getByText(/jusqu'à une heure avant son début/)).toBeVisible();
    await sql`update salon_settings set change_cutoff_hours = 24, max_upcoming_per_customer = 3`;
    await refreshVitrine();
    await page.goto("/conditions");
    await expect(page.getByText("au maximum 3 rendez-vous à venir")).toBeVisible();
    await expect(page.getByText(/jusqu'à 24 h avant son début/)).toBeVisible();
  });

  test("les mentions donnent l'adresse et le téléphone du salon", async ({ page }) => {
    await page.goto("/mentions-legales");
    await expect(
      page
        .getByRole("article")
        .getByText(/162 route de Bischwiller, 67300 Schiltigheim/)
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("article")
        .getByText(/03 88 97 74 68/)
        .first(),
    ).toBeVisible();
  });
});

test.describe("référencement", () => {
  test("robots.txt : tout est interdit tant que l'indexation n'est pas ouverte", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.ok()).toBe(true);
    const text = await response.text();
    expect(text).toMatch(/User-Agent: \*/i);
    expect(text).toMatch(/Disallow: \/\s*$/m);
    expect(text).not.toMatch(/Sitemap:/i);
  });

  test("le plan du site liste les pages publiques, sans les espaces privés", async ({
    request,
  }) => {
    const text = await (await request.get("/sitemap.xml")).text();
    for (const path of ["/reservation", "/mentions-legales", "/confidentialite", "/conditions"]) {
      expect(text).toContain(`${path}</loc>`);
    }
    expect(text).not.toContain("/equipe");
    expect(text).not.toContain("/compte");
    // D-94 : la vitrine du lot 6 n'existe plus.
    expect(text).not.toContain("/prestations");
    expect(text).not.toContain("/salon");
  });

  test("données structurées : un salon de coiffure avec ses horaires, lus en base", async ({
    page,
  }) => {
    await page.goto("/");
    const raw = await page.locator('script[type="application/ld+json"]').textContent();
    const ld = JSON.parse(raw!);
    expect(ld["@type"]).toBe("HairSalon");
    expect(ld.telephone).toBe("+33388977468");
    expect(ld.address.addressLocality).toBe("Schiltigheim");
    expect(ld.openingHoursSpecification).toHaveLength(10);
    expect(ld.hasOfferCatalog.itemListElement).toHaveLength(10);
    expect(ld.priceRange).toBe("10 € - 60 €");
  });

  test("chaque page a son titre, sa description et son lien canonique", async ({ page }) => {
    for (const [path, title] of [
      ["/conditions", "Conditions d'utilisation · Elegance Strasbourg"],
      ["/mentions-legales", "Mentions légales · Elegance Strasbourg"],
    ]) {
      await page.goto(path);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{40,}/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${path}$`),
      );
    }
    await page.goto("/");
    await expect(page).toHaveTitle(/Barbier sur rendez-vous à Schiltigheim/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /salon-wide\.jpg$/,
    );
  });
});

test("sonde de santé : base et file d'envoi, sans donnée personnelle", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    database: "ok",
    emails: { overdue: 0, failedLastWeek: 0 },
  });
});

test.describe("D-69 : application installable, icône E", () => {
  test("le site et la tablette ont chacun leur manifeste, avec l'icône E et le nom Elegance", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "Elegance",
    );
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect(touchIcon).toMatch(/^\/apple-icon/);

    await page.goto("/equipe/connexion");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/equipe.webmanifest",
    );
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "Elegance",
    );

    const tablet = await (await request.get("/equipe.webmanifest")).json();
    expect(tablet).toMatchObject({ start_url: "/equipe", short_name: "Elegance" });
    const site = await (await request.get("/site.webmanifest")).json();
    expect(site).toMatchObject({ start_url: "/", short_name: "Elegance" });

    for (const src of [touchIcon!, ...site.icons.map((icon: { src: string }) => icon.src)]) {
      const response = await request.get(src);
      expect(response.status(), src).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
    }
  });
});
