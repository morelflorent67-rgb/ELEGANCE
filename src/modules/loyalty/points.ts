// Calculs purs de la carte de fidélité (R-96 à R-100) : points d'un RDV, progression vers la coupe offerte.

/** Points d'un RDV : la somme des points de ses prestations (R-96). */
export function pointsForItems(items: { loyaltyPoints: number }[]): number {
  return items.reduce((sum, item) => sum + item.loyaltyPoints, 0);
}

export interface LoyaltyProgress {
  balance: number;
  threshold: number;
  /** Coupes offertes qu'on peut utiliser (au moins 1 dès le seuil). */
  rewardsAvailable: number;
  /** Points qui restent à gagner avant la prochaine coupe offerte (0 si déjà acquise). */
  pointsToNext: number;
  /** La carte de 10 cases : une case = un dixième du seuil ; la dernière peut être à moitié pleine (5 points). */
  cells: { fill: 0 | 0.5 | 1 }[];
}

export const CARD_CELLS = 10;

/** Progression de la carte : les cases se remplissent jusqu'au seuil, puis restent pleines. */
export function loyaltyProgress(balance: number, threshold: number): LoyaltyProgress {
  const safeBalance = Math.max(0, balance);
  const perCell = threshold / CARD_CELLS;
  const cells = Array.from({ length: CARD_CELLS }, (_, index) => {
    const filledPoints = Math.min(Math.max(safeBalance - index * perCell, 0), perCell);
    const ratio = filledPoints / perCell;
    const fill: 0 | 0.5 | 1 = ratio >= 1 ? 1 : ratio >= 0.5 ? 0.5 : 0;
    return { fill };
  });
  return {
    balance: safeBalance,
    threshold,
    rewardsAvailable: Math.floor(safeBalance / threshold),
    pointsToNext: safeBalance >= threshold ? 0 : threshold - safeBalance,
    cells,
  };
}

/** « Encore 3 passages » : estimation d'après les points d'un passage courant (10 points par défaut). */
export function visitsToReward(pointsToNext: number, pointsPerVisit: number): number {
  if (pointsToNext <= 0 || pointsPerVisit <= 0) return 0;
  return Math.ceil(pointsToNext / pointsPerVisit);
}

/** Texte de présentation de l'accueil, construit depuis la base : « 10 passages = une coupe offerte ». */
export function loyaltyPitch(threshold: number, pointsPerVisit: number): string | null {
  if (threshold <= 0 || pointsPerVisit <= 0) return null;
  const visits = Math.ceil(threshold / pointsPerVisit);
  return `${visits} passages = une coupe offerte`;
}
