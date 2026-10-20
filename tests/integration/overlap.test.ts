import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connectTestDb, createCustomer, ENES, insertAppointment, ORHAN, paris } from "./helpers";

const t = connectTestDb();
let customerId: string;

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql);
});
afterAll(() => t.close());

const slot = (staffId: string, from: string, to: string, status = "confirmed") => ({
  customerId,
  staffId,
  startsAt: paris("2026-11-03", from),
  endsAt: paris("2026-11-03", to),
  status,
});

describe("R-23 : la base refuse deux RDV qui se chevauchent pour un même membre", () => {
  it("refuse un RDV qui commence pendant un autre RDV du même membre", async () => {
    await insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30"));
    await expect(insertAppointment(t.sql, slot(ORHAN, "10:15", "10:45"))).rejects.toMatchObject({
      code: "23P01",
    });
  });

  it("refuse un RDV qui en englobe un autre, ou qui a exactement la même plage", async () => {
    await insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30"));
    await expect(insertAppointment(t.sql, slot(ORHAN, "09:30", "11:00"))).rejects.toMatchObject({
      code: "23P01",
    });
    await expect(insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30"))).rejects.toMatchObject({
      code: "23P01",
    });
  });

  it("accepte des RDV qui se suivent sans trou, et des RDV d'autres membres au même moment", async () => {
    await insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30"));
    await insertAppointment(t.sql, slot(ORHAN, "10:30", "11:00"));
    await insertAppointment(t.sql, slot(ORHAN, "09:30", "10:00"));
    await insertAppointment(t.sql, slot(ENES, "10:00", "10:30"));
  });

  it("à la même seconde, une seule des deux réservations aboutit", async () => {
    const results = await Promise.allSettled([
      insertAppointment(t.sql, slot(ORHAN, "11:00", "11:30")),
      insertAppointment(t.sql, slot(ORHAN, "11:00", "11:30")),
      insertAppointment(t.sql, slot(ORHAN, "11:00", "11:30")),
      insertAppointment(t.sql, slot(ORHAN, "11:00", "11:30")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.filter((r) => r.status === "rejected");
    expect(refused).toHaveLength(3);
    for (const r of refused)
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "23P01" });
    const [{ n }] = await t.sql`select count(*)::int as n from appointment`;
    expect(n).toBe(1);
  });

  it("une annulation libère le créneau", async () => {
    await insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30", "cancelled_by_customer"));
    await insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30"));
    await insertAppointment(t.sql, slot(ORHAN, "11:00", "11:30", "cancelled_by_salon"));
    await insertAppointment(t.sql, slot(ORHAN, "11:00", "11:30"));
  });

  it("un RDV honoré ou « non venu » garde le coiffeur occupé", async () => {
    await insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30", "honored"));
    await insertAppointment(t.sql, slot(ORHAN, "11:00", "11:30", "no_show"));
    await expect(insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30"))).rejects.toMatchObject({
      code: "23P01",
    });
    await expect(insertAppointment(t.sql, slot(ORHAN, "11:00", "11:30"))).rejects.toMatchObject({
      code: "23P01",
    });
  });

  it("refuse de rétablir un RDV annulé si le créneau a été repris", async () => {
    await insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30", "cancelled_by_customer"));
    await insertAppointment(t.sql, slot(ORHAN, "10:00", "10:30"));
    await expect(
      t.sql`update appointment set status = 'confirmed' where status = 'cancelled_by_customer'`,
    ).rejects.toMatchObject({ code: "23P01" });
  });
});
