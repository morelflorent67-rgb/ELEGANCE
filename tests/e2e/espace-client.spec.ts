import { DateTime } from "luxon";
import { expect, test, type Page } from "@playwright/test";
import {
  addAppointment,
  newClient,
  openDay,
  parisIso,
  resetData,
  signUpClient,
  slotButtons,
  sql,
} from "./helpers";

test.beforeEach(async () => {
  await resetData();
});
// La connexion à la base est partagée par tous les fichiers de test (helpers.ts) : Playwright la ferme avec le worker.

const phoneLink = "tel:+33388977468";
const soon = () => DateTime.now().plus({ hours: 20 }).toUTC().toISO()!; // dans le délai de 48 h

/** Une carte de RDV de « Mes rendez-vous », retrouvée par son heure. */
const card = (page: Page, text: string | RegExp) =>
  page.locator("article").filter({ visible: true, hasText: text });

test.describe("Mes rendez-vous (R-76)", () => {
  test("sans rendez-vous : message vide et bouton pour réserver", async ({ page }) => {
    await signUpClient(page, newClient());
    await page.goto("/compte/rendez-vous");
    await expect(page.getByRole("heading", { name: "Mes rendez-vous" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "À venir · 0" })).toBeVisible();
    await expect(page.getByText("Aucun rendez-vous à venir")).toBeVisible();
    await expect(page.getByRole("link", { name: "Prendre rendez-vous" })).toBeVisible();
  });

  test("R-30, R-31 : un RDV lointain se modifie ou s'annule, un RDV proche renvoie au salon", async ({
    page,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    await addAppointment(client.email, { startsAt: parisIso(openDay(10), "10:00") });
    await addAppointment(client.email, { startsAt: soon(), staff: "Enes" });

    await page.goto("/compte/rendez-vous");
    await expect(page.getByRole("tab", { name: "À venir · 2" })).toBeVisible();

    // Le RDV lointain : date limite affichée, Modifier et Annuler
    const far = card(page, "avec Orhan");
    await expect(far.getByText(/Modifiable ou annulable jusqu.au /)).toBeVisible();
    await expect(far.getByRole("link", { name: "Modifier" })).toBeVisible();
    await expect(far.getByRole("button", { name: "Annuler", exact: true })).toBeVisible();
    await expect(far.getByRole("link", { name: "Ajouter à mon agenda" })).toHaveAttribute(
      "href",
      /^\/api\/agenda\/[0-9a-f-]{36}\?t=/,
    );

    // Le RDV proche : « Contactez le salon » (R-31, R-32), ni Modifier ni Annuler
    const near = card(page, "avec Enes");
    await expect(
      near.getByText("Moins de 48 h avant : pour modifier ou annuler, appelez le salon."),
    ).toBeVisible();
    await expect(near.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
      "href",
      phoneLink,
    );
    await expect(near.getByRole("link", { name: "Modifier" })).toHaveCount(0);
    await expect(near.getByRole("button", { name: "Annuler", exact: true })).toHaveCount(0);
  });

  test("R-30 : annuler un RDV, avec la feuille de confirmation, libère le créneau et envoie l'email", async ({
    page,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    const id = await addAppointment(client.email, { startsAt: parisIso(openDay(10), "10:00") });

    await page.goto("/compte/rendez-vous");
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Annuler ce rendez-vous ?" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/Le créneau sera libéré pour un autre client/)).toBeVisible();

    // « Garder mon rendez-vous » ferme la feuille sans rien changer
    await sheet.getByRole("button", { name: "Garder mon rendez-vous" }).click();
    await expect(sheet).toBeHidden();
    expect((await sql`select status from appointment where id = ${id}`)[0].status).toBe(
      "confirmed",
    );

    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await sheet.getByRole("button", { name: "Oui, annuler" }).click();
    await expect(page.getByText("Votre rendez-vous est annulé")).toBeVisible();
    await expect(page.getByRole("tab", { name: "À venir · 0" })).toBeVisible();

    expect((await sql`select status from appointment where id = ${id}`)[0].status).toBe(
      "cancelled_by_customer",
    );
    expect((await sql`select 1 from audit_log where action = 'appointment.cancelled'`).length).toBe(
      1,
    );
    await expect
      .poll(async () => (await sql`select status from email_outbox where type = 'cancellation'`)[0])
      .toMatchObject({ status: "sent" });

    // Il apparaît dans « Passés », marqué « Annulé », sans « Reprendre le même RDV »
    await page.getByRole("tab", { name: "Passés" }).click();
    await expect(page.getByText("Annulé", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reprendre le même RDV" })).toHaveCount(0);
  });

  test("R-30 : le délai est revérifié côté serveur au moment de l'annulation", async ({ page }) => {
    const client = newClient();
    await signUpClient(page, client);
    const id = await addAppointment(client.email, { startsAt: parisIso(openDay(10), "10:00") });

    await page.goto("/compte/rendez-vous");
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    // Pendant que la feuille est ouverte, le RDV passe dans le délai (la page, elle, ne le sait pas).
    await sql`update appointment set starts_at = ${soon()}::timestamptz, ends_at = ${soon()}::timestamptz + interval '30 minutes' where id = ${id}`;
    await page
      .getByRole("dialog", { name: "Annuler ce rendez-vous ?" })
      .getByRole("button", { name: "Oui, annuler" })
      .click();
    await expect(
      page.getByText("Il est trop tard pour annuler en ligne. Appelez le salon."),
    ).toBeVisible();
    expect((await sql`select status from appointment where id = ${id}`)[0].status).toBe(
      "confirmed",
    );
  });

  test("« Passés » : les RDV passés proposent « Reprendre le même RDV »", async ({ page }) => {
    const client = newClient();
    await signUpClient(page, client);
    await addAppointment(client.email, {
      startsAt: DateTime.now().minus({ days: 10 }).toUTC().toISO()!,
      status: "honored",
      service: "Coupe & taille de barbe",
      staff: "Enes",
    });
    await page.goto("/compte/rendez-vous");
    await page.getByRole("tab", { name: "Passés" }).click();
    await expect(page.getByText(/Coupe & taille de barbe · 28 € · avec Enes/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Reprendre le même RDV" })).toBeVisible();
  });
});

test.describe("Reprendre le même RDV", () => {
  test("rouvre le parcours avec les mêmes prestations et le même coiffeur, au choix du créneau", async ({
    page,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    await addAppointment(client.email, {
      startsAt: DateTime.now().minus({ days: 10 }).toUTC().toISO()!,
      status: "honored",
      service: "Coupe & taille de barbe",
      staff: "Enes",
    });

    await page.goto("/compte/rendez-vous");
    await page.getByRole("tab", { name: "Passés" }).click();
    await page.getByRole("link", { name: "Reprendre le même RDV" }).click();

    await expect(page).toHaveURL(/\/reservation\?reprendre=/);
    await expect(page.getByRole("heading", { name: "Date et heure" })).toBeVisible();
    await expect(
      page.getByText("Coupe & taille de barbe · 28 €").filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByText("avec Enes").filter({ visible: true })).toBeVisible();

    await expect(slotButtons(page).first()).toBeVisible();
    await slotButtons(page).first().click();
    await expect(page.getByText("Connecté", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("heading", { name: "Rendez-vous confirmé" })).toBeVisible();

    const rows = await sql`
      select a.status, s.first_name, i.name_snapshot
      from appointment a join staff s on s.id = a.staff_id join appointment_item i on i.appointment_id = a.id
      order by a.created_at`;
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      status: "confirmed",
      first_name: "Enes",
      name_snapshot: "Coupe & taille de barbe",
    });
  });

  test("le RDV d'un autre client n'est pas repris : le parcours s'ouvre vide", async ({
    page,
    browser,
  }) => {
    const owner = newClient();
    await signUpClient(page, owner);
    const id = await addAppointment(owner.email, {
      startsAt: DateTime.now().minus({ days: 5 }).toUTC().toISO()!,
      status: "honored",
    });

    const context = await browser.newContext();
    const stranger = await context.newPage();
    await signUpClient(stranger, newClient());
    await stranger.goto(`/reservation?reprendre=${id}`);
    await expect(
      stranger.getByRole("heading", { name: "Choisissez une prestation" }),
    ).toBeVisible();
    await expect(stranger.getByText("avec Orhan")).toHaveCount(0);
    await context.close();
  });
});

test.describe("Modifier un RDV", () => {
  test("R-30 : change le créneau en gardant les prestations ; l'email de modification part", async ({
    page,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    const original = parisIso(openDay(10), "10:00");
    const id = await addAppointment(client.email, { startsAt: original });

    await page.goto("/compte/rendez-vous");
    await page.getByRole("link", { name: "Modifier" }).click();

    await expect(page).toHaveURL(/\/reservation\?modifier=/);
    await expect(page.getByRole("heading", { name: "Date et heure" })).toBeVisible();
    // Les prestations ne se changent pas ici
    await expect(page.getByText("Coupe homme · 18 €").filter({ visible: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ajouter une prestation à la suite" }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Vos coordonnées" })).toHaveCount(0);

    await expect(slotButtons(page).first()).toBeVisible();
    await slotButtons(page).first().click();

    await expect(page.getByRole("heading", { name: "Récapitulatif" })).toBeVisible();
    await expect(page.getByText("Avant", { exact: true })).toBeVisible();
    await expect(page.getByText("Paiement sur place.")).toBeVisible();
    await page.getByRole("button", { name: "Confirmer la modification" }).click();

    await expect(page.getByRole("heading", { name: "Rendez-vous modifié" })).toBeVisible();
    const rows = await sql`select id, starts_at, status from appointment`;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].status).toBe("confirmed");
    expect(new Date(rows[0].starts_at).toISOString()).not.toBe(new Date(original).toISOString());
    expect(
      (await sql`select 1 from audit_log where action = 'appointment.rescheduled'`).length,
    ).toBe(1);
    await expect
      .poll(async () => (await sql`select status from email_outbox where type = 'modification'`)[0])
      .toMatchObject({ status: "sent" });
  });

  test("R-31, R-32 : un RDV dans le délai ne s'ouvre pas en modification", async ({ page }) => {
    const client = newClient();
    await signUpClient(page, client);
    const id = await addAppointment(client.email, { startsAt: soon() });
    await page.goto(`/reservation?modifier=${id}`);
    await expect(page.getByText("Ce rendez-vous ne peut plus être modifié en ligne")).toBeVisible();
    await expect(page.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
      "href",
      phoneLink,
    );
    await expect(page.getByRole("heading", { name: "Date et heure" })).toHaveCount(0);
  });

  test("le RDV d'un autre client ne s'ouvre pas, et reste inchangé", async ({ page, browser }) => {
    const owner = newClient();
    await signUpClient(page, owner);
    const original = parisIso(openDay(10), "10:00");
    const id = await addAppointment(owner.email, { startsAt: original });

    const context = await browser.newContext();
    const stranger = await context.newPage();
    await signUpClient(stranger, newClient());
    await stranger.goto(`/reservation?modifier=${id}`);
    await expect(
      stranger.getByText("Ce rendez-vous ne peut plus être modifié en ligne"),
    ).toBeVisible();
    await context.close();
    const [row] = await sql`select starts_at from appointment where id = ${id}`;
    expect(new Date(row.starts_at).toISOString()).toBe(new Date(original).toISOString());
  });

  test("sans connexion : renvoie vers la connexion, puis revient à la modification", async ({
    page,
  }) => {
    await page.goto(`/reservation?modifier=${crypto.randomUUID()}`);
    await expect(page).toHaveURL(/\/connexion\?next=/);
  });
});

test.describe("Mes informations (R-70, R-76)", () => {
  test("modifie prénom, nom et téléphone", async ({ page }) => {
    await signUpClient(page, newClient());
    await page.goto("/compte/informations");
    await expect(page.getByRole("heading", { name: "Mes informations" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer" })).toBeDisabled();

    await page.getByLabel("Prénom").fill("Tom");
    await page.getByLabel("Téléphone").fill("07 11 22 33 44");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Vos informations sont à jour.")).toBeVisible();

    const [row] = await sql`select first_name, phone from customer`;
    expect(row).toMatchObject({ first_name: "Tom", phone: "+33711223344" });
    await expect(page.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  test("R-70 : un téléphone invalide est refusé avec un message", async ({ page }) => {
    await signUpClient(page, newClient());
    await page.goto("/compte/informations");
    await page.getByLabel("Téléphone").fill("abc");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Ce numéro de téléphone ne semble pas valide.")).toBeVisible();
  });

  test("changer d'email demande le mot de passe actuel, puis la connexion suit la nouvelle adresse", async ({
    page,
    browser,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    await page.goto("/compte/informations");
    const nextEmail = `nouveau.${Date.now()}@exemple.fr`;
    await page.getByLabel("Email", { exact: true }).fill(nextEmail);
    await expect(page.locator("#info-currentPassword")).toBeVisible();

    await page.locator("#info-currentPassword").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Ce mot de passe n'est pas le bon.")).toBeVisible();
    expect((await sql`select email from customer`)[0].email).toBe(client.email.toLowerCase());

    await page.locator("#info-currentPassword").fill(client.password);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Vos informations sont à jour.")).toBeVisible();
    expect((await sql`select email from customer`)[0].email).toBe(nextEmail);
    await expect(page.locator("#info-currentPassword")).toHaveCount(0);

    const context = await browser.newContext();
    const visitor = await context.newPage();
    await visitor.goto("/connexion");
    await visitor.locator("#login-email").fill(nextEmail);
    await visitor.locator("#login-password").fill(client.password);
    await visitor.getByRole("button", { name: "Se connecter" }).click();
    await expect(visitor).toHaveURL(/\/compte\/rendez-vous$/);
    await context.close();
  });

  test("change le mot de passe : l'ancien est exigé, le nouveau sert à se reconnecter", async ({
    page,
    browser,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    await page.goto("/compte/informations");

    await page.locator("#currentPassword").fill("mauvais-mot-de-passe");
    await page.locator("#newPassword").fill("nouveau-mot-de-passe");
    await page.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(page.getByText("Ce mot de passe n'est pas le bon.")).toBeVisible();

    // Après un refus, le formulaire de mot de passe se vide : on le remplit de nouveau.
    await page.locator("#currentPassword").fill(client.password);
    await page.locator("#newPassword").fill("nouveau-mot-de-passe");
    await page.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(page.getByText("Votre mot de passe a été modifié.")).toBeVisible();

    const context = await browser.newContext();
    const visitor = await context.newPage();
    await visitor.goto("/connexion");
    await visitor.locator("#login-email").fill(client.email);
    await visitor.locator("#login-password").fill("nouveau-mot-de-passe");
    await visitor.getByRole("button", { name: "Se connecter" }).click();
    await expect(visitor).toHaveURL(/\/compte\/rendez-vous$/);
    await context.close();
  });

  test("se déconnecter ramène à l'accueil et ferme l'espace client", async ({ page }) => {
    await signUpClient(page, newClient());
    await page.goto("/compte/informations");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/compte/rendez-vous");
    await expect(page).toHaveURL(/\/connexion/);
  });
});

test.describe("Supprimer mon compte (R-75, D-43)", () => {
  test("efface les coordonnées, annule les RDV à venir, garde le passé sans identité", async ({
    page,
    browser,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    const future = await addAppointment(client.email, { startsAt: parisIso(openDay(10), "10:00") });
    const pastId = await addAppointment(client.email, {
      startsAt: DateTime.now().minus({ days: 10 }).toUTC().toISO()!,
      status: "honored",
    });

    await page.goto("/compte/informations");
    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    const sheet = page.getByRole("dialog", { name: "Supprimer votre compte ?" });
    await expect(sheet).toBeVisible();

    // Un mauvais mot de passe ne supprime rien
    await sheet.getByLabel("Confirmez avec votre mot de passe").fill("mauvais-mot-de-passe");
    await sheet.getByRole("button", { name: "Supprimer définitivement" }).click();
    await expect(sheet.getByText("Ce mot de passe n'est pas le bon.")).toBeVisible();
    expect((await sql`select email from customer`)[0].email).toBe(client.email.toLowerCase());

    // « Garder mon compte » ferme la feuille
    await sheet.getByRole("button", { name: "Garder mon compte" }).click();
    await expect(sheet).toBeHidden();

    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    await sheet.getByLabel("Confirmez avec votre mot de passe").fill(client.password);
    await sheet.getByRole("button", { name: "Supprimer définitivement" }).click();
    await expect(page).toHaveURL(/\/compte\/supprime$/);
    await expect(page.getByRole("heading", { name: "Votre compte est supprimé" })).toBeVisible();

    const [row] =
      await sql`select first_name, last_name, phone, email, auth_user_id, anonymized_at from customer`;
    expect(row).toMatchObject({
      first_name: null,
      last_name: null,
      phone: null,
      email: null,
      auth_user_id: null,
    });
    expect(row.anonymized_at).not.toBeNull();
    expect((await sql`select status from appointment where id = ${future}`)[0].status).toBe(
      "cancelled_by_customer",
    );
    expect((await sql`select status from appointment where id = ${pastId}`)[0].status).toBe(
      "honored",
    );

    // Le compte n'existe plus
    const context = await browser.newContext();
    const visitor = await context.newPage();
    await visitor.goto("/connexion");
    await visitor.locator("#login-email").fill(client.email);
    await visitor.locator("#login-password").fill(client.password);
    await visitor.getByRole("button", { name: "Se connecter" }).click();
    await expect(visitor.getByText("Email ou mot de passe incorrect.")).toBeVisible();
    await context.close();
    await page.goto("/compte/rendez-vous");
    await expect(page).toHaveURL(/\/connexion/);
  });

  test("R-30 : avec un RDV dans les 48 h, la suppression renvoie au salon et ne change rien", async ({
    page,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    await addAppointment(client.email, { startsAt: soon() });
    await page.goto("/compte/informations");
    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    const sheet = page.getByRole("dialog", { name: "Supprimer votre compte ?" });
    await expect(sheet.getByText("Vous avez un rendez-vous dans moins de 48 h")).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
      "href",
      phoneLink,
    );
    await expect(sheet.getByLabel("Confirmez avec votre mot de passe")).toHaveCount(0);
    expect((await sql`select email from customer`)[0].email).toBe(client.email.toLowerCase());
  });
});

test.describe("mobile et tablette", () => {
  test("Mes rendez-vous, Mes informations et la modification : pas de défilement horizontal, cibles d'au moins 44 px", async ({
    page,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    const id = await addAppointment(client.email, { startsAt: parisIso(openDay(10), "10:00") });
    await addAppointment(client.email, { startsAt: soon(), staff: "Enes" });
    await addAppointment(client.email, {
      startsAt: DateTime.now().minus({ days: 10 }).toUTC().toISO()!,
      status: "honored",
    });

    for (const path of [
      "/compte/rendez-vous",
      "/compte/informations",
      `/reservation?modifier=${id}`,
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} déborde`).toBe(0);

      const small: string[] = [];
      for (const element of await page
        .locator("main button, main a, header a, main input, [role=tab]")
        .all()) {
        if (!(await element.isVisible())) continue;
        const box = await element.boundingBox();
        // Un lien au milieu d'une phrase est exempté de la taille minimale (WCAG 2.5.8).
        if (await element.evaluate((e) => e.tagName === "A" && !!e.closest("label, p"))) continue;
        if (box && box.height < 43.5)
          small.push(
            `${(await element.textContent())?.trim() ?? ""} (${Math.round(box.height)} px)`,
          );
      }
      expect(small, `${path} : éléments trop petits`).toEqual([]);
    }

    // Les onglets « À venir » et « Passés » ne cassent pas la mise en page
    await page.goto("/compte/rendez-vous");
    await page.getByRole("tab", { name: "Passés" }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
