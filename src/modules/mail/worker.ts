import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import {
  appointment,
  appointmentItem,
  appointmentSeries,
  customer,
  emailOutbox,
  salonSettings,
  staff,
} from "@/db/schema";
import { listAppointmentsToHandle } from "@/modules/absences/to-handle";
import { isHonored } from "@/modules/appointments/status";
import { ruleLabel, type RepeatRule } from "@/modules/availability/recurrence";
import {
  calendarSubject,
  reviewOptOutSubject,
  seriesCalendarSubject,
  signToken,
} from "@/modules/security/token";
import { z } from "zod";
import { renderCancellationEmail } from "./templates/cancellation";
import { renderConfirmationEmail } from "./templates/confirmation";
import { renderModificationEmail } from "./templates/modification";
import { renderReminderEmail } from "./templates/reminder";
import { renderReviewInvitationEmail } from "./templates/review-invitation";
import { renderSeriesConfirmationEmail } from "./templates/series-confirmation";
import type { RenderedEmail } from "./layout";
import { EmailSendError, type EmailMessage, type EmailTransport } from "./transport";

/** Délais entre deux tentatives, en minutes ; au-delà, l'email passe en échec définitif. */
export const BACKOFF_MINUTES = [1, 5, 15, 60, 240];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;
/** Pendant ce temps, un email pris en charge n'est repris par personne d'autre. */
const LEASE_MINUTES = 5;

export interface ProcessOptions {
  transport: EmailTransport;
  /** Adresse publique du site, pour les liens (agenda, gestion du RDV, logo). */
  baseUrl: string;
  /** Secret qui signe le lien d'agenda. */
  secret: string;
  now?: Date;
  limit?: number;
  /** Traiter seulement ces emails (envoi immédiat après une réservation). */
  ids?: string[];
}

export interface ProcessResult {
  sent: number;
  retried: number;
  failed: number;
}

type Row = typeof emailOutbox.$inferSelect;

/**
 * Les RDV dont le client ne doit rien recevoir pour l'instant : « à traiter » (R-42) ou avec un email retenu pour le gérant
 * (R-43). La liste se calcule une seule fois par passage, et seulement si un rappel la demande : elle ne change pas
 * pendant l'envoi, et la recalculer pour chaque rappel multiplierait les allers-retours vers la base.
 */
type HoldCheck = (appointmentId: string) => Promise<boolean>;

function holdChecker(db: Database, now: Date): HoldCheck {
  let held: Promise<Set<string>> | null = null;
  return async (appointmentId) => {
    held ??= (async () => {
      const [toHandle, retained] = await Promise.all([
        listAppointmentsToHandle(db, now),
        db
          .select({ appointmentId: emailOutbox.appointmentId })
          .from(emailOutbox)
          .where(and(eq(emailOutbox.heldForManager, true), eq(emailOutbox.status, "pending"))),
      ]);
      const ids = new Set(toHandle.map((a) => a.id));
      for (const row of retained) if (row.appointmentId) ids.add(row.appointmentId);
      return ids;
    })();
    return (await held).has(appointmentId);
  };
}

class Skip extends Error {}
/** Pas maintenant, sans que ce soit un échec : l'email reste en file et sera repris plus tard (ne compte pas comme un essai). */
class Defer extends Error {}

/** Un rappel repoussé (RDV à traiter) est repris au prochain passage du cron, au plus tard dans cet intervalle. */
const DEFER_MINUTES = 6 * 60;

const minutes = (n: number) => n * 60_000;

interface EmailAppointment {
  id: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  status: (typeof appointment.$inferSelect)["status"];
  staffFirstName: string;
  customerId: string;
  customerFirstName: string | null;
  reviewOptOut: boolean;
  /** Faux pour une fiche sans compte : « Créer mon compte » au lieu de « Gérer mon rendez-vous » (D-81). */
  hasAccount: boolean;
  /** Fiche importée qui n'a encore reçu aucun email : la mention d'origine est due (D-78). */
  originNotice: boolean;
  forName: string | null;
  items: { name: string; durationMin: number; priceCents: number }[];
  totalPriceCents: number;
  durationMinutes: number;
  cutoffHours: number;
  timezone: string;
  reviewUrl: string | null;
}

