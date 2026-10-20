import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAppointment, markNoShow, salonCancelAppointment } from "../../src/modules/booking";
import { setReviewOptOut } from "../../src/modules/customers/review-optout";
import { processOutbox, type EmailMessage, type EmailTransport } from "../../src/modules/mail";
import { scheduleReviewInvitations } from "../../src/modules/mail/review-invitations";
import { reviewOptOutSubject, verifyToken } from "../../src/modules/security/token";
import { COUPE_BARBE, ENES, NOW, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

// R-64 : le lendemain d'un RDV honoré, un email invite le client à laisser un avis.
// Décision du 20 octobre 2026 : un seul bouton vers une page d'avis externe (réglage `review_url`), jamais de note chez nous.

const t = connectTestDb();
let customerId: string;

const REVIEW_URL = "https://avis.exemple.fr/elegance";
const SECRET = "secret-de-test";
const options = { baseUrl: "https://exemple.fr", secret: SECRET };

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql, { name: "Thomas" });
  await t.sql`update salon_settings set review_url = ${REVIEW_URL}`;
});
afterAll(() => t.close());

/** Samedi 7 novembre, 10 h : un RDV de 30 min qui finit à 10 h 30. */
const SATURDAY = "2026-11-07";
const SUNDAY_MORNING = paris("2026-11-08", "07:00"); // « le lendemain »
const book = (overrides: Partial<Parameters<typeof createAppointment>[1]> = {}) =>
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
    NOW,
  );

const invitations = () =>
  t.sql`select * from email_outbox where type = 'review_invitation' order by created_at`;

function recorder() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    async send(message) {
      sent.push(message);
    },
  };
  return { transport, sent };
}

async function run(now: Date) {
  const { transport, sent } = recorder();
  await processOutbox(t.db, { ...options, transport, now });
  return sent.filter((m) => m.subject.startsWith("Merci de votre visite"));
}

describe("R-64 : l'invitation est programmée le lendemain d'un RDV honoré", () => {
  it("met en file, pour 8 h le lendemain, l'invitation d'un RDV terminé la veille et non signalé (R-51)", async () => {
    const created = await book();
    expect(await scheduleReviewInvitations(t.db, SUNDAY_MORNING)).toBe(1);
    const rows = await invitations();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "review_invitation",
      status: "pending",
      appointment_id: created.id,
      dedupe_key: `review:${created.id}`,
    });
    expect(rows[0].next_attempt_at.getTime()).toBe(paris("2026-11-08", "08:00").getTime());
  });

  it("ne programme qu'une fois, même si le cron repasse", async () => {
    await book();
    expect(await scheduleReviewInvitations(t.db, SUNDAY_MORNING)).toBe(1);
    expect(await scheduleReviewInvitations(t.db, SUNDAY_MORNING)).toBe(0);
    expect(await scheduleReviewInvitations(t.db, paris("2026-11-09", "07:00"))).toBe(0);
    expect(await invitations()).toHaveLength(1);
  });

  it("attend le lendemain : rien le jour même, ni pendant le RDV, ni avant", async () => {
    await book();
    expect(await scheduleReviewInvitations(t.db, paris(SATURDAY, "10:15"))).toBe(0); // en cours
    expect(await scheduleReviewInvitations(t.db, paris(SATURDAY, "20:00"))).toBe(0); // le soir même
    expect(await scheduleReviewInvitations(t.db, paris("2026-11-06", "07:00"))).toBe(0); // avant
    expect(await invitations()).toHaveLength(0);
  });

  it("rattrape un cron manqué pendant quelques jours, pas au-delà", async () => {
    await book();
    expect(await scheduleReviewInvitations(t.db, paris("2026-11-10", "07:00"))).toBe(1); // 3 jours après
    await t.sql`delete from email_outbox`;
    expect(await scheduleReviewInvitations(t.db, paris("2026-11-12", "07:00"))).toBe(0); // 5 jours : trop tard
  });

  it("compte aussi un RDV enregistré « honoré » en base", async () => {
    const created = await book();
    await t.sql`update appointment set status = 'honored' where id = ${created.id}`;
    expect(await scheduleReviewInvitations(t.db, SUNDAY_MORNING)).toBe(1);
  });

  it("ne programme rien pour un lapin ni pour un RDV annulé", async () => {
    const lapin = await book();
    await markNoShow(
      t.db,
      { appointmentId: lapin.id, authorStaffId: ENES },
      paris(SATURDAY, "10:20"),
    );
    const annule = await book({ startsAt: paris(SATURDAY, "11:00") });
    await salonCancelAppointment(t.db, { appointmentId: annule.id, authorStaffId: ENES }, NOW);
    expect(await scheduleReviewInvitations(t.db, SUNDAY_MORNING)).toBe(0);
  });

  it("ne programme rien tant que le salon n'a pas renseigné sa page d'avis", async () => {
    await t.sql`update salon_settings set review_url = null`;
    await book();
    expect(await scheduleReviewInvitations(t.db, SUNDAY_MORNING)).toBe(0);
    // Dès que le lien est connu, les RDV de la veille sont invités.
    await t.sql`update salon_settings set review_url = ${REVIEW_URL}`;
    expect(await scheduleReviewInvitations(t.db, SUNDAY_MORNING)).toBe(1);
  });

  it("respecte la demande « ne plus recevoir » et l'absence d'adresse", async () => {
    await book();
    await setReviewOptOut(t.db, customerId);
    expect(await scheduleReviewInvitations(t.db, SUNDAY_MORNING)).toBe(0);

    const other = await createCustomer(t.sql, { name: "Sans mail" });
    await t.sql`update customer set email = null where id = ${other}`;
    await book({
      customerId: other,
      source: "salon",
      createdByStaffId: ENES,
      startsAt: paris(SATURDAY, "11:00"),
    });
    expect(await scheduleReviewInvitations(t.db, SUNDAY_MORNING)).toBe(0);
  });
});

