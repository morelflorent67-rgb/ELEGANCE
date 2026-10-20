import { expect, test, type Page } from "@playwright/test";
import {
  addAppointment,
  addCustomer,
  chooseAuthor,
  loginTablet,
  openDay,
  parisIso,
  pastOpenDay,
  resetData,
  setManagerCode,
  sql,
} from "./helpers";

test.beforeEach(async () => {
  await resetData();
});

// Le Bilan se vérifie sur la tablette en paysage ; le projet « mobile » ne contrôle que l'essentiel.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
const tabletOnly = (page: Page) => test.skip(isPhone(page), "parcours de la tablette");

const CODE = "246810";
const bilanUrl = (day?: string, periode = "jour") =>
  `/equipe/gerant/bilan?periode=${periode}${day ? `&date=${day}` : ""}`;

/** Un chargement complet de page reverrouille l'espace (D-53) : le code se saisit sur la page même du Bilan. */
async function openBilan(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Code gérant" })).toBeVisible();
  await page.getByLabel("Code à 6 chiffres").fill(CODE);
  await page.getByRole("button", { name: "Déverrouiller" }).click();
  await expect(page.getByText("Tableau de bord", { exact: true })).toBeVisible();
}

const card = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true }).filter({ visible: true });

test.describe("R-73 : le bilan est une fonction gérant", () => {
  test("sans code gérant, le chiffre d'affaires reste fermé", async ({ page }) => {
    await setManagerCode(CODE);
    await loginTablet(page);
    await page.goto(bilanUrl());
    await expect(page.getByRole("heading", { name: "Code gérant" })).toBeVisible();
    await expect(page.getByText("Chiffre d’affaires indicatif")).toHaveCount(0);
  });

  test("un mauvais code est refusé, le bon ouvre le bilan", async ({ page }) => {
    await setManagerCode(CODE);
    await loginTablet(page);
    await page.goto(bilanUrl());
    await page.getByLabel("Code à 6 chiffres").fill("000000");
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page.getByText("Ce code n'est pas le bon.")).toBeVisible();
    await page.getByLabel("Code à 6 chiffres").fill(CODE);
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page.getByText("Tableau de bord", { exact: true })).toBeVisible();
  });
});

