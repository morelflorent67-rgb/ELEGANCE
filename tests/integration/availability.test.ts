import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "../../src/lib/domain-error";
import { getDaySlots } from "../../src/modules/availability";
import { createAppointment } from "../../src/modules/booking";
import {
  COLORATION,
  COUPE,
  COUPE_FORMATION,
  ENES,
  KAAN,
  NOW,
  ORHAN,
  TAHA,
  TAILLAGE_BARBE,
  connectTestDb,
  createCustomer,
  paris,
} from "./helpers";

const t = connectTestDb();
beforeEach(() => t.reset());
afterAll(() => t.close());

const TUESDAY = "2026-11-03";

const clock = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

const slots = (options: Partial<Parameters<typeof getDaySlots>[1]> = {}, date: string = TUESDAY) =>
  getDaySlots(t.db, {
    date,
    serviceIds: [COUPE],
    staffId: "any",
    audience: "online",
    now: NOW,
    ...options,
  });

const times = (list: { startsAt: Date }[]) => list.map((s) => clock.format(s.startsAt));

describe("créneaux calculés par le serveur à partir de la base", () => {
  it("R-01, R-05 : de 10 h à 18 h 30 pour une coupe de 30 min, sans la pause de midi", async () => {
    const list = times(await slots());
    expect(list[0]).toBe("10:00");
    expect(list.at(-1)).toBe("18:30");
    expect(list).not.toContain("12:00");
    expect(list).not.toContain("12:30");
    expect(list).toHaveLength(4 + 12); // 10 h–12 h : 4 départs ; 13 h–19 h : 12 départs
  });

  it("R-01 : aucun créneau le lundi ni le dimanche", async () => {
    expect(await slots({}, "2026-11-09")).toEqual([]);
    expect(await slots({}, "2026-11-08")).toEqual([]);
  });

  it("R-02 : les apprentis ont les mêmes horaires que les coiffeurs", async () => {
    const barbers = await slots();
    const apprentices = await slots({ serviceIds: [COUPE_FORMATION] });
    expect(barbers[0].staffIds).toEqual([ORHAN, ENES]);
    expect(apprentices[0].staffIds).toEqual([KAAN, TAHA]);
    expect(apprentices[0].startsAt).toEqual(barbers[0].startsAt);
  });

  it("R-04, R-05 : une prestation de 45 min part à la demi-heure et finit au plus tard à 19 h", async () => {
    const list = times(await slots({ serviceIds: [COUPE_FORMATION] }));
    expect(list).toContain("11:00");
    expect(list).not.toContain("11:30"); // finirait à 12 h 15
    expect(list.at(-1)).toBe("18:00");
  });

  it("R-04 : le salon voit des départs toutes les 15 minutes", async () => {
    const list = times(await slots({ audience: "salon" }));
    expect(list).toContain("10:15");
    expect(list).toContain("18:15");
    expect(list.at(-1)).toBe("18:30"); // une coupe de 30 min part au plus tard à 18 h 30
    const taillage = times(await slots({ audience: "salon", serviceIds: [TAILLAGE_BARBE] }));
    expect(taillage.at(-1)).toBe("18:45"); // 15 min : dernier départ 18 h 45
  });

  it("R-03 : suit les fermetures et les réglages de la base", async () => {
    await t.sql`insert into closure (starts_on, ends_on) values (${TUESDAY}, ${TUESDAY})`;
    expect(await slots()).toEqual([]);
    await t.sql`delete from closure`;
    await t.sql`update salon_settings set online_slot_step_minutes = 15`;
    expect(times(await slots())).toContain("10:15");
  });

  it("R-06 : n'offre pas les créneaux à moins d'une heure ni au-delà de 6 semaines", async () => {
    const now = paris(TUESDAY, "09:30");
    expect(times(await slots({ now }))[0]).toBe("10:30"); // 10 h est dans 30 min
    const tenOClock = paris(TUESDAY, "10:00");
    // 42 jours après mardi 10 h : mardi 15 décembre 10 h pile est accepté, 10 h 30 ne l'est plus.
    expect(times(await slots({ now: tenOClock }, "2026-12-15"))).toEqual(["10:00"]);
    expect(await slots({ now: tenOClock }, "2026-12-22")).toEqual([]);
  });

  it("R-17 : refuse en ligne une prestation sur appel, que le salon peut planifier", async () => {
    await expect(slots({ serviceIds: [COLORATION] })).rejects.toMatchObject({
      code: "not_bookable_online",
    });
    expect((await slots({ serviceIds: [COLORATION], audience: "salon" })).length).toBeGreaterThan(
      0,
    );
  });

  it("R-18 : refuse de mélanger prestations coiffeurs et apprentis", async () => {
    await expect(slots({ serviceIds: [COUPE, COUPE_FORMATION] })).rejects.toMatchObject({
      code: "mixed_categories",
    });
  });

  it("R-13 : un coiffeur non habilité n'a aucun créneau pour la prestation", async () => {
    expect(await slots({ staffId: KAAN })).toEqual([]);
    await t.sql`delete from service_staff where service_id = ${COUPE} and staff_id = ${ENES}`;
    expect((await slots())[0].staffIds).toEqual([ORHAN]);
  });
});

