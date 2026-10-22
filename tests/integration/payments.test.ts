import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import {
  adjustAppointmentAmount,
  createAppointment,
  markNoShow,
  salonCancelAppointment,
} from "../../src/modules/booking";
import { loadDashboard } from "../../src/modules/dashboard";
import {
  cancelPayment,
  expireStalePayments,
  getTerminalStatus,
  latestPaymentsFor,
  pairTerminal,
  PAYMENT_TIMEOUT_MINUTES,
  ProviderError,
  refreshPayment,
  settleByReference,
  startPayment,
  unpairTerminal,
} from "../../src/modules/payments";
import { createFakeTerminal } from "../../src/modules/payments/fake";
import { COUPE, ENES, NOW, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

// R-89 à R-93 : l'encaissement au terminal SumUp Solo (D-105). Le faux terminal joue le client qui paie, ou pas.

const t = connectTestDb();
const terminal = createFakeTerminal();
const RETURN_URL = "https://exemple.test/api/sumup/webhook/secret";
/** Samedi 7 novembre 2026, 18 h : les RDV du matin sont terminés. */
const EVENING = paris("2026-11-07", "18:00");
let customerId: string;

beforeEach(async () => {
  await t.reset();
  terminal.reset();
  customerId = await createCustomer(t.sql, { name: "Thomas" });
  await t.sql`update salon_settings set max_upcoming_per_customer = 50,
              payment_merchant_code = 'MABC1234', payment_reader_id = 'rdr-1'`;
});
afterAll(() => t.close());

const book = (time: string, serviceIds: string[] = [COUPE]) =>
  createAppointment(
    t.db,
    {
      customerId,
      serviceIds,
      staffId: ORHAN,
      startsAt: paris("2026-11-07", time),
      source: "salon",
      createdByStaffId: ENES,
    },
    NOW,
  );

const pay = (appointmentId: string, now: Date = EVENING, authorStaffId = ENES) =>
  startPayment(t.db, terminal, { appointmentId, authorStaffId, returnUrl: RETURN_URL }, now);

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const appointmentRow = async (id: string) =>
  (await t.sql`select adjusted_amount_cents from appointment where id = ${id}`)[0];
const revenue = async () =>
  (await loadDashboard(t.db, { kind: "day", date: "2026-11-07" }, EVENING)).totals.revenueCents;

describe("R-89 : envoyer le montant de la fiche au terminal", () => {
  it("envoie le prix de la carte, signé d'un prénom, avec l'adresse de rappel", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    expect(started).toMatchObject({ status: "pending", amountCents: 1800, appointmentId: a.id });
    expect(terminal.sent).toHaveLength(1);
    expect(terminal.sent[0]).toMatchObject({ amountCents: 1800, returnUrl: RETURN_URL });
    const [row] = await t.sql`select started_by_staff_id, provider_reference from payment`;
    expect(row.started_by_staff_id).toBe(ENES);
    expect(row.provider_reference).toBe(terminal.sent[0].reference);
    const [entry] = await t.sql`select actor_id, after from audit_log where action = 'payment.started'`;
    expect(entry.actor_id).toBe(ENES);
  });

  it("envoie le montant corrigé quand il y en a un (R-53)", async () => {
    const a = await book("10:00");
    await adjustAppointmentAmount(
      t.db,
      { appointmentId: a.id, authorStaffId: ENES, amountCents: 1500 },
      EVENING,
    );
    expect((await pay(a.id)).amountCents).toBe(1500);
    expect(terminal.sent[0].amountCents).toBe(1500);
  });

  it("refuse sans auteur ou avec un auteur inconnu (R-74)", async () => {
    const a = await book("10:00");
    await expectRefused(pay(a.id, EVENING, ""), "author_required");
    await expectRefused(pay(a.id, EVENING, "00000000-0000-4000-8000-00000000ffff"), "unknown_author");
    expect(terminal.sent).toHaveLength(0);
  });

  it("refuse un RDV qui n'a pas commencé, un lapin, un RDV annulé ou inconnu", async () => {
    const future = await book("10:00");
    await expectRefused(pay(future.id, paris("2026-11-07", "09:00")), "not_started");

    const lapin = await book("11:00");
    await markNoShow(t.db, { appointmentId: lapin.id, authorStaffId: ENES }, paris("2026-11-07", "11:10"));
    await expectRefused(pay(lapin.id), "not_modifiable");

    const annule = await book("14:00");
    await salonCancelAppointment(t.db, { appointmentId: annule.id, authorStaffId: ENES }, NOW);
    await expectRefused(pay(annule.id), "not_modifiable");

    await expectRefused(pay("00000000-0000-4000-8000-00000000eeee"), "appointment_not_found");
    expect(terminal.sent).toHaveLength(0);
  });

  it("refuse un montant à 0 € : il n'y a rien à encaisser", async () => {
    const a = await book("10:00");
    await adjustAppointmentAmount(t.db, { appointmentId: a.id, authorStaffId: ENES, amountCents: 0 }, EVENING);
    await expectRefused(pay(a.id), "invalid_amount");
  });

  it("refuse tant que le terminal n'est pas relié", async () => {
    const a = await book("10:00");
    await t.sql`update salon_settings set payment_merchant_code = null, payment_reader_id = null`;
    await expectRefused(pay(a.id), "terminal_not_configured");
    expect(await t.sql`select 1 from payment`).toHaveLength(0);
  });

  it("un seul encaissement à la fois pour tout le salon : il n'y a qu'un terminal", async () => {
    const first = await book("10:00");
    const second = await book("11:00");
    await pay(first.id);
    await expectRefused(pay(second.id), "terminal_busy");
    await expectRefused(pay(first.id), "terminal_busy");
    expect(terminal.sent).toHaveLength(1);
  });

  it("deux demandes en même temps : une seule passe", async () => {
    const first = await book("10:00");
    const second = await book("11:00");
    const results = await Promise.allSettled([pay(first.id), pay(second.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((refused.reason as DomainError).code).toBe("terminal_busy");
    expect(terminal.sent).toHaveLength(1);
  });

  it("terminal éteint : l'encaissement est clos, rien n'est écrit sur le RDV, on peut réessayer", async () => {
    const a = await book("10:00");
    terminal.offline = true;
    await expectRefused(pay(a.id), "terminal_unavailable");
    const [row] = await t.sql`select status, failure_reason from payment`;
    expect(row).toMatchObject({ status: "failed", failure_reason: "terminal_unavailable" });
    expect((await appointmentRow(a.id)).adjusted_amount_cents).toBeNull();

    terminal.offline = false;
    expect((await pay(a.id)).status).toBe("pending");
  });

  it("refuse de réencaisser un RDV déjà payé", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    terminal.complete(terminal.sent[0].reference, { status: "successful" });
    await refreshPayment(t.db, terminal, started.id, EVENING);
    await expectRefused(pay(a.id), "already_paid");
  });
});

describe("R-90 : le résultat du terminal devient le montant encaissé", () => {
  it("au succès au prix de la carte : paiement enregistré, aucune correction, chiffre d'affaires inchangé", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    terminal.complete(terminal.sent[0].reference, { status: "successful" });
    const settled = await refreshPayment(t.db, terminal, started.id, EVENING);
    expect(settled).toMatchObject({ status: "successful", amountCents: 1800 });
    expect((await appointmentRow(a.id)).adjusted_amount_cents).toBeNull();
    expect(await revenue()).toBe(1800);
  });

  it("au succès d'un montant corrigé : ce montant est encaissé, au bilan et au journal", async () => {
    const a = await book("10:00");
    await adjustAppointmentAmount(t.db, { appointmentId: a.id, authorStaffId: ENES, amountCents: 1500 }, EVENING);
    const started = await pay(a.id);
    terminal.complete(terminal.sent[0].reference, { status: "successful" });
    await refreshPayment(t.db, terminal, started.id, EVENING);
    expect((await appointmentRow(a.id)).adjusted_amount_cents).toBe(1500);
    expect(await revenue()).toBe(1500);
    const [entry] = await t.sql`select actor_id, after from audit_log where action = 'appointment.paid'`;
    expect(entry.actor_id).toBe(ENES);
    expect(entry.after).toMatchObject({ amountCents: 1500, paymentId: started.id });
  });

  it("le montant réellement débité l'emporte sur celui qu'on avait envoyé", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    terminal.complete(terminal.sent[0].reference, { status: "successful", amountCents: 2000 });
    const settled = await refreshPayment(t.db, terminal, started.id, EVENING);
    expect(settled.amountCents).toBe(2000);
    expect((await appointmentRow(a.id)).adjusted_amount_cents).toBe(2000);
    expect(await revenue()).toBe(2000);
  });

  it("au refus : le RDV reste à encaisser, intact, et le terminal est libre pour un nouvel essai", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    terminal.complete(terminal.sent[0].reference, { status: "failed", failureReason: "declined" });
    const settled = await refreshPayment(t.db, terminal, started.id, EVENING);
    expect(settled).toMatchObject({ status: "failed", failureReason: "declined" });
    expect((await appointmentRow(a.id)).adjusted_amount_cents).toBeNull();
    expect((await pay(a.id)).status).toBe("pending");
  });

  it("la pastille de la fiche donne le paiement réussi avant un essai raté plus récent", async () => {
    const a = await book("10:00");
    const first = await pay(a.id);
    terminal.complete(terminal.sent[0].reference, { status: "failed" });
    await refreshPayment(t.db, terminal, first.id, EVENING);
    const second = await pay(a.id);
    terminal.complete(terminal.sent[1].reference, { status: "successful" });
    await refreshPayment(t.db, terminal, second.id, EVENING);
    expect((await latestPaymentsFor(t.db, [a.id])).get(a.id)).toMatchObject({
      id: second.id,
      status: "successful",
    });
  });
});

