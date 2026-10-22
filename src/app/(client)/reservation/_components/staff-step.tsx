"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Problem } from "@/components/client/ui";
import type { StaffChoice } from "@/modules/catalog";

const HEX = "M13.5 1H38.5L51 23L38.5 45H13.5L1 23Z";

/**
 * Étape 2 : « Avec qui ? ». R-20 : « Sans préférence » en premier, choisi par défaut ; seuls les coiffeurs habilités
 * apparaissent (R-13). Toucher un nom le choisit et passe au créneau.
 */
export function StaffStep({
  choices,
  failed,
  selected,
  apprentices,
  onSelect,
  onPicked,
}: {
  choices: StaffChoice[] | null;
  failed: boolean;
  selected: string;
  apprentices: boolean;
  onSelect: (id: string) => void;
  onPicked: () => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const title = (
    <div className="flex flex-col gap-2.5">
      <h1 className="overflow-hidden font-display text-[40px] leading-[1.05]">
        <span className="s-tl block">Avec qui ?</span>
      </h1>
      <p className="s-up text-[14px] text-stone" style={{ animationDelay: "180ms" }}>
        {apprentices
          ? "Le tarif formation est réalisé par un apprenti."
          : "Sans préférence, vous voyez tous les horaires."}
      </p>
    </div>
  );

  if (failed || !choices) {
    return (
      <div className="flex flex-col gap-[26px] px-6 pb-9 pt-[26px]">
        {title}
        {failed ? (
          <Problem title="Impossible de charger l'équipe">
            Réessayez dans un instant, ou appelez le salon.
          </Problem>
        ) : (
          <p role="status" className="text-[14px] text-stone">
            Chargement…
          </p>
        )}
      </div>
    );
  }

  const options = [
    {
      id: "any",
      name: "Sans préférence",
      role: `${choices.map((c) => c.firstName).join(" ou ")} · plus de créneaux`,
    },
    ...choices.map((c) => ({
      id: c.id,
      name: c.firstName,
      role: c.role === "apprentice" ? "Apprenti" : "Coiffeur",
    })),
  ];

  return (
    <div className="flex flex-col gap-[26px] px-6 pb-9 pt-[26px]">
      {title}
      <div
        role="radiogroup"
        aria-label="Choix du coiffeur"
        className="flex flex-col border-t border-[rgb(239_233_221_/_0.12)]"
      >
        {options.map((option, i) => {
          const on = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                onSelect(option.id);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(onPicked, 420);
              }}
              className="s-up relative flex min-h-[88px] items-center gap-[18px] border-b border-[rgb(239_233_221_/_0.12)] text-left"
              style={{ animationDelay: `${240 + i * 60}ms` }}
            >
              <span
                aria-hidden="true"
                className="rowfill absolute -inset-x-6 inset-y-0"
                style={{
                  background:
                    "linear-gradient(90deg, rgb(184 147 90 / 0.13), rgb(184 147 90 / 0.02))",
                  transform: `scaleX(${on ? 1 : 0})`,
                }}
              />
              <span
                aria-hidden="true"
                className="relative flex h-[46px] w-[52px] shrink-0 items-center justify-center"
              >
                <svg
                  width="52"
                  height="46"
                  viewBox="0 0 52 46"
                  fill="none"
                  className="absolute inset-0"
                >
                  <path d={HEX} stroke="rgb(239 233 221 / 0.3)" />
                  <path
                    className="hexsel"
                    pathLength="1"
                    d={HEX}
                    stroke="#b8935a"
                    strokeWidth="1.4"
                    style={{ strokeDashoffset: on ? 0 : 1 }}
                  />
                </svg>
                {option.id === "any" ? (
                  <span className="flex flex-col gap-1">
                    <span className="h-[1.5px] w-4 bg-ivory" />
                    <span className="h-[1.5px] w-4 bg-ivory" />
                    <span className="h-[1.5px] w-4 bg-ivory" />
                  </span>
                ) : (
                  <span className="relative font-display text-[24px] leading-none">
                    {option.name.charAt(0)}
                  </span>
                )}
              </span>
              <span className="relative flex flex-1 flex-col gap-1">
                <span className="font-display text-[26px] leading-[1.1]">{option.name}</span>
                <span className="text-[12px] tracking-[0.04em] text-stone">{option.role}</span>
              </span>
              <span className="relative text-ivory-soft">
                <ArrowRight color="#c9c3b7" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
