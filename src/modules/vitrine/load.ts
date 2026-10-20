import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { staff } from "@/db/schema";
import { loadCatalog, type CatalogService } from "@/modules/catalog";
import { listClosures, loadWeekHours, type ManagedClosure } from "@/modules/schedule/manage";
import type { WeekHours } from "./hours";

// Ce que la vitrine lit en base : la carte, l'équipe, les horaires, les fermetures à venir.
// Une seule source avec la réservation et le planning (principe : réglages en base, jamais dans le code).

export interface TeamMember {
  id: string;
  firstName: string;
  role: "barber" | "apprentice";
}

export interface VitrineData {
  services: CatalogService[];
  team: TeamMember[];
  week: WeekHours;
  closures: Pick<ManagedClosure, "startsOn" | "endsOn" | "reason">[];
}

export async function readVitrine(db: Database, now: Date = new Date()): Promise<VitrineData> {
  const [services, team, week, closures] = await Promise.all([
    loadCatalog(db),
    db
      .select({ id: staff.id, firstName: staff.firstName, role: staff.role })
      .from(staff)
      .where(and(eq(staff.active, true)))
      .orderBy(asc(staff.sortOrder), asc(staff.firstName)),
    loadWeekHours(db),
    listClosures(db, now),
  ]);
  return {
    services,
    team,
    week,
    closures: closures.slice(0, 3).map((c) => ({
      startsOn: c.startsOn,
      endsOn: c.endsOn,
      reason: c.reason,
    })),
  };
}
