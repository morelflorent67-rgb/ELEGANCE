import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "../../src/lib/domain-error";
import { adjustAppointmentAmount, createAppointment, markNoShow, undoNoShow } from "../../src/modules/booking";
import {
  adjustBalance,
  balanceOf,
  cancelReward,
  getLoyaltyCard,
  redeemReward,
  rewardStateFor,
  settleLoyalty,
} from "../../src/modules/loyalty";
import { startPayment } from "../../src/modules/payments";
import { createFakeTerminal } from "../../src/modules/payments/fake";
import {
  COUPE,
  COUPE_BARBE,
  COUPE_FORMATION,
  ENES,
  KAAN,
  NOW,
  ORHAN,
  SOIN_VISAGE,
  TAILLAGE_BARBE,
  connectTestDb,
  createCustomer,
  paris,
} from "./helpers";

// R-96 à R-100 : la carte de fidélité (D-114). Un RDV honoré est un état calculé (R-51) : les gains se matérialisent à
// la demande, une seule fois par RDV, et se retirent si le RDV devient un lapin.

const t = connectTestDb();
/** Dimanche 15 novembre 2026, 20 h : tous les RDV de la semaine du 7 novembre sont terminés. */
const LATER = paris("2026-11-15", "20:00");
let customerId: string;
let day = 0;

beforeEach(async () => {
  await t.reset();
  day = 0;
  customerId = await createCustomer(t.sql, { name: "Thomas" });
  await t.sql`update salon_settings set max_upcoming_per_customer = 50, loyalty_started_at = '2026-01-01',
              payment_merchant_code = 'MABC1234', payment_reader_id = 'rdr-1'`;
});
afterAll(() => t.close());

/** Un RDV d'un jour ouvré différent à chaque appel (mardi au samedi). */
async function book(serviceIds: string[], staffId = ORHAN, who = customerId) {
  const dates = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-10", "2026-11-11"];
  const date = dates[day++ % dates.length];
  const created = await createAppointment(
    t.db,
    { customerId: who, serviceIds, staffId, startsAt: paris(date, "14:00"), source: "salon", createdByStaffId: ENES },
    NOW,
  );
  return created.id;
}

const earned = async () => (await getLoyaltyCard(t.db, customerId, LATER)).balance;
const entries = async () =>
  t.sql`select kind, points from loyalty_entry where customer_id = ${customerId} order by created_at, kind`;

describe("R-96 : gagner des points", () => {
  it("un RDV honoré rapporte la somme des points de ses prestations", async () => {
    await book([COUPE, SOIN_VISAGE]); // 10 + 10
    expect(await earned()).toBe(20);
    await book([TAILLAGE_BARBE]); // 5
    expect(await earned()).toBe(25);
  });

  it("un RDV à venir ne rapporte rien encore", async () => {
    await book([COUPE]);
    const card = await getLoyaltyCard(t.db, customerId, paris("2026-11-02", "12:00"));
    expect(card.balance).toBe(0);
  });

  it("rejouer le calcul ne double rien (un RDV ne gagne qu'une fois)", async () => {
    await book([COUPE]);
    await settleLoyalty(t.db, customerId, LATER);
    await settleLoyalty(t.db, customerId, LATER);
    await Promise.all([settleLoyalty(t.db, customerId, LATER), settleLoyalty(t.db, customerId, LATER)]);
    expect(await entries()).toEqual([{ kind: "earn", points: 10 }]);
  });

  it("un RDV annulé ne rapporte rien", async () => {
    const id = await book([COUPE]);
    await t.sql`update appointment set status = 'cancelled_by_customer' where id = ${id}`;
    expect(await earned()).toBe(0);
  });

  it("un RDV antérieur au lancement du programme ne compte pas (départ à zéro)", async () => {
    await t.sql`update salon_settings set loyalty_started_at = '2026-11-06T12:00:00Z'`;
    await book([COUPE]); // 3 novembre
    await book([COUPE]); // 4 novembre
    await book([COUPE]); // 5 novembre
    await book([COUPE]); // 6 novembre, 14 h : après le lancement
    expect(await earned()).toBe(10);
  });

  it("programme désactivé : aucun point", async () => {
    await t.sql`update salon_settings set loyalty_enabled = false`;
    await book([COUPE]);
    const card = await getLoyaltyCard(t.db, customerId, LATER);
    expect(card.enabled).toBe(false);
    expect(await entries()).toHaveLength(0);
  });

  it("le barème est réglable par prestation", async () => {
    await t.sql`update service set loyalty_points = 40 where id = ${COUPE}`;
    await book([COUPE]);
    expect(await earned()).toBe(40);
  });
});

