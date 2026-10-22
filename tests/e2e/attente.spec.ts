import { expect, test, type Page } from "@playwright/test";
import {
  barButton,
  chooseService,
  chooseStaff,
  newClient,
  openDay,
  parisIso,
  resetData,
  signUpClient,
  sql,
} from "./helpers";

test.beforeEach(async () => {
  await resetData();
});
// La connexion à la base est partagée par tous les fichiers de test (helpers.ts) : Playwright la ferme avec le worker.

// R-80 à R-86, R-88 : la liste d'attente (D-73, D-99, D-100) et la désinscription de la relance (D-74).

/** Un jour d'ouverture complet : les deux coiffeurs sont absents toute la journée. */
async function fullDay(): Promise<string> {
  const day = openDay(3);
  await sql`insert into absence (staff_id, starts_at, ends_at, reason)
    select id, ${parisIso(day, "00:00")}::timestamptz, ${parisIso(day, "23:59")}::timestamptz, 'complet'
    from staff where role = 'barber'`;
  return day;
}

/** Jusqu'à l'écran « Quand ? » avec le jour complet affiché. */
async function reachFullDay(page: Page) {
  await page.goto("/reservation");
  await chooseService(page, "Coupe homme");
  await barButton(page, "Continuer").click();
  await chooseStaff(page);
  const full = page.getByRole("listbox", { name: "Jour" }).getByRole("option").filter({ hasText: "complet" });
  await full.first().click();
  await expect(page.getByText("Tout est réservé ce jour-là", { exact: false })).toBeVisible();
}

const joinButton = (page: Page) => page.getByRole("button", { name: "Me prévenir si une place se libère" });

