import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "@/db/types";
import {
  appointment,
  appointmentItem,
  customer,
  emailOutbox,
  salonSettings,
  staff,
} from "@/db/schema";
import { calendarSubject, signToken } from "@/modules/security/token";
import { z } from "zod";
import { renderCancellationEmail } from "./templates/cancellation";
import { renderConfirmationEmail } from "./templates/confirmation";
import { renderModificationEmail } from "./templates/modification";
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

class Skip extends Error {}

const minutes = (n: number) => n * 60_000;

interface EmailAppointment {
  id: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  status: (typeof appointment.$inferSelect)["status"];
  staffFirstName: string;
  customerFirstName: string | null;
  items: { name: string; durationMin: number; priceCents: number }[];
  totalPriceCents: number;
  durationMinutes: number;
  cutoffHours: number;
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
      customerFirstName: customer.firstName,
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
  return {
    ...appt,
    items,
    totalPriceCents: items.reduce((sum, i) => sum + i.priceCents, 0),
    durationMinutes: items.reduce((sum, i) => sum + i.durationMin, 0),
    cutoffHours: settings?.changeCutoffHours ?? 48,
  };
}

const isCancelled = (appt: EmailAppointment) =>
  appt.status === "cancelled_by_customer" || appt.status === "cancelled_by_salon";

const calendarUrl = (appt: EmailAppointment, options: ProcessOptions) =>
  `${options.baseUrl}/api/agenda/${appt.id}?t=${signToken(options.secret, calendarSubject(appt.id))}`;

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
      firstName: appt.customerFirstName,
      startsAt: appt.startsAt,
      endsAt: appt.endsAt,
      items: appt.items,
      totalPriceCents: appt.totalPriceCents,
      durationMinutes: appt.durationMinutes,
      staffFirstName: appt.staffFirstName,
      changeDeadline,
      // R-32 : un RDV pris moins de 48 h avant ne se modifie pas en ligne.
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

/** Annulation : seul le salon laisse une trace dans la charge utile (D-52). */
const cancellationPayload = z.object({ by: z.literal("salon").optional() });

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
  return message(
    row,
    appt,
    renderCancellationEmail({
      firstName: appt.customerFirstName,
      startsAt: appt.startsAt,
      items: appt.items,
      staffFirstName: appt.staffFirstName,
      bookUrl: `${options.baseUrl}/reservation`,
      logoUrl: `${options.baseUrl}/email/logo.png`,
      cancelledBy: payload.success && payload.data.by === "salon" ? "salon" : "customer",
    }),
  );
}

async function render(db: Database, row: Row, options: ProcessOptions): Promise<EmailMessage> {
  switch (row.type) {
    case "confirmation":
      return renderConfirmation(db, row, options);
    case "modification":
      return renderModification(db, row, options);
    case "cancellation":
      return renderCancellation(db, row, options);
    default:
      // Rappel, avis : lot 7.
      throw new EmailSendError(`Type d'email non géré : ${row.type}`, true);
  }
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

  for (const row of await claim(db, options)) {
    try {
      const message = await render(db, row, options);
      await options.transport.send(message);
      await db
        .update(emailOutbox)
        .set({ status: "sent", sentAt: new Date(), lastError: null })
        .where(eq(emailOutbox.id, row.id));
      result.sent++;
    } catch (error) {
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