describe("R-97 : un lapin retire les points, sans rien supprimer", () => {
  it("lapin signalé : écriture inverse ; lapin retiré : points rétablis", async () => {
    const id = await book([COUPE]);
    expect(await earned()).toBe(10);

    await markNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    expect(await earned()).toBe(0);
    expect(await entries()).toEqual([
      { kind: "earn", points: 10 },
      { kind: "reversal", points: -10 },
    ]);

    await undoNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    expect(await earned()).toBe(10);
    expect(await entries()).toHaveLength(3);
  });

  it("le rétablissement rend les points d'origine, même si le barème a changé", async () => {
    const id = await book([COUPE]);
    await earned();
    await markNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    await earned();
    await t.sql`update service set loyalty_points = 99 where id = ${COUPE}`;
    await undoNoShow(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    expect(await earned()).toBe(10);
  });
});

/** Donne `points` points au client par une correction du gérant. */
const giveSolde = (points: number) =>
  adjustBalance(t.db, { customerId, delta: points, reason: "Test", managerActorId: ENES }, LATER);

describe("R-98, R-99 : la coupe offerte", () => {
  it("à 100 points, offre la coupe homme : montant à 0, 100 points débités, journal écrit", async () => {
    await giveSolde(100);
    const id = await book([COUPE]);
    const result = await redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    expect(result).toMatchObject({ discountCents: 1800, amountCents: 0 });
    // La coupe offerte ne rapporte aucun point : 100 - 100.
    expect(await balanceOf(t.db, customerId)).toBe(0);
    expect((await rewardStateFor(t.db, id)).used).toBe(true);
    const [appt] = await t.sql`select adjusted_amount_cents from appointment where id = ${id}`;
    expect(appt.adjusted_amount_cents).toBe(0);
    const audit = await t.sql`select actor_id from audit_log where action = 'loyalty.redeemed' and entity_id = ${id}`;
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_id).toBe(ENES);
  });

  it("sur une coupe & barbe, elle est offerte en entier (28 €)", async () => {
    await giveSolde(100);
    const id = await book([COUPE_BARBE]);
    const result = await redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    expect(result).toMatchObject({ discountCents: 2800, amountCents: 0 });
  });

  it("avec un soin en plus, seule la coupe est offerte : le soin reste à payer", async () => {
    await giveSolde(100);
    const id = await book([COUPE, SOIN_VISAGE]);
    const result = await redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    expect(result).toMatchObject({ discountCents: 1800, amountCents: 2500 });
  });

  it("un RDV avec coupe offerte ne rapporte aucun point, même si un gain avait déjà été écrit", async () => {
    await giveSolde(100);
    const id = await book([COUPE]);
    await settleLoyalty(t.db, customerId, LATER); // gain de 10 écrit avant l'utilisation
    await redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    expect(await balanceOf(t.db, customerId)).toBe(0);
    await settleLoyalty(t.db, customerId, LATER);
    expect(await balanceOf(t.db, customerId)).toBe(0);
  });

  it("refuse sous le seuil, sans écrire", async () => {
    await giveSolde(80); // sous le seuil
    const id = await book([COUPE]);
    await expect(redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER)).rejects.toMatchObject({
      code: "reward_not_available",
    });
    expect(await balanceOf(t.db, customerId)).toBe(80);
  });

  it("refuse une coupe « tarif formation » (non éligible)", async () => {
    await giveSolde(100);
    const id = await book([COUPE_FORMATION], KAAN);
    await expect(redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER)).rejects.toMatchObject({
      code: "no_reward_service",
    });
  });

  it("refuse sans auteur ou pour un RDV à venir", async () => {
    await giveSolde(100);
    const id = await book([COUPE]);
    await expect(
      redeemReward(t.db, { appointmentId: id, authorStaffId: "" }, LATER),
    ).rejects.toMatchObject({ code: "author_required" });
    await expect(
      redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, paris("2026-11-02", "12:00")),
    ).rejects.toMatchObject({ code: "not_started" });
  });

  it("une seule coupe offerte par RDV, même à 200 points", async () => {
    await giveSolde(200);
    const id = await book([COUPE]);
    await redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    await expect(redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER)).rejects.toMatchObject({
      code: "reward_already_used",
    });
    expect(await balanceOf(t.db, customerId)).toBe(100);
  });

  it("deux demandes simultanées : une seule passe", async () => {
    await giveSolde(200);
    const id = await book([COUPE]);
    const results = await Promise.allSettled([
      redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER),
      redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(t.db, customerId)).toBe(100);
  });

  it("l'annulation rend les points et le montant d'avant, et la coupe peut être reprise", async () => {
    await giveSolde(100);
    const id = await book([COUPE]);
    await adjustAppointmentAmount(t.db, { appointmentId: id, authorStaffId: ENES, amountCents: 1500 }, LATER);
    await redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    expect(await balanceOf(t.db, customerId)).toBe(0);

    await cancelReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    expect(await balanceOf(t.db, customerId)).toBe(110); // les 100 rendus + 10 gagnés par ce RDV, redevenu un passage ordinaire
    expect((await rewardStateFor(t.db, id)).used).toBe(false);
    const [appt] = await t.sql`select adjusted_amount_cents from appointment where id = ${id}`;
    expect(appt.adjusted_amount_cents).toBe(1500);

    await redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    await expect(cancelReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER)).resolves.toBeDefined();
    await expect(cancelReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER)).rejects.toMatchObject({
      code: "no_reward_to_cancel",
    });
  });

  it("refuse l'utilisation ou l'annulation une fois le RDV encaissé", async () => {
    await giveSolde(100);
    const id = await book([COUPE, SOIN_VISAGE]);
    await redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    await t.sql`insert into payment (appointment_id, amount_cents, status, started_by_staff_id)
                values (${id}, 2500, 'successful', ${ENES})`;
    await expect(cancelReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER)).rejects.toMatchObject({
      code: "already_paid",
    });
  });

  it("encaissement : le montant envoyé au terminal est celui après la remise", async () => {
    await giveSolde(100);
    const id = await book([COUPE, SOIN_VISAGE]);
    await redeemReward(t.db, { appointmentId: id, authorStaffId: ENES }, LATER);
    const view = await startPayment(
      t.db,
      createFakeTerminal(),
      { appointmentId: id, authorStaffId: ENES, returnUrl: "https://exemple.test/x" },
      LATER,
    );
    expect(view.amountCents).toBe(2500);
  });
});

