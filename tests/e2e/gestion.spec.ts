import { expect, test, type Page } from "@playwright/test";
import {
  chooseService,
  loginTablet,
  openDay,
  resetData,
  setManagerCode,
  sql,
} from "./helpers";

test.beforeEach(async () => {
  await resetData();
});

// L'espace gérant se vérifie sur la tablette en paysage ; le projet « mobile » ne contrôle que l'essentiel.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
const tabletOnly = (page: Page) => test.skip(isPhone(page), "parcours de la tablette");

const CODE = "246810";

/** Ouvre l'espace gérant (R-73) puis un écran par son lien : un chargement complet de page reverrouillerait. */
async function openManagerTool(page: Page, tool: string) {
  await setManagerCode(CODE);
  await loginTablet(page);
  await page.goto("/equipe/gerant");
  await page.getByLabel("Code à 6 chiffres").fill(CODE);
  await page.getByRole("button", { name: "Déverrouiller" }).click();
  await expect(page.getByRole("heading", { name: "Gérer le salon" })).toBeVisible();
  await page.getByRole("link", { name: tool }).click();
}

const row = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ hasText: name }).filter({ visible: true });

test.describe("R-11 : le gérant gère la carte", () => {
  test("sans code gérant, la carte reste fermée", async ({ page }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    await loginTablet(page);
    await page.goto("/equipe/gerant/carte");
    await expect(page).toHaveURL(/\/equipe\/gerant$/);
    await expect(page.getByRole("heading", { name: "Code gérant" })).toBeVisible();
  });

  test("modifier un prix : la réservation affiche le nouveau prix", async ({ page }) => {
    tabletOnly(page);
    await openManagerTool(page, "Carte et tarifs");
    await expect(page.getByRole("heading", { name: "Carte et tarifs" })).toBeVisible();

    await page.getByRole("button", { name: "Modifier Coupe homme", exact: true }).click();
    await page.getByLabel("Prix (€)").fill("20,50");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(row(page, "Coupe homme").first()).toContainText("20,50 €");

    const [{ price_cents }] = await sql`select price_cents from service where name = 'Coupe homme'`;
    expect(price_cents).toBe(2050);
    const [entry] = await sql`select actor_type, action from audit_log where action = 'service.updated'`;
    expect(entry).toMatchObject({ actor_type: "manager" });

    await page.goto("/reservation");
    await expect(page.getByText("20,50 €").filter({ visible: true }).first()).toBeVisible();
  });

  test("ajouter une prestation, la voir à la réservation, puis la retirer et la remettre", async ({
    page,
  }) => {
    tabletOnly(page);
    await openManagerTool(page, "Carte et tarifs");

    await page.getByRole("button", { name: "Ajouter une prestation" }).click();
    await page.getByLabel("Nom").fill("Soin de test");
    await page.getByLabel("Groupe").fill("Barbe et soin");
    await page.getByLabel("Prix (€)").fill("15");
    await page.getByLabel("Durée").selectOption("15");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(row(page, "Soin de test").first()).toContainText("15 €");
    await expect(row(page, "Soin de test").first()).toContainText("Orhan, Enes");

    // Retirer : la prestation passe dans « Retirées de la carte ».
    await page.getByRole("button", { name: "Retirer Soin de test" }).click();
    await page.getByRole("button", { name: "Retirer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Retirées de la carte" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remettre Soin de test dans la carte" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Remettre Soin de test dans la carte" }).click();
    await expect(page.getByRole("heading", { name: "Retirées de la carte" })).toHaveCount(0);
    await expect(row(page, "Soin de test").first()).toBeVisible();

    await page.goto("/reservation");
    await expect(page.getByRole("button", { name: /Choisir Soin de test/ })).toBeVisible();
  });

  test("R-10 : un prix illisible est refusé avec un message, rien n'est enregistré", async ({
    page,
  }) => {
    tabletOnly(page);
    await openManagerTool(page, "Carte et tarifs");
    await page.getByRole("button", { name: "Modifier Coupe homme", exact: true }).click();
    await page.getByLabel("Prix (€)").fill("dix");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Le prix n’est pas valide")).toBeVisible();
    const [{ price_cents }] = await sql`select price_cents from service where name = 'Coupe homme'`;
    expect(price_cents).toBe(1800);
  });

  test("monter une prestation change l'ordre de la carte", async ({ page }) => {
    tabletOnly(page);
    await openManagerTool(page, "Carte et tarifs");
    await page.getByRole("button", { name: "Monter Taillage barbe" }).click();
    await expect
      .poll(async () => {
        const rows = await sql`select name from service order by sort_order`;
        return rows.map((r) => r.name).indexOf("Taillage barbe");
      })
      .toBe(3);
  });
});

