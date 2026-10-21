import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../../src/lib/domain-error";
import {
  createAppointment,
  extendSeries,
  loadSeriesView,
  previewExtend,
  previewRepeat,
  repeatAppointment,
  salonCancelAppointment,
  salonCancelSeries,
  salonRescheduleAppointment,
  seriesCancellable,
} from "../../src/modules/booking";
import { needsHoldAny } from "../../src/modules/absences";
import { buildIcs } from "../../src/modules/calendar/ics";
import { loadSeriesCalendarEvents } from "../../src/modules/calendar/event";
import { customerBookingState } from "../../src/modules/customers/accounts";
import { processOutbox, type EmailMessage, type EmailTransport } from "../../src/modules/mail";
import type { RepeatRule, SeriesEnd } from "../../src/modules/availability";
import {
  COUPE,
  ENES,
  NOW,
  ORHAN,
  connectTestDb,
  createCustomer,
  insertAppointment,
  paris,
} from "./helpers";

// RDV répétés depuis la tablette (D-71, D-83 à D-92). « Maintenant » : lundi 2 novembre 2026, 8 h.
// Le RDV de départ : mardi 3 novembre, 10 h, coupe chez Orhan, pris au salon.

const t = connectTestDb();
let customerId: string;
let sourceId: string;

const WEEKLY: RepeatRule = { frequency: "weekly", intervalWeeks: 1 };
const count = (total: number): SeriesEnd => ({ kind: "count", total });

beforeEach(async () => {
  await t.reset();
  customerId = await createCustomer(t.sql, { name: "Thomas" });
  sourceId = (
    await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris("2026-11-03", "10:00"),
        source: "salon",
        createdByStaffId: ORHAN,
        forName: "Inès",
      },
      NOW,
    )
  ).id;
  // La confirmation du RDV de départ est déjà partie : seuls les emails de la série comptent ici.
  await t.sql`delete from email_outbox`;
});
afterAll(() => t.close());

async function expectRefused(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `une erreur « ${code} » était attendue`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

const repeat = (overrides: Partial<Parameters<typeof repeatAppointment>[1]> = {}, now = NOW) =>
  repeatAppointment(
    t.db,
    {
      appointmentId: sourceId,
      rule: WEEKLY,
      staffId: ORHAN,
      end: count(4),
      authorStaffId: ENES,
      ...overrides,
    },
    now,
  );

const seriesRows = () => t.sql`
  select a.id, a.starts_at, a.staff_id, a.status, a.source, a.created_by_staff_id, a.for_name, a.series_id
  from appointment a where a.series_id is not null order by a.starts_at`;

const parisDay = (instant: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(instant);

function recorder() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    async send(message) {
      sent.push(message);
    },
  };
  return { transport, sent };
}
const mailOptions = { baseUrl: "https://exemple.fr", secret: "secret-de-test" };