async function loadEmailAppointment(db: Database, row: Row): Promise<EmailAppointment> {
  if (!row.appointmentId) throw new Skip("email sans rendez-vous");
  const [appt] = await db
    .select({
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      createdAt: appointment.createdAt,
      status: appointment.status,
      staffFirstName: staff.firstName,
      customerId: appointment.customerId,
      customerFirstName: customer.firstName,
      reviewOptOut: customer.reviewOptOut,
      authUserId: customer.authUserId,
      origin: customer.origin,
      originNoticeSentAt: customer.originNoticeSentAt,
      forName: appointment.forName,
    })
    .from(appointment)
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .innerJoin(customer, eq(customer.id, appointment.customerId))
    .where(eq(appointment.id, row.appointmentId));
  if (!appt) throw new Skip("rendez-vous introuvable");
  // Fiche supprimée (R-75) : l'adresse a été effacée, il n'y a plus personne à qui écrire.
  if (!row.toEmail) throw new Skip("destinataire effacé");

  const items = await db
    .select({
      name: appointmentItem.nameSnapshot,
      durationMin: appointmentItem.durationMin,
      priceCents: appointmentItem.priceCents,
    })
    .from(appointmentItem)
    .where(eq(appointmentItem.appointmentId, appt.id))
    .orderBy(asc(appointmentItem.position));
  const [settings] = await db.select().from(salonSettings).limit(1);
  const { authUserId, origin, originNoticeSentAt, ...rest } = appt;
  return {
    ...rest,
    hasAccount: !!authUserId,
    originNotice: origin === "import" && !originNoticeSentAt,
    items,
    totalPriceCents: items.reduce((sum, i) => sum + i.priceCents, 0),
    durationMinutes: items.reduce((sum, i) => sum + i.durationMin, 0),
    cutoffHours: settings?.changeCutoffHours ?? 48,
    timezone: settings?.timezone ?? "Europe/Paris",
    reviewUrl: settings?.reviewUrl ?? null,
  };
}

const isCancelled = (appt: EmailAppointment) =>
  appt.status === "cancelled_by_customer" || appt.status === "cancelled_by_salon";

const calendarUrl = (appt: EmailAppointment, options: ProcessOptions) =>
  `${options.baseUrl}/api/agenda/${appt.id}?t=${signToken(options.secret, calendarSubject(appt.id))}`;

/** Ce que chaque modèle reçoit du destinataire (D-78, D-80, D-81). */
const recipient = (appt: EmailAppointment, options: ProcessOptions) => ({
  hasAccount: appt.hasAccount,
  signupUrl: `${options.baseUrl}/inscription`,
  originNotice: appt.originNotice,
});

function message(row: Row, appt: EmailAppointment, rendered: RenderedEmail): EmailMessage {
  return {
    to: {
      email: row.toEmail,
      ...(appt.customerFirstName ? { name: appt.customerFirstName } : {}),
    },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  };
}

async function renderConfirmation(
  db: Database,
  row: Row,
  options: ProcessOptions,
): Promise<EmailMessage> {
  const appt = await loadEmailAppointment(db, row);
  if (isCancelled(appt)) throw new Skip("rendez-vous annulé avant l'envoi");

  const changeDeadline = new Date(appt.startsAt.getTime() - appt.cutoffHours * 3_600_000);
  return message(
    row,
    appt,
    renderConfirmationEmail({
      ...recipient(appt, options),
      forName: appt.forName,
      firstName: appt.customerFirstName,
      startsAt: appt.startsAt,
      endsAt: appt.endsAt,
      items: appt.items,
      totalPriceCents: appt.totalPriceCents,
      durationMinutes: appt.durationMinutes,
      staffFirstName: appt.staffFirstName,
      changeDeadline,
      // R-32 : un RDV pris dans le délai de modification ne se modifie pas en ligne.
      changeableOnline: appt.createdAt.getTime() <= changeDeadline.getTime(),
      manageUrl: `${options.baseUrl}/compte/rendez-vous`,
      calendarUrl: calendarUrl(appt, options),
      logoUrl: `${options.baseUrl}/email/logo.png`,
    }),
  );
}

