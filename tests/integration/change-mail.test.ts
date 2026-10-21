import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadCalendarEvent } from "../../src/modules/calendar/event";
import {
  cancelAppointment,
  createAppointment,
  rescheduleAppointment,
  salonCancelAppointment,
  salonRescheduleAppointment,
} from "../../src/modules/booking";
import { processOutbox, type EmailMessage, type EmailTransport } from "../../src/modules/mail";
import { anonymizeCustomer } from "../../src/modules/customers/profile";
import { COUPE_BARBE, ENES, NOW, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

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

function recorder() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    async send(message) {
      sent.push(message);
    },
  };
  return { transport, sent };
}

const book = () =>
  createAppointment(
    t.db,
    {
      customerId,
      serviceIds: [COUPE_BARBE],
      staffId: ORHAN,
      startsAt: paris("2026-11-10", "10:00"),
      source: "online",
    },
    NOW,
  );

/** Envoie la file et rend les messages, confirmation exclue. */
async function flush() {
  const { transport, sent } = recorder();
  await processOutbox(t.db, { ...options, transport, now: NOW });
  return sent;
}

describe("R-30 : email d'annulation", () => {
  it("part après l'annulation, avec le créneau annulé et un lien pour reprendre rendez-vous", async () => {
    const created = await book();
    await flush(); // la confirmation
    await cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW);
    const sent = await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Votre rendez-vous du mardi 10 novembre est annulé");
    expect(sent[0].html).toContain("Merci de nous avoir prévenus, Thomas");
    expect(sent[0].html).toContain("Mardi 10 novembre 2026 · 10:00");
    expect(sent[0].html).toContain("Coupe &amp; taille de barbe · 28 € · avec Orhan");
    expect(sent[0].html).toContain('href="https://exemple.fr/reservation"');
    expect(sent[0].to.email).toMatch(/@example\.com$/);
    const [row] = await t.sql`select status from email_outbox where type = 'cancellation'`;
    expect(row.status).toBe("sent");
  });

  it("la confirmation encore en attente est abandonnée : le client ne reçoit pas « confirmé » puis « annulé »", async () => {
    const created = await book();
    await cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW);
    const sent = await flush();
    expect(sent.map((m) => m.subject)).toEqual([
      "Votre rendez-vous du mardi 10 novembre est annulé",
    ]);
    const [confirmation] = await t.sql`select status from email_outbox where type = 'confirmation'`;
    expect(confirmation.status).toBe("failed");
  });
});

describe("R-30 : email de modification", () => {
  it("part après le déplacement, avec l'ancien et le nouveau créneau", async () => {
    const created = await book();
    await flush();
    await rescheduleAppointment(
      t.db,
      {
        customerId,
        appointmentId: created.id,
        staffId: ENES,
        startsAt: paris("2026-11-12", "14:30"),
      },
      NOW,
    );
    const sent = await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Votre rendez-vous est déplacé au jeudi 12 novembre");
    expect(sent[0].html).toContain("Mardi 10 novembre · 10:00 · avec Orhan"); // avant, coiffeur changé
    expect(sent[0].html).toContain("Jeudi 12 novembre 2026");
    expect(sent[0].html).toContain("14:30");
    expect(sent[0].html).toContain("avec Enes");
    expect(sent[0].html).toContain(`https://exemple.fr/api/agenda/${created.id}?t=`);
  });

  it("annonce « jusqu'à 48 h avant » pour un créneau lointain, et le salon pour un créneau proche (R-32)", async () => {
    const far = await book();
    await rescheduleAppointment(
      t.db,
      { customerId, appointmentId: far.id, staffId: ORHAN, startsAt: paris("2026-11-12", "11:00") },
      NOW,
    );
    await rescheduleAppointment(
      t.db,
      { customerId, appointmentId: far.id, staffId: ORHAN, startsAt: paris("2026-11-03", "11:00") },
      NOW,
    );
    const sent = (await flush()).filter((m) => m.subject.includes("déplacé"));
    expect(sent).toHaveLength(2);
    const lointain = sent.find((m) => m.subject.includes("jeudi 12 novembre"))!;
    const proche = sent.find((m) => m.subject.includes("mardi 3 novembre"))!;
    expect(lointain.text).toContain("Modifiez-le en ligne jusqu'au");
    expect(proche.text).toContain("Pour tout nouveau changement, appelez le salon");
  });

  it("n'est pas envoyé si le RDV a été annulé entre-temps", async () => {
    const created = await book();
    await rescheduleAppointment(
      t.db,
      {
        customerId,
        appointmentId: created.id,
        staffId: ORHAN,
        startsAt: paris("2026-11-12", "11:00"),
      },
      NOW,
    );
    await cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW);
    const subjects = (await flush()).map((m) => m.subject);
    expect(subjects).toEqual(["Votre rendez-vous du jeudi 12 novembre est annulé"]);
  });
});

