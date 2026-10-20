import { DateTime } from "luxon";
import type { Database } from "@/db/types";
import { slotsForDay } from "./engine";
import { loadSettings, loadSnapshot } from "./load";
import { eligibleStaff, resolveServices } from "./services";
import type { Audience, Slot } from "./types";

/**
 * Créneaux libres d'un jour (« AAAA-MM-JJ », heure de Paris) pour des prestations données.
 * `staffId` : un coiffeur précis, ou « any » pour « Sans préférence » (R-20).
 * Calculé uniquement côté serveur (principe 1).
 */
export async function getDaySlots(
  db: Database,
  input: {
    date: string;
    serviceIds: string[];
    staffId: string | "any";
    audience: Audience;
    now?: Date;
  },
): Promise<Slot[]> {
  const { date, serviceIds, staffId, audience } = input;
  const now = input.now ?? new Date();

  const services = await resolveServices(db, serviceIds, audience);
  let candidates = await eligibleStaff(db, services.rows);
  if (staffId !== "any") candidates = candidates.filter((c) => c.id === staffId);
  if (candidates.length === 0) return [];

  const { timezone } = await loadSettings(db);
  const day = DateTime.fromISO(date, { zone: timezone });
  const { snapshot } = await loadSnapshot(db, {
    from: day.startOf("day").toJSDate(),
    to: day.endOf("day").toJSDate(),
    staffIds: candidates.map((c) => c.id),
  });

  return slotsForDay(snapshot, {
    date,
    durationMinutes: services.durationMinutes,
    staffIds: candidates.map((c) => c.id),
    audience,
    now,
  });
}