const modificationPayload = z.object({
  previousStartsAt: z.iso.datetime(),
  previousStaffFirstName: z.string().nullable(),
  startsAt: z.iso.datetime(),
  staffFirstName: z.string().nullable(),
  changedAt: z.iso.datetime(),
  // D-52 : présent quand le salon a déplacé le RDV.
  by: z.literal("salon").optional(),
});

/** Annulation : seul le salon laisse une trace dans la charge utile (D-52) ; une annulation groupée liste ses RDV (D-91). */
const cancellationPayload = z.object({
  by: z.literal("salon").optional(),
  appointmentIds: z.array(z.uuid()).optional(),
});

/** Date et coiffeur de chaque RDV demandé, dans l'ordre, avec leur statut. */
async function loadDates(db: Database, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      id: appointment.id,
      startsAt: appointment.startsAt,
      status: appointment.status,
      staffFirstName: staff.firstName,
    })
    .from(appointment)
    .innerJoin(staff, eq(staff.id, appointment.staffId))
    .where(inArray(appointment.id, ids))
    .orderBy(asc(appointment.startsAt));
}

async function renderModification(
  db: Database,
  row: Row,
  options: ProcessOptions,
): Promise<EmailMessage> {
  const appt = await loadEmailAppointment(db, row);
  if (isCancelled(appt)) throw new Skip("rendez-vous annulé avant l'envoi");
  const payload = modificationPayload.safeParse(row.payload);
  if (!payload.success) throw new Skip("ancien créneau absent de l'email");

  // Le créneau annoncé est celui de ce déplacement, pas forcément le créneau actuel du RDV.
  const startsAt = new Date(payload.data.startsAt);
  const staffFirstName = payload.data.staffFirstName ?? appt.staffFirstName;
  const changeDeadline = new Date(startsAt.getTime() - appt.cutoffHours * 3_600_000);
  return message(
    row,
    appt,
    renderModificationEmail({
      ...recipient(appt, options),
      forName: appt.forName,
      firstName: appt.customerFirstName,
      startsAt,
      items: appt.items,
      totalPriceCents: appt.totalPriceCents,
      durationMinutes: appt.durationMinutes,
      staffFirstName,
      previousStartsAt: new Date(payload.data.previousStartsAt),
      // Le coiffeur précédent n'est affiché que s'il a changé.
      previousStaffFirstName:
        payload.data.previousStaffFirstName &&
        payload.data.previousStaffFirstName !== staffFirstName
          ? payload.data.previousStaffFirstName
          : null,
      changeDeadline,
      // R-30, R-32 : le nouveau créneau reste modifiable s'il est à plus de 48 h du moment du déplacement.
      changeableOnline: new Date(payload.data.changedAt).getTime() <= changeDeadline.getTime(),
      manageUrl: `${options.baseUrl}/compte/rendez-vous`,
      calendarUrl: calendarUrl(appt, options),
      logoUrl: `${options.baseUrl}/email/logo.png`,
      changedBy: payload.data.by === "salon" ? "salon" : "customer",
    }),
  );
}

