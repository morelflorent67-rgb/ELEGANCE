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
import { renderConfirmationEmail } from "./templates/confirmation";
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

async function renderConfirmation(
  db: Database,
  row: Row,
  options: ProcessOptions,
): Promise<{ message: EmailMessage; rendered: RenderedEmail }> {
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
  if (appt.status === "cancelled_by_customer" || appt.status === "cancelled_by_salon") {
    throw new Skip("rendez-vous annulé avant l'envoi");
  }

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
  const cutoffHours = settings?.changeCutoffHours ?? 48;

  const changeDeadline = new Date(appt.startsAt.getTime() - cutoffHours * 3_600_000);
  const rendered = renderConfirmationEmail({
    firstName: appt.customerFirstName,
    startsAt: appt.startsAt,
    endsAt: appt.endsAt,
    items,
    totalPriceCents: items.reduce((sum, i) => sum + i.priceCents, 0),
    durationMinutes: items.reduce((sum, i) => sum + i.durationMin, 0),
    staffFirstName: appt.staffFirstName,
    changeDeadline,
    // R-32 : un RDV pris moins de 48 h avant ne se modifie pas en ligne.
    changeableOnline: appt.createdAt.getTime() <= changeDeadline.getTime(),
    manageUrl: `${options.baseUrl}/compte/rendez-vous`,
    calendarUrl: `${options.baseUrl}/api/agenda/${appt.id}?t=${signToken(options.secret, calendarSubject(appt.id))}`,
    logoUrl: `${options.baseUrl}/email/logo.png`,
  });

  return {
    rendered,
    message: {
      to: {
        email: row.toEmail,
        ...(appt.customerFirstName ? { name: appt.customerFirstName } : {}),
      },
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
  };
}

async function render(db: Database, row: Row, options: ProcessOptions): Promise<EmailMessage> {
  switch (row.type) {
    case "confirmation":
      return (await renderConfirmation(db, row, options)).message;
    default:
      // Rappel, modification, annulation, avis : lot 7.
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