describe("R-91 : le rappel du fournisseur est idempotent et ne se croit pas sur parole", () => {
  it("un rappel en double n'enregistre rien de plus", async () => {
    const a = await book("10:00");
    await pay(a.id);
    const reference = terminal.sent[0].reference;
    terminal.complete(reference, { status: "successful" });
    await settleByReference(t.db, terminal, reference, EVENING);
    await settleByReference(t.db, terminal, reference, EVENING);
    expect(await t.sql`select 1 from audit_log where action = 'appointment.paid'`).toHaveLength(1);
    expect(await t.sql`select 1 from payment where status = 'successful'`).toHaveLength(1);
  });

  it("un rappel qui annonce un succès que le fournisseur ne confirme pas est sans effet", async () => {
    const a = await book("10:00");
    await pay(a.id);
    const settled = await settleByReference(t.db, terminal, terminal.sent[0].reference, EVENING);
    expect(settled?.status).toBe("pending");
    expect(await t.sql`select 1 from audit_log where action = 'appointment.paid'`).toHaveLength(0);
  });

  it("un identifiant inconnu est ignoré", async () => {
    expect(await settleByReference(t.db, terminal, "inconnu", EVENING)).toBeNull();
  });

  it("un fournisseur injoignable laisse l'encaissement en cours", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    const broken = {
      ...terminal,
      getCheckout: async () => {
        throw new ProviderError("hors ligne");
      },
    };
    expect((await refreshPayment(t.db, broken, started.id, EVENING)).status).toBe("pending");
  });
});