async function renderCancellation(
  db: Database,
  row: Row,
  options: ProcessOptions,
): Promise<EmailMessage> {
  const appt = await loadEmailAppointment(db, row);
  if (!isCancelled(appt)) throw new Skip("rendez-vous rétabli avant l'envoi");
  const payload = cancellationPayload.safeParse(row.payload ?? {});
  // Annulation groupée (D-88) : seulement les RDV toujours annulés au moment de l'envoi.
  const group = payload.success && payload.data.appointmentIds ? payload.data.appointmentIds : [];
  const dates = (await loadDates(db, group)).filter(
    (d) => d.status === "cancelled_by_customer" || d.status === "cancelled_by_salon",
  );
  return message(
    row,
    appt,
    renderCancellationEmail({
      ...recipient(appt, options),
      firstName: appt.customerFirstName,
      startsAt: appt.startsAt,
      items: appt.items,
      staffFirstName: appt.staffFirstName,
      bookUrl: `${options.baseUrl}/reservation`,
      logoUrl: `${options.baseUrl}/email/logo.png`,
      cancelledBy: payload.success && payload.data.by === "salon" ? "salon" : "customer",
      ...(dates.length > 1 ? { dates } : {}),
    }),
  );
}

const seriesPayload = z.object({
  seriesId: z.uuid(),
  appointmentIds: z.array(z.uuid()).min(1),
  extended: z.boolean().optional(),
});

/** Email unique d'une série (D-91) : les RDV posés qui tiennent encore à l'envoi. */
async function renderSeriesConfirmation(
  db: Database,
  row: Row,
  options: ProcessOptions,
  now: Date,
): Promise<EmailMessage> {
  const appt = await loadEmailAppointment(db, row);
  const payload = seriesPayload.safeParse(row.payload);
  if (!payload.success) throw new Skip("dates absentes de l'email de série");
  const dates = (await loadDates(db, payload.data.appointmentIds)).filter(
    (d) => d.status === "confirmed" && d.startsAt.getTime() > now.getTime(),
  );
  if (dates.length === 0) throw new Skip("plus aucun rendez-vous de la série à annoncer");
  const [series] = await db
    .select()
    .from(appointmentSeries)
    .where(eq(appointmentSeries.id, payload.data.seriesId));
  if (!series) throw new Skip("série introuvable");
  const rule: RepeatRule =
    series.frequency === "weekly"
      ? { frequency: "weekly", intervalWeeks: series.intervalWeeks as 1 | 2 | 3 | 4 }
      : { frequency: "monthly", monthlyMode: series.monthlyMode! };
  return message(
    row,
    appt,
    renderSeriesConfirmationEmail({
      ...recipient(appt, options),
      forName: appt.forName,
      firstName: appt.customerFirstName,
      ruleLabel: ruleLabel(series.anchorOn, rule),
      dates,
      items: appt.items,
      totalPriceCents: appt.totalPriceCents,
      durationMinutes: appt.durationMinutes,
      cutoffHours: appt.cutoffHours,
      extended: payload.data.extended === true,
      manageUrl: `${options.baseUrl}/compte/rendez-vous`,
      calendarUrl: `${options.baseUrl}/api/agenda/serie/${series.id}?t=${signToken(options.secret, seriesCalendarSubject(series.id))}`,
      logoUrl: `${options.baseUrl}/email/logo.png`,
    }),
  );
}

const reminderPayload = z.object({ startsAt: z.iso.datetime() });

/** Jours de Paris entre l'envoi et le RDV : 3 pour un rappel à 72 h, 0 si le RDV est aujourd'hui. */
const daysBetween = (from: Date, to: Date, zone: string) =>
  Math.round(
    DateTime.fromJSDate(to, { zone })
      .startOf("day")
      .diff(DateTime.fromJSDate(from, { zone }).startOf("day"), "days").days,
  );

