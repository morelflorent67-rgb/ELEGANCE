import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  BACKOFF_MINUTES,
  EmailSendError,
  MAX_ATTEMPTS,
  processOutbox,
  type EmailMessage,
  type EmailTransport,
} from "../../src/modules/mail";
import { loadCalendarEvent } from "../../src/modules/calendar/event";
import { createAppointment } from "../../src/modules/booking";
import {
  COUPE,
  COUPE_BARBE,
  NOW,
  ORHAN,
  TAILLAGE_BARBE,
  connectTestDb,
  createCustomer,
  paris,
} from "./helpers";

const t = connectTestDb();
let customerId: string;

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql, { name: "Thomas" });
  // Scénarios écrits avec les délais d'origine (48 h, 72 h) : ils vérifient que le délai vient du réglage. Les valeurs
  // actuelles (1 h et 24 h, D-63 et D-64) ont leurs propres tests.
  await t.sql`update salon_settings set change_cutoff_hours = 48, reminder_hours = 72`;
});
afterAll(() => t.close());

const options = { baseUrl: "https://exemple.fr", secret: "secret-de-test" };

function fakeTransport(behaviour: (message: EmailMessage, call: number) => void = () => {}) {
  const sent: EmailMessage[] = [];
  let calls = 0;
  const transport: EmailTransport = {
    async send(message) {
      calls++;
      behaviour(message, calls);
      sent.push(message);
    },
  };
  return { transport, sent, calls: () => calls };
}

const book = (overrides: Partial<Parameters<typeof createAppointment>[1]> = {}) =>
  createAppointment(
    t.db,
    {
      customerId,
      serviceIds: [COUPE_BARBE],
      staffId: ORHAN,
      startsAt: paris("2026-11-10", "10:00"),
      source: "online",
      ...overrides,
    },
    NOW,
  );

// Ces tests suivent l'email de confirmation ; les rappels programmés avec le RDV ont les leurs (reminders.test.ts).
const outbox = () => t.sql`select * from email_outbox where type <> 'reminder' order by created_at`;

describe("R-60 : un email de confirmation part dès la réservation", () => {
  it("met l'email en file dans la même transaction que le RDV, sans rien envoyer", async () => {
    const created = await book();
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "confirmation",
      status: "pending",
      attempts: 0,
      appointment_id: created.id,
      dedupe_key: `confirmation:${created.id}`,
    });
    const [{ email }] = await t.sql`select email from customer where id = ${customerId}`;
    expect(rows[0].to_email).toBe(email);
  });

  it("n'écrit aucun email quand la réservation est refusée", async () => {
    await expect(book({ startsAt: paris("2026-11-09", "10:00") })).rejects.toMatchObject({
      code: "closed",
    });
    expect(await outbox()).toHaveLength(0);
  });

  it("envoie le message rendu, avec les liens signés et le logo, puis marque l'email envoyé", async () => {
    const created = await book();
    const { transport, sent } = fakeTransport();
    const result = await processOutbox(t.db, { ...options, transport, now: NOW });
    expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Votre rendez-vous du mardi 10 novembre est confirmé");
    expect(sent[0].html).toContain("À mardi, Thomas.");
    expect(sent[0].html).toContain("Coupe &amp; taille de barbe · 30 min");
    expect(sent[0].html).toContain("avec Orhan");
    expect(sent[0].html).toContain("https://exemple.fr/email/logo.png");
    expect(sent[0].html).toContain(`https://exemple.fr/api/agenda/${created.id}?t=`);
    expect(sent[0].html).toContain("https://exemple.fr/compte/rendez-vous");

    const [row] = await outbox();
    expect(row.status).toBe("sent");
    expect(row.sent_at).not.toBeNull();
  });

  it("ne renvoie pas un email déjà envoyé", async () => {
    await book();
    const { transport, calls } = fakeTransport();
    await processOutbox(t.db, { ...options, transport, now: NOW });
    await processOutbox(t.db, { ...options, transport, now: NOW });
    expect(calls()).toBe(1);
  });

  it("indique en ligne la date limite de modification (R-30) quand le RDV est pris assez tôt", async () => {
    await book({ startsAt: paris("2026-11-10", "10:00") });
    const { transport, sent } = fakeTransport();
    await processOutbox(t.db, { ...options, transport, now: NOW });
    expect(sent[0].text).toContain("jusqu'au dimanche 8 novembre, 10:00");
  });

  it("renvoie vers le salon quand le RDV est pris moins de 48 h avant (R-32)", async () => {
    await book({ startsAt: paris("2026-11-03", "10:00") }); // pris lundi 8 h, pour mardi 10 h
    const { transport, sent } = fakeTransport();
    await processOutbox(t.db, { ...options, transport, now: NOW });
    expect(sent[0].text).toContain("Pour tout changement, appelez le salon");
  });

  it("utilise le délai de modification des réglages", async () => {
    await t.sql`update salon_settings set change_cutoff_hours = 24`;
    await book({ startsAt: paris("2026-11-10", "10:00") });
    const { transport, sent } = fakeTransport();
    await processOutbox(t.db, { ...options, transport, now: NOW });
    expect(sent[0].text).toContain("jusqu'au lundi 9 novembre, 10:00");
  });
});

