import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { appointment, customer } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import { formatPhone, maskPhone } from "@/lib/phone";
import { listCustomerAppointments, type AppointmentView } from "@/modules/appointments/queries";
import { recordAudit } from "@/modules/audit/record";
import { loadSettings } from "@/modules/availability";
import type { AuthDriver } from "@/modules/auth/types";
import { countNoShows } from "@/modules/booking/salon-changes";
import { anonymizeCustomer } from "./profile";

// Ce que la tablette sait des clients : recherche pour réserver (R-26), fiche avec les lapins (R-52), et les deux
// fonctions réservées au gérant, qui demandent le code (R-73) : bloquer la réservation en ligne, supprimer la fiche.

const MAX_RESULTS = 8;

/** Minuscules, sans accents ni signes : « Éric » et « eric » se trouvent. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le même nettoyage côté base, pour comparer avec ce que l'utilisateur tape. */
const nameHaystack = sql`lower(translate(coalesce(${customer.firstName}, '') || ' ' || coalesce(${customer.lastName}, ''),
  'àâäçéèêëîïôöùûüÿñÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÑ-''', 'aaaceeeeiioouuuynAAACEEEEIIOOUUUYN  '))`;
const phoneDigits = sql`regexp_replace(coalesce(${customer.phone}, ''), '\\D', '', 'g')`;

/** « 06 12 34 » → « 3361234 » : le téléphone est stocké en +33…, on le cherche sans le 0 initial. */
function phoneNeedle(token: string): string | null {
  const digits = token.replace(/\D/g, "");
  if (digits.length < 2) return null;
  if (/^[\d+\s]+$/.test(token) === false) return null;
  return digits.startsWith("0") && !token.startsWith("+") ? `33${digits.slice(1)}` : digits;
}

export interface CustomerHit {
  id: string;
  /** « Thomas Durand » */
  name: string;
  /** « 06 •• •• •• 78 » : le numéro complet n'est montré que sur la fiche. */
  maskedPhone: string;
  /** Dernier RDV commencé (hors annulés), ou null. */
  lastVisit: Date | null;
  /** RDV confirmés à venir. */
  upcoming: number;
}

/**
 * Cherche un client inscrit par nom, prénom ou téléphone (R-26). 2 caractères au moins, 8 réponses au plus. Les fiches
 * supprimées (R-75) n'apparaissent jamais. Le téléphone est masqué : la fiche entière s'ouvre au choix du client.
 */
export async function searchCustomers(
  db: Database,
  query: string,
  now: Date = new Date(),
): Promise<CustomerHit[]> {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (tokens.join("").length < 2) return [];

  const conditions = tokens.map((token) => {
    const phone = phoneNeedle(token);
    const name = sql`${nameHaystack} like ${`%${token.replace(/[^a-z0-9]/g, "")}%`}`;
    return phone ? sql`(${phoneDigits} like ${`%${phone}%`})` : name;
  });
  const rows = await db
    .select({
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
    })
    .from(customer)
    .where(and(isNull(customer.anonymizedAt), ...conditions))
    .orderBy(asc(customer.lastName), asc(customer.firstName))
    .limit(MAX_RESULTS);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const visits = await db
    .select({
      customerId: appointment.customerId,
      last: sql<Date | null>`max(${appointment.startsAt}) filter (where ${appointment.startsAt} <= ${now.toISOString()}::timestamptz)`,
      upcoming: sql<number>`count(*) filter (where ${appointment.status} = 'confirmed' and ${appointment.startsAt} > ${now.toISOString()}::timestamptz)::int`,
    })
    .from(appointment)
    .where(
      and(
        inArray(appointment.customerId, ids),
        ne(appointment.status, "cancelled_by_customer"),
        ne(appointment.status, "cancelled_by_salon"),
      ),
    )
    .groupBy(appointment.customerId);
  const byCustomer = new Map(visits.map((v) => [v.customerId, v]));

  return rows.map((r) => {
    const visit = byCustomer.get(r.id);
    return {
      id: r.id,
      name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      maskedPhone: r.phone ? maskPhone(r.phone) : "",
      lastVisit: visit?.last ? new Date(visit.last) : null,
      upcoming: visit?.upcoming ?? 0,
    };
  });
}

