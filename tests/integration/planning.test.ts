import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAppointment } from "../../src/modules/booking";
import { loadAppointmentCard, loadDayPlanning } from "../../src/modules/planning";
import {
  COLORATION,
  COUPE,
  COUPE_BARBE,
  ENES,
  KAAN,
  ORHAN,
  TAHA,
  TAILLAGE_BARBE,
  connectTestDb,
  insertAppointment,
  paris,
} from "./helpers";

const t = connectTestDb();

beforeEach(async () => {
  await t.reset();
});
afterAll(() => t.close());

const DAY = "2026-11-03"; // mardi
const NOW = paris(DAY, "10:40");

async function client(first: string, last: string, phone = "+33612345678") {
  const [row] = await t.sql`
    insert into customer (first_name, last_name, phone, email)
    values (${first}, ${last}, ${phone}, ${`${first}.${last}@exemple.fr`.toLowerCase()})
    returning id`;
  return row.id as string;
}

const book = (
  customerId: string,
  staffId: string,
  time: string,
  serviceIds = [COUPE],
  source: "online" | "salon" = "online",
) =>
  createAppointment(
    t.db,
    {
      customerId,
      serviceIds,
      staffId,
      startsAt: paris(DAY, time),
      source,
      ...(source === "salon" ? { createdByStaffId: ENES } : {}),
    },
    paris("2026-11-02", "08:00"),
  );

describe("planning du jour (R-72)", () => {
  it("une colonne par membre actif, dans l'ordre d'affichage, avec les RDV triés par heure", async () => {
    const thomas = await client("Thomas", "Durand");
    const yanis = await client("Yanis", "Benali");
    await book(yanis, ORHAN, "11:00");
    await book(thomas, ORHAN, "10:00");
    await book(thomas, ENES, "14:00", [COUPE_BARBE]);

    const day = await loadDayPlanning(t.db, DAY, NOW);
    expect(day.columns.map((c) => c.staff.firstName)).toEqual(["Orhan", "Enes", "Kaan", "Taha"]);
    const orhan = day.columns[0].appointments;
    expect(orhan.map((a) => a.customerName)).toEqual(["Thomas Durand", "Yanis Benali"]);
    expect(day.columns[1].appointments).toHaveLength(1);
    expect(day.columns[2].appointments).toHaveLength(0);
    expect(day.count).toBe(3);
  });

  it("donne pour chaque RDV prestations, prix figé, durée, note, origine et téléphone complet", async () => {
    const thomas = await client("Thomas", "Durand");
    const created = await createAppointment(
      t.db,
      {
        customerId: thomas,
        serviceIds: [COUPE, TAILLAGE_BARBE],
        staffId: ORHAN,
        startsAt: paris(DAY, "10:00"),
        source: "salon",
        createdByStaffId: ENES,
        note: "Dégradé à blanc",
      },
      paris("2026-11-02", "08:00"),
    );
    const day = await loadDayPlanning(t.db, DAY, NOW);
    const [appt] = day.columns[0].appointments;
    expect(appt).toMatchObject({
      id: created.id,
      customerName: "Thomas Durand",
      phone: "06 12 34 56 78",
      source: "salon",
      note: "Dégradé à blanc",
      totalPriceCents: 3000,
      durationMinutes: 45,
      summary: "Coupe homme + Taillage barbe",
    });
    expect(appt.items.map((i) => i.name)).toEqual(["Coupe homme", "Taillage barbe"]);
  });

  it("R-51 : passé = honoré, en cours = en cours, à venir = à venir, sans rien enregistrer", async () => {
    const a = await client("Alice", "A");
    const b = await client("Bob", "B");
    const c = await client("Chloé", "C");
    await book(a, ORHAN, "10:00"); // 10:00-10:30 : terminé à 10:40
    await book(b, ORHAN, "10:30", [COUPE_BARBE]); // 10:30-11:00 : en cours
    await book(c, ORHAN, "14:00"); // à venir
    const day = await loadDayPlanning(t.db, DAY, NOW);
    expect(day.columns[0].appointments.map((x) => x.status)).toEqual([
      "honored",
      "in_progress",
      "upcoming",
    ]);
    const [{ n }] =
      await t.sql`select count(*)::int as n from appointment where status = 'honored'`;
    expect(n).toBe(0);
  });

  it("n'affiche pas les RDV annulés, mais garde les lapins", async () => {
    const a = await client("Alice", "A");
    const b = await client("Bob", "B");
    const c = await client("Chloé", "C");
    await book(a, ORHAN, "10:00");
    await book(b, ORHAN, "11:00");
    await book(c, ORHAN, "14:00");
    await t.sql`update appointment set status = 'cancelled_by_salon' where starts_at = ${paris(DAY, "10:00")}`;
    await t.sql`update appointment set status = 'no_show' where starts_at = ${paris(DAY, "11:00")}`;
    const day = await loadDayPlanning(t.db, DAY, NOW);
    expect(day.columns[0].appointments.map((x) => x.status)).toEqual(["no_show", "upcoming"]);
    expect(day.count).toBe(2);
  });

  it("R-52 : indique les lapins déjà reçus par le client et son blocage", async () => {
    const thomas = await client("Thomas", "Durand");
    await insertAppointment(t.sql, {
      customerId: thomas,
      staffId: KAAN,
      startsAt: paris("2026-10-06", "10:00"),
      endsAt: paris("2026-10-06", "10:30"),
      status: "no_show",
    });
    await book(thomas, ORHAN, "14:00");
    await t.sql`update customer set online_booking_blocked = true where id = ${thomas}`;
    const day = await loadDayPlanning(t.db, DAY, NOW);
    expect(day.columns[0].appointments[0]).toMatchObject({ noShowCount: 1, blocked: true });
  });

  it("montre les absences du jour dans la colonne du coiffeur", async () => {
    await t.sql`insert into absence (staff_id, starts_at, ends_at, reason)
      values (${TAHA}, ${paris(DAY, "13:00")}, ${paris(DAY, "18:00")}, 'Cours')`;
    const day = await loadDayPlanning(t.db, DAY, NOW);
    expect(day.columns[3].absences).toEqual([
      { startMinute: 13 * 60, endMinute: 18 * 60, reason: "Cours" },
    ]);
    expect(day.columns[0].absences).toEqual([]);
  });

  it("donne les horaires d'ouverture du jour et signale un jour fermé", async () => {
    const open = await loadDayPlanning(t.db, DAY, NOW);
    expect(open.open).toBe(true);
    expect(open.ranges).toEqual([
      { from: 10 * 60, to: 12 * 60 },
      { from: 13 * 60, to: 19 * 60 },
    ]);
    const monday = await loadDayPlanning(t.db, "2026-11-09", NOW);
    expect(monday.open).toBe(false);
    expect(monday.ranges).toEqual([]);

    await t.sql`insert into closure (starts_on, ends_on, reason) values ('2026-11-04', '2026-11-04', 'Férié')`;
    expect((await loadDayPlanning(t.db, "2026-11-04", NOW)).open).toBe(false);
  });

  it("« À suivre » : les prochains RDV à venir d'aujourd'hui, tous coiffeurs, dans l'ordre", async () => {
    const people = await Promise.all(["A", "B", "C", "D", "E", "F"].map((n) => client(n, n)));
    await book(people[0], ORHAN, "10:00"); // terminé
    await book(people[1], ENES, "11:00");
    await book(people[2], ORHAN, "11:00");
    await book(people[3], ENES, "13:00");
    await book(people[4], ORHAN, "15:00");
    await book(people[5], ENES, "17:00");
    const day = await loadDayPlanning(t.db, DAY, NOW);
    expect(day.next.map((a) => a.customerName)).toEqual(["C C", "B B", "D D", "E E"]);
  });

  it("« À suivre » reste vide un autre jour que le jour courant", async () => {
    const a = await client("A", "A");
    await createAppointment(
      t.db,
      {
        customerId: a,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris("2026-11-10", "10:00"),
        source: "online",
      },
      paris("2026-11-02", "08:00"),
    );
    const other = await loadDayPlanning(t.db, "2026-11-10", NOW);
    expect(other.count).toBe(1);
    expect(other.next).toEqual([]);
  });

  it("les heures sont celles de Paris, y compris autour du changement d'heure", async () => {
    // Samedi 24 octobre 2026 (heure d'été, UTC+2) : 10 h à Paris = 8 h UTC. Mardi 27 (heure d'hiver) : 9 h UTC.
    const a = await client("A", "A");
    await t.sql`insert into appointment (customer_id, staff_id, starts_at, ends_at, status, source)
      values (${a}, ${ORHAN}, '2026-10-24T08:00:00Z', '2026-10-24T08:30:00Z', 'confirmed', 'online'),
             (${a}, ${ORHAN}, '2026-10-27T09:00:00Z', '2026-10-27T09:30:00Z', 'confirmed', 'online')`;
    const saturday = await loadDayPlanning(t.db, "2026-10-24", paris("2026-10-20", "08:00"));
    const tuesday = await loadDayPlanning(t.db, "2026-10-27", paris("2026-10-20", "08:00"));
    expect(saturday.columns[0].appointments[0].startMinute).toBe(10 * 60);
    expect(tuesday.columns[0].appointments[0].startMinute).toBe(10 * 60);
  });
});

