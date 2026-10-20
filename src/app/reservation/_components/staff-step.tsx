"use client";

import { Alert, btnPrimary } from "@/components/ui";
import type { StaffChoice } from "@/modules/catalog";

/** Étape 2 : « Avec qui ? ». R-20 : « Sans préférence » est sélectionné par défaut ; seuls les coiffeurs habilités apparaissent (R-13). */
export function StaffStep({
  choices,
  failed,
  selected,
  onSelect,
  onContinue,
}: {
  choices: StaffChoice[] | null;
  failed: boolean;
  selected: string;
  onSelect: (id: string) => void;
  onContinue: () => void;
}) {
  if (failed) {
    return (
      <Alert kind="error" title="Impossible de charger l'équipe">
        Réessayez dans un instant, ou appelez le salon.
      </Alert>
    );
  }
  if (!choices) {
    return (
      <p role="status" className="py-6 text-body-sm text-stone">
        Chargement…
      </p>
    );
  }

  const apprentices = choices.length > 0 && choices.every((c) => c.role === "apprentice");
  const options = [
    { id: "any", name: "Sans préférence", role: apprentices ? "Un apprenti" : "Plus de créneaux" },
    ...choices.map((c) => ({
      id: c.id,
      name: c.firstName,
      role: c.role === "apprentice" ? "Apprenti" : "Coiffeur",
    })),
  ];
  const names = choices.map((c) => c.firstName);
  const note = apprentices
    ? `Tarif formation : réalisé par ${names.join(" ou ")}, nos apprentis.`
    : "";

  return (
    <>
      {note ? <p className="text-body-sm leading-normal text-stone">{note}</p> : null}
      <div role="radiogroup" aria-label="Coiffeur" className="flex flex-col gap-2.5">
        {options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(option.id)}
              className={`flex min-h-[60px] items-center gap-3.5 border px-4 text-left transition-colors duration-200 ${
                isSelected
                  ? "border-ivory bg-graphite-light"
                  : "border-line hover:bg-graphite-light"
              }`}
            >
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center border ${isSelected ? "border-ivory" : "border-line-hover"}`}
              >
                {isSelected ? <span className="h-2 w-2 bg-ivory" /> : null}
              </span>
              <span className="flex-1 text-body-lg">{option.name}</span>
              <span className="text-label normal-case tracking-normal text-stone">
                {option.role}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onContinue} className={btnPrimary}>
        Continuer
      </button>
    </>
  );
}
