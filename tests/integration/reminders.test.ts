import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { declareAbsence } from "../../src/modules/absences";
import { anonymizeCustomer } from "../../src/modules/customers/profile";
import {
  cancelAppointment,
  createAppointment,
  rescheduleAppointment,
  salonCancelAppointment,
} from "../../src/modules/booking";
import { processOutbox, type EmailMessage, type EmailTransport } from "../../src/modules/mail";
import { reminderDue } from "../../src/modules/mail/reminders";
import { COUPE_BARBE, ENES, NOW, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

// R-61 : un rappel part 72 h avant, pour les RDV pris plus tôt, avec la date limite de modification.

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
const HOUR = 3_600_000;

function recorder() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    async send(message) {
      sent.push(message);
    },
  };
  return { transport, sent };
}

/** NOW = lundi 2 novembre 8 h. Un RDV le samedi 7 novembre à 10 h est à plus de 72 h. */
const SATURDAY = "2026-11-07";

const book = (overrides: Partial<Parameters<typeof createAppointment>[1]> = {}, now: Date = NOW) =>
  createAppointment(
    t.db,
    {
      customerId,
      serviceIds: [COUPE_BARBE],
      staffId: ORHAN,
      startsAt: paris(SATURDAY, "10:00"),
      source: "online",
      ...overrides,
    },
    now,
  );

const reminders = () =>
  t.sql`select * from email_outbox where type = 'reminder' order by created_at`;

async function run(now: Date) {
  const { transport, sent } = recorder();
  const result = await processOutbox(t.db, { ...options, transport, now });
  return { result, sent: sent.filter((m) => m.subject.startsWith("Rappel")) };
}

describe("R-61, D-64 : avec le réglage du salon, le rappel part 24 h avant", () => {
  it("programme le rappel la veille, à l'heure du RDV", async () => {
    await t.sql`update salon_settings set reminder_hours = default`;
    const created = await book();
    const rows = await reminders();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ appointment_id: created.id });
    expect(rows[0].next_attempt_at.getTime()).toBe(paris(SATURDAY, "10:00").getTime() - 24 * HOUR);
  });
});

describe("R-61 : un rappel est programmé 72 h avant le rendez-vous (délai réglé à 72 h)", () => {
  it("quand le RDV est pris plus de 72 h à l'avance, met un rappel en file pour J-72 h, sans rien envoyer", async () => {
    const created = await book();
    const rows = await reminders();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "reminder",
      status: "pending",
      appointment_id: created.id,
    });
    expect(rows[0].next_attempt_at.getTime()).toBe(paris(SATURDAY, "10:00").getTime() - 72 * HOUR);
    expect(rows[0].payload).toEqual({ startsAt: paris(SATURDAY, "10:00").toISOString() });
  });

  it("n'envoie pas le rappel avant l'heure prévue, puis l'envoie à l'heure", async () => {
    await book();
    const dueAt = paris(SATURDAY, "10:00").getTime() - 72 * HOUR;
    const early = await run(new Date(dueAt - 60_000));
    expect(early.sent).toHaveLength(0);
    const onTime = await run(new Date(dueAt));
    expect(onTime.sent).toHaveLength(1);
    expect((await reminders())[0].status).toBe("sent");
  });

  it("n'en met pas pour un RDV pris moins de 72 h avant : « pour les RDV pris plus tôt »", async () => {
    await book({ startsAt: paris("2026-11-04", "10:00") }); // mercredi, dans 50 h
    expect(await reminders()).toHaveLength(0);
    await book({ startsAt: paris("2026-11-05", "10:00") }); // jeudi 10 h : exactement 74 h → programmé
    expect(await reminders()).toHaveLength(1);
  });

  it("n'en met pas pour un RDV pris exactement à 72 h : le rappel serait aussitôt dû", async () => {
    // Mercredi 4 novembre 10 h pour samedi 7 novembre 10 h : 72 h pile.
    await book({}, paris("2026-11-04", "10:00"));
    expect(await reminders()).toHaveLength(0);
  });

  it("vaut aussi pour un RDV pris par le salon", async () => {
    await book({ source: "salon", createdByStaffId: ENES });
    expect(await reminders()).toHaveLength(1);
  });

  it("utilise le délai des réglages", async () => {
    await t.sql`update salon_settings set reminder_hours = 24`;
    await book();
    const [row] = await reminders();
    expect(row.next_attempt_at.getTime()).toBe(paris(SATURDAY, "10:00").getTime() - 24 * HOUR);
  });

  it("n'écrit aucun rappel quand la réservation est refusée", async () => {
    await expect(book({ startsAt: paris("2026-11-09", "10:00") })).rejects.toMatchObject({
      code: "closed",
    });
    expect(await reminders()).toHaveLength(0);
  });

  it("ne retient pas le rappel dans l'envoi immédiat de la confirmation", async () => {
    await book();
    const { result } = await run(NOW);
    expect(result.sent).toBe(1); // la confirmation seulement
    expect((await reminders())[0].status).toBe("pending");
  });
});

