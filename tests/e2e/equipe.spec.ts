import { DateTime } from "luxon";
import { expect, test, type Page } from "@playwright/test";
import {
  STAFF_LOGIN,
  addAppointment,
  addCustomer,
  chooseAuthor,
  loginTablet,
  newClient,
  openDay,
  parisIso,
  pastOpenDay,
  resetData,
  setManagerCode,
  signUpClient,
  slotButtons,
  sql,
} from "./helpers";

test.beforeEach(async () => {
  await resetData();
});

// La tablette du salon se vérifie en paysage (1194 × 834) ; le projet « mobile » ne contrôle que l'essentiel.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
const tabletOnly = (page: Page) => test.skip(isPhone(page), "parcours de la tablette");

const planningUrl = (day: string, id?: string) => `/equipe?jour=${day}${id ? `&rdv=${id}` : ""}`;
const block = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name }).filter({ visible: true });
const panel = (page: Page) => page.getByRole("complementary");
const confirmButton = (page: Page) => page.getByRole("button", { name: "Confirmer", exact: true });

// ---------------------------------------------------------------------------------------------------------------

test.describe("R-72 : la tablette reste connectée en mode équipe", () => {
  test("sans connexion, tout /equipe renvoie à la connexion de la tablette", async ({ page }) => {
    for (const path of ["/equipe", "/equipe/reserver", "/equipe/gerant"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/equipe\/connexion$/);
    }
    await expect(page.getByRole("heading", { name: "Connexion de la tablette" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("un client connecté n'entre pas sur la tablette", async ({ page }) => {
    const client = newClient();
    await signUpClient(page, client);
    await page.goto("/equipe");
    await expect(page).toHaveURL(/\/equipe\/connexion$/);
    // Et son compte client ne donne pas la tablette, même avec le bon mot de passe.
    await page.getByLabel("Email").fill(client.email);
    await page.getByLabel("Mot de passe").fill(client.password);
    await page.getByRole("button", { name: "Ouvrir la tablette" }).click();
    await expect(page.getByText("Email ou mot de passe incorrect.")).toBeVisible();
    await page.goto("/equipe");
    await expect(page).toHaveURL(/\/equipe\/connexion$/);
  });

  test("un mauvais mot de passe est refusé, le bon ouvre le planning et la session reste ouverte", async ({
    page,
  }) => {
    await page.goto("/equipe/connexion");
    await page.getByLabel("Email").fill(STAFF_LOGIN.email);
    await page.getByLabel("Mot de passe").fill("faux-mot-de-passe");
    await page.getByRole("button", { name: "Ouvrir la tablette" }).click();
    await expect(page.getByText("Email ou mot de passe incorrect.")).toBeVisible();

    await loginTablet(page);
    await expect(page.getByRole("navigation", { name: "Navigation du salon" })).toBeVisible();
    // La session reste ouverte : on revient sur la tablette sans se reconnecter.
    await page.goto("/equipe/reserver");
    await expect(page).toHaveURL(/\/equipe\/reserver$/);
    await page.reload();
    await expect(page).toHaveURL(/\/equipe\/reserver$/);
  });

  test("le compte équipe n'ouvre pas l'espace client", async ({ page }) => {
    await loginTablet(page);
    await page.goto("/compte/rendez-vous");
    await expect(page).toHaveURL(/\/connexion/);
  });
});

test.describe("planning du jour", () => {
  test("une colonne par coiffeur, les RDV à leur heure, la pause et la fiche au toucher", async ({
    page,
  }) => {
    tabletOnly(page);
    const day = openDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    const yanis = await addCustomer("Yanis", "Benali", "+33698765432");
    await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00"), staff: "Orhan" });
    await addAppointment(yanis.email, {
      startsAt: parisIso(day, "11:00"),
      staff: "Enes",
      service: "Coupe & taille de barbe",
    });

    await loginTablet(page);
    await page.goto(planningUrl(day));
    for (const name of ["Orhan", "Enes", "Kaan", "Taha"]) {
      await expect(page.getByRole("group", { name: `Rendez-vous de ${name}` })).toBeVisible();
    }
    await expect(
      page
        .getByRole("group", { name: "Rendez-vous de Orhan" })
        .getByRole("button", { name: /Thomas Durand/ }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Rendez-vous de Enes" })
        .getByRole("button", { name: /Yanis Benali/ }),
    ).toBeVisible();
    await expect(page.getByLabel("Pause de 12:00 à 13:00")).toBeVisible();
    await expect(page.getByText("2 rendez-vous", { exact: true }).first()).toBeVisible();

    await block(page, /Yanis Benali/).click();
    const fiche = panel(page);
    await expect(fiche.getByRole("link", { name: "Yanis Benali" })).toBeVisible();
    await expect(fiche.getByText("Coupe & taille de barbe · 28 €")).toBeVisible();
    await expect(fiche.getByText("30 min · avec Enes")).toBeVisible();
    await expect(fiche.getByRole("link", { name: "06 98 76 54 32" })).toHaveAttribute(
      "href",
      "tel:0698765432",
    );
    await expect(fiche.getByText("En ligne", { exact: true })).toBeVisible();
    await expect(fiche.getByText("À venir", { exact: true })).toBeVisible();
    // Un RDV à venir ne se signale pas comme lapin (R-51).
    await expect(fiche.getByRole("button", { name: "Signaler un lapin" })).toHaveCount(0);

    await fiche.getByRole("button", { name: "Fermer la fiche" }).click();
    await expect(page.getByText("Touchez un rendez-vous pour ouvrir sa fiche.")).toBeVisible();
  });

  test("les jours se changent d'un geste, un jour fermé est signalé", async ({ page }) => {
    tabletOnly(page);
    await loginTablet(page);
    const tuesday = openDay(3);
    await page.goto(planningUrl(tuesday));
    const next = DateTime.fromISO(tuesday).plus({ days: 1 }).toISODate()!;
    await page.getByRole("link", { name: "Jour suivant" }).click();
    await expect(page).toHaveURL(new RegExp(`jour=${next}`));

    const monday = DateTime.now().plus({ days: 3 });
    const sunday = monday.plus({ days: (7 - monday.weekday) % 7 }).toISODate()!;
    await page.goto(planningUrl(sunday));
    await expect(page.getByText("Le salon est fermé ce jour-là.")).toBeVisible();
  });

  test("« À suivre » et les RDV du jour apparaissent seuls, sans recharger la page", async ({
    page,
  }) => {
    tabletOnly(page);
    test.setTimeout(90_000);
    await loginTablet(page);
    const day = openDay(3);
    await page.goto(planningUrl(day));
    await expect(page.getByText("Aucun rendez-vous").first()).toBeVisible();
    const marie = await addCustomer("Marie", "Lemoine");
    await addAppointment(marie.email, { startsAt: parisIso(day, "14:00") });
    // Mise à jour automatique toutes les 30 secondes (D-54).
    await expect(block(page, /Marie Lemoine/)).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("R-33, R-74 : annuler et modifier au salon", () => {
  test("annuler : le nom est exigé, l'email part, l'auteur est au journal", async ({ page }) => {
    tabletOnly(page);
    const day = openDay(1); // à moins de 48 h comme à plus : le salon n'a pas de délai
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });

    await loginTablet(page);
    await page.goto(planningUrl(day, id));
    const fiche = panel(page);
    await fiche.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(fiche.getByText("Annuler le rendez-vous de Thomas ?")).toBeVisible();

    // R-74 : tant qu'aucun nom n'est choisi, on ne peut pas confirmer.
    await expect(confirmButton(page)).toBeDisabled();
    await chooseAuthor(page, "Enes");
    await expect(confirmButton(page)).toBeEnabled();
    await confirmButton(page).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Rendez-vous de Thomas annulé" }),
    ).toBeVisible();
    await expect(block(page, /Thomas Durand/)).toHaveCount(0);

    const [row] = await sql`select status from appointment where id = ${id}`;
    expect(row.status).toBe("cancelled_by_salon");
    const [entry] =
      await sql`select actor_type, actor_id from audit_log where action = 'appointment.cancelled'`;
    expect(entry.actor_type).toBe("staff");
    const [enes] = await sql`select id from staff where first_name = 'Enes'`;
    expect(entry.actor_id).toBe(enes.id);
    const [mail] =
      await sql`select to_email, payload from email_outbox where type = 'cancellation'`;
    expect(mail.to_email).toBe(thomas.email);
    expect(mail.payload).toMatchObject({ by: "salon" });
  });

  test("« Retour » abandonne l'annulation sans rien changer", async ({ page }) => {
    tabletOnly(page);
    const day = openDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });
    await loginTablet(page);
    await page.goto(planningUrl(day, id));
    await panel(page).getByRole("button", { name: "Annuler", exact: true }).click();
    await page.getByRole("button", { name: "Retour" }).click();
    await expect(panel(page).getByRole("button", { name: "Modifier" })).toBeVisible();
    const [row] = await sql`select status from appointment where id = ${id}`;
    expect(row.status).toBe("confirmed");
  });

  test("modifier : un autre coiffeur au même horaire, avec email « suite à notre échange »", async ({
    page,
  }) => {
    tabletOnly(page);
    const day = openDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, {
      startsAt: parisIso(day, "10:00"),
      staff: "Orhan",
    });

    await loginTablet(page);
    await page.goto(planningUrl(day, id));
    const fiche = panel(page);
    await fiche.getByRole("button", { name: "Modifier" }).click();
    await expect(fiche.getByText("Déplacer le rendez-vous")).toBeVisible();
    await fiche
      .getByRole("group", { name: "Coiffeur" })
      .getByRole("button", { name: "Enes" })
      .click();
    await expect(slotButtons(page).first()).toBeVisible();
    await page.getByRole("button", { name: `, 10:00`, exact: false }).first().click();
    await expect(fiche.getByText(/Nouveau créneau/)).toBeVisible();

    await expect(confirmButton(page)).toBeDisabled(); // pas encore de nom
    await chooseAuthor(page, "Orhan");
    await confirmButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "déplacé" })).toBeVisible();

    const [row] = await sql`select staff_id from appointment where id = ${id}`;
    const [enes] = await sql`select id from staff where first_name = 'Enes'`;
    expect(row.staff_id).toBe(enes.id);
    const [mail] = await sql`select payload from email_outbox where type = 'modification'`;
    expect(mail.payload).toMatchObject({ by: "salon" });
    await expect(
      page
        .getByRole("group", { name: "Rendez-vous de Enes" })
        .getByRole("button", { name: /Thomas Durand/ }),
    ).toBeVisible();
  });

  test("R-23 : un créneau repris entre-temps est refusé avec un message clair", async ({
    page,
  }) => {
    tabletOnly(page);
    const day = openDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    const hugo = await addCustomer("Hugo", "Martin");
    const id = await addAppointment(thomas.email, {
      startsAt: parisIso(day, "10:00"),
      staff: "Orhan",
    });

    await loginTablet(page);
    await page.goto(planningUrl(day, id));
    const fiche = panel(page);
    await fiche.getByRole("button", { name: "Modifier" }).click();
    await fiche
      .getByRole("group", { name: "Coiffeur" })
      .getByRole("button", { name: "Enes" })
      .click();
    const wanted = page.getByRole("button", { name: ", 11:00", exact: false }).first();
    await wanted.click();
    // Entre-temps, quelqu'un d'autre prend ce créneau.
    await addAppointment(hugo.email, { startsAt: parisIso(day, "11:00"), staff: "Enes" });
    await chooseAuthor(page, "Orhan");
    await confirmButton(page).click();
    await expect(
      fiche.getByText("Ce créneau vient d'être pris. Choisissez-en un autre."),
    ).toBeVisible();
    const [row] = await sql`select starts_at from appointment where id = ${id}`;
    expect(new Date(row.starts_at).toISOString()).toBe(
      new Date(parisIso(day, "10:00")).toISOString(),
    );
  });
});

test.describe("R-51, R-52 : les lapins", () => {
  test("un RDV passé est honoré par défaut ; un lapin se signale en un geste et se retire", async ({
    page,
  }) => {
    tabletOnly(page);
    const day = pastOpenDay(3);
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, { startsAt: parisIso(day, "10:00") });

    await loginTablet(page);
    await page.goto(planningUrl(day, id));
    const fiche = panel(page);
    // R-51 : rien n'a été enregistré, et pourtant le RDV est honoré.
    await expect(fiche.getByText("Honoré", { exact: true })).toBeVisible();
    const [stored] = await sql`select status from appointment where id = ${id}`;
    expect(stored.status).toBe("confirmed");
    await expect(fiche.getByRole("button", { name: "Modifier" })).toHaveCount(0);
    await expect(fiche.getByRole("button", { name: "Annuler", exact: true })).toHaveCount(0);

    await fiche.getByRole("button", { name: "Signaler un lapin" }).click();
    await expect(confirmButton(page)).toBeDisabled();
    await chooseAuthor(page, "Kaan");
    await confirmButton(page).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Lapin signalé pour Thomas" }),
    ).toBeVisible();
    await expect(block(page, /Thomas Durand.*Lapin/)).toBeVisible();

    const [row] = await sql`select status from appointment where id = ${id}`;
    expect(row.status).toBe("no_show");
    const [entry] =
      await sql`select actor_type from audit_log where action = 'appointment.no_show'`;
    expect(entry.actor_type).toBe("staff");

    // Chaque lapin s'ajoute à la fiche client.
    await fiche.getByRole("link", { name: "Thomas Durand" }).click();
    await expect(page.getByText("1 lapin", { exact: true })).toBeVisible();

    await page.goto(planningUrl(day, id));
    await panel(page).getByRole("button", { name: "Retirer le lapin" }).click();
    await chooseAuthor(page, "Orhan");
    await confirmButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Lapin retiré" })).toBeVisible();
    const [back] = await sql`select status from appointment where id = ${id}`;
    expect(back.status).toBe("confirmed");
  });
});