describe("R-64 : l'envoi de l'invitation", () => {
  it("n'envoie rien avant 8 h, puis envoie le message avec un seul bouton vers la page d'avis", async () => {
    const created = await book();
    await scheduleReviewInvitations(t.db, SUNDAY_MORNING);
    expect(await run(SUNDAY_MORNING)).toHaveLength(0);

    const sent = await run(paris("2026-11-08", "08:00"));
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Merci de votre visite, Thomas");
    expect(sent[0].html).toContain("Comment s&#39;est passé votre rendez-vous avec Orhan ?");
    expect(sent[0].html).toContain(`href="${REVIEW_URL}"`);
    expect(sent[0].html).toContain(`https://exemple.fr/reservation?reprendre=${created.id}`);
    expect(sent[0].html).not.toContain("Votre note");
    expect(sent[0].to.email).toMatch(/@example\.com$/);
    expect((await invitations())[0].status).toBe("sent");
  });

  it("le lien de désinscription est signé pour ce client", async () => {
    await book();
    await scheduleReviewInvitations(t.db, SUNDAY_MORNING);
    const [message] = await run(paris("2026-11-08", "08:00"));
    const match = /avis\/desinscription\?c=([0-9a-f-]+)&amp;t=([\w-]+)/.exec(message.html);
    expect(match).not.toBeNull();
    const [, id, token] = match!;
    expect(id).toBe(customerId);
    expect(verifyToken(SECRET, reviewOptOutSubject(id), token)).toBe(true);
    expect(verifyToken(SECRET, reviewOptOutSubject("autre-client"), token)).toBe(false);
  });

  it("abandonne l'invitation d'un RDV signalé lapin entre-temps (D-54 : un lapin se corrige)", async () => {
    const created = await book();
    await scheduleReviewInvitations(t.db, SUNDAY_MORNING);
    await markNoShow(
      t.db,
      { appointmentId: created.id, authorStaffId: ENES },
      paris("2026-11-08", "07:30"),
    );
    expect(await run(paris("2026-11-08", "08:00"))).toHaveLength(0);
    const [row] = await invitations();
    expect(row.status).toBe("failed");
    expect(row.last_error).toContain("honoré");
  });

  it("abandonne l'invitation si le client s'est désabonné depuis", async () => {
    await book();
    await scheduleReviewInvitations(t.db, SUNDAY_MORNING);
    await setReviewOptOut(t.db, customerId);
    expect(await run(paris("2026-11-08", "08:00"))).toHaveLength(0);
    expect((await invitations())[0].status).toBe("failed");
  });

  it("abandonne l'invitation si le lien d'avis a été retiré des réglages", async () => {
    await book();
    await scheduleReviewInvitations(t.db, SUNDAY_MORNING);
    await t.sql`update salon_settings set review_url = null`;
    expect(await run(paris("2026-11-08", "08:00"))).toHaveLength(0);
    expect((await invitations())[0].status).toBe("failed");
  });
});

describe("R-64 : « Ne plus recevoir ces invitations »", () => {
  it("coche la fiche du client, sans toucher au reste, et se rejoue sans effet", async () => {
    await setReviewOptOut(t.db, customerId);
    await setReviewOptOut(t.db, customerId);
    const [row] =
      await t.sql`select review_opt_out, online_booking_blocked from customer where id = ${customerId}`;
    expect(row).toEqual({ review_opt_out: true, online_booking_blocked: false });
    const audit = await t.sql`select action from audit_log where entity_id = ${customerId}`;
    expect(audit.map((a) => a.action)).toEqual(["customer.review_opt_out"]); // une seule trace : le second appel n'a rien changé
  });

  it("ignore un client inconnu", async () => {
    await expect(
      setReviewOptOut(t.db, "00000000-0000-4000-8000-00000000dead"),
    ).resolves.toBeUndefined();
  });
});