describe("R-100 : le solde ne descend jamais sous 0", () => {
  it("la correction du gérant ne peut pas passer sous 0", async () => {
    await giveSolde(20);
    await expect(
      adjustBalance(t.db, { customerId, delta: -30, reason: "Erreur", managerActorId: ENES }, LATER),
    ).rejects.toMatchObject({ code: "loyalty_negative" });
    expect(await balanceOf(t.db, customerId)).toBe(20);
  });

  it("la base elle-même refuse une écriture qui rendrait le solde négatif", async () => {
    await expect(
      t.sql`insert into loyalty_entry (customer_id, kind, points, actor_type, reason)
            values (${customerId}, 'adjust', -5, 'manager', 'x')`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("une transaction annulée n'écrit aucun point", async () => {
    await book([COUPE]);
    await expect(
      t.db.transaction(async (tx) => {
        await settleLoyalty(tx, customerId, LATER);
        throw new Error("échec après le gain");
      }),
    ).rejects.toThrow("échec après le gain");
    expect(await entries()).toHaveLength(0);
  });
});

describe("correction manuelle du gérant", () => {
  it("ajoute ou retire des points avec un motif, et l'écrit au journal", async () => {
    await giveSolde(50);
    await adjustBalance(t.db, { customerId, delta: -20, reason: "Carte papier perdue", managerActorId: ENES }, LATER);
    expect(await balanceOf(t.db, customerId)).toBe(30);
    const log = await t.sql`select after from audit_log where action = 'loyalty.adjusted' order by id desc limit 1`;
    expect(log[0].after).toMatchObject({ delta: -20, reason: "Carte papier perdue" });
  });

  it("refuse un motif vide ou un nombre nul", async () => {
    for (const input of [
      { delta: 10, reason: "  " },
      { delta: 0, reason: "x" },
      { delta: 1.5, reason: "x" },
    ]) {
      await expect(
        adjustBalance(t.db, { customerId, managerActorId: ENES, ...input }, LATER),
      ).rejects.toBeInstanceOf(DomainError);
    }
  });
});

describe("carte du client", () => {
  it("donne solde, progression et historique", async () => {
    await book([COUPE]);
    await book([COUPE_BARBE]);
    const card = await getLoyaltyCard(t.db, customerId, LATER);
    expect(card).toMatchObject({ enabled: true, balance: 20, threshold: 100, pointsToNext: 80, rewardsAvailable: 0 });
    expect(card.cells.filter((c) => c.fill === 1)).toHaveLength(2);
    expect(card.history).toHaveLength(2);
    expect(card.history.flatMap((h) => h.serviceNames).sort()).toEqual(["Coupe & taille de barbe", "Coupe homme"]);
  });
});
