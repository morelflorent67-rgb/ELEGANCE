import { SALON, salonMapsUrl } from "@/lib/salon";
import { formatClosure, type HoursRow } from "@/modules/vitrine/hours";
import type { VitrineData } from "@/modules/vitrine/load";
import { SectionHeading } from "./section-heading";

const button =
  "text-button-sm flex h-[52px] items-center justify-center border border-line-strong uppercase text-ivory transition-colors hover:bg-graphite-light";

/** Plan dessiné aux couleurs du site : aucune carte tierce (pas de cookie, pas de script), l'itinéraire s'ouvre à part. */
function AccessCard() {
  return (
    <div
      role="img"
      aria-label={`Plan de situation : ${SALON.street}, ${SALON.city}`}
      className="relative flex h-[200px] items-center justify-center overflow-hidden border border-line-subtle bg-charcoal lg:h-full lg:min-h-[260px]"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 342 200"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M-10 150 L120 96 L210 120 L360 40"
          stroke="rgb(239 233 221 / 0.18)"
          strokeWidth="10"
        />
        <path d="M60 -10 L150 210" stroke="rgb(239 233 221 / 0.1)" strokeWidth="6" />
        <path d="M250 -10 L230 210" stroke="rgb(239 233 221 / 0.1)" strokeWidth="5" />
      </svg>
      <svg
        width="34"
        height="30"
        viewBox="0 0 34 30"
        fill="none"
        className="relative"
        aria-hidden="true"
      >
        <path
          d="M9 1 H25 L33 15 L25 29 H9 L1 15 Z"
          stroke="var(--color-gold)"
          strokeWidth="1.5"
          fill="var(--color-ink)"
        />
        <circle cx="17" cy="15" r="3" fill="var(--color-gold)" />
      </svg>
      <span className="absolute bottom-2.5 left-3 text-label uppercase tracking-[0.2em] text-stone-dark">
        {SALON.city}
      </span>
    </div>
  );
}

/** Horaires (lus en base, R-01), fermetures exceptionnelles (R-03), adresse, plan, boutons Itinéraire et Appeler. */
export function HoursAccess({
  rows,
  closures,
}: {
  rows: HoursRow[];
  closures: VitrineData["closures"];
}) {
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-6 py-14 lg:py-20">
      <SectionHeading label="Nous trouver" title="Horaires et accès" />
      <div className="flex flex-col gap-7 lg:grid lg:grid-cols-2 lg:gap-12">
        <div className="flex flex-col gap-7" data-reveal>
          <ul className="flex flex-col border-t border-line">
            {rows.map((row) => (
              <li
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-line py-[18px]"
              >
                <span className={`text-body ${row.closed ? "text-stone" : ""}`}>{row.label}</span>
                {row.closed ? (
                  <span className="text-body text-stone">Fermé</span>
                ) : (
                  <span className="text-right text-body leading-relaxed">
                    {row.ranges.map((range) => (
                      <span key={range} className="block">
                        {range}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {closures.length > 0 ? (
            <ul
              className="flex flex-col gap-2 border border-line-strong p-4"
              aria-label="Fermetures exceptionnelles"
            >
              {closures.map((c) => (
                <li key={`${c.startsOn}-${c.endsOn}`} className="text-body-sm text-ivory-soft">
                  Fermeture exceptionnelle {formatClosure(c.startsOn, c.endsOn)}
                  {c.reason ? ` (${c.reason})` : ""}.
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-label uppercase tracking-[0.28em] text-gold">
            Uniquement sur rendez-vous
          </p>
          <address className="flex flex-col gap-1.5 not-italic">
            <span className="text-[18px]">{SALON.street}</span>
            <span className="text-body text-ivory-soft">
              {SALON.postalCode} {SALON.city}
            </span>
          </address>
        </div>
        <div className="flex flex-col gap-7" data-reveal>
          <AccessCard />
          <div className="grid grid-cols-2 gap-2.5">
            <a href={salonMapsUrl} target="_blank" rel="noopener" className={button}>
              Itinéraire
            </a>
            <a href={SALON.phoneHref} className={button}>
              Appeler
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