test.describe("R-13 : chaque prestation indique les coiffeurs habilités", () => {
  test("retirer Enes d'une prestation : il n'est plus proposé à la réservation", async ({
    page,
  }) => {
    tabletOnly(page);
    await openManagerTool(page, "Carte et tarifs");
    await page.getByRole("button", { name: "Modifier Coupe homme", exact: true }).click();
    await page.getByRole("checkbox", { name: "Enes" }).click();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(row(page, "Coupe homme").first()).toContainText("Orhan");
    await expect(row(page, "Coupe homme").first()).not.toContainText("Enes");

    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await page.getByRole("button", { name: /^Continuer/ }).click();
    await expect(page.getByText("Orhan", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Enes", { exact: true }).filter({ visible: true })).toHaveCount(0);
  });

  test("une prestation en ligne sans aucun coiffeur est refusée avec une explication", async ({
    page,
  }) => {
    tabletOnly(page);
    await openManagerTool(page, "Carte et tarifs");
    await page.getByRole("button", { name: "Modifier Coupe homme", exact: true }).click();
    await page.getByRole("checkbox", { name: "Orhan" }).click();
    await page.getByRole("checkbox", { name: "Enes" }).click();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(/au moins un coiffeur habilité/)).toBeVisible();
    const rows = await sql`
      select 1 from service_staff ss join service s on s.id = ss.service_id where s.name = 'Coupe homme'`;
    expect(rows).toHaveLength(2);
  });

  test("une prestation d'apprenti ne propose que les apprentis", async ({ page }) => {
    tabletOnly(page);
    await openManagerTool(page, "Carte et tarifs");
    await page
      .getByRole("button", { name: "Modifier Coupe, tarif formation", exact: true })
      .click();
    await expect(page.getByRole("checkbox", { name: "Kaan" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Taha" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Orhan" })).toHaveCount(0);
  });
});

test.describe("R-02 : le gérant gère l'équipe", () => {
  test("ajouter un coiffeur : il est proposé à la réservation", async ({ page }) => {
    tabletOnly(page);
    await openManagerTool(page, "Équipe et habilitations");
    await expect(page.getByRole("heading", { name: "Équipe et habilitations" })).toBeVisible();

    await page.getByRole("button", { name: "Ajouter un membre" }).click();
    await page.getByLabel("Prénom").fill("Mehdi");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(row(page, "Mehdi").first()).toContainText("Coiffeur");
    await expect(row(page, "Mehdi").first()).toContainText("8 prestations");

    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await page.getByRole("button", { name: /^Continuer/ }).click();
    await expect(page.getByText("Mehdi", { exact: true }).filter({ visible: true })).toBeVisible();
  });

  test("un prénom déjà pris est refusé avec un message", async ({ page }) => {
    tabletOnly(page);
    await openManagerTool(page, "Équipe et habilitations");
    await page.getByRole("button", { name: "Ajouter un membre" }).click();
    await page.getByLabel("Prénom").fill("orhan");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("porte déjà ce prénom")).toBeVisible();
    const [{ count }] = await sql`select count(*)::int as count from staff`;
    expect(count).toBe(4);
  });

  test("retirer un membre puis le remettre ; le dernier d'une prestation en ligne ne part pas", async ({
    page,
  }) => {
    tabletOnly(page);
    await openManagerTool(page, "Équipe et habilitations");

    await page.getByRole("button", { name: "Retirer Kaan de l’équipe" }).click();
    await page.getByRole("button", { name: "Retirer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Retirés de l’équipe" })).toBeVisible();

    // Taha est maintenant le dernier apprenti : le départ est refusé, avec l'explication.
    await page.getByRole("button", { name: "Retirer Taha de l’équipe" }).click();
    await page.getByRole("button", { name: "Retirer", exact: true }).click();
    await expect(page.getByText(/la dernière à réaliser une prestation/)).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
    const [taha] = await sql`select active from staff where first_name = 'Taha'`;
    expect(taha.active).toBe(true);

    await page.getByRole("button", { name: "Remettre Kaan dans l’équipe" }).click();
    await expect(page.getByRole("heading", { name: "Retirés de l’équipe" })).toHaveCount(0);
    const [kaan] = await sql`select active from staff where first_name = 'Kaan'`;
    expect(kaan.active).toBe(true);
  });

  test("renommer et monter un membre", async ({ page }) => {
    tabletOnly(page);
    await openManagerTool(page, "Équipe et habilitations");
    await page.getByRole("button", { name: "Renommer Enes" }).click();
    await page.getByLabel("Prénom").fill("Enes B.");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(row(page, "Enes B.").first()).toBeVisible();
    await page.getByRole("button", { name: "Monter Enes B." }).click();
    await expect
      .poll(
        async () => (await sql`select first_name from staff order by sort_order limit 1`)[0].first_name,
      )
      .toBe("Enes B.");
  });
});

