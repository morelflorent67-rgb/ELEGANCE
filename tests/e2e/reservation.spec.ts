import { expect, test } from "@playwright/test";
import {
  chooseService,
  fillSignUp,
  newClient,
  openDay,
  reachIdentityStep,
  resetData,
  signUpAndReachRecap,
  slotButtons,
  sql,
} from "./helpers";

test.beforeEach(async () => {
  await resetData();
});
// La connexion à la base est partagée par tous les fichiers de test (helpers.ts) : Playwright la ferme avec le worker.

const phoneLink = "tel:+33388977468";

test.describe("parcours complet", () => {
  test("un client réserve de bout en bout : prestation, coiffeur, créneau, compte, confirmation", async ({
    page,
  }) => {
    const client = newClient();
    await page.goto("/reservation");

    // Étape 1 : la carte
    await expect(page.getByRole("heading", { name: "Choisissez une prestation" })).toBeVisible();
    await chooseService(page, "Coupe homme");
    await page.getByRole("button", { name: "Continuer · 18 €" }).click();

    // Étape 2 : « Sans préférence » est choisi par défaut (R-20)
    await expect(page.getByRole("heading", { name: "Avec qui ?" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Sans préférence/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Orhan/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Enes/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Kaan/ })).toHaveCount(0); // apprenti : autre catégorie (R-13)
    await page.getByRole("button", { name: "Continuer", exact: true }).click();

    // Étape 3 : un créneau
    await expect(page.getByRole("heading", { name: "Date et heure" })).toBeVisible();
    await expect(slotButtons(page).first()).toBeVisible();
    await slotButtons(page).first().click();

    // Étape 4 : création du compte (R-70, R-71)
    await expect(page.getByRole("heading", { name: "Vos coordonnées" })).toBeVisible();
    await page.getByRole("tab", { name: "Créer un compte" }).click();
    await fillSignUp(page, client, "step-signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByText("Connecté", { exact: true })).toBeVisible();
    await expect(page.getByText(`${client.firstName} ${client.lastName}`)).toBeVisible();
    await page.getByRole("button", { name: "Continuer", exact: true }).click();

    // Étape 5 : récapitulatif, paiement sur place (D-34), pas de paiement en ligne
    await expect(page.getByRole("heading", { name: "Récapitulatif" })).toBeVisible();
    await expect(page.getByText("Paiement sur place.")).toBeVisible();
    await expect(page.getByText("Total · 30 min")).toBeVisible();
    await expect(page.getByText(/payer en ligne/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Confirmer" }).click();

    // Confirmation
    await expect(page).toHaveURL(/\/reservation\/confirmation\?rdv=/);
    await expect(page.getByRole("heading", { name: "Rendez-vous confirmé" })).toBeVisible();
    // La page précédente reste en mémoire, masquée : on ne regarde que ce qui est visible.
    await expect(page.getByText("Coupe homme · 30 min").filter({ visible: true })).toBeVisible();
    await expect(
      page.getByText("Paiement sur place", { exact: true }).filter({ visible: true }),
    ).toBeVisible();

    // R-24 : le RDV est confirmé tout de suite ; R-60 : l'email de confirmation est parti
    const [appointment] = await sql`select status, source from appointment`;
    expect(appointment).toMatchObject({ status: "confirmed", source: "online" });
    await expect
      .poll(async () => (await sql`select status, type, to_email from email_outbox`)[0])
      .toMatchObject({ status: "sent", type: "confirmation", to_email: client.email });
  });

  test("« Ajouter à mon agenda » donne un fichier d'agenda, et seulement avec le bon lien", async ({
    page,
    request,
  }) => {
    await signUpAndReachRecap(page, newClient());
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("heading", { name: "Rendez-vous confirmé" })).toBeVisible();

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
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("heading", { name: "Rendez-vous confirmé" })).toBeVisible();
    const url = page.url();

    const stranger = await browser.newContext();
    const other = await stranger.newPage();
    await other.goto(url);
    await expect(other).toHaveURL(/\/connexion/);
    await stranger.close();
  });
});

test.describe("délai de modification (R-30, R-32)", () => {
  test("un RDV pris longtemps à l'avance annonce qu'il est modifiable jusqu'à 48 h avant", async ({
    page,
  }) => {
    // Un jour ouvré (mardi à samedi) dans 8 jours ou plus, compté en heure de Paris : plus de 48 h, et dans les
    // 6 semaines. (Avant : jour de la semaine en heure locale mais date en UTC, faux entre minuit et 2 h à Paris.)
    const date = openDay(8);

    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await page.getByRole("button", { name: /^Continuer/ }).click();
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await page.getByRole("button", { name: "Choisir une autre date" }).click();
    await page.locator("#other-date").fill(date);
    await slotButtons(page).first().click();
    await page.getByRole("tab", { name: "Créer un compte" }).click();
    await fillSignUp(page, newClient(), "step-signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await page.getByRole("button", { name: "Continuer", exact: true }).click();

    await expect(
      page.getByText("Modifiable ou annulable jusqu'à 48 h avant. Ensuite, appelez le salon."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("heading", { name: "Rendez-vous confirmé" })).toBeVisible();
    await expect(
      page
        .getByText("Modifiable ou annulable jusqu'à 48 h avant, depuis Mes RDV.")
        .filter({ visible: true }),
    ).toBeVisible();
  });
});

test.describe("règles visibles dans la carte", () => {
  test("R-17 : une prestation sur appel reste affichée avec un bouton d'appel, sans bouton de réservation", async ({
    page,
  }) => {
    await page.goto("/reservation");
    for (const name of ["Coloration", "Tribal", "Défrisage", "Lissage brésilien"]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(
        page.getByRole("link", { name: `Appeler le salon pour ${name}` }),
      ).toHaveAttribute("href", phoneLink);
      await expect(page.getByRole("button", { name: `Choisir ${name}`, exact: true })).toHaveCount(
        0,
      );
    }
    // D-36 : le soin du visage se réserve en ligne
    await expect(
      page.getByRole("button", { name: "Choisir Soin du visage à la vapeur" }),
    ).toBeVisible();
  });

  test("R-18 : après une prestation coiffeur, le tarif formation est grisé avec un message, et inversement", async ({
    page,
  }) => {
    await page.goto("/reservation");
    const formation = page.getByRole("button", {
      name: "Choisir Coupe, tarif formation",
      exact: true,
    });
    await expect(formation).toBeEnabled();

    await chooseService(page, "Coupe homme");
    await expect(formation).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "ne mélange pas" })).toBeVisible();

    await page.getByRole("button", { name: "Retirer Coupe homme" }).click();
    await expect(formation).toBeEnabled();
    await formation.click();
    await expect(
      page.getByRole("button", { name: "Choisir Coupe homme", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Choisir Taillage barbe", exact: true }),
    ).toBeDisabled();
  });

  test("R-14 : des prestations à la suite additionnent durées et prix", async ({ page }) => {
    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await chooseService(page, "Taillage barbe");
    await page.getByRole("button", { name: "Continuer · 30 €" }).click();
    await expect(page.getByText("Coupe homme · 18 €")).toBeVisible();
    await expect(page.getByText("Taillage barbe · 12 €")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ajouter une prestation à la suite" }),
    ).toBeVisible();
  });

  test("R-14 : le récapitulatif donne la durée totale de 45 minutes", async ({ page }) => {
    const client = newClient();
    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await chooseService(page, "Taillage barbe");
    await page.getByRole("button", { name: /^Continuer/ }).click();
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await slotButtons(page).first().click();
    await page.getByRole("tab", { name: "Créer un compte" }).click();
    await fillSignUp(page, client, "step-signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(page.getByText("Total · 45 min")).toBeVisible();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("heading", { name: "Rendez-vous confirmé" })).toBeVisible();
    const [row] =
      await sql`select extract(epoch from ends_at - starts_at)::int as seconds from appointment`;
    expect(row.seconds).toBe(45 * 60);
  });

  test("R-20 : les apprentis ne sont proposés que pour un tarif formation", async ({ page }) => {
    await page.goto("/reservation");
    await chooseService(page, "Coupe, tarif formation");
    await page.getByRole("button", { name: /^Continuer/ }).click();
    await expect(page.getByRole("radio", { name: /Sans préférence/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Kaan/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Taha/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Orhan/ })).toHaveCount(0);
    await expect(page.getByText(/réalisé par Kaan ou Taha/)).toBeVisible();
  });
});

test.describe("cas particuliers de la maquette", () => {
  test("créneau pris entre-temps : retour à l'étape 3, avec les autres choix conservés", async ({
    page,
  }) => {
    await signUpAndReachRecap(page, newClient());

    // Pendant que le client hésite, les deux coiffeurs deviennent indisponibles.
    await sql`insert into absence (staff_id, starts_at, ends_at, reason)
      select id, now(), now() + interval '90 days', 'test' from staff where role = 'barber'`;

    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByText("Ce créneau vient d'être pris")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Date et heure" })).toBeVisible();
    await expect(page.getByText("Coupe homme · 18 €")).toBeVisible(); // étape 1 conservée
    await expect(page.getByText("Sans préférence")).toBeVisible(); // étape 2 conservée
    expect((await sql`select 1 from appointment`).length).toBe(0); // rien n'a été créé
  });

  test("aucun créneau : message, prochaine disponibilité et bouton d'appel", async ({ page }) => {
    await sql`insert into closure (starts_on, ends_on, reason) values (current_date, current_date + 6, 'test')`;
    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await page.getByRole("button", { name: /^Continuer/ }).click();
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(page.getByText("Aucun créneau cette semaine")).toBeVisible();
    await expect(page.getByText(/Prochaine disponibilité/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
      "href",
      phoneLink,
    );
    await page.getByRole("button", { name: /^Voir le / }).click();
    await expect(slotButtons(page).first()).toBeVisible();
  });

  test("R-52 : un client bloqué par le gérant voit un message factuel et le bouton d'appel", async ({
    page,
  }) => {
    const client = newClient();
    await page.goto("/inscription");
    await fillSignUp(page, client, "signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(/\/reservation$/);
    await sql`update customer set online_booking_blocked = true where email = ${client.email.toLowerCase()}`;

    await reachIdentityStep(page);
    await expect(page.getByText("Réservation en ligne indisponible")).toBeVisible();
    await expect(page.getByText(/Plusieurs rendez-vous n.ont pas été honorés/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Appeler le salon" })).toHaveAttribute(
      "href",
      phoneLink,
    );
    await expect(page.getByRole("button", { name: "Continuer", exact: true })).toHaveCount(0);
  });

  test("R-25 : deux rendez-vous à venir déjà atteints", async ({ page }) => {
    const client = newClient();
    await page.goto("/inscription");
    await fillSignUp(page, client, "signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(/\/reservation$/);
    await sql`
      insert into appointment (customer_id, staff_id, starts_at, ends_at, source)
      select c.id, '00000000-0000-4000-8000-0000000000a1', now() + (d || ' days')::interval,
             now() + (d || ' days')::interval + interval '30 minutes', 'salon'
      from customer c, (values (5), (6)) as v(d) where c.email = ${client.email.toLowerCase()}`;

    await reachIdentityStep(page);
    await expect(page.getByText("Vous avez déjà 2 rendez-vous à venir")).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir mes rendez-vous" })).toHaveAttribute(
      "href",
      "/compte/rendez-vous",
    );
    await expect(page.getByRole("button", { name: "Continuer", exact: true })).toHaveCount(0);
  });

  test("R-29 : la note au salon est limitée à 300 caractères", async ({ page }) => {
    await reachIdentityStep(page);
    await page.getByRole("tab", { name: "Créer un compte" }).click();
    await fillSignUp(page, newClient(), "step-signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    const note = page.getByLabel(/Note au salon/);
    await note.fill("x".repeat(400));
    await expect(note).toHaveValue("x".repeat(300));
    await expect(page.getByText("300/300")).toBeVisible();
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

  test("un email déjà utilisé renvoie vers la connexion", async ({ page, browser }) => {
    const client = newClient();
    await page.goto("/inscription");
    await fillSignUp(page, client, "signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(/\/reservation$/);

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
    const client = newClient();
    await page.goto("/inscription");
    await fillSignUp(page, client, "signup");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page).toHaveURL(/\/reservation$/);

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
    await expect(visitor.getByRole("heading", { name: "Mes rendez-vous" })).toBeVisible();
    await context.close();
  });

  test("mot de passe oublié : même message que l'adresse existe ou non", async ({ page }) => {
    await page.goto("/mot-de-passe-oublie");
    await page.locator("#forgot-email").fill("personne@exemple.fr");
    await page.getByRole("button", { name: "Recevoir le lien" }).click();
    await expect(page.getByText(/Si un compte existe avec cette adresse/)).toBeVisible();
  });

  test("les pages légales provisoires existent (liens de l'inscription)", async ({ page }) => {
    for (const [path, title] of [
      ["/conditions", "Conditions d'utilisation"],
      ["/confidentialite", "Politique de confidentialité"],
      ["/mentions-legales", "Mentions légales"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });
});

test.describe("mobile et tablette", () => {
  for (const path of ["/reservation", "/connexion", "/inscription"]) {
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
      for (const element of await page.locator("main button, main a, header a, main input").all()) {
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
