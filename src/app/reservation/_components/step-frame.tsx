import type { ReactNode } from "react";
import { LedLine } from "@/components/ui";

export type StepStatus = "open" | "done" | "todo";

const numberBox = "flex h-7 w-7 shrink-0 items-center justify-center border text-body-sm";

/**
 * Une étape du parcours : ouverte (panneau), validée (résumé modifiable) ou à venir (ligne grisée).
 * Les états restent lisibles sans la couleur : numéro, coche et libellé.
 */
export function StepFrame({
  n,
  title,
  status,
  summaryLabel,
  summary,
  onEdit,
  editLabel = "Modifier",
  children,
}: {
  n: number;
  title: string;
  status: StepStatus;
  summaryLabel: string;
  summary: ReactNode;
  /** Absent : l'étape validée ne se modifie pas (ex. les prestations d'un RDV qu'on déplace). */
  onEdit?: () => void;
  editLabel?: string;
  children: ReactNode;
}) {
  if (status === "open") {
    return (
      <section
        id={`step-${n}`}
        aria-labelledby={`step-${n}-title`}
        className="flex scroll-mt-4 animate-step-in flex-col gap-4 border border-ivory p-4"
      >
        <div className="flex items-center gap-3.5">
          <span className={`${numberBox} border-ivory text-ivory`}>{n}</span>
          <h2 id={`step-${n}-title`} className="text-title-3 font-light">
            {title}
          </h2>
        </div>
        <LedLine />
        {children}
      </section>
    );
  }

  if (status === "done") {
    return (
      <section
        id={`step-${n}`}
        aria-label={`${title} : validé`}
        className="flex min-h-[72px] items-center gap-3.5 bg-graphite px-4 py-3"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center bg-ivory"
          aria-hidden="true"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2.2"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-label uppercase text-stone">{summaryLabel}</span>
          <div className="flex flex-col gap-0.5 text-[15px] leading-snug text-ivory">{summary}</div>
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 shrink-0 text-body-sm text-ivory-soft underline underline-offset-4"
          >
            {editLabel}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      id={`step-${n}`}
      aria-label={`${title} : à venir`}
      className="flex min-h-[60px] items-center gap-3.5 border border-line-subtle px-4"
    >
      <span className={`${numberBox} border-line-strong text-stone`}>{n}</span>
      <span className="text-body text-stone">{title}</span>
    </section>
  );
}
