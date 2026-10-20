import { expect, test, type Page } from "@playwright/test";
import { loginTablet, refreshVitrine, resetData, setManagerCode, sql } from "./helpers";

// Lot 6 : la vitrine publique. Mobile (390 px) : menu plein écran et barre collante. À partir de 1024 px (D-37, la
// tablette en paysage en fait partie) : liens et bouton Réserver dans l'en-tête, grilles à deux colonnes.

test.beforeEach(async () => {
  await resetData();
});

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const noHorizontalScroll = async (page: Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);

test.describe("gabarit commun", () => {
  test("mobile : barre collante Réserver + Appeler ; ordinateur : bouton Réserver dans l'en-tête", async ({
    page,
  }) => {
    await page.goto("/prestations");
    const bar = page
      .locator("div.fixed")
      .filter({ has: page.getByRole("link", { name: "Réserver", exact: true }) });
    if (wide(page)) {
      await expect(bar).toBeHidden();
      const header = page.getByRole("banner");
      await expect(header.getByRole("link", { name: "Réserver", exact: true })).toBeVisible();
      await expect(header.getByRole("link", { name: "Prestations" })).toBeVisible();
    } else {
      await expect(bar.getByRole("link", { name: "Réserver", exact: true })).toBeVisible();
      await expect(bar.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
        "href",
        "tel:+33388977468",
      );
      const box = await bar.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(80);
    }
  });

  test("le menu s'ouvre, mène aux pages, se ferme avec Échap et rend le focus", async ({
    page,
  }) => {
    test.skip(wide(page), "le menu plein écran est celui du mobile");
    await page.goto("/prestations");
    const opener = page.getByRole("button", { name: "Menu" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Menu principal" });
    await expect(dialog).toBeVisible();
    for (const label of [
      "Accueil",
      "Prestations et tarifs",
      "Le salon",
      "Mes rendez-vous",
      "Mes informations",
    ]) {
      await expect(dialog.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(dialog.getByText("Mardi – samedi · 10 h – 12 h, 13 h – 19 h")).toBeVisible();
    await expect(dialog.getByText("Se connecter")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await opener.click();
    await dialog.getByRole("link", { name: "Accueil" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("dialog", { name: "Menu principal" })).toBeHidden();
  });

  test("pied de page : coordonnées, réseaux et pages légales", async ({ page }) => {
    await page.goto("/prestations");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByText("162 route de Bischwiller, 67300 Schiltigheim")).toBeVisible();
    await expect(footer.getByRole("link", { name: "03 88 97 74 68" })).toHaveAttribute(
      "href",
      "tel:+33388977468",
    );
    await expect(footer.getByRole("link", { name: "Instagram" })).toBeVisible();
    for (const [label, href] of [
      ["Mentions légales", "/mentions-legales"],
      ["Confidentialité", "/confidentialite"],
      ["Conditions", "/conditions"],
    ]) {
      await expect(footer.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });
});

test.describe("Prestations et tarifs", () => {
  test("la carte : 10 prestations en trois groupes, avec prix et durée (R-10)", async ({
    page,
  }) => {
    await page.goto("/prestations");
    await expect(
      page.getByRole("heading", { level: 1, name: "Prestations et tarifs" }),
    ).toBeVisible();
    await expect(page.getByText("10 prestations, sur rendez-vous uniquement")).toBeVisible();
    for (const title of ["Coupes", "Barbe et soin", "Techniques"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    const coupe = page.getByRole("listitem").filter({ hasText: /^Coupe homme/ });
    await expect(coupe).toContainText("18 €");
    await expect(coupe).toContainText("30 min");
    const lissage = page.getByRole("listitem").filter({ hasText: /^Lissage brésilien/ });
    await expect(lissage).toContainText("60 €");
    await expect(page.getByRole("listitem").filter({ hasText: /Taillage barbe/ })).toContainText(
      "15 min",
    );
    await expect(
      page.getByRole("listitem").filter({ hasText: /^Coupe, tarif formation/ }),
    ).toContainText("par un apprenti");
    await expect(
      page.getByText("Tarif formation : réalisé par Kaan ou Taha, nos apprentis."),
    ).toBeVisible();
  });

  test("R-17, D-36 : le soin se réserve en ligne, le tribal et la coloration sont sur appel", async ({
    page,
  }) => {
    await page.goto("/prestations");
    await expect(
      page.getByRole("link", { name: "Réserver : Soin du visage à la vapeur" }),
    ).toHaveAttribute("href", "/reservation");
    await expect(page.getByRole("link", { name: "Réserver : Tribal" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Appeler pour : Tribal" })).toHaveAttribute(
      "href",
      "tel:+33388977468",
    );
    await expect(
      page.getByRole("link", { name: "Appeler pour : Lissage brésilien" }),
    ).toBeVisible();
    // Les prestations sur appel restent affichées avec leur prix et leur durée.
    await expect(page.getByRole("listitem").filter({ hasText: /^Tribal/ })).toContainText("10 €");
    await expect(
      page.getByText("Coloration, tribal, défrisage et lissage brésilien demandent un échange"),
    ).toBeVisible();
  });

  test("les ancres des catégories mènent aux groupes", async ({ page }) => {
    await page.goto("/prestations");
    await page.getByRole("link", { name: "Techniques", exact: true }).click();
    await expect(page).toHaveURL(/#techniques$/);
  });

  test("aucun défilement horizontal", async ({ page }) => {
    await page.goto("/prestations");
    await noHorizontalScroll(page);
  });

  test("R-11 : le prix modifié par le gérant apparaît sur la vitrine", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, "parcours de la tablette");
    const CODE = "246810";
    await setManagerCode(CODE);
    await loginTablet(page);
    await page.goto("/equipe/gerant");
    await page.getByLabel("Code à 6 chiffres").fill(CODE);
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await page.getByRole("link", { name: "Carte et tarifs" }).click();
    await page.getByRole("button", { name: "Modifier Coupe homme", exact: true }).click();
    await page.getByLabel("Prix (€)").fill("20,50");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Coupe homme" })
        .filter({ visible: true })
        .first(),
    ).toContainText("20,50 €");

    await page.goto("/prestations");
    await expect(page.getByRole("listitem").filter({ hasText: /^Coupe homme/ })).toContainText(
      "20,50 €",
    );
  });
});

test.describe("Le salon", () => {
  test("la page montre la galerie, l'équipe, les sept jours d'horaires et l'accès", async ({
    page,
  }) => {
    await page.goto("/salon");
    await expect(page.getByRole("heading", { level: 1, name: "Le salon" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Agrandir :/ })).toHaveCount(6);

    const team = page.getByRole("heading", { name: "L'équipe" }).locator("xpath=../..");
    await expect(team).toContainText("Orhan");
    await expect(team).toContainText("Taha");
    await expect(
      team.getByText("Tarif formation : réalisé par Kaan ou Taha, nos apprentis."),
    ).toBeVisible();

    const hours = page.getByRole("heading", { name: "Horaires et accès" }).locator("xpath=../..");
    for (const day of ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]) {
      await expect(hours.getByText(day, { exact: true })).toBeVisible();
    }
    await expect(hours.getByText("Fermé")).toHaveCount(2);
    await expect(hours.getByRole("link", { name: "Itinéraire" })).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("D-38 : la section Avis reste masquée jusqu'au lancement", async ({ page }) => {
    await page.goto("/salon");
    await expect(page.getByRole("heading", { name: "Avis" })).toHaveCount(0);
    await expect(page.getByText(/avis vérifiés/)).toHaveCount(0);
  });

  test("la visionneuse : ouvrir, passer d'une photo à l'autre au clavier, fermer avec Échap", async ({
    page,
  }) => {
    await page.goto("/salon");
    const first = page.getByRole("button", { name: /^Agrandir : Les postes/ });
    await first.click();
    const viewer = page.getByRole("dialog");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByText("1 / 6")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText("2 / 6")).toBeVisible();
    await viewer.getByRole("button", { name: "Photo précédente" }).click();
    await viewer.getByRole("button", { name: "Photo précédente" }).click();
    await expect(viewer.getByText("6 / 6")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(first).toBeFocused();
  });

  test("la visionneuse se ferme avec le bouton Fermer", async ({ page }) => {
    await page.goto("/salon");
    await page.getByRole("button", { name: /^Agrandir : Le mur de l'entrée/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test("les pages publiques tiennent sans défilement horizontal, mobile comme grand écran", async ({
  page,
}) => {
  for (const path of ["/", "/prestations", "/salon"]) {
    await page.goto(path);
    await noHorizontalScroll(page);
  }
});

test("grand écran (1440 px) : en-tête avec liens, grilles à plusieurs colonnes, rien ne déborde", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  for (const path of ["/", "/prestations", "/salon"]) {
    await page.goto(`http://127.0.0.1:3100${path}`);
    await noHorizontalScroll(page);
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Réserver", exact: true }),
    ).toBeVisible();
  }
  await page.goto("http://127.0.0.1:3100/prestations");
  const coupes = await page.locator("#coupes").boundingBox();
  const barbe = await page.locator("#barbe-et-soin").boundingBox();
  // Deux colonnes : « Barbe et soin » est à droite de « Coupes », pas dessous.
  expect(barbe!.x).toBeGreaterThan(coupes!.x + coupes!.width / 2);
  await context.close();
});

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
    await expect(page.getByText("au maximum 2 rendez-vous à venir")).toBeVisible();
    await expect(page.getByText(/jusqu'à 48 h avant son début/)).toBeVisible();
    await sql`update salon_settings set change_cutoff_hours = 24, max_upcoming_per_customer = 3`;
    await refreshVitrine();
    await page.goto("/conditions");
    await expect(page.getByText("au maximum 3 rendez-vous à venir")).toBeVisible();
    await expect(page.getByText(/jusqu'à 24 h avant son début/)).toBeVisible();
  });

  test("les mentions donnent l'adresse et le téléphone du salon", async ({ page }) => {
    await page.goto("/mentions-legales");
    await expect(
      page.getByRole("article").getByText(/162 route de Bischwiller, 67300 Schiltigheim/).first(),
    ).toBeVisible();
    await expect(page.getByRole("article").getByText(/03 88 97 74 68/).first()).toBeVisible();
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
    for (const path of [
      "/prestations",
      "/salon",
      "/reservation",
      "/mentions-legales",
      "/confidentialite",
      "/conditions",
    ]) {
      expect(text).toContain(`${path}</loc>`);
    }
    expect(text).not.toContain("/equipe");
    expect(text).not.toContain("/compte");
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
      ["/prestations", "Prestations et tarifs · Elegance Strasbourg"],
      ["/salon", "Le salon · Elegance Strasbourg"],
      ["/conditions", "Conditions d'utilisation · Elegance Strasbourg"],
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

test("de la vitrine à la réservation en un geste", async ({ page }) => {
  await page.goto("/prestations");
  await page.getByRole("link", { name: "Réserver : Coupe homme" }).click();
  await expect(page).toHaveURL(/\/reservation$/);
  await expect(
    page.getByRole("button", { name: "Choisir Coupe homme", exact: true }),
  ).toBeVisible();
});
