"use client";

import { CheckBox, Mark, Note, PhoneIcon, chip } from "@/components/client/ui";
import { formatDuration, formatPrice } from "@/lib/format";
import { SALON } from "@/lib/salon";
import type { CatalogService } from "@/modules/catalog";
import { groupCatalog } from "@/modules/vitrine/catalog-view";

/** Les prénoms de l'équipe active, par rôle, pour « Orhan · Enes » sous chaque groupe de la carte. */
export interface TeamNames {
  barber: string[];
  apprentice: string[];
}

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

/**
 * Étape 1 : « Que souhaitez-vous ? ». R-14 : plusieurs prestations à la suite. R-17 : « sur appel » avec un bouton
 * d'appel. R-18 : coiffeurs et apprentis ne se mélangent pas, l'autre catégorie se grise.
 */
export function ServiceStep({
  catalog,
  team,
  selected,
  onChange,
}: {
  catalog: CatalogService[];
  team: TeamNames;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { rows } = totals(catalog, selected);
  const category = rows[0]?.performedBy;
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const barbers = team.barber.join(" ou ");
  // « d'Orhan ou Enes », « de Karim ou Enes » : élision devant une voyelle.
  const ofBarbers = barbers
    ? `${/^[aeiouyhéèêàâîôû]/i.test(barbers) ? "d'" : "de "}${barbers}`
    : "d'un coiffeur";
  const mixNote =
    category === "apprentice"
      ? `Les apprentis travaillent seuls : pour une prestation ${ofBarbers}, prenez un second rendez-vous.`
      : "Le tarif formation est réalisé par nos apprentis, dans un rendez-vous à part.";

  let row = 0;
  return (
    <div className="flex flex-col gap-[26px] px-6 pb-9 pt-[26px]">
      <div className="flex flex-col gap-2.5">
        <h1 className="overflow-hidden font-display text-[40px] leading-[1.05]">
          <span className="s-tl block">Que souhaitez-vous ?</span>
        </h1>
        <p className="s-up text-[14px] text-stone" style={{ animationDelay: "180ms" }}>
          Plusieurs choix possibles.
        </p>
      </div>
      {category ? (
        <div className="s-up">
          <Note>{mixNote}</Note>
        </div>
      ) : null}

      {groupCatalog(catalog).map((group) => {
        // « Orhan · Enes » sous le groupe, seulement s'il ne mélange pas coiffeurs et apprentis.
        const role = group.items[0]?.performedBy ?? "barber";
        const single = group.items.every((i) => i.performedBy === role);
        const names = single ? team[role] : [];
        const by = names.length
          ? `${names.join(" · ")}${role === "apprentice" ? `, apprenti${names.length > 1 ? "s" : ""}` : ""}`
          : "";
        const headerDelay = 260 + row++ * 40;
        return (
          <section
            key={group.anchor}
            aria-labelledby={`groupe-${group.anchor}`}
            className="flex flex-col"
          >
            <h2
              id={`groupe-${group.anchor}`}
              className="s-up mb-1.5 flex items-baseline justify-between"
              style={{ animationDelay: `${headerDelay}ms` }}
            >
              <span className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-ivory-soft">
                <Mark size={7} />
                {group.title}
              </span>
              <span className="text-[11px] text-stone-dark">{by}</span>
            </h2>
            {group.items.map((item) => {
              const delay = 260 + row++ * 40;
              const on = selected.includes(item.id);
              const onCall = !item.bookableOnline;
              const locked = !on && !onCall && !!category && item.performedBy !== category;
              return (
                <div
                  key={item.id}
                  className="s-up relative border-b border-[rgb(239_233_221_/_0.12)]"
                  style={{ animationDelay: `${delay}ms` }}
                >
                  {onCall ? (
                    <div className="flex min-h-[68px] items-center gap-3.5">
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-[15px] text-ivory-soft">{item.name}</span>
                        <span className="text-[12px] text-stone-dark">
                          {formatDuration(item.durationMin)} · {formatPrice(item.priceCents)} · par
                          téléphone
                        </span>
                      </span>
                      <a
                        href={SALON.phoneHref}
                        aria-label={`Appeler le salon pour ${item.name}`}
                        className={chip}
                      >
                        <PhoneIcon size={12} />
                        Sur appel
                      </a>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => !locked && toggle(item.id)}
                      aria-pressed={on}
                      aria-disabled={locked || undefined}
                      aria-label={`${item.name}, ${formatPrice(item.priceCents)}`}
                      className={`tap relative flex min-h-[68px] w-full items-center gap-3.5 text-left ${locked ? "cursor-not-allowed opacity-40" : ""}`}
                    >
                      <span
                        aria-hidden="true"
                        className="rowfill absolute -inset-x-6 inset-y-0"
                        style={{
                          background:
                            "linear-gradient(90deg, rgb(239 233 221 / 0.07), rgb(239 233 221 / 0.015))",
                          transform: `scaleX(${on ? 1 : 0})`,
                        }}
                      />
                      <span className="relative flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-[15px] text-ivory">{item.name}</span>
                        <span className={`text-[12px] ${locked ? "text-gold" : "text-stone-dark"}`}>
                          {locked
                            ? item.performedBy === "apprentice"
                              ? "Dans un rendez-vous séparé"
                              : "Pas avec un tarif formation"
                            : formatDuration(item.durationMin)}
                        </span>
                      </span>
                      <span className="relative font-display text-[22px] tabular-nums">
                        {formatPrice(item.priceCents)}
                      </span>
                      <span className="relative">
                        <CheckBox checked={on} />
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