async function renderReminder(
  db: Database,
  row: Row,
  options: ProcessOptions,
  now: Date,
  isHeld: HoldCheck,
): Promise<EmailMessage> {
  const appt = await loadEmailAppointment(db, row);
  if (isCancelled(appt)) throw new Skip("rendez-vous annulé avant l'envoi");
  const payload = reminderPayload.safeParse(row.payload);
  if (!payload.success) throw new Skip("créneau absent du rappel");
  // Le rappel annonce un créneau précis : si le RDV a été déplacé, le déplacement en a programmé un nouveau.
  if (appt.startsAt.getTime() !== new Date(payload.data.startsAt).getTime()) {
    throw new Skip("rendez-vous déplacé avant l'envoi");
  }
  if (appt.status !== "confirmed") throw new Skip("rendez-vous plus confirmé");
  if (appt.startsAt.getTime() <= now.getTime()) throw new Skip("rendez-vous déjà passé");
  // R-42, R-43 : un RDV « à traiter », ou dont un email attend le gérant, ne reçoit rien tant qu'il n'est pas traité.
  if (await isHeld(appt.id)) throw new Defer("rendez-vous à traiter");

  const changeDeadline = new Date(appt.startsAt.getTime() - appt.cutoffHours * 3_600_000);
  return message(
    row,
    appt,
    renderReminderEmail({
      ...recipient(appt, options),
      forName: appt.forName,
      firstName: appt.customerFirstName,
      startsAt: appt.startsAt,
      items: appt.items,
      totalPriceCents: appt.totalPriceCents,
      durationMinutes: appt.durationMinutes,
      staffFirstName: appt.staffFirstName,
      daysAway: daysBetween(now, appt.startsAt, appt.timezone),
      changeDeadline,
      // R-30, R-32 : si le cron est en retard, la date limite peut être passée à l'envoi.
      changeableOnline: now.getTime() <= changeDeadline.getTime(),
      manageUrl: `${options.baseUrl}/compte/rendez-vous`,
      logoUrl: `${options.baseUrl}/email/logo.png`,
    }),
  );
}

async function renderReviewInvitation(
  db: Database,
  row: Row,
  options: ProcessOptions,
  now: Date,
): Promise<EmailMessage> {
  const appt = await loadEmailAppointment(db, row);
  // R-51, D-54 : le lapin se signale et se corrige jusqu'au dernier moment ; on revérifie à l'envoi.
  if (!isHonored(appt, now)) throw new Skip("rendez-vous non honoré");
  if (appt.reviewOptOut) throw new Skip("le client ne veut plus de ces invitations");
  if (!appt.reviewUrl) throw new Skip("page d'avis non renseignée");

  const token = signToken(options.secret, reviewOptOutSubject(appt.customerId));
  return message(
    row,
    appt,
    renderReviewInvitationEmail({
      ...recipient(appt, options),
      firstName: appt.customerFirstName,
      startsAt: appt.startsAt,
      items: appt.items,
      staffFirstName: appt.staffFirstName,
      reviewUrl: appt.reviewUrl,
      rebookUrl: `${options.baseUrl}/reservation?reprendre=${appt.id}`,
      bookUrl: `${options.baseUrl}/reservation`,
      unsubscribeUrl: `${options.baseUrl}/avis/desinscription?c=${appt.customerId}&t=${token}`,
      logoUrl: `${options.baseUrl}/email/logo.png`,
    }),
  );
}

async function render(
  db: Database,
  row: Row,
  options: ProcessOptions,
  now: Date,
  isHeld: HoldCheck,
): Promise<EmailMessage> {
  switch (row.type) {
    case "confirmation":
      return renderConfirmation(db, row, options);
    case "modification":
      return renderModification(db, row, options);
    case "cancellation":
      return renderCancellation(db, row, options);
    case "reminder":
      return renderReminder(db, row, options, now, isHeld);
    case "review_invitation":
      return renderReviewInvitation(db, row, options, now);
    case "series_confirmation":
      return renderSeriesConfirmation(db, row, options, now);
    default:
      throw new EmailSendError(`Type d'email non géré : ${row.type}`, true);
  }
}

/**
 * D-78 : une fois un email parti vers une fiche importée, la mention d'origine a été faite ; les suivants ne la répètent
 * pas. Sans effet pour les autres fiches.
 */