describe("D-83 : « Répéter ce RDV » depuis la fiche", () => {
  it("le RDV devient le premier de la série ; les suivants sont des RDV du salon, signés", async () => {
    const written = await repeat();
    expect(written.created).toHaveLength(3);
    const rows = await seriesRows();
    expect(rows.map((r) => parisDay(r.starts_at))).toEqual([
      "2026-11-03",
      "2026-11-10",
      "2026-11-17",
      "2026-11-24",
    ]);
    expect(rows[0].id).toBe(sourceId);
    expect(new Set(rows.map((r) => r.series_id)).size).toBe(1);
    for (const row of rows.slice(1)) {
      expect(row).toMatchObject({
        status: "confirmed",
        source: "salon",
        created_by_staff_id: ENES,
        staff_id: ORHAN,
        for_name: "Inès",
      });
    }
    const [audit] =
      await t.sql`select actor_id, after from audit_log where action = 'series.created'`;
    expect(audit.actor_id).toBe(ENES);
    expect(audit.after.appointments).toHaveLength(3);
  });

  it("l'aperçu calcule les mêmes dates sans rien écrire", async () => {
    const plan = await previewRepeat(
      t.db,
      { appointmentId: sourceId, rule: WEEKLY, staffId: ORHAN, end: count(4) },
      NOW,
    );
    expect(plan.ruleLabel).toBe("Chaque semaine");
    expect(plan.dates.filter((d) => d.ok)).toHaveLength(3);
    expect(await seriesRows()).toHaveLength(0);
  });

  it("refuse sans auteur, pour un RDV annulé, ou déjà dans une série", async () => {
    await expectRefused(repeat({ authorStaffId: "" }), "author_required");
    await repeat();
    await expectRefused(repeat(), "already_in_series");
    await t.reset();
    customerId = await createCustomer(t.sql);
    const other = await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: ORHAN,
        startsAt: paris("2026-11-03", "10:00"),
        source: "salon",
        createdByStaffId: ORHAN,
      },
      NOW,
    );
    await salonCancelAppointment(t.db, { appointmentId: other.id, authorStaffId: ORHAN }, NOW);
    await expectRefused(repeat({ appointmentId: other.id }), "not_modifiable");
  });

  it("refuse une règle impossible : « 2e mardi » d'un 5e mardi, moins de 2 RDV, fin avant le départ", async () => {
    await expectRefused(repeat({ end: count(1) }), "invalid_series");
    await expectRefused(repeat({ end: { kind: "until", date: "2026-11-03" } }), "invalid_series");
    await t.sql`update appointment set starts_at = ${paris("2026-12-29", "10:00")}, ends_at = ${paris("2026-12-29", "10:30")}`;
    await expectRefused(
      repeat({ rule: { frequency: "monthly", monthlyMode: "weekday_rank" } }),
      "invalid_series",
    );
  });
});

describe("D-84 : coiffeur pris ou absent", () => {
  it("coiffeur précis : la date est sautée, avec sa raison", async () => {
    const other = await createCustomer(t.sql);
    await insertAppointment(t.sql, {
      customerId: other,
      staffId: ORHAN,
      startsAt: paris("2026-11-10", "10:00"),
      endsAt: paris("2026-11-10", "10:30"),
    });
    const written = await repeat({ end: { kind: "until", date: "2026-11-24" } });
    expect(written.dates.map((d) => [d.date, d.ok ? "ok" : d.reason])).toEqual([
      ["2026-11-10", "busy"],
      ["2026-11-17", "ok"],
      ["2026-11-24", "ok"],
    ]);
  });

  it("« Sans préférence » : un autre coiffeur libre prend la date", async () => {
    await t.sql`
      insert into absence (staff_id, starts_at, ends_at, reason)
      values (${ORHAN}, ${paris("2026-11-10", "09:00")}, ${paris("2026-11-10", "19:00")}, 'Congé')`;
    const written = await repeat({ staffId: "any", end: count(3) });
    expect(written.created.map((c) => c.staffId)).toEqual([ENES, ORHAN]);
  });
});

