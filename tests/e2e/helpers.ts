import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";
import postgres from "postgres";
import { hashManagerCode } from "../../src/modules/staff/manager-code";

// Base du serveur de test (scripts/e2e-server.mjs). Les tests s'en servent pour remettre à zéro et pour provoquer des cas
// que l'interface seule ne peut pas produire (créneau pris entre-temps, client bloqué).
export const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54399/postgres", {
  max: 2,
  onnotice: () => {},
});

const seedSql = readFileSync("src/db/seed.sql", "utf8");

export async function resetData() {
  // Carte, équipe, horaires et réglages aussi : le gérant les modifie (lot 5), chaque test repart des données de départ.
  await sql.unsafe(
    `truncate payment, waitlist_offer, waitlist_entry, appointment_item, appointment, appointment_series, absence, closure, email_outbox, audit_log, customer, rate_limit,
              service_staff, service, staff, opening_hours, salon_settings restart identity cascade`,
  );
  await sql.unsafe(seedSql);
  // Aucun code gérant tant qu'un test n'en pose pas un (R-73).
  await sql`update salon_settings set manager_pin_hash = null`;
  await refreshVitrine();
}

/** La vitrine garde la carte, l'équipe et les horaires en cache : après un changement direct en base, on le vide. */
export async function refreshVitrine() {
  await fetch("http://127.0.0.1:3100/api/e2e/revalidate", { method: "POST" });
}

export const newClient = () => ({
  firstName: "Thomas",
  lastName: "Durand",
  phone: "06 12 34 56 78",
  email: `thomas.${randomUUID().slice(0, 8)}@exemple.fr`,
  password: "motdepasse-test",
});

export type Client = ReturnType<typeof newClient>;

/** Bouton d'un créneau : « Mardi 3 novembre, 10:00 ». */
export const slotButtons = (page: Page) => page.getByRole("button", { name: /, \d{2}:\d{2}$/ });

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Une prestation de l'étape 1 : « Coupe homme, 18 € » (bouton à bascule, lot 12). */
export const serviceButton = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`^${escapeRegExp(name)}, \\d`) });

export async function chooseService(page: Page, name: string) {
  const button = serviceButton(page, name);
  // Un clic avant que la page soit active (hydratée) est perdu : on réessaie jusqu'à ce qu'il compte.
  await expect(async () => {
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** Le bouton de la barre du bas (« Continuer », « Confirmer »…). */
export const barButton = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

/** Étape 2 : toucher un coiffeur (ou « Sans préférence ») passe au créneau. */
export async function chooseStaff(page: Page, name: string | RegExp = /^Sans préférence/) {
  await page.getByRole("radio", { name }).click();
  await expect(page.getByRole("heading", { name: /^Quand/ })).toBeVisible();
}

export async function fillSignUp(page: Page, client: Client, prefix: string) {
  await page.locator(`#${prefix}-firstName`).fill(client.firstName);
  await page.locator(`#${prefix}-lastName`).fill(client.lastName);
  await page.locator(`#${prefix}-phone`).fill(client.phone);
  await page.locator(`#${prefix}-email`).fill(client.email);
  await page.locator(`#${prefix}-password`).fill(client.password);
  await page.getByRole("checkbox").check();
}

/** Parcours jusqu'au créneau choisi : une coupe, sans préférence, premier créneau libre (pas encore « Continuer »). */
export async function pickFirstSlot(page: Page, service = "Coupe homme") {
  await page.goto("/reservation");
  await chooseService(page, service);
  await barButton(page, "Continuer").click();
  await chooseStaff(page);
  await expect(slotButtons(page).first()).toBeVisible();
  await slotButtons(page).first().click();
}

/** Parcours jusqu'à l'étape 4 (« Votre compte ») : une coupe, sans préférence, premier créneau libre. */
export async function reachIdentityStep(page: Page) {
  await pickFirstSlot(page);
  await barButton(page, "Continuer").click();
  await expect(page.getByRole("heading", { name: "Votre compte" })).toBeVisible();
}

/** Étape 4 par la création d'un compte, jusqu'au récapitulatif. */
export async function signUpAndReachRecap(page: Page, client: Client) {
  await reachIdentityStep(page);
  await fillSignUp(page, client, "step-signup");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { name: /^Tout est prêt/ })).toBeVisible();
}

/** Heure de Paris → instant ISO (UTC), pour poser des RDV directement en base. */
export const parisIso = (date: string, time: string) =>
  DateTime.fromISO(`${date}T${time}`, { zone: "Europe/Paris" }).toUTC().toISO()!;

/** Premier jour d'ouverture (mardi à samedi) au moins `minDays` jours après aujourd'hui, « AAAA-MM-JJ ». */
export function openDay(minDays: number): string {
  let day = DateTime.now().setZone("Europe/Paris").plus({ days: minDays });
  while (day.weekday < 2 || day.weekday > 6) day = day.plus({ days: 1 });
  return day.toISODate()!;
}

/** Crée un compte par la page d'inscription : le client reste connecté. */
export async function signUpClient(page: Page, client: Client) {
  await page.goto("/inscription");
  await fillSignUp(page, client, "signup");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/reservation$/);
}

