import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";
import postgres from "postgres";

// Base du serveur de test (scripts/e2e-server.mjs). Les tests s'en servent pour remettre à zéro et pour provoquer des cas
// que l'interface seule ne peut pas produire (créneau pris entre-temps, client bloqué).
export const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54399/postgres", {
  max: 2,
  onnotice: () => {},
});

export async function resetData() {
  await sql.unsafe(
    "truncate appointment_item, appointment, absence, closure, email_outbox, audit_log, customer, rate_limit restart identity cascade",
  );
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

export async function chooseService(page: Page, name: string) {
  await page.getByRole("button", { name: `Choisir ${name}`, exact: true }).click();
}

export async function fillSignUp(page: Page, client: Client, prefix: string) {
  await page.locator(`#${prefix}-firstName`).fill(client.firstName);
  await page.locator(`#${prefix}-lastName`).fill(client.lastName);
  await page.locator(`#${prefix}-phone`).fill(client.phone);
  await page.locator(`#${prefix}-email`).fill(client.email);
  await page.locator(`#${prefix}-password`).fill(client.password);
  await page.getByRole("checkbox").check();
}

/** Parcours jusqu'à l'étape 4 : une coupe, sans préférence, premier créneau libre. */
export async function reachIdentityStep(page: Page) {
  await page.goto("/reservation");
  await chooseService(page, "Coupe homme");
  await page.getByRole("button", { name: /^Continuer/ }).click();
  await page.getByRole("button", { name: "Continuer", exact: true }).click(); // étape 2, « Sans préférence »
  await expect(slotButtons(page).first()).toBeVisible();
  await slotButtons(page).first().click();
  await expect(page.getByRole("heading", { name: "Vos coordonnées" })).toBeVisible();
}

/** Étape 4 par la création d'un compte, jusqu'au récapitulatif. */
export async function signUpAndReachRecap(page: Page, client: Client) {
  await reachIdentityStep(page);
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await fillSignUp(page, client, "step-signup");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Connecté", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Récapitulatif" })).toBeVisible();
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
 * passé, ni à moins de 48 h d'une date précise). `startsAt` : instant ISO.
 */
export async function addAppointment(
  email: string,
  options: {
    startsAt: string;
    staff?: string;
    service?: string;
    status?: string;
  },
): Promise<string> {
  const { startsAt, staff = "Orhan", service = "Coupe homme", status = "confirmed" } = options;
  const [item] =
    await sql`select id, name, price_cents, duration_min from service where name = ${service}`;
  const [row] = await sql`
    insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
    select c.id, s.id, ${startsAt}::timestamptz,
           ${startsAt}::timestamptz + (${item.duration_min} * interval '1 minute'), ${status}, 'online'
    from customer c, staff s
    where lower(c.email) = ${email.toLowerCase()} and s.first_name = ${staff}
    returning id`;
  await sql`
    insert into appointment_item (appointment_id, service_id, name_snapshot, price_cents, duration_min, position)
    values (${row.id}, ${item.id}, ${item.name}, ${item.price_cents}, ${item.duration_min}, 0)`;
  return row.id as string;
}