describe("R-92 : un encaissement sans réponse est clos au bout de quelques minutes", () => {
  const later = new Date(EVENING.getTime() + (PAYMENT_TIMEOUT_MINUTES + 1) * 60_000);

  it("le clôt comme échoué, interrompt le terminal et libère la place", async () => {
    const a = await book("10:00");
    const second = await book("11:00");
    await pay(a.id);
    expect(await expireStalePayments(t.db, terminal, later)).toBe(1);
    expect(terminal.terminated).toBe(1);
    expect((await t.sql`select status, failure_reason from payment`)[0]).toMatchObject({
      status: "failed",
      failure_reason: "timeout",
    });
    expect((await pay(second.id, later)).status).toBe("pending");
  });

  it("ne touche pas un encaissement récent", async () => {
    const a = await book("10:00");
    await pay(a.id);
    expect(await expireStalePayments(t.db, terminal, new Date(EVENING.getTime() + 60_000))).toBe(0);
  });

  it("un paiement arrivé entre-temps l'emporte sur l'expiration", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    terminal.complete(terminal.sent[0].reference, { status: "successful" });
    expect(await expireStalePayments(t.db, terminal, later)).toBe(0);
    expect((await refreshPayment(t.db, terminal, started.id, later)).status).toBe("successful");
  });

  it("un nouvel encaissement ferme d'abord un encaissement oublié", async () => {
    const a = await book("10:00");
    const second = await book("11:00");
    await pay(a.id);
    expect((await pay(second.id, later)).status).toBe("pending");
  });
});