/**
 * Pose un RDV directement en base pour un client (le parcours de réservation ne sait pas créer un RDV dans le
 * passé, ni dans le délai de modification). `startsAt` : instant ISO.
 */
export async function addAppointment(
  email: string,
  options: {
    startsAt: string;
    staff?: string;
    service?: string;
    status?: string;
    source?: "online" | "salon";
  },
): Promise<string> {
  const {
    startsAt,
    staff = "Orhan",
    service = "Coupe homme",
    status = "confirmed",
    source = "online",
  } = options;
  const [item] =
    await sql`select id, name, price_cents, duration_min from service where name = ${service}`;
  const [row] = await sql`
    insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
    select c.id, s.id, ${startsAt}::timestamptz,
           ${startsAt}::timestamptz + (${item.duration_min} * interval '1 minute'), ${status}, ${source}
    from customer c, staff s
    where lower(c.email) = ${email.toLowerCase()} and s.first_name = ${staff}
    returning id`;
  await sql`
    insert into appointment_item (appointment_id, service_id, name_snapshot, price_cents, duration_min, position)
    values (${row.id}, ${item.id}, ${item.name}, ${item.price_cents}, ${item.duration_min}, 0)`;
  return row.id as string;
}

// ---------------------------------------------------------------------------------------------------------------
// Tablette du salon (lot 4)

/** Le compte « équipe » du serveur de test (scripts/e2e-server.mjs). */
export const STAFF_LOGIN = { email: "equipe@elegance.test", password: "mot-de-passe-equipe" };

/** Ouvre la tablette : une seule connexion, la session reste ouverte (R-72). */
export async function loginTablet(page: Page) {
  await page.goto("/equipe/connexion");
  await page.getByLabel("Email").fill(STAFF_LOGIN.email);
  await page.getByLabel("Mot de passe").fill(STAFF_LOGIN.password);
  await page.getByRole("button", { name: "Ouvrir la tablette" }).click();
  await expect(page).toHaveURL(/\/equipe$/);
}

/** Pose le code gérant (R-73) dans la base de test. */
export async function setManagerCode(code: string) {
  await sql`update salon_settings set manager_pin_hash = ${hashManagerCode(code)}`;
}

/** Un client inscrit, sans passer par l'interface : rend son id et son email. */
export async function addCustomer(
  first: string,
  last: string,
  phone = "+33612345678",
): Promise<{ id: string; email: string }> {
  const email = `${first}.${last}.${randomUUID().slice(0, 6)}@exemple.fr`.toLowerCase();
  const [row] = await sql`
    insert into customer (first_name, last_name, phone, email, auth_user_id)
    values (${first}, ${last}, ${phone}, ${email}, ${randomUUID()}) returning id`;
  return { id: row.id as string, email };
}

/** Dernier jour d'ouverture (mardi à samedi) au moins `minDays` jours avant aujourd'hui, « AAAA-MM-JJ ». */
export function pastOpenDay(minDays: number): string {
  let day = DateTime.now().setZone("Europe/Paris").minus({ days: minDays });
  while (day.weekday < 2 || day.weekday > 6) day = day.minus({ days: 1 });
  return day.toISODate()!;
}

/** Choisit un nom dans « Qui fait la modification ? » (R-74). */
export async function chooseAuthor(page: Page, name: string, group = "Qui fait la modification ?") {
  await page.getByRole("group", { name: group }).getByRole("button", { name, exact: true }).click();
}