export interface CustomerFile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** R-52 : réservation en ligne bloquée par le gérant. */
  blocked: boolean;
  noShowCount: number;
  /** Nombre de lapins à partir duquel le gérant peut bloquer (réglage). */
  blockThreshold: number;
  canBlock: boolean;
  /** Tous les RDV du client, le plus récent d'abord. */
  appointments: AppointmentView[];
}

/** La fiche d'un client pour la tablette, ou null s'il n'existe pas ou a été supprimé. */
export async function loadCustomerFile(
  db: Database,
  customerId: string,
): Promise<CustomerFile | null> {
  const [row] = await db
    .select()
    .from(customer)
    .where(and(eq(customer.id, customerId), isNull(customer.anonymizedAt)));
  if (!row) return null;
  const [settings, noShowCount, appointments] = await Promise.all([
    loadSettings(db),
    countNoShows(db, row.id),
    listCustomerAppointments(db, row.id),
  ]);
  return {
    id: row.id,
    firstName: row.firstName ?? "",
    lastName: row.lastName ?? "",
    phone: row.phone ? formatPhone(row.phone) : "",
    email: row.email ?? "",
    blocked: row.onlineBookingBlocked,
    noShowCount,
    blockThreshold: settings.noShowBlockThreshold,
    canBlock: noShowCount >= settings.noShowBlockThreshold,
    appointments,
  };
}

/**
 * Bloque ou débloque la réservation en ligne d'un client (R-52, D-35). Bloquer n'est possible qu'à partir du seuil de
 * lapins ; débloquer l'est toujours. Aucun effet sur les RDV déjà pris, ni sur la réservation par le salon (D-41).
 * Le gérant a saisi son code avant : l'action est inscrite au journal au nom du gérant.
 */
export async function setOnlineBookingBlocked(
  db: Database,
  input: { customerId: string; blocked: boolean; actorId: string | null },
  now: Date = new Date(),
): Promise<{ changed: boolean }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.id, input.customerId), isNull(customer.anonymizedAt)))
      .for("update");
    if (!row) throw new DomainError("unknown_customer");
    if (row.onlineBookingBlocked === input.blocked) return { changed: false };

    const noShowCount = await countNoShows(tx, row.id);
    if (input.blocked) {
      const { noShowBlockThreshold } = await loadSettings(tx);
      if (noShowCount < noShowBlockThreshold) throw new DomainError("customer_not_blockable");
    }
    await tx
      .update(customer)
      .set({ onlineBookingBlocked: input.blocked })
      .where(eq(customer.id, row.id));
    await recordAudit(
      tx,
      {
        actorType: "manager",
        actorId: input.actorId,
        action: input.blocked ? "customer.blocked" : "customer.unblocked",
        entity: "customer",
        entityId: row.id,
        before: { onlineBookingBlocked: row.onlineBookingBlocked },
        after: { onlineBookingBlocked: input.blocked, noShowCount },
      },
      now,
    );
    return { changed: true };
  });
}

/**
 * Le gérant supprime une fiche client (R-75, D-43) : la fiche est anonymisée, les RDV à venir sont annulés même à moins
 * de 48 h (R-33, aucun email : l'adresse est effacée, l'équipe appelle) et le compte de connexion est supprimé.
 */
export async function deleteCustomerAsManager(
  db: Database,
  driver: AuthDriver,
  input: { customerId: string; actorId: string | null },
  now: Date = new Date(),
): Promise<{ cancelledAppointmentIds: string[] }> {
  const result = await anonymizeCustomer(
    db,
    {
      customerId: input.customerId,
      actor: { type: "manager", id: input.actorId },
      onImminent: "cancel",
    },
    now,
  );
  // La fiche est déjà anonymisée : l'accès est fermé même si la suppression du compte échoue.
  if (result.authUserId) await driver.deleteUser(result.authUserId);
  return { cancelledAppointmentIds: result.cancelledAppointmentIds };
}