test.describe("R-01, R-03 : horaires et fermetures", () => {
  test("ouvrir le lundi et fermer le samedi", async ({ page }) => {
    tabletOnly(page);
    await openManagerTool(page, "Horaires et fermetures");
    await expect(page.getByRole("heading", { name: "Horaires et fermetures" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer les horaires" })).toBeDisabled();

    await page.getByRole("switch", { name: "Ouvert le lundi" }).click();
    await page.getByRole("switch", { name: "Ouvert le samedi" }).click();
    await page.getByRole("button", { name: "Enregistrer les horaires" }).click();
    await expect(page.getByText("Horaires enregistrés.")).toBeVisible();

    const days = (await sql`select distinct weekday from opening_hours order by weekday`).map(
      (r) => r.weekday,
    );
    expect(days).toEqual([1, 2, 3, 4, 5]);
    const [entry] = await sql`select actor_type from audit_log where action = 'hours.changed'`;
    expect(entry).toMatchObject({ actor_type: "manager" });
  });

  test("changer l'heure de fermeture d'un jour", async ({ page }) => {
    tabletOnly(page);
    await openManagerTool(page, "Horaires et fermetures");
    await page.getByLabel("Mardi, plage 2, fermeture").selectOption("18:00");
    await page.getByRole("button", { name: "Enregistrer les horaires" }).click();
    await expect(page.getByText("Horaires enregistrés.")).toBeVisible();
    const rows = await sql`select closes_at from opening_hours where weekday = 2 order by opens_at`;
    expect(rows.map((r) => String(r.closes_at).slice(0, 5))).toEqual(["12:00", "18:00"]);
  });

  test("des horaires incohérents sont refusés avec un message, rien n'est enregistré", async ({
    page,
  }) => {
    tabletOnly(page);
    await openManagerTool(page, "Horaires et fermetures");
    await page.getByLabel("Mardi, plage 2, fermeture").selectOption("12:30"); // finit avant son début (13 h)
    await page.getByRole("button", { name: "Enregistrer les horaires" }).click();
    await expect(page.getByText(/Vérifiez les horaires/)).toBeVisible();
    const rows = await sql`select closes_at from opening_hours where weekday = 2 order by opens_at`;
    expect(rows.map((r) => String(r.closes_at).slice(0, 5))).toEqual(["12:00", "19:00"]);
  });

  test("ajouter puis supprimer une fermeture", async ({ page }) => {
    tabletOnly(page);
    const day = openDay(10);
    await openManagerTool(page, "Horaires et fermetures");
    await expect(page.getByText("Aucune fermeture prévue.")).toBeVisible();

    await page.locator("#closure-from").fill(day);
    await page.locator("#closure-to").fill(day);
    await page.getByLabel("Motif").fill("Jour de test");
    await page.getByRole("button", { name: "Ajouter la fermeture" }).click();
    await expect(page.getByText("Jour de test").filter({ visible: true })).toBeVisible();
    const [closure] = await sql`
      select starts_on::text as starts_on, ends_on::text as ends_on from closure`;
    expect(closure).toMatchObject({ starts_on: day, ends_on: day });

    await page.getByRole("button", { name: /^Supprimer la fermeture/ }).click();
    await expect(page.getByText("Aucune fermeture prévue.")).toBeVisible();
    expect(await sql`select 1 from closure`).toHaveLength(0);
  });
});

test.describe("mobile : la gestion reste lisible sur un téléphone", () => {
  test("la carte du gérant ne déborde pas", async ({ page }) => {
    test.skip(!isPhone(page), "contrôle du projet mobile");
    await openManagerTool(page, "Carte et tarifs");
    await expect(page.getByRole("heading", { name: "Carte et tarifs" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  for (const tool of ["Équipe et habilitations", "Horaires et fermetures"]) {
    test(`« ${tool} » ne déborde pas`, async ({ page }) => {
      test.skip(!isPhone(page), "contrôle du projet mobile");
      await openManagerTool(page, tool);
      await expect(page.getByRole("heading", { name: tool })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
