"use client";

import { PhoneIcon, btnPrimary } from "@/components/ui";
import { formatDuration, formatPrice } from "@/lib/format";
import type { CatalogService } from "@/modules/catalog";

const smallButton =
  "flex h-11 items-center gap-2 px-3 text-[11px] uppercase tracking-[0.2em] transition-colors duration-200";

export function totals(catalog: CatalogService[], ids: string[]) {
  const rows = ids
    .map((id) => catalog.find((s) => s.id === id))
    .filter((s): s is CatalogService => !!s);
  return {
    rows,
    priceCents: rows.reduce((sum, s) => sum + s.priceCents, 0),
    durationMin: rows.reduce((sum, s) => sum + s.durationMin, 0),
  };
}

/** Étape 1 : la carte. R-14 : plusieurs prestations à la suite. R-17 : « sur appel » avec bouton d'appel. R-18 : pas de mélange. */
export function ServiceStep({
  catalog,
  selected,
  onChange,
  onContinue,
}: {
  catalog: CatalogService[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onContinue: () => void;
}) {
  const { rows, priceCents } = totals(catalog, selected);
  const category = rows[0]?.performedBy;

  const groups: { title: string; items: CatalogService[] }[] = [];
  for (const service of catalog) {
    const group = groups.find((g) => g.title === service.category);
    if (group) group.items.push(service);
    else groups.push({ title: service.category, items: [service] });
  }

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <>
      {category ? (
        <p
          role="status"
          className="border border-line-strong p-3.5 text-body-sm leading-normal text-ivory-soft"
        >
          Un rendez-vous ne mélange pas les prestations des coiffeurs et celles des apprentis (tarif
          formation). Les prestations qui ne peuvent pas s&rsquo;ajouter sont grisées.
        </p>
      ) : null}

      {groups.map((group) => (
        <div key={group.title} className="flex flex-col">
          <h3 className="pb-2 pt-2.5 text-label uppercase text-stone">{group.title}</h3>
          <ul>
            {group.items.map((item) => {
              const isSelected = selected.includes(item.id);
              const onCall = !item.bookableOnline;
              const blocked = !onCall && !!category && item.performedBy !== category;
              return (
                <li
                  key={item.id}
                  className={`flex min-h-[68px] items-center gap-3 border-t border-line ${blocked ? "opacity-40" : ""}`}
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-[15px] leading-snug">{item.name}</span>
                    <span className="text-body-sm text-stone">
                      {onCall
                        ? `${formatPrice(item.priceCents)} · ${formatDuration(item.durationMin)} · sur appel`
                        : `${formatDuration(item.durationMin)} · ${formatPrice(item.priceCents)}`}
                    </span>
                  </div>
                  {onCall ? (
                    <a
                      href="tel:+33388977468"
                      aria-label={`Appeler le salon pour ${item.name}`}
                      className={`${smallButton} border border-line-strong text-ivory hover:bg-graphite-light`}
                    >
                      <PhoneIcon />
                      Appeler
                    </a>
                  ) : isSelected ? (
                    <button
                      type="button"
                      aria-pressed="true"
                      aria-label={`Retirer ${item.name}`}
                      onClick={() => toggle(item.id)}
                      className={`${smallButton} bg-ivory font-medium text-ink`}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        aria-hidden="true"
                      >
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                      Choisie
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-pressed="false"
                      aria-label={`Choisir ${item.name}`}
                      disabled={blocked}
                      onClick={() => toggle(item.id)}
                      className={`${smallButton} border border-line-strong text-ivory hover:bg-graphite-light disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                    >
                      Choisir
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <p className="text-body-sm text-stone">
        Les prestations « sur appel » se réservent par téléphone.
      </p>

      <button
        type="button"
        disabled={selected.length === 0}
        onClick={onContinue}
        className={btnPrimary}
      >
        {selected.length === 0
          ? "Choisissez une prestation"
          : `Continuer · ${formatPrice(priceCents)}`}
      </button>
    </>
  );
}