describe("D-85, D-86 : chaque mois, fin et limite de 6 mois", () => {
  it("« N rendez-vous en tout » compte celui de départ et remplace une date de fermeture", async () => {
    await t.sql`insert into closure (starts_on, ends_on) values ('2026-11-17', '2026-11-17')`;
    const written = await repeat({ end: count(4) });
    expect(written.created.map((c) => parisDay(c.startsAt))).toEqual([
      "2026-11-10",
      "2026-11-24",
      "2026-12-01",
    ]);
    expect(written.dates.find((d) => !d.ok)).toMatchObject({
      date: "2026-11-17",
      reason: "closed",
    });
  });

  it("chaque mois, le 2e mardi ; jamais au-delà de 6 mois", async () => {
    await t.sql`update appointment set starts_at = ${paris("2026-11-10", "10:00")}, ends_at = ${paris("2026-11-10", "10:30")}`;
    const written = await repeat({
      rule: { frequency: "monthly", monthlyMode: "weekday_rank" },
      end: { kind: "until", date: "2027-12-31" },
    });
    expect(written.created.map((c) => parisDay(c.startsAt))).toEqual([
      "2026-12-08",
      "2027-01-12",
      "2027-02-09",
      "2027-03-09",
      "2027-04-13",
    ]);
    expect(written.limit).toBe("2027-05-10");
  });

  it("garde 10 h à Paris après le changement d'heure de mars", async () => {
    const written = await repeat({
      rule: { frequency: "weekly", intervalWeeks: 4 },
      end: count(7),
    });
    const last = written.created.at(-1)!;
    expect(parisDay(last.startsAt)).toBe("2027-04-20");
    expect(last.startsAt.toISOString()).toBe("2027-04-20T08:00:00.000Z");
  });

  it("refuse quand aucune date n'est libre : rien n'est écrit", async () => {
    await t.sql`insert into closure (starts_on, ends_on) values ('2026-11-04', '2027-06-30')`;
    await expectRefused(repeat(), "series_empty");
    expect(await t.sql`select * from appointment_series`).toHaveLength(0);
    const [source] = await t.sql`select series_id from appointment where id = ${sourceId}`;
    expect(source.series_id).toBeNull();
  });
});

describe("D-87 : hors limite de RDV à venir (R-25)", () => {
  it("la série dépasse la limite, et le client peut encore réserver seul en ligne", async () => {
    await t.sql`update salon_settings set max_upcoming_per_customer = 2`;
    const written = await repeat({ end: count(6) });
    expect(written.created).toHaveLength(5);
    // Le RDV de départ est dans la série : aucun RDV hors série.
    expect((await customerBookingState(t.db, customerId, NOW)).upcoming).toBe(0);
    await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: ENES,
        startsAt: paris("2026-11-05", "14:00"),
        source: "online",
      },
      NOW,
    );
    await createAppointment(
      t.db,
      {
        customerId,
        serviceIds: [COUPE],
        staffId: ENES,
        startsAt: paris("2026-11-06", "14:00"),
        source: "online",
      },
      NOW,
    );
    await expectRefused(
      createAppointment(
        t.db,
        {
          customerId,
          serviceIds: [COUPE],
          staffId: ENES,
          startsAt: paris("2026-11-07", "14:00"),
          source: "online",
        },
        NOW,
      ),
      "too_many_upcoming",
    );
  });
});

describe("D-88 : annulation par le salon", () => {
  it("« Celui-ci et les suivants » garde les RDV d'avant ; un seul email liste les dates", async () => {
    const written = await repeat({ end: count(5) });
    const third = written.created[1].id; // 17 novembre
    const result = await salonCancelSeries(
      t.db,
      { appointmentId: third, scope: "following", authorStaffId: ORHAN },
      NOW,
    );
    expect(result.cancelled).toHaveLength(3);
    const rows = await seriesRows();
    expect(rows.map((r) => r.status)).toEqual([
      "confirmed",
      "confirmed",
      "cancelled_by_salon",
      "cancelled_by_salon",
      "cancelled_by_salon",
    ]);
    const emails =
      await t.sql`select appointment_id, payload from email_outbox where type = 'cancellation'`;
    expect(emails).toHaveLength(1);
    expect(emails[0].appointment_id).toBe(third);
    expect(emails[0].payload.appointmentIds).toHaveLength(3);
    const audits =
      await t.sql`select entity_id from audit_log where action = 'appointment.cancelled'`;
    expect(audits).toHaveLength(3);
  });

  it("« Tous les RDV à venir de la série » ne touche pas aux RDV passés", async () => {
    await repeat({ end: count(4) });
    const later = new Date(paris("2026-11-10", "12:00"));
    const [second] =
      await t.sql`select id from appointment where starts_at = ${paris("2026-11-17", "10:00")}`;
    const touched = await seriesCancellable(
      t.db,
      { appointmentId: second.id, scope: "all" },
      later,
    );
    expect(touched.map((r) => parisDay(r.startsAt))).toEqual(["2026-11-17", "2026-11-24"]);
    await salonCancelSeries(
      t.db,
      { appointmentId: second.id, scope: "all", authorStaffId: ORHAN },
      later,
    );
    const rows = await seriesRows();
    expect(rows.map((r) => r.status)).toEqual([
      "confirmed",
      "confirmed",
      "cancelled_by_salon",
      "cancelled_by_salon",
    ]);
  });

  it("R-43 : un RDV touché par une absence fait retenir l'email groupé", async () => {
    await repeat({ end: count(3) });
    await t.sql`
      insert into absence (staff_id, starts_at, ends_at, reason)
      values (${ORHAN}, ${paris("2026-11-17", "09:00")}, ${paris("2026-11-17", "19:00")}, 'Congé')`;
    const touched = await seriesCancellable(
      t.db,
      { appointmentId: sourceId, scope: "following" },
      NOW,
    );
    const hold = await needsHoldAny(
      t.db,
      touched.map((r) => r.id),
      NOW,
    );
    expect(hold).toBe(true);
    await salonCancelSeries(
      t.db,
      { appointmentId: sourceId, scope: "following", authorStaffId: ORHAN, holdEmails: hold },
      NOW,
    );
    const [email] =
      await t.sql`select held_for_manager from email_outbox where type = 'cancellation'`;
    expect(email.held_for_manager).toBe(true);
  });

  it("refuse pour un RDV hors série", async () => {
    await expectRefused(
      salonCancelSeries(
        t.db,
        { appointmentId: sourceId, scope: "following", authorStaffId: ORHAN },
        NOW,
      ),
      "not_in_series",
    );
  });
});