describe("R-21, R-22, R-23 : créneaux pris, absences, annulations", () => {
  it("retire des créneaux un RDV confirmé et les rend après une annulation", async () => {
    const customerId = await createCustomer(t.sql);
    const created = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris(TUESDAY, "10:00"),
        source: "online",
      },
      NOW,
    );
    expect((await slots())[0].staffIds).toEqual([ENES]);
    expect((await slots({ staffId: ORHAN }))[0].startsAt).toEqual(paris(TUESDAY, "10:30"));

    await t.sql`update appointment set status = 'cancelled_by_customer' where id = ${created.id}`;
    expect((await slots())[0].staffIds).toEqual([ORHAN, ENES]);
  });

  it("un RDV honoré ou non venu continue d'occuper le créneau", async () => {
    const customerId = await createCustomer(t.sql);
    await t.sql`insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source) values
      (${customerId}, ${ORHAN}, ${paris(TUESDAY, "10:00")}, ${paris(TUESDAY, "10:30")}, 'honored', 'salon'),
      (${customerId}, ${ENES}, ${paris(TUESDAY, "10:00")}, ${paris(TUESDAY, "10:30")}, 'no_show', 'salon')`;
    expect(times(await slots())[0]).toBe("10:30");
  });

  it("une absence retire les créneaux du coiffeur concerné seulement", async () => {
    await t.sql`insert into absence (staff_id, starts_at, ends_at)
                values (${ENES}, ${paris(TUESDAY, "14:00")}, ${paris(TUESDAY, "16:00")})`;
    const list = await slots();
    const at = (time: string) => list.find((s) => clock.format(s.startsAt) === time)!.staffIds;
    expect(at("13:30")).toEqual([ORHAN, ENES]);
    expect(at("14:00")).toEqual([ORHAN]);
    expect(at("15:30")).toEqual([ORHAN]);
    expect(at("16:00")).toEqual([ORHAN, ENES]);
  });

  it("un jour complet pour tous les coiffeurs ne laisse aucun créneau", async () => {
    await t.sql`insert into absence (staff_id, starts_at, ends_at)
                values (${ORHAN}, ${paris(TUESDAY, "00:00")}, ${paris("2026-11-04", "00:00")}),
                       (${ENES}, ${paris(TUESDAY, "00:00")}, ${paris("2026-11-04", "00:00")})`;
    expect(await slots()).toEqual([]);
    expect((await slots({}, "2026-11-04")).length).toBeGreaterThan(0);
  });
});

describe("cohérence : ce qui est proposé se réserve, le reste est refusé", () => {
  it("chaque créneau proposé (premier, dernier, milieu) se réserve avec le coiffeur annoncé", async () => {
    const list = await slots({ staffId: ORHAN });
    for (const slot of [list[0], list[Math.floor(list.length / 2)], list.at(-1)!]) {
      const customerId = await createCustomer(t.sql);
      const created = await createAppointment(
        t.db,
        {
          customerId,
          serviceIds: [COUPE],
          staffId: ORHAN,
          startsAt: slot.startsAt,
          source: "online",
        },
        NOW,
      );
      expect(created.startsAt).toEqual(slot.startsAt);
    }
  });

  it("les horaires non proposés sont refusés à la réservation", async () => {
    const proposed = new Set(times(await slots()));
    for (const time of ["09:30", "12:00", "12:30", "10:15", "18:45", "19:00"]) {
      expect(proposed.has(time)).toBe(false);
      const customerId = await createCustomer(t.sql);
      const error = await createAppointment(
        t.db,
        {
          customerId,
          serviceIds: [COUPE],
          staffId: "any",
          startsAt: paris(TUESDAY, time),
          source: "online",
        },
        NOW,
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error, `${time} aurait dû être refusé`).toBeInstanceOf(DomainError);
    }
  });
});
