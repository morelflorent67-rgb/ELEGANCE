"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PhoneIcon, cta } from "@/components/client/ui";
import { SALON } from "@/lib/salon";
import { fetchCountedUpcoming, type UpcomingLine } from "../actions";

/**
 * R-25 : déjà le nombre maximum de RDV à venir (5 aujourd'hui, réglage). Les hexagones s'allument, le dernier bat ;
 * la sélection du client est gardée. Les RDV d'une série ne comptent pas (D-87).
 */
export function LimitScreen({ max, onBack }: { max: number; onBack: () => void }) {
  const [lines, setLines] = useState<UpcomingLine[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchCountedUpcoming();
      if (!cancelled && result.ok) setLines(result.lines);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col gap-6 px-6 pb-9 pt-[30px]">
      <div aria-hidden="true" className="flex gap-2.5">
        {Array.from({ length: max }, (_, i) => (
          <svg
            key={i}
            className={i === max - 1 ? "l-last" : "l-hex"}
            width="34"
            height="30"
            viewBox="0 0 34 30"
            fill="none"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <path
              d="M9 1H25L33 15L25 29H9L1 15Z"
              stroke="#b8935a"
              strokeWidth="1.2"
              fill="rgb(184 147 90 / 0.16)"
            />
          </svg>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="overflow-hidden font-display text-[40px] leading-[1.06]">
          <span className="s-tl block">Vous avez déjà {max} rendez-vous à venir.</span>
        </h1>
        <p
          className="s-up text-[14px] leading-[1.6] text-stone"
          style={{ animationDelay: "200ms" }}
        >
          C&rsquo;est le maximum par compte. Pour réserver celui-ci, annulez l&rsquo;un d&rsquo;eux
          ou attendez qu&rsquo;il soit passé. Votre sélection n&rsquo;est pas perdue.
        </p>
      </div>
      {lines ? (
        <ul className="flex flex-col border-t border-[rgb(239_233_221_/_0.12)]">
          {lines.map((line, i) => (
            <li
              key={`${line.when}${i}`}
              className="s-up flex min-h-[52px] items-center justify-between gap-3 border-b border-[rgb(239_233_221_/_0.12)] text-[14px]"
              style={{ animationDelay: `${280 + i * 50}ms` }}
            >
              <span className="tabular-nums">{line.when}</span>
              <span className="text-right text-[12px] text-stone-dark">{line.what}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="s-up mt-auto flex flex-col gap-1.5" style={{ animationDelay: "560ms" }}>
        <Link href="/compte/rendez-vous" className={cta}>
          Gérer mes rendez-vous
        </Link>
        <button type="button" onClick={onBack} className="min-h-11 text-[13px] text-stone">
          Revenir à ma sélection
        </button>
      </div>
    </div>
  );
}

/** R-52 : la réservation en ligne est bloquée par le gérant ; le client appelle le salon. */
export function BlockedScreen() {
  return (
    <div className="flex min-h-full flex-col gap-6 px-6 pb-9 pt-[30px]">
      <div className="flex flex-col gap-3">
        <h1 className="overflow-hidden font-display text-[40px] leading-[1.06]">
          <span className="s-tl block">Réservation en ligne indisponible</span>
        </h1>
        <p
          className="s-up text-[14px] leading-[1.6] text-stone"
          style={{ animationDelay: "200ms" }}
        >
          Plusieurs rendez-vous n&rsquo;ont pas été honorés. Pour réserver, appelez le salon : nous
          en parlerons ensemble.
        </p>
      </div>
      <div className="s-up mt-auto" style={{ animationDelay: "400ms" }}>
        <a href={SALON.phoneHref} className={cta}>
          <PhoneIcon color="#0b0a09" />
          Appeler le salon
        </a>
      </div>
    </div>
  );
}