describe("D-89 : un RDV de la série se déplace seul", () => {
  it("le RDV déplacé reste dans la série, les autres ne bougent pas", async () => {
    const written = await repeat({ end: count(3) });
    await salonRescheduleAppointment(
      t.db,
      {
        appointmentId: written.created[0].id,
        staffId: ENES,
        startsAt: paris("2026-11-11", "15:00"),
        authorStaffId: ORHAN,
      },
      NOW,
    );
    const rows = await seriesRows();
    expect(rows.map((r) => parisDay(r.starts_at))).toEqual([
      "2026-11-03",
      "2026-11-11",
      "2026-11-17",
    ]);
  });
});

describe("D-90 : prolonger la série", () => {
  it("reprend la règle après la dernière date prévue, « N rendez-vous de plus »", async () => {
    const written = await repeat({ end: count(3) });
    const plan = await previewExtend(
      t.db,
      { appointmentId: written.created[1].id, end: count(2) },
      NOW,
    );
    expect(plan.dates.filter((d) => d.ok).map((d) => d.date)).toEqual(["2026-11-24", "2026-12-01"]);
    const more = await extendSeries(
      t.db,
      { appointmentId: sourceId, end: count(2), authorStaffId: ORHAN },
      NOW,
    );
    expect(more.seriesId).toBe(written.seriesId);
    expect((await seriesRows()).map((r) => parisDay(r.starts_at))).toEqual([
      "2026-11-03",
      "2026-11-10",
      "2026-11-17",
      "2026-11-24",
      "2026-12-01",
    ]);
    const [audit] = await t.sql`select after from audit_log where action = 'series.extended'`;
    expect(audit.after.appointments).toHaveLength(2);
    // Une date sautée à la création n'est pas reprise : la prolongation part après la dernière date examinée.
    const view = await loadSeriesView(t.db, sourceId, NOW);
    expect(view).toMatchObject({ position: 1, total: 5, isLast: false });
  });

  it("refuse pour un RDV hors série", async () => {
    await expectRefused(
      extendSeries(t.db, { appointmentId: sourceId, end: count(2), authorStaffId: ORHAN }, NOW),
      "not_in_series",
    );
  });
});

