import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/types";
import { service, staff } from "@/db/schema";
import { eligibleStaff, resolveServices, type Audience } from "@/modules/availability";

export interface CatalogService {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  durationMin: number;
  /** « barber » : prestations coiffeurs ; « apprentice » : tarif formation (R-12, R-18). */
  performedBy: "barber" | "apprentice";
  /** Faux : prestation sur appel, affichée avec un bouton d'appel (R-17). */
  bookableOnline: boolean;
}

export interface StaffChoice {
  id: string;
  firstName: string;
  role: "barber" | "apprentice";
}

/** La carte : prestations actives, dans l'ordre d'affichage. Les prestations retirées n'y figurent plus (R-16). */
export async function loadCatalog(db: Database): Promise<CatalogService[]> {
  const rows = await db
    .select()
    .from(service)
    .where(eq(service.active, true))
    .orderBy(asc(service.sortOrder), asc(service.name));
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category ?? "Autres",
    priceCents: s.priceCents,
    durationMin: s.durationMin,
    performedBy: s.performedBy,
    bookableOnline: s.bookableOnline,
  }));
}

/** Coiffeurs proposés à l'étape « Avec qui ? » : habilités pour toutes les prestations choisies (R-13, R-20). */
export async function loadStaffChoices(
  db: Database,
  serviceIds: string[],
  audience: Audience,
): Promise<StaffChoice[]> {
  const services = await resolveServices(db, serviceIds, audience);
  return loadStaffChoicesFor(db, services.rows);
}

/** Les mêmes coiffeurs pour des prestations déjà résolues (ex. celles d'un RDV qu'on déplace, R-16). */
export async function loadStaffChoicesFor(
  db: Database,
  rows: Parameters<typeof eligibleStaff>[1],
): Promise<StaffChoice[]> {
  const eligible = await eligibleStaff(db, rows);
  if (eligible.length === 0) return [];
  const members = await db
    .select({ id: staff.id, firstName: staff.firstName, role: staff.role })
    .from(staff)
    .where(
      and(
        eq(staff.active, true),
        inArray(
          staff.id,
          eligible.map((e) => e.id),
        ),
      ),
    );
  const order = new Map(eligible.map((e, index) => [e.id, index]));
  return members.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}