test.describe("R-26, R-27 : réserver pour un client par téléphone ou au comptoir", () => {
  test("recherche d'un client inscrit, prestations, coiffeur, créneau, nom : le RDV est créé et confirmé par email", async ({
    page,
  }) => {
    tabletOnly(page);
    const thomas = await addCustomer("Thomas", "Durand", "+33612345678");
    await addCustomer("Julien", "Durieux", "+33645000021");
    await loginTablet(page);
    await page.goto("/equipe/reserver");

    await page.getByLabel("Nom, prénom ou téléphone").fill("dur");
    await expect(
      page.getByRole("list", { name: "Clients trouvés" }).getByRole("button"),
    ).toHaveCount(2);
    // Le téléphone est masqué tant que la fiche n'est pas ouverte.
    await expect(page.getByText("06 •• •• •• 78")).toBeVisible();
    await expect(page.getByText("06 12 34 56 78")).toHaveCount(0);

    await page.getByRole("button", { name: /Thomas Durand/ }).click();
    await expect(page.getByRole("button", { name: "Changer" })).toBeVisible();

    await page.getByRole("button", { name: "Choisir Coupe homme", exact: true }).click();
    await page.getByRole("button", { name: "Choisir Coloration", exact: true }).click(); // sur appel : réservable au salon
    await expect(
      page.getByRole("button", { name: "Choisir Coupe, tarif formation" }),
    ).toBeDisabled(); // R-18
    await expect(page.getByRole("button", { name: "Sans préférence" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Semaine suivante" }).click();
    await slotButtons(page).first().click();
    const confirm = page.getByRole("button", { name: /^(Confirmer|Qui réserve)/ });
    await expect(confirm).toBeDisabled(); // R-74 : pas encore de nom
    await chooseAuthor(page, "Taha", "Qui réserve ?");
    await page.getByRole("button", { name: /^Confirmer/ }).click();
    await expect(page.getByText("Rendez-vous créé par Taha")).toBeVisible();

    const [row] = await sql`
      select source, status, created_by_staff_id, customer_id from appointment`;
    expect(row).toMatchObject({ source: "salon", status: "confirmed", customer_id: thomas.id });
    const [taha] = await sql`select id from staff where first_name = 'Taha'`;
    expect(row.created_by_staff_id).toBe(taha.id);
    const items = await sql`select name_snapshot from appointment_item order by position`;
    expect(items.map((i) => i.name_snapshot)).toEqual(["Coupe homme", "Coloration"]);
    const [mail] = await sql`select to_email from email_outbox where type = 'confirmation'`;
    expect(mail.to_email).toBe(thomas.email);
    const [entry] =
      await sql`select actor_type from audit_log where action = 'appointment.created'`;
    expect(entry.actor_type).toBe("staff");

    await page.getByRole("link", { name: "Voir le planning" }).click();
    await expect(page).toHaveURL(/\/equipe\?jour=\d{4}-\d{2}-\d{2}&rdv=/);
    await expect(panel(page).getByRole("link", { name: "Thomas Durand" })).toBeVisible();
  });

  test("R-26 : un client sans compte ne se trouve pas, le client doit d'abord s'inscrire", async ({
    page,
  }) => {
    tabletOnly(page);
    await loginTablet(page);
    await page.goto("/equipe/reserver");
    // La recherche ne réagit qu'une fois la page active : on retape jusqu'à obtenir la réponse.
    await expect(async () => {
      await page.getByLabel("Nom, prénom ou téléphone").fill("");
      await page.getByLabel("Nom, prénom ou téléphone").fill("personne");
      await expect(page.getByText(/Aucun client inscrit ne correspond/)).toBeVisible({
        timeout: 1500,
      });
    }).toPass({ timeout: 10_000 });
  });

  test("la fiche client propose « Réserver pour ce client » avec le client déjà choisi", async ({
    page,
  }) => {
    tabletOnly(page);
    const thomas = await addCustomer("Thomas", "Durand");
    await addAppointment(thomas.email, { startsAt: parisIso(pastOpenDay(5), "10:00") });
    await loginTablet(page);
    await page.goto(`/equipe/clients/${thomas.id}`);
    await expect(page.getByRole("heading", { name: "Thomas Durand" })).toBeVisible();
    await expect(page.getByText("Aucun lapin")).toBeVisible();
    await page.getByRole("link", { name: "Réserver pour ce client" }).click();
    await expect(page).toHaveURL(new RegExp(`/equipe/reserver\\?client=${thomas.id}`));
    await expect(
      page.getByRole("region", { name: "Client" }).getByText("Thomas Durand"),
    ).toBeVisible();
    await expect(page.getByText(/Dernier RDV/)).toBeVisible();
  });

  test("un client qui a déjà le maximum de RDV à venir est signalé", async ({ page }) => {
    tabletOnly(page);
    const thomas = await addCustomer("Thomas", "Durand");
    await addAppointment(thomas.email, { startsAt: parisIso(openDay(5), "10:00") });
    await addAppointment(thomas.email, { startsAt: parisIso(openDay(6), "11:00") });
    await loginTablet(page);
    await page.goto(`/equipe/reserver?client=${thomas.id}`);
    await expect(page.getByText(/a déjà 2 rendez-vous à venir/)).toBeVisible();
  });
});

test.describe("R-73 : l'espace gérant demande un code", () => {
  test("sans code défini, l'espace reste fermé et le dit", async ({ page }) => {
    tabletOnly(page);
    await loginTablet(page);
    await page.goto("/equipe/gerant");
    await page.getByLabel("Code à 6 chiffres").fill("123456");
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page.getByText(/Aucun code gérant n'est encore défini/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gérer le salon" })).toHaveCount(0);
  });

  test("un mauvais code est refusé ; le bon ouvre l'espace ; le quitter le reverrouille", async ({
    page,
  }) => {
    tabletOnly(page);
    await setManagerCode("246810");
    await loginTablet(page);
    await page.goto("/equipe/gerant");
    await expect(page.getByRole("heading", { name: "Code gérant" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gérer le salon" })).toHaveCount(0);

    await page.getByLabel("Code à 6 chiffres").fill("000000");
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page.getByText("Ce code n'est pas le bon.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gérer le salon" })).toHaveCount(0);

    await page.getByLabel("Code à 6 chiffres").fill("246810");
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page.getByRole("heading", { name: "Gérer le salon" })).toBeVisible();

    // Quitter l'espace gérant le reverrouille (D-53) : on attend que l'action de verrouillage ait répondu.
    const lock = page.waitForResponse((r) => r.url().endsWith("/equipe/verrouiller"));
    await page.getByRole("link", { name: "Planning" }).click();
    await expect(page).toHaveURL(/\/equipe$/);
    await lock;
    await page.getByRole("link", { name: "Gérant" }).click();
    await expect(page.getByRole("heading", { name: "Code gérant" })).toBeVisible();
  });

  test("« Verrouiller » referme l'espace tout de suite", async ({ page }) => {
    tabletOnly(page);
    await setManagerCode("246810");
    await loginTablet(page);
    await page.goto("/equipe/gerant");
    await page.getByLabel("Code à 6 chiffres").fill("246810");
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page.getByRole("heading", { name: "Gérer le salon" })).toBeVisible();
    await page.getByRole("button", { name: "Verrouiller" }).click();
    await expect(page.getByRole("heading", { name: "Code gérant" })).toBeVisible();
  });

  test("une fiche gérant ne s'ouvre pas sans le code", async ({ page }) => {
    tabletOnly(page);
    await setManagerCode("246810");
    const thomas = await addCustomer("Thomas", "Durand");
    await loginTablet(page);
    await page.goto(`/equipe/gerant/clients/${thomas.id}`);
    await expect(page).toHaveURL(/\/equipe\/gerant$/);
    await expect(page.getByRole("heading", { name: "Code gérant" })).toBeVisible();
  });

  async function unlock(page: Page) {
    await page.goto("/equipe/gerant");
    await page.getByLabel("Code à 6 chiffres").fill("246810");
    await page.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(page.getByRole("heading", { name: "Gérer le salon" })).toBeVisible();
  }

  test("R-52 : après 2 lapins, le gérant bloque la réservation en ligne du client, puis la débloque", async ({
    page,
  }) => {
    tabletOnly(page);
    await setManagerCode("246810");
    const thomas = await addCustomer("Thomas", "Durand");
    const sage = await addCustomer("Hugo", "Sage");
    for (const [days, who] of [
      [3, thomas],
      [5, thomas],
      [4, sage],
    ] as const) {
      await addAppointment(who.email, {
        startsAt: parisIso(pastOpenDay(days), "10:00"),
        status: "no_show",
      });
    }
    await loginTablet(page);
    await unlock(page);

    // Seul le client au seuil de lapins est « à surveiller ».
    await expect(page.getByRole("link", { name: /Thomas Durand/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Hugo Sage/ })).toHaveCount(0);

    // Un client à 1 lapin ne peut pas être bloqué.
    await page.getByLabel("Chercher un client").fill("sage");
    await page.getByRole("link", { name: /Hugo Sage/ }).click();
    await expect(
      page.getByRole("button", { name: "Bloquer la réservation en ligne" }),
    ).toBeDisabled();
    await expect(page.getByText(/qu.à partir de 2 lapins/)).toBeVisible();

    await page.getByRole("link", { name: "Retour à l’espace gérant" }).click();
    await page.getByRole("link", { name: /Thomas Durand/ }).click();
    await page.getByRole("button", { name: "Bloquer la réservation en ligne" }).click();
    await expect(
      page.getByRole("button", { name: "Débloquer la réservation en ligne" }),
    ).toBeVisible();
    const [row] = await sql`select online_booking_blocked from customer where id = ${thomas.id}`;
    expect(row.online_booking_blocked).toBe(true);

    // Le client bloqué est repéré sur la fiche du planning (« Bloqué en ligne »).
    await page.goto(`/equipe/clients/${thomas.id}`);
    await expect(page.getByText("Bloqué en ligne")).toBeVisible();

    // Un chargement complet de page reverrouille l'espace gérant : on ressaisit le code.
    await unlock(page);
    await page.getByRole("link", { name: /Thomas Durand/ }).click();
    await page.getByRole("button", { name: "Débloquer la réservation en ligne" }).click();
    await expect(
      page.getByRole("button", { name: "Bloquer la réservation en ligne" }),
    ).toBeVisible();
    const [after] = await sql`select online_booking_blocked from customer where id = ${thomas.id}`;
    expect(after.online_booking_blocked).toBe(false);
  });

  test("R-75 : le gérant supprime une fiche client, ses RDV à venir sont annulés", async ({
    page,
  }) => {
    tabletOnly(page);
    await setManagerCode("246810");
    const thomas = await addCustomer("Thomas", "Durand");
    const id = await addAppointment(thomas.email, { startsAt: parisIso(openDay(1), "10:00") });
    await loginTablet(page);
    await unlock(page);
    await page.getByLabel("Chercher un client").fill("durand");
    await page.getByRole("link", { name: /Thomas Durand/ }).click();
    await page.getByRole("button", { name: "Supprimer la fiche" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Supprimer la fiche de Thomas Durand ?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();

    await expect(page).toHaveURL(/\/equipe\/gerant\?supprime=1$/);
    await expect(page.getByText(/Fiche client supprimée/)).toBeVisible();
    const [row] =
      await sql`select first_name, last_name, phone, email, anonymized_at from customer where id = ${thomas.id}`;
    expect(row).toMatchObject({ first_name: null, last_name: null, phone: null, email: null });
    expect(row.anonymized_at).not.toBeNull();
    const [appt] = await sql`select status from appointment where id = ${id}`;
    expect(appt.status).toBe("cancelled_by_salon");
    // Le nom n'apparaît plus nulle part.
    await page.getByLabel("Chercher un client").fill("durand");
    await expect(page.getByText("Aucun client ne correspond.")).toBeVisible();
  });
});

test.describe("mobile : la tablette reste lisible sur un téléphone", () => {
  test("connexion, planning, réservation et code gérant sans défilement horizontal", async ({
    page,
  }) => {
    test.skip(!isPhone(page), "contrôle du projet mobile");
    const noOverflow = async () => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    };
    await page.goto("/equipe/connexion");
    await noOverflow();
    await loginTablet(page);
    await expect(page.getByRole("navigation", { name: "Navigation du salon" })).toBeVisible();
    await noOverflow();
    await page.goto("/equipe/reserver");
    await expect(page.getByLabel("Nom, prénom ou téléphone")).toBeVisible();
    await noOverflow();
    await page.goto("/equipe/gerant");
    await expect(page.getByRole("heading", { name: "Code gérant" })).toBeVisible();
    await noOverflow();
  });
});