describe("D-91 : un seul email, un rappel par RDV", () => {
  it("met en file un email de série (pas de confirmation par RDV) et un rappel pour chaque RDV", async () => {
    const written = await repeat({ end: count(4) });
    const rows = await t.sql`select type, appointment_id, payload from email_outbox order by type`;
    expect(rows.filter((r) => r.type === "confirmation")).toHaveLength(0);
    const series = rows.filter((r) => r.type === "series_confirmation");
    expect(series).toHaveLength(1);
    expect(series[0].payload.appointmentIds).toEqual([
      sourceId,
      ...written.created.map((c) => c.id),
    ]);
    expect(
      rows
        .filter((r) => r.type === "reminder")
        .map((r) => r.appointment_id)
        .sort(),
    ).toEqual(written.created.map((c) => c.id).sort());
  });

  it("l'email liste les dates qui tiennent encore à l'envoi, avec le lien d'agenda de la série", async () => {
    const written = await repeat({ end: count(4) });
    await salonCancelAppointment(
      t.db,
      { appointmentId: written.created[2].id, authorStaffId: ORHAN },
      NOW,
    );
    const { transport, sent } = recorder();
    await processOutbox(t.db, { ...mailOptions, transport, now: NOW });
    const email = sent.find((m) => m.subject.includes("rendez-vous sont confirmés"));
    expect(email?.subject).toBe("Vos 3 rendez-vous sont confirmés");
    expect(email?.text).toContain("Chaque semaine");
    expect(email?.text).toContain("Mardi 3 novembre · 10:00 · avec Orhan");
    expect(email?.text).toContain("Mardi 17 novembre · 10:00 · avec Orhan");
    expect(email?.text).not.toContain("24 novembre");
    expect(email?.text).toContain("Pour Inès");
    expect(email?.text).toContain(`https://exemple.fr/api/agenda/serie/${written.seriesId}?t=`);
  });

  it("l'annulation groupée part en un seul email qui liste les dates", async () => {
    const written = await repeat({ end: count(3) });
    await t.sql`delete from email_outbox`;
    await salonCancelSeries(
      t.db,
      { appointmentId: written.created[0].id, scope: "following", authorStaffId: ORHAN },
      NOW,
    );
    const { transport, sent } = recorder();
    await processOutbox(t.db, { ...mailOptions, transport, now: NOW });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Vos 2 rendez-vous à partir du mardi 10 novembre sont annulés");
    expect(sent[0].text).toContain("- Mardi 10 novembre · 10:00 · avec Orhan");
    expect(sent[0].text).toContain("- Mardi 17 novembre · 10:00 · avec Orhan");
  });

  it("sans email sur la fiche, rien n'est mis en file (D-81)", async () => {
    await t.sql`update customer set email = null`;
    await repeat();
    expect(await t.sql`select * from email_outbox`).toHaveLength(0);
  });

  it("le fichier d'agenda de la série contient chaque RDV à venir", async () => {
    const written = await repeat({ end: count(3) });
    const events = await loadSeriesCalendarEvents(t.db, written.seriesId, NOW);
    expect(events).toHaveLength(3);
    expect(buildIcs(events).match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });
});

describe("D-92 : prix du jour et place dans la série", () => {
  it("les nouveaux RDV prennent le prix de la carte du jour ; le RDV de départ garde le sien", async () => {
    await t.sql`update service set price_cents = 2000 where id = ${COUPE}`;
    await repeat({ end: count(2) });
    const prices = await t.sql`
      select a.id, i.price_cents from appointment a join appointment_item i on i.appointment_id = a.id
      order by a.starts_at`;
    expect(prices.map((p) => p.price_cents)).toEqual([1800, 2000]);
  });

  it("la fiche dit le rang du RDV, le total et le dernier", async () => {
    const written = await repeat({
      rule: { frequency: "weekly", intervalWeeks: 2 },
      end: count(3),
    });
    const view = await loadSeriesView(t.db, written.created[1].id, NOW);
    expect(view).toMatchObject({
      ruleLabel: "Toutes les 2 semaines",
      position: 3,
      total: 3,
      isLast: true,
      upcomingBefore: 2,
      followingCount: 1,
      staffChoice: ORHAN,
    });
  });
});