describe("R-61 : le contenu du rappel", () => {
  it("donne le créneau, la prestation, le coiffeur et la date limite de modification", async () => {
    await book();
    const dueAt = new Date(paris(SATURDAY, "10:00").getTime() - 72 * HOUR); // mercredi 4 novembre, 10 h
    const { sent } = await run(dueAt);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Rappel : votre rendez-vous samedi à 10:00");
    expect(sent[0].html).toContain("Dans 3 jours");
    expect(sent[0].html).toContain("Votre rendez-vous approche, Thomas.");
    expect(sent[0].html).toContain("Coupe &amp; taille de barbe · 30 min");
    expect(sent[0].html).toContain("avec Orhan");
    expect(sent[0].html).toContain("https://exemple.fr/compte/rendez-vous");
    expect(sent[0].html).toContain("https://exemple.fr/email/logo.png");
    // Samedi 10 h − 48 h = jeudi 5 novembre, 10 h.
    expect(sent[0].text).toContain("jusqu'au jeudi 5 novembre, 10:00");
    expect(sent[0].to.email).toMatch(/@example\.com$/);
  });

  it("renvoie vers le salon quand la date limite est déjà passée à l'envoi (cron en retard)", async () => {
    await book();
    const late = paris("2026-11-05", "11:00"); // jeudi 11 h : plus modifiable en ligne
    const { sent } = await run(late);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("appelez le salon au 03 88 97 74 68");
    expect(sent[0].text).not.toContain("jusqu'au");
  });

  it("dit « Demain » quand le cron passe la veille", async () => {
    await book();
    const { sent } = await run(paris("2026-11-06", "08:00"));
    expect(sent[0].html).toContain("Demain");
  });
});

