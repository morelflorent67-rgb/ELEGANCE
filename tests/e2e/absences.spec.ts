import { expect, test, type Page } from "@playwright/test";
import {
  addAppointment,
  addCustomer,
  chooseAuthor,
  loginTablet,
  openDay,
  parisIso,
  resetData,
  setManagerCode,
  slotButtons,
  sql,
} from "./helpers";

test.beforeEach(async () => {
  await resetData();
});

// Les absences se vérifient sur la tablette en paysage ; le projet « mobile » ne contrôle que l'essentiel.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
const tabletOnly = (page: Page) => test.skip(isPhone(page), "parcours de la tablette");

const CODE = "246810";

/** Deux clients ont rendez-vous chez Orhan un jour d'ouverture, dans une dizaine de jours. */
async function twoAppointments() {
  const day = openDay(10);
  const thomas = await addCustomer("Thomas", "Durand");
  const sami = await addCustomer("Sami", "Karim");
  const first = await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });
  const second = await addAppointment(sami.email, { startsAt: parisIso(day, "11:00") });
  return { day, first, second };
}

/** Déclare une absence d'une journée pour Orhan, signée par Enes. */
async function declareOrhanAbsence(page: Page, day: string) {
  await page.goto("/equipe/absences");
  await page.getByRole("group", { name: "Qui ?", exact: true }).getByRole("button", { name: "Orhan" }).click();
  await page.locator("#absence-from").fill(day);
  await page.locator("#absence-to").fill(day);
  await chooseAuthor(page, "Enes", "Qui déclare l’absence ?");
  await page.getByRole("button", { name: "Enregistrer l’absence" }).click();
}

/** Les cartes de rendez-vous à traiter (la liste des emails retenus n'en fait pas partie). */
const cards = (page: Page) =>
  page
    .getByRole("region", { name: "Rendez-vous à traiter" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /^Déplacer le rendez-vous/ }) });

