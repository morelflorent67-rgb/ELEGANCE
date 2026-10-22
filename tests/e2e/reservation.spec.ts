import { expect, test } from "@playwright/test";
import {
  barButton,
  chooseService,
  chooseStaff,
  fillSignUp,
  loginTablet,
  newClient,
  openDay,
  pickFirstSlot,
  reachIdentityStep,
  resetData,
  serviceButton,
  setManagerCode,
  signUpAndReachRecap,
  slotButtons,
  sql,
} from "./helpers";

test.beforeEach(async () => {
  await resetData();
});
// La connexion à la base est partagée par tous les fichiers de test (helpers.ts) : Playwright la ferme avec le worker.

const phoneLink = "tel:+33388977468";

/** Crée un compte par la page d'inscription : le client reste connecté. */
async function signUpFirst(page: import("@playwright/test").Page) {
  const client = newClient();
  await page.goto("/inscription");
  await fillSignUp(page, client, "signup");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/reservation$/);
  return client;
}

test.describe("parcours complet (lot 12)", () => {
  test("un client réserve de bout en bout : prestation, coiffeur, créneau, compte, confirmation", async ({
    page,
  }) => {
    const client = newClient();
    await page.goto("/reservation");

    // Étape 1 : la carte, une étape par écran
    await expect(page.getByRole("heading", { name: /^Que souhaitez-vous/ })).toBeVisible();
    await expect(page.getByText("Étape 1 sur 5")).toBeVisible();
    await expect(barButton(page, "Continuer")).toBeDisabled();
    await chooseService(page, "Coupe homme");
    await expect(page.getByText("1 prestation · 30 min")).toBeVisible();
    await barButton(page, "Continuer").click();

    // Étape 2 : « Sans préférence » en premier, choisi par défaut (R-20) ; seuls les coiffeurs habilités (R-13)
    await expect(page.getByRole("heading", { name: /^Avec qui/ })).toBeVisible();
    await expect(page.getByRole("radio").first()).toHaveAccessibleName(/^Sans préférence/);
    await expect(page.getByRole("radio", { name: /^Sans préférence/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^Orhan/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Enes/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Kaan Apprenti/ })).toHaveCount(0);
    await chooseStaff(page, /^Orhan/);

    // Étape 3 : un créneau, à l'heure ou à la demie (D-65)
    await expect(page.getByText(/Départs à l.heure et à la demie · 30 min/)).toBeVisible();
    await expect(slotButtons(page).first()).toBeVisible();
    for (const label of await slotButtons(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label")!),
    )) {
      expect(label).toMatch(/:(00|30)$/);
    }
    await slotButtons(page).first().click();
    await barButton(page, "Continuer").click();

    // Étape 4 : création du compte (R-70, R-71)
    await expect(page.getByRole("heading", { name: "Votre compte" })).toBeVisible();
    await fillSignUp(page, client, "step-signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    // Étape 5 : récapitulatif, paiement sur place (D-34, D-98), pas de paiement en ligne
    await expect(page.getByRole("heading", { name: /^Tout est prêt/ })).toBeVisible();
    await expect(page.getByText("Carte ou espèces")).toBeVisible();
    await expect(page.getByText(/Paiement sur place\./)).toBeVisible();
    await expect(page.getByText("Orhan", { exact: true })).toBeVisible();
    await expect(page.getByText(/payer en ligne/i)).toHaveCount(0);
    await barButton(page, /^Confirmer/).click();

    // Confirmation dorée
    await expect(page).toHaveURL(/\/reservation\/confirmation\?rdv=/);
    await expect(page.getByRole("heading", { name: "C'est réservé." })).toBeVisible();
    await expect(
      page.getByText(/avec Orhan · Coupe homme · 18 €/).filter({ visible: true }),
    ).toBeVisible();

    // R-24 : le RDV est confirmé tout de suite ; R-60 : l'email de confirmation est parti
    const [appointment] = await sql`
      select a.status, a.source, s.first_name from appointment a join staff s on s.id = a.staff_id`;
    expect(appointment).toMatchObject({
      status: "confirmed",
      source: "online",
      first_name: "Orhan",
    });
    await expect
      .poll(
        async () =>
          (
            await sql`select status, type, to_email from email_outbox where type = 'confirmation'`
          )[0],
      )
      .toMatchObject({ status: "sent", type: "confirmation", to_email: client.email });
  });

  test("« Ajouter à mon agenda » donne un fichier d'agenda, et seulement avec le bon lien", async ({
    page,
    request,
  }) => {
    await signUpAndReachRecap(page, newClient());
    await barButton(page, /^Confirmer/).click();
    await expect(page.getByRole("heading", { name: "C'est réservé." })).toBeVisible();

    const href = await page
      .getByRole("link", { name: "Ajouter à mon agenda" })
      .getAttribute("href");
    expect(href).toMatch(/^\/api\/agenda\/[0-9a-f-]{36}\?t=/);
    const ok = await request.get(href!);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toContain("text/calendar");
    const body = await ok.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("SUMMARY:Coupe homme chez Elegance Strasbourg");

    const tampered = await request.get(href!.replace(/t=.{4}/, "t=xxxx"));
    expect(tampered.status()).toBe(404);
  });

  test("le RDV n'est visible que par son propriétaire", async ({ page, browser }) => {
    await signUpAndReachRecap(page, newClient());
    await barButton(page, /^Confirmer/).click();
    await expect(page.getByRole("heading", { name: "C'est réservé." })).toBeVisible();
    const url = page.url();

    const stranger = await browser.newContext();
    const other = await stranger.newPage();
    await other.goto(url);
    await expect(other).toHaveURL(/\/connexion/);
    await stranger.close();
  });

  test("le bouton retour du téléphone revient à l'étape précédente sans rien perdre", async ({
    page,
  }) => {
    await pickFirstSlot(page);
    const chosen = await page.locator('button[aria-pressed="true"]').getAttribute("aria-label");
    await page.goBack();
    await expect(page.getByRole("heading", { name: /^Avec qui/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: /^Que souhaitez-vous/ })).toBeVisible();
    await expect(serviceButton(page, "Coupe homme")).toHaveAttribute("aria-pressed", "true");
    await page.goForward();
    await page.goForward();
    await expect(page.getByRole("heading", { name: /^Quand/ })).toBeVisible();
    await expect(page.locator('button[aria-pressed="true"]')).toHaveAttribute(
      "aria-label",
      chosen!,
    );
    await expect(page).toHaveURL(/\/reservation$/);
  });

  test("le récapitulatif renvoie à l'étape voulue avec « Modifier »", async ({ page }) => {
    await signUpAndReachRecap(page, newClient());
    await page.getByRole("button", { name: "Modifier la date" }).click();
    await expect(page.getByRole("heading", { name: /^Quand/ })).toBeVisible();
    await expect(barButton(page, "Continuer")).toBeEnabled(); // le créneau est gardé
    await barButton(page, "Continuer").click();
    // Déjà connecté : l'étape du compte est sautée.
    await expect(page.getByRole("heading", { name: /^Tout est prêt/ })).toBeVisible();
  });
});

test.describe("délai de modification (R-30, R-32)", () => {
  test("un RDV pris longtemps à l'avance annonce qu'il est modifiable jusqu'à une heure avant", async ({
    page,
  }) => {
    // Un jour ouvré dans 8 jours ou plus, compté en heure de Paris.
    const date = openDay(8);
    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await barButton(page, "Continuer").click();
    await chooseStaff(page);
    const day = page.getByRole("option", {
      name: new RegExp(`^\\w+ ${Number(date.slice(8))}(er)? `),
    });
    await day.first().click();
    await slotButtons(page).first().click();
    await barButton(page, "Continuer").click();
    await fillSignUp(page, newClient(), "step-signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    await expect(
      page.getByText(
        "Modifiable ou annulable en ligne jusqu'à une heure avant le rendez-vous. Paiement sur place.",
      ),
    ).toBeVisible();
    await barButton(page, /^Confirmer/).click();
    await expect(page.getByRole("heading", { name: "C'est réservé." })).toBeVisible();
    await expect(
      page
        .getByText(/Modifiable jusqu'à une heure avant, depuis Mes rendez-vous/)
        .filter({ visible: true }),
    ).toBeVisible();
  });
});

test.describe("la carte (R-10 à R-18)", () => {
  test("R-10 : les prestations en groupes, avec prix et durée, lues en base", async ({ page }) => {
    await page.goto("/reservation");
    for (const title of ["Coupes", "Barbe et soin", "Techniques"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    await expect(serviceButton(page, "Coupe homme")).toContainText("18 €");
    await expect(serviceButton(page, "Coupe homme")).toContainText("30 min");
    await expect(serviceButton(page, "Taillage barbe")).toContainText("15 min");
    await expect(page.getByText("Lissage brésilien", { exact: true })).toBeVisible();
    await expect(page.getByText(/60 € · par téléphone/)).toBeVisible();
  });

  test("R-17, D-36 : une prestation sur appel garde son bouton d'appel ; le soin se réserve en ligne", async ({
    page,
  }) => {
    await page.goto("/reservation");
    for (const name of ["Coloration", "Tribal", "Défrisage", "Lissage brésilien"]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(
        page.getByRole("link", { name: `Appeler le salon pour ${name}` }),
      ).toHaveAttribute("href", phoneLink);
      await expect(serviceButton(page, name)).toHaveCount(0);
    }
    await expect(serviceButton(page, "Soin du visage à la vapeur")).toBeVisible();
  });

  test("R-18 : après une prestation coiffeur, le tarif formation est grisé avec un message, et inversement", async ({
    page,
  }) => {
    await page.goto("/reservation");
    const formation = serviceButton(page, "Coupe, tarif formation");
    await expect(formation).not.toHaveAttribute("aria-disabled", "true");

    await chooseService(page, "Coupe homme");
    await expect(formation).toHaveAttribute("aria-disabled", "true");
    await expect(formation).toContainText("Dans un rendez-vous séparé");
    await expect(
      page.getByRole("note").filter({ hasText: "dans un rendez-vous à part" }),
    ).toBeVisible();
    await formation.click({ force: true });
    await expect(formation).toHaveAttribute("aria-pressed", "false");

    await serviceButton(page, "Coupe homme").click(); // retire la coupe
    await expect(formation).not.toHaveAttribute("aria-disabled", "true");
    await chooseService(page, "Coupe, tarif formation");
    await expect(serviceButton(page, "Coupe homme")).toHaveAttribute("aria-disabled", "true");
    await expect(serviceButton(page, "Taillage barbe")).toContainText(
      "Pas avec un tarif formation",
    );
    await expect(
      page.getByRole("note").filter({ hasText: "Les apprentis travaillent seuls" }),
    ).toBeVisible();
  });

  test("R-14 : des prestations à la suite additionnent durées et prix, jusqu'au récapitulatif", async ({
    page,
  }) => {
    const client = newClient();
    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await chooseService(page, "Taillage barbe");
    await expect(page.getByText("2 prestations · 45 min")).toBeVisible();
    await expect(page.getByText("30 €", { exact: true })).toBeVisible();
    await barButton(page, "Continuer").click();
    await chooseStaff(page);
    await expect(page.getByText(/Départs à l.heure et à la demie · 45 min/)).toBeVisible();
    await slotButtons(page).first().click();
    await barButton(page, "Continuer").click();
    await fillSignUp(page, client, "step-signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByText("Coupe homme + Taillage barbe")).toBeVisible();
    await expect(page.getByText("45 min", { exact: true })).toBeVisible();
    await barButton(page, /^Confirmer/).click();
    await expect(page.getByRole("heading", { name: "C'est réservé." })).toBeVisible();
    const [row] =
      await sql`select extract(epoch from ends_at - starts_at)::int as seconds from appointment`;
    expect(row.seconds).toBe(45 * 60);
  });

  test("R-20 : les apprentis ne sont proposés que pour un tarif formation", async ({ page }) => {
    await page.goto("/reservation");
    await chooseService(page, "Coupe, tarif formation");
    await barButton(page, "Continuer").click();
    await expect(page.getByRole("radio", { name: /^Sans préférence/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^Kaan/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Taha/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Orhan/ })).toHaveCount(0);
    await expect(page.getByText("Le tarif formation est réalisé par un apprenti.")).toBeVisible();
  });

  test("R-11 : le prix modifié par le gérant apparaît dans la réservation", async ({ page }) => {
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

    await page.goto("/reservation");
    await expect(serviceButton(page, "Coupe homme")).toContainText("20,50 €");
  });
});

test.describe("créneaux (D-96)", () => {
  test("la bande couvre tout l'horizon (R-06) ; jours fermés et complets restent, marqués", async ({
    page,
  }) => {
    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await barButton(page, "Continuer").click();
    await chooseStaff(page);
    const days = page.getByRole("listbox", { name: "Jour" }).getByRole("option");
    // Aujourd'hui compris, jusqu'au dernier jour réservable (42 jours plus tard).
    await expect(days).toHaveCount(43);
    await expect(days.filter({ hasText: "fermé" }).first()).toHaveAccessibleName(/, fermé$/);
    // Un dimanche et un lundi par semaine au moins.
    expect(await days.filter({ hasText: "fermé" }).count()).toBeGreaterThanOrEqual(12);
  });

  test("une fermeture d'une semaine : les jours sont « fermé », le premier jour libre s'affiche", async ({
    page,
  }) => {
    // La semaine est celle de Paris : entre minuit et 2 h, la date UTC de la base a un jour de retard.
    await sql`
      insert into closure (starts_on, ends_on, reason)
      values ((now() at time zone 'Europe/Paris')::date, (now() at time zone 'Europe/Paris')::date + 6, 'test')`;
    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await barButton(page, "Continuer").click();
    await chooseStaff(page);
    const days = page.getByRole("listbox", { name: "Jour" }).getByRole("option");
    for (let i = 0; i < 7; i++) await expect(days.nth(i)).toHaveAccessibleName(/, fermé$/);
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveAccessibleName(
      /\d+ horaires?$/,
    );
    await expect(slotButtons(page).first()).toBeVisible();
    // Toucher un jour fermé le dit, sans créneau.
    await days.first().click();
    await expect(page.getByText("Le salon est fermé ce jour-là.", { exact: false })).toBeVisible();
    await expect(slotButtons(page)).toHaveCount(0);
  });

  test("aucun créneau sur tout l'horizon : message, « Essayer sans préférence » et bouton d'appel", async ({
    page,
  }) => {
    await sql`insert into absence (staff_id, starts_at, ends_at, reason)
      select id, now() - interval '1 day', now() + interval '90 days', 'test' from staff where first_name = 'Orhan'`;
    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await barButton(page, "Continuer").click();
    await chooseStaff(page, /^Orhan/);
    await expect(
      page.getByText("Aucun créneau en ligne sur toute la période avec Orhan."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
      "href",
      phoneLink,
    );
    await page.getByRole("button", { name: "Essayer sans préférence" }).click();
    await expect(slotButtons(page).first()).toBeVisible();
  });
});

test.describe("cas particuliers des maquettes", () => {
  test("créneau pris entre-temps : retour au créneau, barré, trois horaires proches, sélection gardée", async ({
    page,
  }) => {
    await signUpAndReachRecap(page, newClient());
    const time = (await page.getByText(/^\d{2}:\d{2} – \d{2}:\d{2}$/).textContent())!.slice(0, 5);
    // Pendant que le client hésite, les deux coiffeurs deviennent indisponibles.
    await sql`insert into absence (staff_id, starts_at, ends_at, reason)
      select id, now(), now() + interval '90 days', 'test' from staff where role = 'barber'`;

    await barButton(page, /^Confirmer/).click();
    await expect(page.getByRole("heading", { name: /^Quand/ })).toBeVisible();
    await expect(
      page.getByText(`${time} vient d'être réservé par un autre client.`, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`${time}, déjà réservé$`) }),
    ).toBeVisible();
    expect((await sql`select 1 from appointment`).length).toBe(0); // rien n'a été créé
    // La prestation est gardée.
    await expect(page.getByText(/Départs à l.heure et à la demie · 30 min/)).toBeVisible();
  });

  test("R-52 : un client bloqué par le gérant voit un message factuel et le bouton d'appel", async ({
    page,
  }) => {
    const client = await signUpFirst(page);
    await sql`update customer set online_booking_blocked = true where email = ${client.email.toLowerCase()}`;
    await pickFirstSlot(page);
    await barButton(page, "Continuer").click();
    await expect(
      page.getByRole("heading", { name: "Réservation en ligne indisponible" }),
    ).toBeVisible();
    await expect(page.getByText(/Plusieurs rendez-vous n.ont pas été honorés/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
      "href",
      phoneLink,
    );
    await expect(barButton(page, /^Confirmer/)).toHaveCount(0);
  });

  test("R-25 : cinq rendez-vous à venir déjà atteints (D-66), la sélection est gardée", async ({
    page,
  }) => {
    const client = await signUpFirst(page);
    await sql`
      insert into appointment (customer_id, staff_id, starts_at, ends_at, source)
      select c.id, '00000000-0000-4000-8000-0000000000a1', now() + (d || ' days')::interval,
             now() + (d || ' days')::interval + interval '30 minutes', 'salon'
      from customer c, (values (5), (6), (7), (8), (9)) as v(d) where c.email = ${client.email.toLowerCase()}`;

    await pickFirstSlot(page);
    await barButton(page, "Continuer").click();
    await expect(
      page.getByRole("heading", { name: "Vous avez déjà 5 rendez-vous à venir." }),
    ).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(5);
    await expect(page.getByRole("link", { name: "Gérer mes rendez-vous" })).toHaveAttribute(
      "href",
      "/compte/rendez-vous",
    );
    await page.getByRole("button", { name: "Revenir à ma sélection" }).click();
    await expect(page.getByRole("heading", { name: /^Quand/ })).toBeVisible();
  });

  test("R-28, D-80 : « Pour qui ? » nomme un proche ; le RDV reste au titulaire et Mes rendez-vous le rappelle", async ({
    page,
  }) => {
    const client = newClient();
    await signUpAndReachRecap(page, client);
    await page.getByLabel(/Pour qui/).fill("Lina");
    await expect(page.getByText("Pour Lina — le rendez-vous reste à votre nom.")).toBeVisible();
    await barButton(page, /^Confirmer/).click();
    await expect(page).toHaveURL(/\/reservation\/confirmation\?rdv=/);
    await expect(
      page.getByText("Pour Lina · au nom de votre compte").filter({ visible: true }),
    ).toBeVisible();

    const [row] = await sql`
      select a.for_name, c.email from appointment a join customer c on c.id = a.customer_id`;
    expect(row).toEqual({ for_name: "Lina", email: client.email.toLowerCase() });
    await page.goto("/compte/rendez-vous");
    await expect(
      page.getByText("Pour Lina", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  });

  test("R-29 : la note au salon est limitée à 300 caractères", async ({ page }) => {
    await signUpAndReachRecap(page, newClient());
    const note = page.getByLabel(/Une précision/);
    await note.fill("x".repeat(400));
    await expect(note).toHaveValue("x".repeat(300));
    await expect(page.getByText("300 / 300")).toBeVisible();
  });
});

test.describe("comptes", () => {
  test("R-70, R-71 : l'inscription demande les cinq champs et les conditions, un message par champ", async ({
    page,
  }) => {
    await page.goto("/inscription");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByText("Indiquez votre prénom.")).toBeVisible();
    await expect(page.getByText("Indiquez votre nom.")).toBeVisible();
    await expect(page.getByText("Indiquez votre téléphone.")).toBeVisible();
    await expect(page.getByText("Cette adresse email ne semble pas valide.")).toBeVisible();
    await expect(page.getByText("8 caractères minimum.").first()).toBeVisible();
    await expect(page.getByText("Acceptez les conditions pour créer votre compte.")).toBeVisible();
  });

  test("à l'étape 4, « Déjà client ? Se connecter » ouvre la connexion (D-95 : email seul)", async ({
    page,
    browser,
  }) => {
    const client = await signUpFirst(page);
    const context = await browser.newContext();
    const visitor = await context.newPage();
    await reachIdentityStep(visitor);
    await visitor.getByRole("button", { name: /Déjà client/ }).click();
    await expect(visitor.getByRole("heading", { name: "Bon retour." })).toBeVisible();
    await expect(visitor.getByLabel("Email", { exact: true })).toBeVisible();
    await visitor.locator("#step-email").fill(client.email);
    await visitor.locator("#step-password").fill(client.password);
    await visitor.getByRole("button", { name: "Se connecter" }).click();
    await expect(visitor.getByRole("heading", { name: /^Tout est prêt/ })).toBeVisible();
    await context.close();
  });

  test("un email déjà utilisé renvoie vers la connexion", async ({ page, browser }) => {
    const client = await signUpFirst(page);
    const other = await (await browser.newContext()).newPage();
    await other.goto("/inscription");
    await fillSignUp(other, client, "signup");
    await other.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(other.getByText(/Un compte existe déjà avec cette adresse email/)).toBeVisible();
    await other.context().close();
  });

  test("connexion : mauvais mot de passe refusé, bon mot de passe accepté", async ({
    page,
    browser,
  }) => {
    const client = await signUpFirst(page);
    const context = await browser.newContext();
    const visitor = await context.newPage();
    await visitor.goto("/connexion");
    await visitor.locator("#login-email").fill(client.email);
    await visitor.locator("#login-password").fill("mauvais-mot-de-passe");
    await visitor.getByRole("button", { name: "Se connecter" }).click();
    await expect(visitor.getByText("Email ou mot de passe incorrect.")).toBeVisible();

    await visitor.locator("#login-password").fill(client.password);
    await visitor.getByRole("button", { name: "Se connecter" }).click();
    await expect(visitor).toHaveURL(/\/compte\/rendez-vous$/);
    await expect(
      visitor.getByRole("heading", { name: `Bonjour ${client.firstName}.` }),
    ).toBeVisible();
    await context.close();
  });

  test("mot de passe oublié : même message que l'adresse existe ou non", async ({ page }) => {
    await page.goto("/mot-de-passe-oublie");
    await page.locator("#forgot-email").fill("personne@exemple.fr");
    await page.getByRole("button", { name: "Recevoir le lien" }).click();
    await expect(page.getByText(/Si un compte existe avec cette adresse/)).toBeVisible();
  });

  test("les pages légales existent (liens de l'inscription)", async ({ page }) => {
    for (const [path, title] of [
      ["/conditions", "Conditions d'utilisation"],
      ["/confidentialite", "Politique de confidentialité"],
      ["/mentions-legales", "Mentions légales"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    }
  });
});

test.describe("mobile et tablette", () => {
  for (const path of ["/reservation", "/connexion", "/inscription", "/"]) {
    test(`${path} : aucun défilement horizontal et cibles tactiles d'au moins 44 px`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);

      const small: string[] = [];
      for (const element of await page
        .locator("main button, main a, header a, header button, main input")
        .all()) {
        if (!(await element.isVisible())) continue;
        const box = await element.boundingBox();
        const type = await element.getAttribute("type");
        if (type === "checkbox") continue; // la case est entourée d'un libellé de 44 px
        // Un lien au milieu d'une phrase est exempté de la taille minimale (WCAG 2.5.8).
        if (await element.evaluate((e) => e.tagName === "A" && !!e.closest("label, p"))) continue;
        if (box && box.height < 43.5)
          small.push(
            `${(await element.textContent())?.trim() ?? ""} (${Math.round(box.height)} px)`,
          );
      }
      expect(small, "éléments interactifs trop petits").toEqual([]);
    });
  }
});