async function markOriginNotified(db: Database, row: Row, now: Date): Promise<void> {
  if (!row.appointmentId) return;
  const [appt] = await db
    .select({ customerId: appointment.customerId })
    .from(appointment)
    .where(eq(appointment.id, row.appointmentId));
  if (!appt) return;
  await db
    .update(customer)
    .set({ originNoticeSentAt: now })
    .where(
      and(
        eq(customer.id, appt.customerId),
        eq(customer.origin, "import"),
        isNull(customer.originNoticeSentAt),
      ),
    );
}

/** Prend en charge les emails à envoyer : réserve chacun pour 5 minutes, sans jamais en prendre un déjà pris. */
async function claim(db: Database, options: ProcessOptions): Promise<Row[]> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.status, "pending"),
          eq(emailOutbox.heldForManager, false), // R-43 : retenu jusqu'à la confirmation du gérant
          lte(emailOutbox.nextAttemptAt, now),
          ...(options.ids ? [inArray(emailOutbox.id, options.ids)] : []),
        ),
      )
      .orderBy(asc(emailOutbox.nextAttemptAt))
      .limit(options.limit ?? 20)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];

    const rows = await tx
      .select()
      .from(emailOutbox)
      .where(
        inArray(
          emailOutbox.id,
          due.map((d) => d.id),
        ),
      );
    for (const row of rows) {
      await tx
        .update(emailOutbox)
        .set({
          attempts: row.attempts + 1,
          nextAttemptAt: new Date(now.getTime() + minutes(LEASE_MINUTES)),
        })
        .where(eq(emailOutbox.id, row.id));
    }
    return rows.map((row) => ({ ...row, attempts: row.attempts + 1 }));
  });
}

/**
 * Envoie les emails en attente (principe 7). Appelé juste après une réservation (envoi immédiat, `ids`) et par le cron
 * (reprise des échecs). Un échec transitoire est repris avec un délai croissant ; un échec permanent, ou le dernier
 * essai, marque l'email en échec définitif. Une panne d'email ne touche jamais le RDV.
 */
export async function processOutbox(db: Database, options: ProcessOptions): Promise<ProcessResult> {
  const now = options.now ?? new Date();
  const result: ProcessResult = { sent: 0, retried: 0, failed: 0 };
  const isHeld = holdChecker(db, now);

  for (const row of await claim(db, options)) {
    try {
      const message = await render(db, row, options, now, isHeld);
      await options.transport.send(message);
      await db
        .update(emailOutbox)
        .set({ status: "sent", sentAt: new Date(), lastError: null })
        .where(eq(emailOutbox.id, row.id));
      await markOriginNotified(db, row, now);
      result.sent++;
    } catch (error) {
      if (error instanceof Defer) {
        // Pas un essai : l'attente ne doit pas épuiser les reprises.
        await db
          .update(emailOutbox)
          .set({
            attempts: row.attempts - 1,
            lastError: error.message,
            nextAttemptAt: new Date(now.getTime() + minutes(DEFER_MINUTES)),
          })
          .where(eq(emailOutbox.id, row.id));
        result.retried++;
        continue;
      }
      const reason = error instanceof Error ? error.message : String(error);
      const permanent =
        error instanceof Skip || (error instanceof EmailSendError && error.permanent);
      if (permanent || row.attempts >= MAX_ATTEMPTS) {
        await db
          .update(emailOutbox)
          .set({ status: "failed", lastError: reason })
          .where(eq(emailOutbox.id, row.id));
        result.failed++;
      } else {
        const wait = BACKOFF_MINUTES[Math.min(row.attempts, BACKOFF_MINUTES.length) - 1];
        await db
          .update(emailOutbox)
          .set({ lastError: reason, nextAttemptAt: new Date(now.getTime() + minutes(wait)) })
          .where(eq(emailOutbox.id, row.id));
        result.retried++;
      }
    }
  }
  return result;
}