test.describe("R-40, R-41 : l'équipe déclare une absence", () => {
  test("l'absence ferme les créneaux du coiffeur et liste les rendez-vous touchés (R-42)", async ({
    page,
  }) => {
    tabletOnly(page);
    const { day } = await twoAppointments();
    await loginTablet(page);
    await declareOrhanAbsence(page, day);

    await expect(page.getByText(/Absence enregistrée\. Les créneaux de Orhan sont fermés\. 2 rendez-vous à traiter\./)).toBeVisible();
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText("Thomas Durand");
    await expect(cards(page).first()).toContainText("Orhan est absent (congé)");
    await expect(cards(page).nth(1)).toContainText("Sami Karim");
    await expect(page.getByRole("link", { name: "Appeler Thomas Durand" })).toHaveAttribute(
      "href",
      "tel:+33612345678",
    );

    // Journal : signée d'un membre de l'équipe (R-74).
    const [entry] = await sql`select actor_type, action from audit_log where action = 'absence.declared'`;
    expect(entry).toMatchObject({ actor_type: "staff" });
    // La pastille de la barre annonce le nombre de rendez-vous à traiter.
    await expect(page.getByRole("status", { name: "2 rendez-vous à traiter" })).toBeVisible();
  });

  test("sans auteur, l'absence ne s'enregistre pas (R-74)", async ({ page }) => {
    tabletOnly(page);
    await loginTablet(page);
    await page.goto("/equipe/absences");
    await page.getByRole("group", { name: "Qui ?", exact: true }).getByRole("button", { name: "Orhan" }).click();
    await expect(page.getByRole("button", { name: "Enregistrer l’absence" })).toBeDisabled();
  });

  test("des heures précises sur un seul jour", async ({ page }) => {
    tabletOnly(page);
    const day = openDay(10);
    await loginTablet(page);
    await page.goto("/equipe/absences");
    await page.getByRole("group", { name: "Qui ?", exact: true }).getByRole("button", { name: "Enes" }).click();
    await page.locator("#absence-from").fill(day);
    await page.getByRole("button", { name: "Quelques heures" }).click();
    await page.locator("#absence-start").selectOption("14:00");
    await page.locator("#absence-end").selectOption("16:00");
    await page.locator("#absence-motif").selectOption("Formation");
    await chooseAuthor(page, "Orhan", "Qui déclare l’absence ?");
    await page.getByRole("button", { name: "Enregistrer l’absence" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Aucun rendez-vous n’est touché." }),
    ).toBeVisible();
    const [row] = await sql`
      select to_char(starts_at at time zone 'Europe/Paris', 'HH24:MI') as s,
             to_char(ends_at at time zone 'Europe/Paris', 'HH24:MI') as e, reason from absence`;
    expect(row).toMatchObject({ s: "14:00", e: "16:00", reason: "Formation" });
  });

  test("une heure de fin avant le début est refusée avec un message", async ({ page }) => {
    tabletOnly(page);
    await loginTablet(page);
    await page.goto("/equipe/absences");
    await page.getByRole("group", { name: "Qui ?", exact: true }).getByRole("button", { name: "Enes" }).click();
    await page.getByRole("button", { name: "Quelques heures" }).click();
    await page.locator("#absence-start").selectOption("16:00");
    await page.locator("#absence-end").selectOption("14:00");
    await chooseAuthor(page, "Orhan", "Qui déclare l’absence ?");
    await page.getByRole("button", { name: "Enregistrer l’absence" }).click();
    await expect(page.getByText(/Vérifiez l'absence/)).toBeVisible();
    expect(await sql`select 1 from absence`).toHaveLength(0);
  });

  test("supprimer une absence rouvre les créneaux et vide la liste", async ({ page }) => {
    tabletOnly(page);
    const { day } = await twoAppointments();
    await loginTablet(page);
    await declareOrhanAbsence(page, day);
    await expect(cards(page)).toHaveCount(2);

    await page.getByRole("button", { name: /^Supprimer l’absence de Orhan/ }).click();
    await chooseAuthor(page, "Enes");
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(page.getByText("Aucune absence prévue.")).toBeVisible();
    await expect(page.getByText("Tout est traité")).toBeVisible();
    expect(await sql`select 1 from absence`).toHaveLength(0);
  });
});

test.describe("R-42, R-43 : traiter les rendez-vous touchés, puis confirmation du gérant", () => {
  test("confier, annuler, puis le gérant confirme : les emails partent alors seulement", async ({
    page,
  }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    const { day, first, second } = await twoAppointments();
    await loginTablet(page);
    await declareOrhanAbsence(page, day);
    await expect(cards(page)).toHaveCount(2);

    // Confier le premier à Enes : le planning est à jour, l'email attend.
    await page.getByRole("button", { name: "Confier le rendez-vous de Thomas Durand à Enes" }).click();
    await chooseAuthor(page, "Orhan");
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(page.getByText(/confié à Enes · l’email attend la confirmation du gérant/)).toBeVisible();
    await expect(cards(page)).toHaveCount(1);
    const [moved] = await sql`
      select s.first_name from appointment a join staff s on s.id = a.staff_id where a.id = ${first}`;
    expect(moved.first_name).toBe("Enes");

    // Annuler le second avec excuses : l'email attend aussi.
    await page.getByRole("button", { name: "Annuler le rendez-vous de Sami Karim" }).click();
    await chooseAuthor(page, "Orhan");
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(page.getByText("Tout est traité")).toBeVisible();
    const [cancelled] = await sql`select status from appointment where id = ${second}`;
    expect(cancelled.status).toBe("cancelled_by_salon");

    // R-43 : deux emails retenus, aucun n'est parti.
    const banner = page.getByRole("region", { name: "Emails en attente de confirmation" });
    await expect(banner).toContainText("2 emails en attente de confirmation du gérant");
    await expect(banner).toContainText("Annulation · Sami Karim");
    await expect(banner).toContainText("Déplacement · Thomas Durand");
    const held = await sql`select status, held_for_manager from email_outbox where type in ('modification', 'cancellation')`;
    expect(held).toHaveLength(2);
    expect(held.every((r) => r.held_for_manager && r.status === "pending")).toBe(true);

    // Sans le code gérant, l'envoi ne se libère pas ; le bon code ouvre le bouton.
    await banner.getByLabel("Code gérant, pour confirmer l’envoi").fill("000000");
    await banner.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(banner.getByText("Ce code n'est pas le bon.")).toBeVisible();
    await banner.getByLabel("Code gérant, pour confirmer l’envoi").fill(CODE);
    await banner.getByRole("button", { name: "Déverrouiller" }).click();
    await banner.getByRole("button", { name: "Confirmer et prévenir les clients" }).click();
    await expect(page.getByText(/2 emails confirmés/)).toBeVisible();
    await expect(banner).toHaveCount(0);

    // Les emails ont rejoint la file normale, et le journal garde la confirmation du gérant.
    const after = await sql`select held_for_manager from email_outbox where type in ('modification', 'cancellation')`;
    expect(after.every((r) => !r.held_for_manager)).toBe(true);
    const [entry] = await sql`select actor_type from audit_log where action = 'emails.released'`;
    expect(entry).toMatchObject({ actor_type: "manager" });
  });

  test("déplacer un rendez-vous touché vers un autre créneau", async ({ page }) => {
    tabletOnly(page);
    const { day, first } = await twoAppointments();
    await loginTablet(page);
    await declareOrhanAbsence(page, day);

    await page.getByRole("button", { name: "Déplacer le rendez-vous de Thomas Durand" }).click();
    await expect(slotButtons(page).first()).toBeVisible();
    await slotButtons(page).first().click();
    await chooseAuthor(page, "Enes");
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(page.getByText(/déplacé au .* · l’email attend la confirmation du gérant/)).toBeVisible();
    await expect(cards(page)).toHaveCount(1);
    // Orhan est absent ce jour-là : « sans préférence » donne le premier créneau libre, chez Enes.
    const [row] = await sql`
      select s.first_name, a.status from appointment a join staff s on s.id = a.staff_id where a.id = ${first}`;
    expect(row).toMatchObject({ first_name: "Enes", status: "confirmed" });
    const [mail] = await sql`select held_for_manager from email_outbox where type = 'modification'`;
    expect(mail.held_for_manager).toBe(true);
  });

  test("depuis la fiche du planning, annuler un rendez-vous touché retient aussi l'email", async ({
    page,
  }) => {
    tabletOnly(page);
    const { day, first } = await twoAppointments();
    await loginTablet(page);
    await declareOrhanAbsence(page, day);
    await expect(cards(page)).toHaveCount(2);

    await page.goto(`/equipe?jour=${day}&rdv=${first}`);
    await page.getByRole("button", { name: "Annuler", exact: true }).filter({ visible: true }).click();
    await chooseAuthor(page, "Enes");
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /l’email attend la confirmation du gérant/ }),
    ).toBeVisible();
    const [mail] = await sql`select held_for_manager from email_outbox where type = 'cancellation'`;
    expect(mail.held_for_manager).toBe(true);
  });

  test("un rendez-vous ordinaire garde le comportement du lot 4 : l'email part tout de suite", async ({
    page,
  }) => {
    tabletOnly(page);
    const day = openDay(10);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });
    await loginTablet(page);
    await page.goto(`/equipe?jour=${day}&rdv=${id}`);
    await page.getByRole("button", { name: "Annuler", exact: true }).filter({ visible: true }).click();
    await chooseAuthor(page, "Enes");
    await page.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "le client reçoit un email d’annulation" }),
    ).toBeVisible();
    const [mail] = await sql`select held_for_manager from email_outbox where type = 'cancellation'`;
    expect(mail.held_for_manager).toBe(false);
  });
});

