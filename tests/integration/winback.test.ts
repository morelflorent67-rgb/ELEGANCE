import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAppointment } from "../../src/modules/booking";
import { processOutbox, type EmailMessage, type EmailTransport } from "../../src/modules/mail";
import { scheduleWinbackEmails } from "../../src/modules/mail/winback";
import { setWinbackOptOut } from "../../src/modules/customers/winback-optout";
import { verifyToken, winbackOptOutSubject } from "../../src/modules/security/token";
import { COUPE_BARBE, ENES, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

// R-87, R-88 : 15 jours après son dernier RDV honoré, un client inscrit sans RDV à venir reçoit une fois
// « Nous serions ravis de vous revoir » (D-74), avec un lien pour ne plus en recevoir.

const t = connectTestDb();
const SECRET = "secret-de-test";
let customerId: string;

/** Mardi 13 octobre 2026, 10 h : le RDV honoré (il finit à 10 h 30). */
const VISIT = paris("2026-10-13", "10:00");
/** 15 jours plus tard, il est dû ; 14 jours, non. */
const DUE = paris("2026-10-29", "12:00");
const TOO_EARLY = paris("2026-10-27", "12:00");

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql, { name: "Thomas" });
});
afterAll(() => t.close());

async function visit(id: string = customerId, startsAt: Date = VISIT) {
  const [row] = await t.sql`
    insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
    values (${id}, ${ORHAN}, ${startsAt}, ${new Date(startsAt.getTime() + 30 * 60_000)}, 'confirmed', 'salon')
    returning id`;
  await t.sql`insert into appointment_item (appointment_id, service_id, name_snapshot, price_cents, duration_min, position)
              values (${row.id}, ${COUPE_BARBE}, 'Coupe & taille de barbe', 2800, 30, 0)`;
  return row.id as string;
}
const winbacks = () => t.sql`select * from email_outbox where type = 'winback' order by created_at`;

async function run(now: Date) {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = { send: async (m) => void sent.push(m) };
  await processOutbox(t.db, { baseUrl: "https://exemple.fr", secret: SECRET, transport, now });
  return sent.filter((m) => m.subject.startsWith("Nous serions ravis"));
}

describe("relance après 15 jours (R-87)", () => {
  it("programme un email 15 jours après le dernier RDV honoré, pas avant", async () => {
    const id = await visit();
    expect(await scheduleWinbackEmails(t.db, TOO_EARLY)).toBe(0);
    expect(await scheduleWinbackEmails(t.db, DUE)).toBe(1);
    const [row] = await winbacks();
    expect(row.appointment_id).toBe(id);
    expect(row.status).toBe("pending");
  });

  it("n'en programme qu'un par visite, même si le cron passe plusieurs jours de suite", async () => {
    await visit();
    await scheduleWinbackEmails(t.db, DUE);
    expect(await scheduleWinbackEmails(t.db, DUE)).toBe(0);
    expect(await scheduleWinbackEmails(t.db, paris("2026-10-30", "12:00"))).toBe(0);
    expect(await winbacks()).toHaveLength(1);
  });

  it("rattrape un cron manqué quelques jours, mais pas au-delà", async () => {
    await visit();
    expect(await scheduleWinbackEmails(t.db, paris("2026-11-12", "12:00"))).toBe(0);
    expect(await scheduleWinbackEmails(t.db, paris("2026-10-30", "12:00"))).toBe(1);
  });

  it("ne relance pas un client qui a déjà un RDV à venir", async () => {
    await visit();
    await t.sql`insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
                values (${customerId}, ${ENES}, ${paris("2026-11-05", "10:00")}, ${paris("2026-11-05", "10:30")}, 'confirmed', 'salon')`;
    expect(await scheduleWinbackEmails(t.db, DUE)).toBe(0);
  });

  it("ne relance que pour la dernière visite : une visite plus récente repousse la relance", async () => {
    await visit();
    await visit(customerId, paris("2026-10-22", "10:00"));
    expect(await scheduleWinbackEmails(t.db, DUE)).toBe(0);
  });

  it("ne relance ni un lapin, ni un RDV annulé", async () => {
    const id = await visit();
    await t.sql`update appointment set status = 'no_show' where id = ${id}`;
    expect(await scheduleWinbackEmails(t.db, DUE)).toBe(0);
    await t.sql`update appointment set status = 'cancelled_by_customer' where id = ${id}`;
    expect(await scheduleWinbackEmails(t.db, DUE)).toBe(0);
  });

  it("ne relance pas une fiche sans compte, un client désinscrit, bloqué ou supprimé", async () => {
    const noAccount = await createCustomer(t.sql, { withoutAccount: true });
    const optedOut = await createCustomer(t.sql);
    const blocked = await createCustomer(t.sql, { blocked: true });
    const deleted = await createCustomer(t.sql);
    for (const [i, id] of [noAccount, optedOut, blocked, deleted].entries()) {
      await visit(id, new Date(VISIT.getTime() + i * 3_600_000)); // une heure d'écart : même coiffeur
    }
    await setWinbackOptOut(t.db, optedOut, true);
    await t.sql`update customer set anonymized_at = now(), email = null where id = ${deleted}`;
    expect(await scheduleWinbackEmails(t.db, DUE)).toBe(0);
  });

  it("le délai est un réglage (winback_after_days)", async () => {
    await visit();
    await t.sql`update salon_settings set winback_after_days = 30`;
    expect(await scheduleWinbackEmails(t.db, DUE)).toBe(0);
    expect(await scheduleWinbackEmails(t.db, paris("2026-11-13", "12:00"))).toBe(1);
  });
});

describe("envoi et désinscription (R-88)", () => {
  it("envoie un email avec un seul bouton « Réserver », « Reprendre le même RDV » et un lien de désinscription signé", async () => {
    const id = await visit();
    await scheduleWinbackEmails(t.db, DUE);
    const [mail] = await run(DUE);
    expect(mail.subject).toBe("Nous serions ravis de vous revoir, Thomas");
    expect(mail.html).toContain("Réserver à nouveau");
    expect(mail.html).toContain(`https://exemple.fr/reservation?reprendre=${id}`);
    const match = /relance\/desinscription\?c=([^&"]+)&amp;t=([^"]+)"/.exec(mail.html);
    expect(match).toBeTruthy();
    expect(match![1]).toBe(customerId);
    expect(verifyToken(SECRET, winbackOptOutSubject(customerId), match![2])).toBe(true);
    expect(mail.html).not.toContain("Prochains horaires");
  });

  it("revérifie à l'envoi : un RDV pris depuis, ou une désinscription, annule la relance", async () => {
    await visit();
    await scheduleWinbackEmails(t.db, DUE);
    await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE_BARBE],
        staffId: ORHAN,
        startsAt: paris("2026-11-03", "10:00"),
        source: "online",
      },
      DUE,
    );
    expect(await run(DUE)).toHaveLength(0);
    const [row] = await winbacks();
    expect(row.status).toBe("failed");
    expect(row.last_error).toContain("déjà prévu");
  });

  it("une désinscription faite après la mise en file empêche l'envoi", async () => {
    await visit();
    await scheduleWinbackEmails(t.db, DUE);
    await setWinbackOptOut(t.db, customerId, true);
    expect(await run(DUE)).toHaveLength(0);
  });

  it("ne part pas avant 8 h, heure de Paris", async () => {
    await visit();
    await scheduleWinbackEmails(t.db, paris("2026-10-29", "06:30"));
    expect(await run(paris("2026-10-29", "06:30"))).toHaveLength(0);
    expect(await run(paris("2026-10-29", "08:05"))).toHaveLength(1);
  });
});