test.describe("R-53 à R-55 : les chiffres du jour", () => {
  test("chiffre d'affaires des RDV honorés, rendez-vous, lapins, détail par membre et lapins récents", async ({
    page,
  }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    const day = pastOpenDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    const adam = await addCustomer("Adam", "Karaca");
    await addAppointment(thomas.email, {
      startsAt: parisIso(day, "10:00"),
      service: "Coupe homme",
    }); // 18 €
    await addAppointment(thomas.email, {
      startsAt: parisIso(day, "11:00"),
      staff: "Enes",
      service: "Coupe & taille de barbe", // 28 €
    });
    await addAppointment(adam.email, {
      startsAt: parisIso(day, "14:00"),
      staff: "Orhan",
      service: "Coupe homme",
      status: "no_show",
    });
    await addAppointment(adam.email, {
      startsAt: parisIso(day, "15:00"),
      staff: "Orhan",
      service: "Coupe homme",
      status: "cancelled_by_customer",
    });

    await loginTablet(page);
    await openBilan(page, bilanUrl(day));

    await expect(card(page, "Chiffre d’affaires indicatif")).toContainText("46 €");
    await expect(card(page, "Rendez-vous")).toContainText("3");
    await expect(card(page, "Rendez-vous")).toContainText("3 en ligne · 0 par le salon");
    await expect(card(page, "Lapins")).toContainText("1");
    // R-55 : un repère, pas une valeur comptable.
    await expect(page.getByText("la caisse fait foi").first()).toBeVisible();

    const members = page.getByRole("region", { name: "Par membre" }).filter({ visible: true });
    await expect(members.getByRole("row", { name: /Orhan/ })).toContainText("2");
    await expect(members.getByRole("row", { name: /Orhan/ })).toContainText("18 €");
    await expect(members.getByRole("row", { name: /Enes/ })).toContainText("28 €");
    await expect(members.getByRole("row", { name: /Kaan/ })).toContainText("0 €");

    const recent = page.getByRole("region", { name: "Lapins récents" }).filter({ visible: true });
    await expect(recent).toContainText("Adam K.");
    await expect(recent).toContainText("1er lapin");
    await expect(recent).toContainText("avec Orhan");
    await expect(recent).toContainText("À partir de 2 lapins");
  });

  test("les flèches remontent les périodes, et on ne va pas dans le futur", async ({ page }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    await loginTablet(page);
    await openBilan(page, bilanUrl());
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Aujourd’hui");
    await expect(
      page
        .locator('[aria-disabled="true"]')
        .filter({ hasText: "Suivant" })
        .filter({ visible: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Période précédente" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hier");
    await page.getByRole("link", { name: "Période suivante" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Aujourd’hui");

    await page.getByRole("link", { name: "Semaine", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Semaine du");
    await page.getByRole("link", { name: "Mois", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /^(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre) \d{4}$/,
    );
  });

  test("le menu de la tablette ouvre le Bilan et le met en évidence", async ({ page }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    await loginTablet(page);
    await page.getByRole("link", { name: "Bilan", exact: true }).click();
    await expect(page).toHaveURL(/\/equipe\/gerant\/bilan$/);
    await expect(page.getByRole("link", { name: "Bilan", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("link", { name: "Gérant", exact: true })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("R-53, R-54 : corriger le montant encaissé", () => {
  test("toute l'équipe corrige le montant avec son nom ; le bilan et le journal le suivent", async ({
    page,
  }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    const day = pastOpenDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, {
      startsAt: parisIso(day, "10:00"),
      service: "Coupe & taille de barbe", // 28 €
    });

    await loginTablet(page);
    await page.goto(`/equipe?jour=${day}&rdv=${id}`);
    const fiche = page.getByRole("complementary");
    await fiche.getByRole("button", { name: "Corriger le montant" }).click();
    await expect(fiche.getByLabel("Montant (€)")).toHaveValue("28");
    await fiche.getByLabel("Montant (€)").fill("20,50");
    // Sans nom, impossible de confirmer (R-74).
    await expect(page.getByRole("button", { name: "Confirmer", exact: true })).toBeDisabled();
    await chooseAuthor(page, "Kaan");
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Montant corrigé pour Thomas : 20,50 €." }),
    ).toBeVisible();
    await expect(fiche).toContainText("Montant encaissé · 20,50 €");
    await expect(fiche).toContainText("carte : 28 €");

    const [row] = await sql`select adjusted_amount_cents from appointment where id = ${id}`;
    expect(row.adjusted_amount_cents).toBe(2050);
    const [entry] = await sql`
      select actor_type, before, after from audit_log where action = 'appointment.amount_adjusted'`;
    expect(entry.actor_type).toBe("staff");
    expect(entry.before).toMatchObject({ amountCents: 2800 });
    expect(entry.after).toMatchObject({ amountCents: 2050, adjustedAmountCents: 2050 });

    // Le bilan du jour compte 20,50 € et signale la correction.
    await openBilan(page, bilanUrl(day));
    await expect(card(page, "Chiffre d’affaires indicatif")).toContainText("20,50 €");
    await expect(card(page, "Chiffre d’affaires indicatif")).toContainText("1 montant corrigé");

    // Rétablir le prix de la carte.
    await page.goto(`/equipe?jour=${day}&rdv=${id}`);
    await page.getByRole("button", { name: "Corriger le montant encaissé" }).click();
    await page.getByRole("button", { name: "Rétablir le prix de la carte" }).click();
    await chooseAuthor(page, "Orhan");
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Montant rétabli pour Thomas : 28 €." }),
    ).toBeVisible();
    const [back] = await sql`select adjusted_amount_cents from appointment where id = ${id}`;
    expect(back.adjusted_amount_cents).toBeNull();
  });

  test("un montant illisible bloque la confirmation, un montant démesuré est refusé par le serveur", async ({
    page,
  }) => {
    tabletOnly(page);
    const day = pastOpenDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });
    await loginTablet(page);
    await page.goto(`/equipe?jour=${day}&rdv=${id}`);
    const fiche = page.getByRole("complementary");
    await fiche.getByRole("button", { name: "Corriger le montant" }).click();
    await fiche.getByLabel("Montant (€)").fill("vingt");
    await chooseAuthor(page, "Kaan");
    await expect(page.getByRole("button", { name: "Confirmer", exact: true })).toBeDisabled();
    await fiche.getByLabel("Montant (€)").fill("1 500");
    // Le serveur plafonne à 1 000 € (R-54 : une faute de frappe ne doit pas gonfler le chiffre d'affaires).
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "entre 0 et 1 000" })).toBeVisible();
    const [row] = await sql`select adjusted_amount_cents from appointment where id = ${id}`;
    expect(row.adjusted_amount_cents).toBeNull();
  });

  test("un RDV à venir n'a pas de bouton « Corriger le montant »", async ({ page }) => {
    tabletOnly(page);
    const day = openDay(5);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });
    await loginTablet(page);
    await page.goto(`/equipe?jour=${day}&rdv=${id}`);
    await expect(
      page.getByRole("complementary").getByText("À venir", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary").getByRole("button", { name: /Corriger le montant/ }),
    ).toHaveCount(0);
  });

  test("un lapin n'a pas de bouton « Corriger le montant »", async ({ page }) => {
    tabletOnly(page);
    const day = pastOpenDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, {
      startsAt: parisIso(day, "10:00"),
      status: "no_show",
    });
    await loginTablet(page);
    await page.goto(`/equipe?jour=${day}&rdv=${id}`);
    await expect(page.getByRole("complementary").getByText("Lapin", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("complementary").getByRole("button", { name: /Corriger le montant/ }),
    ).toHaveCount(0);
  });
});

test.describe("le bilan sur téléphone", () => {
  test("rien ne dépasse de l'écran à 390 px", async ({ page }) => {
    test.skip(!isPhone(page), "contrôle du format téléphone");
    await setManagerCode(CODE);
    const day = pastOpenDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });
    await loginTablet(page);
    await openBilan(page, bilanUrl(day));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(card(page, "Chiffre d’affaires indicatif")).toContainText("18 €");
  });
});
