import { and, count, eq, gt, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { appointment, appointmentItem, customer, staff } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { recordAudit } from "@/modules/audit/record";
import { enqueueEmail } from "@/modules/mail/outbox";
import { assertActiveAuthor } from "@/modules/staff/team";
import {
  checkSlot,
  eligibleStaff,
  loadSnapshot,
  pickStaff,
  resolveServices,
  type Audience,
} from "@/modules/availability";

export interface CreateAppointmentInput {
  customerId: string;
  /** Dans l'ordre où le client les a ajoutées (R-14). */
  serviceIds: string[];
  /** Un coiffeur précis, ou « any » pour « Sans préférence » (R-20). */
  staffId: string | "any";
  startsAt: Date;
  /** « online » : délais de R-06 appliqués ; « salon » : exemptés (R-27). */
  source: Audience;
  note?: string;
  /** Membre de l'équipe qui réserve, pour une réservation au salon (R-74). */
  createdByStaffId?: string;
}

export interface CreatedAppointment {
  id: string;
  staffId: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  totalPriceCents: number;
}

/** Code d'erreur Postgres, qu'il soit direct ou enveloppé par Drizzle. */
function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/**
 * Crée un RDV, immédiatement confirmé (R-24), en une transaction :
 * 1. valide les prestations (R-13, R-14, R-17, R-18) ;
 * 2. verrouille le client et les coiffeurs candidats, pour que deux demandes simultanées s'attendent ;
 * 3. vérifie le plafond de RDV à venir (R-25) et le blocage en ligne (R-52) ;
 * 4. revérifie le créneau sur des données fraîches (R-01 à R-06, R-21, R-22) ;
 * 5. attribue le coiffeur (R-20) et insère le RDV avec prix et durée figés (R-16).
 * La contrainte d'exclusion de la base (R-23) reste la barrière finale.
 */
export async function createAppointment(
  db: Database,
  input: CreateAppointmentInput,
  now: Date = new Date(),
): Promise<CreatedAppointment> {
  try {
    return await db.transaction(async (tx) => {
      // R-74 : une réservation au salon est signée par un membre de l'équipe, choisi sur la tablette.
      const authorId =
        input.source === "salon" ? await assertActiveAuthor(tx, input.createdByStaffId) : null;
      const services = await resolveServices(tx, input.serviceIds, input.source);

      const [client] = await tx
        .select()
        .from(customer)
        .where(eq(customer.id, input.customerId))
        .for("update");
      if (!client) throw new DomainError("unknown_customer");
      // R-26 : le salon ne réserve que pour un client qui a un compte ; une fiche supprimée n'en a plus (R-75).
      if (input.source === "salon" && client.anonymizedAt) {
        throw new DomainError("customer_has_no_account");
      }
      // R-52 : le blocage concerne la réservation en ligne ; le salon peut réserver pour ce client.
      if (input.source === "online" && client.onlineBookingBlocked) {
        throw new DomainError("customer_blocked");
      }

      let candidates = await eligibleStaff(tx, services.rows);
      if (input.staffId !== "any") candidates = candidates.filter((c) => c.id === input.staffId);
      if (candidates.length === 0) throw new DomainError("staff_not_eligible");
      const candidateIds = candidates.map((c) => c.id);

      await tx
        .select({ id: staff.id })
        .from(staff)
        .where(inArray(staff.id, candidateIds))
        .orderBy(staff.id)
        .for("update");

      // Fenêtre large : elle couvre tout le jour de Paris du RDV, quel que soit le changement d'heure.
      const margin = 36 * 3_600_000;
      const { snapshot, settings } = await loadSnapshot(tx, {
        from: new Date(input.startsAt.getTime() - margin),
        to: new Date(input.startsAt.getTime() + margin),
        staffIds: candidateIds,
      });

      // R-25 : au plus N RDV à venir, salon compris.
      const [{ upcoming }] = await tx
        .select({ upcoming: count() })
        .from(appointment)
        .where(
          and(
            eq(appointment.customerId, input.customerId),
            eq(appointment.status, "confirmed"),
            gt(appointment.startsAt, now),
          ),
        );
      if (upcoming >= settings.maxUpcomingPerCustomer) throw new DomainError("too_many_upcoming");

      const checks = candidateIds.map((staffId) => ({
        staffId,
        result: checkSlot(snapshot, {
          staffId,
          startsAt: input.startsAt,
          durationMinutes: services.durationMinutes,
          audience: input.source,
          now,
        }),
      }));
      const free = checks.filter((c) => c.result.ok).map((c) => c.staffId);
      if (free.length === 0) {
        // Les refus d'horaire valent pour tous les coiffeurs ; seul « occupé » dépend du coiffeur.
        const reason = checks
          .map((c) => (c.result.ok ? null : c.result.reason))
          .find((r) => r !== "busy");
        throw new DomainError(reason ?? "slot_unavailable");
      }

      const date = DateTime.fromJSDate(input.startsAt, { zone: settings.timezone }).toISODate()!;
      const staffId =
        input.staffId === "any"
          ? pickStaff(free, snapshot.appointments, date, settings.timezone)
          : free[0];
      const endsAt = new Date(input.startsAt.getTime() + services.durationMinutes * 60_000);

      const [created] = await tx
        .insert(appointment)
        .values({
          customerId: input.customerId,
          staffId,
          startsAt: input.startsAt,
          endsAt,
          status: "confirmed",
          source: input.source,
          customerNote: input.note ?? null,
          createdByStaffId: authorId,
          createdAt: now, // même horloge que les délais : R-32 compare cette date à celle du RDV
        })
        .returning({ id: appointment.id });

      await tx.insert(appointmentItem).values(
        services.rows.map((s, position) => ({
          appointmentId: created.id,
          serviceId: s.id,
          nameSnapshot: s.name,
          priceCents: s.priceCents,
          durationMin: s.durationMin,
          position,
        })),
      );

      if (authorId) {
        await recordAudit(
          tx,
          {
            actorType: "staff",
            actorId: authorId,
            action: "appointment.created",
            entity: "appointment",
            entityId: created.id,
            after: { startsAt: input.startsAt.toISOString(), staffId, source: input.source },
          },
          now,
        );
      }

      // R-60 : l'email de confirmation entre dans la file d'envoi avec le RDV, dans la même transaction.
      // L'envoi lui-même se fait après la réponse : une panne d'email ne bloque jamais la réservation.
      if (client.email) {
        await enqueueEmail(tx, {
          type: "confirmation",
          toEmail: client.email,
          appointmentId: created.id,
          dedupeKey: `confirmation:${created.id}`,
        });
      }

      return {
        id: created.id,
        staffId,
        startsAt: input.startsAt,
        endsAt,
        durationMinutes: services.durationMinutes,
        totalPriceCents: services.totalPriceCents,
      };
    });
  } catch (error) {
    // R-23 : la base a refusé le chevauchement (autre chemin d'écriture, ou course perdue).
    if (pgCode(error) === "23P01") throw new DomainError("slot_unavailable");
    throw error;
  }
}