describe("principe 7 : une panne d'email ne bloque jamais un RDV, et l'envoi est repris", () => {
  it("le RDV existe même si aucun envoi n'a jamais lieu", async () => {
    await book();
    const [{ n }] =
      await t.sql`select count(*)::int as n from appointment where status = 'confirmed'`;
    expect(n).toBe(1);
    expect((await outbox())[0].status).toBe("pending");
  });

  it("une panne passagère reprogramme l'envoi avec un délai croissant", async () => {
    await book();
    const { transport } = fakeTransport(() => {
      throw new EmailSendError("Brevo 503", false);
    });
    let now = NOW;
    for (let attempt = 1; attempt <= BACKOFF_MINUTES.length; attempt++) {
      const result = await processOutbox(t.db, { ...options, transport, now });
      expect(result).toEqual({ sent: 0, retried: 1, failed: 0 });
      const [row] = await outbox();
      expect(row.attempts).toBe(attempt);
      expect(row.status).toBe("pending");
      expect(row.last_error).toBe("Brevo 503");
      expect(row.next_attempt_at.getTime() - now.getTime()).toBe(
        BACKOFF_MINUTES[attempt - 1] * 60_000,
      );
      now = row.next_attempt_at;
    }
  });

  it("n'essaie pas avant l'heure prévue", async () => {
    await book();
    const failing = fakeTransport(() => {
      throw new EmailSendError("Brevo 503", false);
    });
    await processOutbox(t.db, { ...options, transport: failing.transport, now: NOW });
    const early = new Date(NOW.getTime() + 30_000);
    const result = await processOutbox(t.db, {
      ...options,
      transport: failing.transport,
      now: early,
    });
    expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(failing.calls()).toBe(1);
  });

  it("réussit à la reprise quand la panne est finie", async () => {
    await book();
    let down = true;
    const { transport, sent } = fakeTransport(() => {
      if (down) throw new EmailSendError("Brevo 503", false);
    });
    await processOutbox(t.db, { ...options, transport, now: NOW });
    down = false;
    const later = new Date(NOW.getTime() + 2 * 60_000);
    expect(await processOutbox(t.db, { ...options, transport, now: later })).toEqual({
      sent: 1,
      retried: 0,
      failed: 0,
    });
    expect(sent).toHaveLength(1);
    expect((await outbox())[0]).toMatchObject({ status: "sent", last_error: null });
  });

  it("après le dernier essai, l'email passe en échec définitif", async () => {
    await book();
    const { transport } = fakeTransport(() => {
      throw new EmailSendError("Brevo 503", false);
    });
    let now = NOW;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await processOutbox(t.db, { ...options, transport, now });
      const [row] = await outbox();
      now = new Date(row.next_attempt_at.getTime());
    }
    const [row] = await outbox();
    expect(row).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(await processOutbox(t.db, { ...options, transport, now })).toEqual({
      sent: 0,
      retried: 0,
      failed: 0,
    });
  });

  it("un refus permanent (adresse ou clé refusée) n'est pas réessayé", async () => {
    await book();
    const { transport, calls } = fakeTransport(() => {
      throw new EmailSendError("Brevo 401", true);
    });
    expect(await processOutbox(t.db, { ...options, transport, now: NOW })).toEqual({
      sent: 0,
      retried: 0,
      failed: 1,
    });
    expect(calls()).toBe(1);
    expect((await outbox())[0]).toMatchObject({ status: "failed", last_error: "Brevo 401" });
  });

  it("deux traitements simultanés n'envoient l'email qu'une seule fois", async () => {
    await book();
    const { transport, calls } = fakeTransport();
    await Promise.all([
      processOutbox(t.db, { ...options, transport, now: NOW }),
      processOutbox(t.db, { ...options, transport, now: NOW }),
      processOutbox(t.db, { ...options, transport, now: NOW }),
    ]);
    expect(calls()).toBe(1);
  });

  it("un email pris en charge n'est repris par personne d'autre avant la fin de son délai", async () => {
    await book();
    const crash = fakeTransport(() => {
      throw new Error("plantage inattendu");
    });
    await processOutbox(t.db, { ...options, transport: crash.transport, now: NOW });
    // Le processus plante en plein envoi : l'email reste réservé quelques minutes, puis redevient disponible.
    const [row] = await outbox();
    expect(row.next_attempt_at.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("envoi immédiat : ne traite que les emails demandés", async () => {
    await book();
    const second = await book({ startsAt: paris("2026-11-10", "11:00"), serviceIds: [COUPE] });
    const rows = await outbox();
    const target = rows.find((r) => r.appointment_id === second.id)!;
    const { transport, sent } = fakeTransport();
    await processOutbox(t.db, { ...options, transport, now: NOW, ids: [target.id] });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("mardi 10 novembre");
    const statuses = Object.fromEntries((await outbox()).map((r) => [r.appointment_id, r.status]));
    expect(statuses[second.id]).toBe("sent");
    expect(Object.values(statuses).filter((s) => s === "pending")).toHaveLength(1);
  });

  it("n'envoie pas la confirmation d'un RDV annulé entre-temps", async () => {
    const created = await book();
    await t.sql`update appointment set status = 'cancelled_by_customer' where id = ${created.id}`;
    const { transport, calls } = fakeTransport();
    expect(await processOutbox(t.db, { ...options, transport, now: NOW })).toEqual({
      sent: 0,
      retried: 0,
      failed: 1,
    });
    expect(calls()).toBe(0);
    expect((await outbox())[0].last_error).toContain("annulé");
  });
});

describe("file d'envoi : un même message ne part pas deux fois", () => {
  it("refuse un doublon de clé", async () => {
    const created = await book();
    await expect(
      t.sql`insert into email_outbox (type, to_email, appointment_id, dedupe_key)
            values ('confirmation', 'x@y.fr', ${created.id}, ${`confirmation:${created.id}`})`,
    ).rejects.toMatchObject({ code: "23505" });
  });
});

describe("R-60 : lien « Ajouter à l'agenda »", () => {
  it("décrit le RDV avec toutes ses prestations", async () => {
    const created = await book({ serviceIds: [COUPE, TAILLAGE_BARBE], staffId: ORHAN });
    const event = await loadCalendarEvent(t.db, created.id);
    expect(event).toMatchObject({
      uid: `appointment-${created.id}@elegance-strasbourg`,
      summary: "Coupe homme + Taillage barbe chez Elegance Strasbourg",
      location: "162 route de Bischwiller, 67300 Schiltigheim",
    });
    expect(event!.startsAt).toEqual(paris("2026-11-10", "10:00"));
    expect(event!.endsAt).toEqual(paris("2026-11-10", "10:45"));
  });

  it("n'existe plus pour un RDV annulé ou inconnu", async () => {
    const created = await book();
    await t.sql`update appointment set status = 'cancelled_by_salon' where id = ${created.id}`;
    expect(await loadCalendarEvent(t.db, created.id)).toBeNull();
    expect(await loadCalendarEvent(t.db, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });
});
