import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/types";
import { service, serviceStaff, staff } from "@/db/schema";
import { DomainError } from "@/lib/domain-error";
import type { Audience } from "./types";

export type ServiceRow = typeof service.$inferSelect;

export interface ResolvedServices {
  /** Dans l'ordre demandé (R-14 : prestations à la suite). */
  rows: ServiceRow[];
  durationMinutes: number;
  totalPriceCents: number;
}

/**
 * Vérifie et rassemble les prestations d'un RDV.
 * R-17 : en ligne, seules les prestations réservables en ligne ; le salon peut réserver les autres.
 * R-18 : on ne mélange pas prestations « coiffeurs » et « apprentis ».
 * R-14 : durées et prix s'additionnent.
 */
export async function resolveServices(
  db: Database,
  serviceIds: string[],
  audience: Audience,
): Promise<ResolvedServices> {
  if (serviceIds.length === 0) throw new DomainError("no_services");

  const unique = [...new Set(serviceIds)];
  const found = await db
    .select()
    .from(service)
    .where(and(inArray(service.id, unique), eq(service.active, true)));
  const byId = new Map(found.map((s) => [s.id, s]));
  if (unique.some((id) => !byId.has(id))) throw new DomainError("unknown_service");

  const rows = serviceIds.map((id) => byId.get(id)!);
  if (audience === "online" && rows.some((s) => !s.bookableOnline)) {
    throw new DomainError("not_bookable_online");
  }
  if (new Set(rows.map((s) => s.performedBy)).size > 1) throw new DomainError("mixed_categories");

  return {
    rows,
    durationMinutes: rows.reduce((sum, s) => sum + s.durationMin, 0),
    totalPriceCents: rows.reduce((sum, s) => sum + s.priceCents, 0),
  };
}

/**
 * Coiffeurs actifs de la bonne catégorie, habilités pour **toutes** les prestations (R-13),
 * dans l'ordre d'affichage.
 */
export async function eligibleStaff(
  db: Database,
  rows: ServiceRow[],
): Promise<{ id: string; sortOrder: number }[]> {
  const unique = [...new Set(rows.map((s) => s.id))];
  const role = rows[0].performedBy;

  const members = await db
    .select({ id: staff.id, sortOrder: staff.sortOrder })
    .from(staff)
    .where(and(eq(staff.active, true), eq(staff.role, role)))
    .orderBy(asc(staff.sortOrder), asc(staff.firstName));
  const qualified = await db
    .select({ serviceId: serviceStaff.serviceId, staffId: serviceStaff.staffId })
    .from(serviceStaff)
    .where(inArray(serviceStaff.serviceId, unique));

  return members.filter((m) =>
    unique.every((id) => qualified.some((q) => q.staffId === m.id && q.serviceId === id)),
  );
}
