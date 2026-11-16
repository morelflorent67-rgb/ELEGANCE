import { visitsToReward } from "@/modules/loyalty/points";
import type { LoyaltyCard as LoyaltyCardData } from "@/modules/loyalty";

/** Une case de la carte : vide, à moitié pleine (5 points) ou pleine. */
function Cell({ fill }: { fill: 0 | 0.5 | 1 }) {
  return (
    <span
      aria-hidden="true"
      data-fill={fill}
      className="relative h-[26px] flex-1 overflow-hidden border border-[rgb(239_233_221_/_0.2)]"
    >
      {fill > 0 ? (
        <span
          className="absolute inset-y-0 left-0 bg-[rgb(var(--accent-rgb)_/_0.85)] shadow-[0_0_12px_rgb(var(--accent-rgb)_/_0.5)]"
          style={{ width: fill === 1 ? "100%" : "50%" }}
        />
      ) : null}
    </span>
  );
}

export interface LoyaltyHistoryItem {
  id: string;
  /** « 3 nov. » */
  dateLabel: string;
  label: string;
  points: number;
}

/**
 * Carte de fidélité (D-114) : 10 cases qui se remplissent, le solde, le nombre de passages avant la coupe offerte et
 * l'historique. Tout vient de la base : le seuil, le solde, les points d'un passage courant.
 */
export function LoyaltyCardView({
  card,
  pointsPerVisit,
  history,
}: {
  card: LoyaltyCardData;
  pointsPerVisit: number;
  history: LoyaltyHistoryItem[];
}) {
  if (!card.enabled) return null;
  const ready = card.rewardsAvailable > 0;
  const visits = visitsToReward(card.pointsToNext, pointsPerVisit);
  return (
    <section
      aria-label="Ma carte de fidélité"
      className="s-up flex flex-col gap-3.5 border border-[rgb(var(--accent-rgb)_/_0.35)] bg-[rgb(var(--accent-rgb)_/_0.05)] px-[18px] py-4"
      style={{ animationDelay: "200ms" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone">Fidélité</span>
        <span className="text-[13px] tabular-nums text-ivory">
          {Math.min(card.balance, card.threshold)} / {card.threshold} points
        </span>
      </div>
      <div role="img" aria-label={`${card.balance} points sur ${card.threshold}`} className="flex gap-1">
        {card.cells.map((cell, i) => (
          <Cell key={i} fill={cell.fill} />
        ))}
      </div>
      <p className="text-[14px] leading-normal text-ivory-soft">
        {ready
          ? "Votre coupe offerte vous attend : dites-le au salon lors de votre prochain passage."
          : `Encore ${visits} passage${visits > 1 ? "s" : ""} avant votre coupe offerte.`}
      </p>
      {history.length > 0 ? (
        <details className="text-[13px]">
          <summary className="min-h-10 cursor-pointer py-2 text-stone">Historique</summary>
          <ul className="flex flex-col divide-y divide-[rgb(239_233_221_/_0.1)]" aria-label="Historique des points">
            {history.map((h) => (
              <li key={h.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="flex flex-col">
                  <span>{h.label}</span>
                  <span className="text-[12px] text-stone-dark">{h.dateLabel}</span>
                </span>
                <span className="tabular-nums text-ivory">{h.points > 0 ? `+${h.points}` : h.points}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
