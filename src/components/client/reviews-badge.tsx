import { reviewHeadline } from "@/modules/vitrine/reviews";
import { InView } from "./in-view";

const STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z";

/**
 * Bandeau d'avis de l'accueil (D-112) : « Plus de 1 000 avis » et cinq étoiles. Le total cumulé vient des réglages ;
 * ni la source des avis ni un lien n'y figurent (demande du salon). Masqué si le réglage est vide.
 */
export function ReviewsBadge({ count }: { count: number | null }) {
  const headline = reviewHeadline(count);
  if (!headline) return null;
  return (
    <InView
      aria-label="Avis des clients"
      className="flex flex-col items-center gap-3.5 border-y border-[rgb(239_233_221_/_0.08)] px-6 py-9 text-center"
    >
      <div aria-hidden="true" className="flex gap-1.5 text-gold">
        {[0, 1, 2, 3, 4].map((i) => (
          <svg
            key={i}
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="currentColor"
            className="r-star"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <path d={STAR} />
          </svg>
        ))}
      </div>
      <p className="font-display text-[32px] leading-[1.05]">{headline}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone">
        Des clients qui nous font confiance
      </p>
    </InView>
  );
}
