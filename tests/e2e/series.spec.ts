import { DateTime } from "luxon";
import { expect, test, type Page } from "@playwright/test";
import {
  addAppointment,
  addCustomer,
  chooseAuthor,
  fillSignUp,
  loginTablet,
  newClient,
  openDay,
  parisIso,
  resetData,
  sql,
} from "./helpers";

// RDV répétés depuis la fiche du planning (D-71, D-83 à D-92).

test.beforeEach(async () => {
  await resetData();
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
const tabletOnly = (page: Page) => test.skip(isPhone(page), "parcours de la tablette");
const panel = (page: Page) => page.getByRole("complementary");
const planningUrl = (day: string, id: string) => `/equipe?jour=${day}&rdv=${id}`;
const plusDays = (day: string, n: number) => DateTime.fromISO(day).plus({ days: n }).toISODate()!;
const capture = (page: Page, name: string) =>
  process.env.CAPTURES ? page.screenshot({ path: `test-results/captures/${name}.png` }) : null;

/** Une série posée directement en base : `count` RDV chaque semaine à 10 h chez Orhan, à partir de `day`. */
async function addSeries(email: string, day: string, count: number): Promise<string[]> {
  const [orhan] = await sql`select id from staff where first_name = 'Orhan'`;
  const [series] = await sql`
    insert into appointment_series (frequency, interval_weeks, anchor_on, start_time, staff_id, last_planned_on, created_by_staff_id)
    values ('weekly', 1, ${day}, '10:00', ${orhan.id}, ${plusDays(day, 7 * (count - 1))}, ${orhan.id})
    returning id`;
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = await addAppointment(email, {
      startsAt: parisIso(plusDays(day, 7 * i), "10:00"),
      source: "salon",
    });
    await sql`update appointment set series_id = ${series.id} where id = ${id}`;
    ids.push(id);
  }
  return ids;
}

test.describe("D-83, D-84, D-91 : répéter un RDV depuis sa fiche", () => {
  test("règle, aperçu avec date sautée, nom, confirmation : la série est posée et marquée ↻", async ({
    page,
  }) => {
    tabletOnly(page);
    const day = openDay(2);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, {
      startsAt: parisIso(day, "10:00"),
      source: "salon",
    });
    // Le salon est fermé le jour de la 2e date : elle est sautée, puis remplacée.
    await sql`insert into closure (starts_on, ends_on) values (${plusDays(day, 14)}, ${plusDays(day, 14)})`;

    await loginTablet(page);
    await page.goto(planningUrl(day, id));
    const fiche = panel(page);
    await fiche.getByRole("button", { name: "↻ Répéter ce RDV" }).click();
    await fiche
      .getByRole("group", { name: "Fréquence" })
      .getByRole("button", { name: "Toutes les 2 semaines" })
      .click();
    await fiche.getByRole("button", { name: "Un RDV de moins" }).click(); // 5 RDV en tout
    const dates = fiche.getByRole("region", { name: "Dates de la série" });
    await expect(dates.getByText("4 RDV seront réservés · 1 date sautée")).toBeVisible();
    await expect(dates.getByText("Sautée · Salon fermé")).toBeVisible();
    await expect(dates.getByRole("link", { name: "Réserver à une autre heure" })).toHaveAttribute(
      "href",
      new RegExp(`jour=${plusDays(day, 14)}`),
    );
    await capture(page, "lot11-repeter-tablette");

    const confirm = fiche.getByRole("button", { name: "Confirmer 4 RDV" });
    await expect(confirm).toBeDisabled(); // R-74 : un nom d'abord
    await chooseAuthor(page, "Enes", "Qui réserve ?");
    await confirm.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Série créée par Enes : 4 RDV, 1 date sautée" }),
    ).toBeVisible();

    const rows = await sql`
      select starts_at, series_id from appointment where series_id is not null order by starts_at`;
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.series_id)).size).toBe(1);
    const mails =
      await sql`select type from email_outbox where type in ('series_confirmation', 'confirmation')`;
    expect(mails.map((m) => m.type)).toEqual(["series_confirmation"]);

    // D-92 : la fiche dit la série ; le planning marque la case.
    await expect(fiche.getByRole("region", { name: "Série de rendez-vous" })).toContainText(
      "Toutes les 2 semaines · 1er sur 5",
    );
    await expect(page.locator("[data-repeated]").filter({ visible: true })).toHaveCount(1);
    await capture(page, "lot11-fiche-serie-tablette");
  });

  test("« Réserver à une autre heure » ouvre Nouveau RDV avec le client, la prestation et le jour", async ({
    page,
  }) => {
    tabletOnly(page);
    const day = openDay(2);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, {
      startsAt: parisIso(day, "10:00"),
      source: "salon",
    });
    await loginTablet(page);
    await page.goto(`/equipe/reserver?client=${thomas.id}&depuis=${id}&jour=${plusDays(day, 7)}`);
    await expect(page.getByText("Thomas Durand").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retirer Coupe homme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("region", { name: "Coiffeur" }).getByRole("button", { name: "Orhan" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("D-88 : annuler une partie de la série", () => {
  test("« Celui-ci et les suivants » annule la suite, un seul email part", async ({ page }) => {
    tabletOnly(page);
    const day = openDay(2);
    const thomas = await addCustomer("Thomas", "Durand");
    const ids = await addSeries(thomas.email, day, 4);

    await loginTablet(page);
    await page.goto(planningUrl(plusDays(day, 7), ids[1]));
    const fiche = panel(page);
    await expect(fiche.getByRole("region", { name: "Série de rendez-vous" })).toContainText(
      "Chaque semaine · 2e sur 4",
    );
    await fiche.getByRole("button", { name: "Annuler", exact: true }).click();
    const choices = fiche.getByRole("radiogroup", { name: "Quels rendez-vous ?" });
    await expect(choices.getByRole("radio", { name: "Ce RDV" })).toBeChecked();
    await expect(
      choices.getByRole("radio", { name: "Tous les RDV à venir de la série (4)" }),
    ).toBeVisible();
    await choices.getByRole("radio", { name: "Celui-ci et les suivants (3)" }).click();
    await capture(page, "lot11-annuler-suivants-tablette");
    await chooseAuthor(page, "Orhan");
    await fiche.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "3 rendez-vous de Thomas annulés" }),
    ).toBeVisible();

    const statuses = await sql`select status from appointment order by starts_at`;
    expect(statuses.map((s) => s.status)).toEqual([
      "confirmed",
      "cancelled_by_salon",
      "cancelled_by_salon",
      "cancelled_by_salon",
    ]);
    const mails = await sql`select payload from email_outbox where type = 'cancellation'`;
    expect(mails).toHaveLength(1);
    expect(mails[0].payload.appointmentIds).toHaveLength(3);
  });
});

test.describe("D-90 : prolonger la série", () => {
  test("la fiche du dernier RDV le dit, « Prolonger la série » ajoute les dates suivantes", async ({
    page,
  }) => {
    tabletOnly(page);
    const day = openDay(2);
    const thomas = await addCustomer("Thomas", "Durand");
    const ids = await addSeries(thomas.email, day, 2);

    await loginTablet(page);
    await page.goto(planningUrl(plusDays(day, 7), ids[1]));
    const fiche = panel(page);
    await expect(fiche.getByText("Dernier RDV de la série")).toBeVisible();
    await fiche.getByRole("button", { name: "↻ Prolonger la série" }).click();
    await expect(fiche.getByText("RDV de plus")).toBeVisible();
    await fiche.getByRole("button", { name: "Un RDV de moins" }).click();
    await fiche.getByRole("button", { name: "Un RDV de moins" }).click(); // 2 de plus
    await expect(
      fiche.getByRole("region", { name: "Dates de la série" }).getByText("2 RDV seront réservés"),
    ).toBeVisible();
    await chooseAuthor(page, "Kaan", "Qui réserve ?");
    await fiche.getByRole("button", { name: "Confirmer 2 RDV" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Série prolongée par Kaan" }),
    ).toBeVisible();
    const rows = await sql`select starts_at from appointment where series_id is not null`;
    expect(rows).toHaveLength(4);
  });
});

test.describe("mobile", () => {
  test("D-92 : Mes rendez-vous signale un RDV répété", async ({ page }) => {
    test.skip(!isPhone(page), "contrôle du projet mobile");
    const client = newClient();
    await page.goto("/inscription");
    await fillSignUp(page, client, "signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(/\/reservation$/);
    await addSeries(client.email, openDay(2), 2);
    await page.goto("/compte/rendez-vous");
    await expect(page.getByText("RDV répété").filter({ visible: true })).toHaveCount(2);
    await capture(page, "lot11-mes-rdv-mobile");
  });

  test("D-83 : la fiche se répète aussi sur un téléphone, sans défilement horizontal", async ({
    page,
  }) => {
    test.skip(!isPhone(page), "contrôle du projet mobile");
    const day = openDay(2);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, {
      startsAt: parisIso(day, "10:00"),
      source: "salon",
    });
    await loginTablet(page);
    await page.goto(planningUrl(day, id));
    const fiche = panel(page);
    await fiche.getByRole("button", { name: "↻ Répéter ce RDV" }).click();
    await expect(
      fiche.getByRole("region", { name: "Dates de la série" }).getByText(/RDV seront réservés/),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await capture(page, "lot11-repeter-mobile");
  });
});