describe("R-75 : aucun email n'est envoyé à une fiche supprimée", () => {
  it("l'envoi en attente disparaît avec la fiche", async () => {
    await book();
    await anonymizeCustomer(
      t.db,
      { customerId, actor: { type: "manager", id: null }, onImminent: "cancel" },
      NOW,
    );
    expect(await flush()).toEqual([]);
    expect(await t.sql`select 1 from email_outbox`).toHaveLength(0);
  });
});

describe("R-30 : lien « Ajouter à l'agenda » après un déplacement", () => {
  it("garde le même identifiant d'événement et augmente le numéro de version", async () => {
    const created = await book();
    const before = await loadCalendarEvent(t.db, created.id);
    expect(before).toMatchObject({
      uid: `appointment-${created.id}@elegance-strasbourg`,
      sequence: 0,
    });
    await rescheduleAppointment(
      t.db,
      {
        customerId,
        appointmentId: created.id,
        staffId: ORHAN,
        startsAt: paris("2026-11-12", "11:00"),
      },
      NOW,
    );
    const after = await loadCalendarEvent(t.db, created.id);
    expect(after).toMatchObject({ uid: before!.uid, sequence: 1 });
    expect(after!.startsAt).toEqual(paris("2026-11-12", "11:00"));
  });

  it("un RDV annulé n'a plus d'événement", async () => {
    const created = await book();
    await cancelAppointment(t.db, { customerId, appointmentId: created.id }, NOW);
    expect(await loadCalendarEvent(t.db, created.id)).toBeNull();
  });
});

describe("R-33, R-63, D-52 : emails d'un changement décidé par le salon", () => {
  it("l'annulation par le salon présente des excuses et ne remercie pas le client de l'avoir prévenu", async () => {
    const created = await book();
    await flush();
    await salonCancelAppointment(t.db, { appointmentId: created.id, authorStaffId: ENES }, NOW);
    const sent = await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Votre rendez-vous du mardi 10 novembre est annulé");
    expect(sent[0].html).toContain("Thomas, suite à notre échange, nous avons annulé");
    expect(sent[0].html).not.toContain("Merci de nous avoir prévenus");
    expect(sent[0].to.email).toMatch(/@example\.com$/);
  });

  it("le déplacement par le salon annonce l'ancien et le nouveau créneau avec le texte du salon", async () => {
    const created = await book();
    await flush();
    await salonRescheduleAppointment(
      t.db,
      {
        appointmentId: created.id,
        staffId: ENES,
        startsAt: paris("2026-11-10", "14:30"),
        authorStaffId: ORHAN,
      },
      NOW,
    );
    const sent = await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Votre rendez-vous est déplacé au mardi 10 novembre");
    expect(sent[0].html).toContain("Suite à notre échange, nous avons déplacé votre rendez-vous");
    expect(sent[0].html).toContain("Mardi 10 novembre 2026"); // maintenant
    expect(sent[0].html).toContain("14:30");
    expect(sent[0].html).toContain("avec Enes");
  });

  it("un changement du client garde ses textes habituels", async () => {
    const created = await book();
    await flush();
    await rescheduleAppointment(
      t.db,
      {
        customerId,
        appointmentId: created.id,
        staffId: ENES,
        startsAt: paris("2026-11-10", "14:00"),
      },
      NOW,
    );
    const sent = await flush();
    expect(sent[0].html).toContain("C&#39;est noté, Thomas.");
    expect(sent[0].html).not.toContain("Suite à notre échange");
  });
});