test.describe("inscription à la liste d'attente (R-80)", () => {
  test("un jour complet propose de s'inscrire ; l'inscription apparaît dans Mes rendez-vous et se retire", async ({
    page,
  }) => {
    const client = newClient();
    await signUpClient(page, client);
    await fullDay();
    await reachFullDay(page);

    await joinButton(page).click();
    const sheet = page.getByRole("dialog", { name: /Me prévenir si une place se libère/ });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radio", { name: /L.après-midi/ }).click();
    await sheet.getByRole("button", { name: "Me prévenir", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Vous êtes sur la liste." })).toBeVisible();

    const [entry] = await sql`select "window", status, staff_id from waitlist_entry`;
    expect(entry).toMatchObject({ window: "afternoon", status: "active", staff_id: null });

    await page.goto("/compte/rendez-vous");
    const section = page.getByRole("region", { name: /Liste d.attente/ }).filter({ visible: true });
    await expect(section).toContainText("l'après-midi");
    await expect(section).toContainText("Coupe homme");
    await section.getByRole("button", { name: /^Me retirer/ }).click();
    await expect(section).toHaveCount(0);
    expect((await sql`select status from waitlist_entry`)[0].status).toBe("removed");
  });

  test("un jour où il reste des places ne propose pas la liste", async ({ page }) => {
    await signUpClient(page, newClient());
    await page.goto("/reservation");
    await chooseService(page, "Coupe homme");
    await barButton(page, "Continuer").click();
    await chooseStaff(page);
    await expect(joinButton(page)).toHaveCount(0);
  });

  test("sans compte connecté, la feuille invite à se connecter", async ({ page }) => {
    await fullDay();
    await reachFullDay(page);
    await joinButton(page).click();
    const sheet = page.getByRole("dialog", { name: /Me prévenir/ });
    await expect(sheet.getByRole("link", { name: /Me connecter/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Me prévenir", exact: true })).toBeDisabled();
  });
});

test.describe("la place gardée (R-83, R-84)", () => {
  /** Un client inscrit sur un jour complet, puis la place de 10 h libérée et offerte pour 15 minutes. */
  async function withOffer(page: Page, expires = "now() + interval '15 minutes'") {
    const client = newClient();
    await signUpClient(page, client);
    const day = await fullDay();
    const [customer] = await sql`select id from customer where lower(email) = ${client.email.toLowerCase()}`;
    const [service] = await sql`select id from service where name = 'Coupe homme'`;
    const [entry] = await sql`
      insert into waitlist_entry (customer_id, service_ids, days, "window")
      values (${customer.id}, ${[service.id]}::uuid[], ${[day]}::date[], 'day') returning id`;
    await sql`delete from absence`;
    const [orhan] = await sql`select id from staff where first_name = 'Orhan'`;
    const [offer] = await sql.unsafe(
      `insert into waitlist_offer (entry_id, customer_id, staff_id, starts_at, ends_at, expires_at)
       values ($1, $2, $3, $4::timestamptz, $5::timestamptz, ${expires}) returning id`,
      [entry.id, customer.id, orhan.id, parisIso(day, "10:00"), parisIso(day, "10:30")],
    );
    return { offerId: offer.id as string, entryId: entry.id as string, client };
  }

  test("prendre la place crée le RDV et mène à la confirmation", async ({ page }) => {
    const { offerId, entryId } = await withOffer(page);
    await page.goto(`/attente/${offerId}`);
    await expect(page.getByRole("heading", { name: /Une place s.est libérée/ })).toBeVisible();
    await expect(page.getByText("avec Orhan")).toBeVisible();
    await expect(page.getByRole("timer")).toBeVisible();

    await page.getByRole("button", { name: "Prendre cette place" }).click();
    await expect(page).toHaveURL(/\/reservation\/confirmation\?rdv=/);
    await expect(page.getByRole("heading", { name: "C'est réservé." })).toBeVisible();
    expect((await sql`select count(*)::int as n from appointment where status = 'confirmed'`)[0].n).toBe(1);
    expect((await sql`select status from waitlist_entry where id = ${entryId}`)[0].status).toBe("fulfilled");
    expect((await sql`select status from waitlist_offer where id = ${offerId}`)[0].status).toBe("accepted");
  });

  test("« Pas cette fois » refuse la place et garde l'inscription", async ({ page }) => {
    const { offerId, entryId } = await withOffer(page);
    await page.goto(`/attente/${offerId}`);
    await page.getByRole("button", { name: "Pas cette fois, je reste sur la liste" }).click();
    await expect(page.getByRole("heading", { name: /C.est noté/ })).toBeVisible();
    expect((await sql`select status from waitlist_offer where id = ${offerId}`)[0].status).toBe("declined");
    expect((await sql`select status from waitlist_entry where id = ${entryId}`)[0].status).toBe("active");
  });

  test("« Quitter la liste » retire l'inscription", async ({ page }) => {
    const { offerId, entryId } = await withOffer(page);
    await page.goto(`/attente/${offerId}`);
    await page.getByRole("button", { name: /Quitter la liste d.attente/ }).click();
    await expect(page.getByRole("heading", { name: "Vous avez quitté la liste." })).toBeVisible();
    expect((await sql`select status from waitlist_entry where id = ${entryId}`)[0].status).toBe("removed");
  });

  test("délai écoulé : la place n'est plus disponible, l'inscription reste", async ({ page }) => {
    const { offerId } = await withOffer(page, "now() - interval '1 minute'");
    await page.goto(`/attente/${offerId}`);
    await expect(
      page.getByRole("heading", { name: /Cette place n.est plus disponible/ }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir les autres horaires" })).toBeVisible();
    expect((await sql`select count(*)::int as n from appointment`)[0].n).toBe(0);
  });

  test("limite de RDV à venir : le message dit quoi faire, la place reste gardée", async ({
    page,
  }) => {
    const { offerId, client } = await withOffer(page);
    await sql`update salon_settings set max_upcoming_per_customer = 1`;
    const [orhan] = await sql`select id from staff where first_name = 'Enes'`;
    await sql`insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
      select c.id, ${orhan.id}, ${parisIso(openDay(8), "11:00")}::timestamptz, ${parisIso(openDay(8), "11:30")}::timestamptz, 'confirmed', 'online'
      from customer c where lower(c.email) = ${client.email.toLowerCase()}`;
    await page.goto(`/attente/${offerId}`);
    await page.getByRole("button", { name: "Prendre cette place" }).click();
    await expect(page.getByText("Vous avez déjà 1 rendez-vous à venir")).toBeVisible();
    expect((await sql`select status from waitlist_offer where id = ${offerId}`)[0].status).toBe("pending");
  });

  test("l'offre d'un autre client n'est pas accessible", async ({ page }) => {
    const { offerId } = await withOffer(page);
    await page.context().clearCookies();
    await signUpClient(page, newClient());
    await page.goto(`/attente/${offerId}`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Prendre cette place" })).toHaveCount(0);
  });

  test("sans connexion, la page renvoie vers la connexion puis revient à l'offre", async ({
    page,
    context,
  }) => {
    const { offerId } = await withOffer(page);
    await context.clearCookies();
    await page.goto(`/attente/${offerId}`);
    await expect(page).toHaveURL(new RegExp(`/connexion\\?next=.*${offerId}`));
  });
});

test.describe("désinscription de la relance (R-88)", () => {
  test("un lien sans signature valable est refusé", async ({ page }) => {
    await page.goto("/relance/desinscription?c=00000000-0000-4000-8000-000000000001&t=faux");
    await expect(page.getByRole("heading", { name: /Ce lien n.est plus valable/ })).toBeVisible();
  });
});