describe("fiche d'un RDV", () => {
  it("retrouve le RDV avec son client, ses lignes et le nom de qui l'a réservé au salon", async () => {
    const thomas = await client("Thomas", "Durand");
    const created = await book(thomas, ORHAN, "10:00", [COUPE_BARBE], "salon");
    const card = await loadAppointmentCard(t.db, created.id, NOW);
    expect(card).toMatchObject({
      id: created.id,
      customerId: thomas,
      customerName: "Thomas Durand",
      staffFirstName: "Orhan",
      source: "salon",
      bookedBy: "Enes",
      totalPriceCents: 2800,
    });
  });

  it("donne le montant corrigé à la clôture (R-53), ou null tant qu'il n'a pas été corrigé", async () => {
    const thomas = await client("Thomas", "Durand");
    const created = await book(thomas, ORHAN, "10:00", [COUPE_BARBE], "salon");
    expect((await loadAppointmentCard(t.db, created.id, NOW))?.adjustedAmountCents).toBeNull();
    await t.sql`update appointment set adjusted_amount_cents = 2000 where id = ${created.id}`;
    expect((await loadAppointmentCard(t.db, created.id, NOW))?.adjustedAmountCents).toBe(2000);
  });

  it("n'a pas de fiche pour un RDV inconnu", async () => {
    expect(await loadAppointmentCard(t.db, "00000000-0000-4000-8000-0000000000ff", NOW)).toBeNull();
  });

  it("un service « sur appel » se réserve au salon et se lit sur la fiche", async () => {
    const thomas = await client("Thomas", "Durand");
    const created = await book(thomas, ENES, "13:00", [COLORATION], "salon");
    const card = await loadAppointmentCard(t.db, created.id, NOW);
    expect(card?.items.map((i) => i.name)).toEqual(["Coloration"]);
  });
});