describe("R-93 : annuler sur le terminal", () => {
  it("interrompt le terminal, clôt l'encaissement « annulé » et laisse le RDV à encaisser", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    const cancelled = await cancelPayment(t.db, terminal, { paymentId: started.id, authorStaffId: ORHAN }, EVENING);
    expect(cancelled.status).toBe("cancelled");
    expect(terminal.terminated).toBe(1);
    expect((await appointmentRow(a.id)).adjusted_amount_cents).toBeNull();
    const [entry] = await t.sql`select actor_id from audit_log where action = 'payment.cancelled'`;
    expect(entry.actor_id).toBe(ORHAN);
    // Le rappel d'échec qui suit l'interruption ne change rien.
    terminal.complete(terminal.sent[0].reference, { status: "failed" });
    expect((await refreshPayment(t.db, terminal, started.id, EVENING)).status).toBe("cancelled");
  });

  it("si le client a déjà payé, le paiement est gardé et l'annulation est sans effet", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    terminal.complete(terminal.sent[0].reference, { status: "successful" });
    const result = await cancelPayment(t.db, terminal, { paymentId: started.id, authorStaffId: ENES }, EVENING);
    expect(result.status).toBe("successful");
    expect(terminal.terminated).toBe(0);
  });

  it("exige un auteur", async () => {
    const a = await book("10:00");
    const started = await pay(a.id);
    await expectRefused(
      cancelPayment(t.db, terminal, { paymentId: started.id, authorStaffId: "" }, EVENING),
      "author_required",
    );
  });
});

describe("D-105 : relier le terminal (espace gérant)", () => {
  beforeEach(async () => {
    await t.sql`update salon_settings set payment_merchant_code = null, payment_reader_id = null`;
  });

  it("mémorise le code marchand et l'identifiant du terminal, au journal", async () => {
    await pairTerminal(t.db, terminal, { merchantCode: " MABC1234 ", pairingCode: "ZX81QA", actorId: ENES });
    expect(await getTerminalStatus(t.db)).toEqual({
      configured: true,
      merchantCode: "MABC1234",
      readerId: "fake-reader-zx81qa",
    });
    expect(await t.sql`select 1 from audit_log where action = 'terminal.paired'`).toHaveLength(1);
  });

  it("refuse des codes mal formés ou refusés par le terminal", async () => {
    await expectRefused(
      pairTerminal(t.db, terminal, { merchantCode: "ab", pairingCode: "ZX81QA", actorId: ENES }),
      "invalid_pairing",
    );
    await expectRefused(
      pairTerminal(t.db, terminal, { merchantCode: "MABC1234", pairingCode: "pas valide!", actorId: ENES }),
      "invalid_pairing",
    );
    await expectRefused(
      pairTerminal(t.db, terminal, { merchantCode: "MABC1234", pairingCode: "INVALID", actorId: ENES }),
      "invalid_pairing",
    );
    expect((await getTerminalStatus(t.db)).configured).toBe(false);
  });

  it("se délie, sauf pendant un encaissement", async () => {
    await pairTerminal(t.db, terminal, { merchantCode: "MABC1234", pairingCode: "ZX81QA", actorId: ENES });
    const a = await book("10:00");
    await pay(a.id);
    await expectRefused(unpairTerminal(t.db, { actorId: ENES }), "terminal_busy");
    await expireStalePayments(
      t.db,
      terminal,
      new Date(EVENING.getTime() + (PAYMENT_TIMEOUT_MINUTES + 1) * 60_000),
    );
    await unpairTerminal(t.db, { actorId: ENES });
    expect((await getTerminalStatus(t.db)).configured).toBe(false);
  });
});
