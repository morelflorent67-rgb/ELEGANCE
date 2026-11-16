import { and, asc, eq, gt } from "drizzle-orm";
import type { Database } from "@/db/types";
import { service } from "@/db/schema";
import type { LoyaltyHistoryLine } from "./ledger";

/** Le libellé d'une ligne d'historique côté client : la prestation d'un passage, ou la nature de l'écriture. */
export function loyaltyEntryLabel(line: Pick<LoyaltyHistoryLine, "kind" | "serviceNames">): string {
  switch (line.kind) {
    case "earn":
      return line.serviceNames.join(" + ") || "Passage au salon";
    case "reversal":
      return "Points retirés (rendez-vous non honoré)";
    case "redeem":
      return "Coupe offerte utilisée";
    case "redeem_cancel":
      return "Coupe offerte annulée";
    case "adjust":
      return "Ajustement par le salon";
  }
}

/**
 * Points d'un passage courant, pour annoncer « 10 passages = une coupe offerte » : ceux de la première prestation
 * éligible à la coupe offerte (la coupe de la carte), jamais un nombre écrit en dur. 0 : on n'annonce rien.
 */
export async function typicalVisitPoints(db: Database): Promise<number> {
  const [row] = await db
    .select({ points: service.loyaltyPoints })
    .from(service)
    .where(and(eq(service.active, true), eq(service.loyaltyRewardEligible, true), gt(service.loyaltyPoints, 0)))
    .orderBy(asc(service.sortOrder))
    .limit(1);
  return row?.points ?? 0;
}