test.describe("D-57 : fermeture ou départ, même circuit", () => {
  test("une fermeture exceptionnelle fait apparaître les rendez-vous du jour, avec un rappel dans l'espace gérant", async ({
    page,
  }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    const { day } = await twoAppointments();
    await loginTablet(page);
    await page.goto("/equipe/gerant");
    await page.getByLabel("Code à 6 chiffres").fill(CODE);
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await page.getByRole("link", { name: "Horaires et fermetures" }).click();
    await page.locator("#closure-from").fill(day);
    await page.locator("#closure-to").fill(day);
    await page.getByLabel("Motif").fill("Jour férié");
    await page.getByRole("button", { name: "Ajouter la fermeture" }).click();
    await expect(page.getByText("Jour férié").filter({ visible: true })).toBeVisible();

    // Le rappel s'affiche aussi sur la page d'accueil de l'espace gérant.
    await page.getByRole("link", { name: "Retour à l’espace gérant" }).click();
    await expect(page.getByText(/2 rendez-vous sont à traiter/)).toBeVisible();
    await page.getByRole("link", { name: "Voir les rendez-vous à traiter" }).click();

    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText("Le salon est fermé ce jour-là (jour férié)");
    // Le salon fermé ce jour-là : aucun collègue à qui confier.
    await expect(page.getByRole("button", { name: /^Confier le rendez-vous/ })).toHaveCount(0);
  });

  test("retirer un coiffeur de l'équipe laisse ses rendez-vous à traiter, qu'on peut confier à son collègue", async ({
    page,
  }) => {
    tabletOnly(page);
    await setManagerCode(CODE);
    const day = openDay(10);
    const noah = await addCustomer("Noah", "Petit");
    await addAppointment(noah.email, {
      startsAt: parisIso(day, "10:00"),
      staff: "Kaan",
      service: "Coupe, tarif formation",
    });
    await loginTablet(page);
    await page.goto("/equipe/gerant");
    await page.getByLabel("Code à 6 chiffres").fill(CODE);
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await page.getByRole("link", { name: "Équipe et habilitations" }).click();
    await page.getByRole("button", { name: "Retirer Kaan de l’équipe" }).click();
    await page.getByRole("button", { name: "Retirer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Retirés de l’équipe" })).toBeVisible();
    await expect(page.getByText(/1 rendez-vous est à traiter/)).toBeVisible();

    await page.getByRole("link", { name: "Voir les rendez-vous à traiter" }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Kaan a quitté l’équipe");
    await expect(
      page.getByRole("button", { name: "Confier le rendez-vous de Noah Petit à Taha" }),
    ).toBeVisible();
  });
});

test.describe("mobile : les absences restent lisibles sur un téléphone", () => {
  test("l'écran des absences ne déborde pas", async ({ page }) => {
    test.skip(!isPhone(page), "contrôle du projet mobile");
    await twoAppointments();
    await loginTablet(page);
    await declareOrhanAbsence(page, openDay(10));
    await expect(cards(page)).toHaveCount(2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