describe("R-61 : un rappel ne part que pour un RDV qui tient encore", () => {
  it("est abandonné quand le client annule", async () => {
    const created = await book();
    await cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW);
    const { sent } = await run(paris("2026-11-05", "07:00"));
    expect(sent).toHaveLength(0);
    const [row] = await reminders();
    expect(row.status).toBe("failed");
    expect(row.last_error).toContain("annulé");
  });

  it("est abandonné quand le salon annule", async () => {
    const created = await book();
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW);
    const { sent } = await run(paris("2026-11-05", "07:00"));
    expect(sent).toHaveLength(0);
    expect((await reminders())[0].status).toBe("failed");
  });

  it("est remplacé quand le RDV est déplacé : l'ancien rappel ne part pas, le nouveau part à J-72 h du nouveau créneau", async () => {
    const created = await book();
    await rescheduleAppointment(
      t.db,
      {
        customerId,
        appointmentId: created.id,
        staffId: ORHAN,
        startsAt: paris("2026-11-10", "14:00"),
      },
      NOW,
    );
    const rows = await reminders();
    expect(rows).toHaveLength(2);
    const [old, replacement] = rows;
    expect(replacement.next_attempt_at.getTime()).toBe(
      paris("2026-11-10", "14:00").getTime() - 72 * HOUR,
    );

    // À l'échéance de l'ancien rappel : rien ne part, il est abandonné.
    const first = await run(new Date(old.next_attempt_at.getTime() + 60_000));
    expect(first.sent).toHaveLength(0);
    const after = await reminders();
    expect(after[0].status).toBe("failed");
    expect(after[0].last_error).toContain("déplacé");

    // À l'échéance du nouveau : il part, avec le nouveau créneau.
    const second = await run(new Date(replacement.next_attempt_at.getTime() + 60_000));
    expect(second.sent).toHaveLength(1);
    expect(second.sent[0].subject).toBe("Rappel : votre rendez-vous mardi à 14:00");
  });

  it("n'en programme pas quand le RDV est déplacé à moins de 72 h", async () => {
    const created = await book();
    await rescheduleAppointment(
      t.db,
      {
        customerId,
        appointmentId: created.id,
        staffId: ORHAN,
        startsAt: paris("2026-11-05", "10:00"),
      },
      paris("2026-11-03", "09:00"), // le nouveau créneau est à 49 h : moins de 72 h, donc pas de rappel
    );
    const rows = await reminders();
    expect(rows).toHaveLength(1); // seulement l'ancien
    const { sent } = await run(paris("2026-11-05", "07:00"));
    expect(sent).toHaveLength(0);
  });

  it("n'est pas envoyé pour un RDV déjà passé", async () => {
    await book();
    const { sent } = await run(paris("2026-11-07", "12:00"));
    expect(sent).toHaveLength(0);
    expect((await reminders())[0].status).toBe("failed");
  });

  it("est repoussé, sans compter comme un essai, tant que le RDV est « à traiter » (absence du coiffeur)", async () => {
    await book();
    await declareAbsence(
      t.db,
      {
        staffId: ORHAN,
        startDate: SATURDAY,
        endDate: SATURDAY,
        startTime: "09:00",
        endTime: "12:00",
        reason: "Congé",
      },
      ENES,
      NOW,
    );
    const dueAt = new Date(paris(SATURDAY, "10:00").getTime() - 72 * HOUR);
    const first = await run(dueAt);
    expect(first.sent).toHaveLength(0);
    const [row] = await reminders();
    expect(row.status).toBe("pending"); // ni envoyé ni abandonné : le client attend le traitement du gérant
    expect(row.attempts).toBe(0);
    expect(row.next_attempt_at.getTime()).toBeGreaterThan(dueAt.getTime());

    // L'absence disparaît : le RDV tient de nouveau, le rappel part à la reprise.
    await t.sql`delete from absence`;
    const later = new Date(row.next_attempt_at.getTime() + 60_000);
    const second = await run(later);
    expect(second.sent).toHaveLength(1);
  });

  it("dans un même passage, seul le RDV à traiter est repoussé : les autres rappels partent", async () => {
    await book(); // samedi 10 h avec Orhan
    await book({ staffId: ENES, startsAt: paris(SATURDAY, "11:00") });
    await declareAbsence(
      t.db,
      {
        staffId: ORHAN,
        startDate: SATURDAY,
        endDate: SATURDAY,
        startTime: "09:00",
        endTime: "10:45",
        reason: "Congé",
      },
      ENES,
      NOW,
    );
    const { sent } = await run(new Date(paris(SATURDAY, "11:00").getTime() - 72 * HOUR));
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Rappel : votre rendez-vous samedi à 11:00");
    const rows = await reminders();
    expect(rows.map((r) => r.status)).toEqual(["pending", "sent"]); // Orhan attend, Enes est parti
  });

  it("disparaît avec la fiche client supprimée (R-75)", async () => {
    await book();
    await anonymizeCustomer(
      t.db,
      { customerId, actor: { type: "manager", id: null }, onImminent: "cancel" },
      NOW,
    );
    expect(await reminders()).toHaveLength(0);
    const { sent } = await run(paris("2026-11-05", "07:00"));
    expect(sent).toHaveLength(0);
  });

  it("n'en met pas quand le client n'a pas d'adresse email", async () => {
    await t.sql`update customer set email = null`;
    await book({ source: "salon", createdByStaffId: ENES });
    expect(await reminders()).toHaveLength(0);
  });
});

describe("R-61 : la règle du délai (fonction pure)", () => {
  const start = paris(SATURDAY, "10:00");

  it("renvoie l'instant d'envoi pour un RDV pris plus de 72 h avant", () => {
    expect(reminderDue(start, NOW, 72)?.getTime()).toBe(start.getTime() - 72 * HOUR);
  });

  it("renvoie null pour un RDV pris 72 h avant ou moins", () => {
    expect(reminderDue(start, new Date(start.getTime() - 72 * HOUR), 72)).toBeNull();
    expect(reminderDue(start, new Date(start.getTime() - 10 * HOUR), 72)).toBeNull();
  });

  it("renvoie null sans délai (0) : pas de rappel", () => {
    expect(reminderDue(start, NOW, 0)).toBeNull();
  });
});
