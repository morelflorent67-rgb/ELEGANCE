import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "../../src/lib/domain-error";
import { cancelAppointment, createAppointment, loadChangeableAppointment } from "../../src/modules/booking";
import { loadDashboard } from "../../src/modules/dashboard";
import { getLoyaltyCard } from "../../src/modules/loyalty";
import { loadDayPlanning } from "../../src/modules/planning";
import { markAppleReview } from "../../src/modules/customers/apple-review";
import { COUPE_BARBE, NOW, ORHAN, connectTestDb, createCustomer, paris } from "./helpers";

// R-103 (D-125) : le compte de démonstration de l'examinateur d'Apple. Ses RDV sont réels (le salon les voit, avec une
// étiquette), mais n'envoient aucun email, ne comptent ni au Bilan ni à la fidélité, et s'annulent à tout moment.

const t = connectTestDb();
let review: string;
let normal: string;

beforeEach(async () => {
  await t.reset();
  review = await createCustomer(t.sql, { name: "Apple" });
  normal = await createCustomer(t.sql, { name: "Thomas" });
  await markAppleReview(t.db, review);
  await t.sql`update salon_settings set change_cutoff_hours = 48, loyalty_started_at = ${paris("2026-10-01", "00:00")}`;
});
afterAll(() => t.close());

const book = (customerId: string, date = "2026-11-10", time = "10:00") =>
  createAppointment(
    t.db,
    { customerId, serviceIds: [COUPE_BARBE], staffId: ORHAN, startsAt: paris(date, time), source: "online" },
    NOW,
  );

const emailsFor = async (appointmentId: string) =>
  t.sql`select type from email_outbox where appointment_id = ${appointmentId}`;

describe("R-103 : le compte de démonstration Apple", () => {
  it("n'envoie aucun email, ni de confirmation ni d'annulation (donc aucune notification)", async () => {
    const created = await book(review);
    await cancelAppointment(t.db, { customerId: review, appointmentId: created.id }, NOW);
    expect(await emailsFor(created.id)).toHaveLength(0);
  });

  it("un client ordinaire reçoit toujours sa confirmation", async () => {
    const created = await book(normal);
    expect((await emailsFor(created.id)).map((r) => r.type)).toContain("confirmation");
  });

  it("peut annuler à moins du délai de modification, ce qu'un client ordinaire ne peut pas", async () => {
    const soon = paris("2026-11-03", "10:00"); // dans moins de 48 h de NOW + 1 jour : on se place au dernier moment
    const now = paris("2026-11-03", "09:30");
    const a = await createAppointment(
      t.db,
      { customerId: review, serviceIds: [COUPE_BARBE], staffId: ORHAN, startsAt: soon, source: "online" },
      NOW,
    );
    const b = await createAppointment(
      t.db,
      { customerId: normal, serviceIds: [COUPE_BARBE], staffId: ORHAN, startsAt: paris("2026-11-03", "11:00"), source: "online" },
      NOW,
    );
    await expect(loadChangeableAppointment(t.db, review, a.id, now)).resolves.toMatchObject({ id: a.id });
    await expect(cancelAppointment(t.db, { customerId: review, appointmentId: a.id }, now)).resolves.toEqual({
      alreadyCancelled: false,
    });
    const refused = await cancelAppointment(t.db, { customerId: normal, appointmentId: b.id }, now).catch(
      (e: unknown) => e,
    );
    expect(refused).toBeInstanceOf(DomainError);
    expect((refused as DomainError).code).toBe("change_too_late");
  });

  it("ne rapporte aucun point de fidélité", async () => {
    await book(review, "2026-11-04", "10:00");
    await book(normal, "2026-11-04", "11:00");
    const later = paris("2026-11-07", "18:00");
    expect((await getLoyaltyCard(t.db, review, later)).balance).toBe(0);
    expect((await getLoyaltyCard(t.db, normal, later)).balance).toBeGreaterThan(0);
  });

  it("ne compte pas au Bilan", async () => {
    await book(review, "2026-11-04", "10:00");
    await book(normal, "2026-11-04", "11:00");
    const view = await loadDashboard(t.db, { kind: "day", date: "2026-11-04" }, paris("2026-11-07", "18:00"));
    expect(view.totals.appointmentCount).toBe(1);
    expect(view.totals.revenueCents).toBe(2800);
  });

  it("apparaît au planning avec l'indication « Test Apple »", async () => {
    await book(review, "2026-11-04", "10:00");
    await book(normal, "2026-11-04", "11:00");
    const day = await loadDayPlanning(t.db, "2026-11-04", NOW);
    const [first, second] = day.columns[0].appointments;
    expect(first.appleReview).toBe(true);
    expect(second.appleReview).toBe(false);
  });
});
