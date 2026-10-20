import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/types";
import { staff } from "@/db/schema";
import { loadSettings } from "@/modules/availability";
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

/** Les règles du salon que les pages légales citent : lues dans les réglages, jamais en dur (principe 8). */
export interface SalonRules {
  /** R-30 : délai de modification ou d'annulation en ligne, en heures. */
  changeCutoffHours: number;
  /** R-25 : rendez-vous à venir au plus, par client. */
  maxUpcomingPerCustomer: number;
  /** R-52 : lapins à partir desquels le gérant peut bloquer la réservation en ligne. */
  noShowBlockThreshold: number;
  /** R-61 : le rappel part ce nombre d'heures avant le rendez-vous. */
  reminderHours: number;
  /** R-64 : le salon a renseigné sa page d'avis, donc une invitation part le lendemain d'un rendez-vous honoré. */
  reviewInvitations: boolean;
}

export interface VitrineData {
  rules: SalonRules;
  services: CatalogService[];
  team: TeamMember[];
  week: WeekHours;
  closures: Pick<ManagedClosure, "startsOn" | "endsOn" | "reason">[];
}

export async function readVitrine(db: Database, now: Date = new Date()): Promise<VitrineData> {
  const [settings, services, team, week, closures] = await Promise.all([
    loadSettings(db),
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
    rules: {
      changeCutoffHours: settings.changeCutoffHours,
      maxUpcomingPerCustomer: settings.maxUpcomingPerCustomer,
      noShowBlockThreshold: settings.noShowBlockThreshold,
      reminderHours: settings.reminderHours,
      reviewInvitations: !!settings.reviewUrl,
    },
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
