import { expect, test, type Page } from "@playwright/test";
import { loginTablet, resetData, setManagerCode } from "./helpers";

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
    const bar = page.locator("div.fixed").filter({ has: page.getByRole("link", { name: "Réserver", exact: true }) });
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

  test("le menu s'ouvre, mène aux pages, se ferme avec Échap et rend le focus", async ({ page }) => {
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
  test("la carte : 10 prestations en trois groupes, avec prix et durée (R-10)", async ({ page }) => {
    await page.goto("/prestations");
    await expect(page.getByRole("heading", { level: 1, name: "Prestations et tarifs" })).toBeVisible();
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
    await expect(page.getByRole("link", { name: "Appeler pour : Lissage brésilien" })).toBeVisible();
    // Les prestations sur appel restent affichées avec leur prix et leur durée.
    await expect(page.getByRole("listitem").filter({ hasText: /^Tribal/ })).toContainText("10 €");
    await expect(page.getByText("Coloration, tribal, défrisage et lissage brésilien demandent un échange")).toBeVisible();
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
      page.getByRole("listitem").filter({ hasText: "Coupe homme" }).filter({ visible: true }).first(),
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
