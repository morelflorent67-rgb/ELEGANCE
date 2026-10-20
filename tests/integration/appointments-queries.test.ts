import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  listCustomerAppointments,
  loadCustomerAppointment,
} from "../../src/modules/appointments/queries";
import { createAppointment } from "../../src/modules/booking";
import { COUPE, NOW, ORHAN, TAILLAGE_BARBE, connectTestDb, createCustomer, paris } from "./helpers";

const t = connectTestDb();
let me: string;
let someoneElse: string;

beforeEach(async () => {
  await t.reset();
  me = await createCustomer(t.sql);
  someoneElse = await createCustomer(t.sql);
});
afterAll(() => t.close());

const book = (customerId: string, startsAt: Date, serviceIds = [COUPE]) =>
  createAppointment(
    t.db,
    { customerId, serviceIds, staffId: ORHAN, startsAt, source: "online" },
    NOW,
  );

describe("lecture des RDV d'un client", () => {
  it("rend le RDV avec ses prestations figées, le coiffeur et le total (R-14, R-16)", async () => {
    const created = await book(me, paris("2026-11-10", "10:00"), [COUPE, TAILLAGE_BARBE]);
    const view = await loadCustomerAppointment(t.db, me, created.id);
    expect(view).toMatchObject({
      id: created.id,
      status: "confirmed",
      staffFirstName: "Orhan",
      totalPriceCents: 3000,
      durationMinutes: 45,
    });
    expect(view!.items.map((i) => i.name)).toEqual(["Coupe homme", "Taillage barbe"]);
  });

  it("ne montre jamais le RDV d'un autre client", async () => {
    const created = await book(me, paris("2026-11-10", "10:00"));
    expect(await loadCustomerAppointment(t.db, someoneElse, created.id)).toBeNull();
    expect(await listCustomerAppointments(t.db, someoneElse)).toEqual([]);
  });

  it("rend null pour un RDV inconnu", async () => {
    expect(
      await loadCustomerAppointment(t.db, me, "00000000-0000-4000-8000-0000000000ff"),
    ).toBeNull();
  });

  it("liste les RDV du plus récent au plus ancien, annulés compris", async () => {
    const early = await book(me, paris("2026-11-10", "10:00"));
    const late = await book(me, paris("2026-11-12", "14:00"));
    await t.sql`update appointment set status = 'cancelled_by_customer' where id = ${early.id}`;
    const list = await listCustomerAppointments(t.db, me);
    expect(list.map((a) => a.id)).toEqual([late.id, early.id]);
    expect(list[1].status).toBe("cancelled_by_customer");
  });
});
