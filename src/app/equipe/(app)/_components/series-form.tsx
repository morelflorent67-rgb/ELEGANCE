"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { StaffChoice } from "@/modules/catalog";
import type { MonthlyMode, RepeatRule, SeriesEnd } from "@/modules/availability/recurrence";
import { teamMessage } from "../../_lib/messages";
import {
  extendSeriesAction,
  fetchRepeatOptions,
  previewExtendAction,
  previewRepeatAction,
  repeatAppointmentAction,
  type RepeatOptionsView,
  type SeriesCardView,
  type SeriesPlanView,
} from "../../actions";
import { AuthorPicker, type TeamMemberView } from "./author-picker";

// « Répéter ce RDV » et « Prolonger la série » (D-83, D-90), dans la fiche du RDV. L'aperçu vient du serveur à chaque
// changement : dates retenues avec leur coiffeur, dates sautées avec leur raison (D-71, D-84). Rien n'est réservé avant
// « Confirmer ».

type Frequency = 1 | 2 | 3 | 4 | "month";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 1, label: "Chaque semaine" },
  { value: 2, label: "Toutes les 2 semaines" },
  { value: 3, label: "Toutes les 3 semaines" },
  { value: 4, label: "Toutes les 4 semaines" },
  { value: "month", label: "Chaque mois" },
];

const choice = (on: boolean) =>
  `min-h-12 border px-2 text-[14px] leading-tight transition-colors duration-200 ${
    on ? "border-ivory bg-ivory text-ink" : "border-line-strong hover:bg-graphite-light"
  }`;
const label = "text-label uppercase text-stone";
const ghostButton =
  "h-[52px] border border-line-strong text-[11px] uppercase tracking-[0.2em] text-ivory transition-colors duration-200 hover:bg-graphite-light";

export function SeriesForm({
  mode,
  appointmentId,
  customerId,
  series,
  team,
  hasEmail,
  onDone,
  onCancel,
}: {
  mode: "repeat" | "extend";
  appointmentId: string;
  customerId: string;
  /** La série du RDV, pour une prolongation. */
  series: SeriesCardView | null;
  team: TeamMemberView[];
  hasEmail: boolean;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [options, setOptions] = useState<RepeatOptionsView | null>(null);
  const [frequency, setFrequency] = useState<Frequency>(4);
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>("day_of_month");
  const [staffId, setStaffId] = useState<string | "any">("any");
  const [endKind, setEndKind] = useState<SeriesEnd["kind"]>("count");
  const [total, setTotal] = useState(mode === "repeat" ? 6 : 4);
  const [until, setUntil] = useState("");
  const [plan, setPlan] = useState<SeriesPlanView | null>(null);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Ce que permet ce RDV : façons de répéter chaque mois, coiffeurs habilités, limite des 6 mois.
  useEffect(() => {
    if (mode !== "repeat") return;
    let cancelled = false;
    fetchRepeatOptions({ appointmentId }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setOptions(result.options);
        setStaffId(result.options.staffId);
      } else {
        setError(teamMessage(result.error));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, appointmentId]);

  const rule: RepeatRule =
    frequency === "month"
      ? { frequency: "monthly", monthlyMode }
      : { frequency: "weekly", intervalWeeks: frequency };
  const end: SeriesEnd | null =
    endKind === "count" ? { kind: "count", total } : until ? { kind: "until", date: until } : null;
  const ready = mode === "extend" || options !== null;
  const firstDay = mode === "repeat" ? options?.firstDay : series?.extendFirstDay;
  const limit = mode === "repeat" ? options?.limit : series?.extendLimit;
  const minTotal = mode === "repeat" ? 2 : 1;
  const staffChoice = mode === "repeat" ? staffId : (series?.staffChoice ?? "any");
  const key = JSON.stringify({ rule, staffId, end });

  // Aperçu : 250 ms après le dernier changement. Une réponse plus ancienne ne remplace jamais la dernière.
  useEffect(() => {
    if (!ready || !end) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result =
        mode === "repeat"
          ? await previewRepeatAction({ appointmentId, rule, staffId, end })
          : await previewExtendAction({ appointmentId, end, staffChoice });
      if (cancelled) return;
      if (result.ok) {
        setPlan(result.plan);
        setError(null);
      } else {
        setPlan(null);
        setError(teamMessage(result.error));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` résume règle, coiffeur et fin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, mode, appointmentId]);

  const okCount = plan?.okCount ?? 0;
  const skipped = plan ? plan.dates.length - okCount : 0;
  // À la création, le RDV de départ compte dans la série mais n'est pas réservé une seconde fois.
  const canConfirm = !!authorId && !!end && okCount > 0 && !pending;

  const confirm = () => {
    if (!authorId || !end) return;
    setError(null);
    startTransition(async () => {
      const result =
        mode === "repeat"
          ? await repeatAppointmentAction({ appointmentId, rule, staffId, end, authorId })
          : await extendSeriesAction({ appointmentId, end, authorId, staffChoice });
      if (!result.ok) {
        setError(teamMessage(result.error));
        return;
      }
      const author = team.find((m) => m.id === authorId)?.firstName ?? "";
      const sautees = result.plan.dates.length - result.plan.okCount;
      onDone(
        `${mode === "repeat" ? "Série créée" : "Série prolongée"} par ${author} : ${result.created} RDV${
          sautees > 0
            ? `, ${sautees} date${sautees > 1 ? "s" : ""} sautée${sautees > 1 ? "s" : ""}`
            : ""
        } · ${hasEmail ? "le client reçoit un email avec les dates." : "pas d’email sur la fiche, prévenez le client."}`,
      );
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {mode === "repeat" && options ? (
        <p className="text-[13px] leading-normal text-stone">
          Ce RDV ({options.startLabel}) devient le premier de la série. Mêmes prestations, même
          heure ; au plus 6 mois.
        </p>
      ) : null}
      {mode === "extend" && series ? (
        <p className="text-[13px] leading-normal text-stone">
          {series.ruleLabel} : la série reprend après sa dernière date, pour 6 mois au plus.
        </p>
      ) : null}

      {mode === "repeat" ? (
        <div role="group" aria-label="Fréquence" className="flex flex-col gap-2">
          <span className={label}>Fréquence</span>
          <div className="grid grid-cols-2 gap-2">
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={frequency === f.value}
                onClick={() => setFrequency(f.value)}
                className={`${choice(frequency === f.value)} ${f.value === "month" ? "col-span-2" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {frequency === "month" && options ? (
            <div role="group" aria-label="Chaque mois" className="grid grid-cols-2 gap-2 pt-1">
              {options.monthly.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  aria-pressed={monthlyMode === m.mode}
                  onClick={() => setMonthlyMode(m.mode)}
                  className={choice(monthlyMode === m.mode)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "repeat" && options ? (
        <div role="group" aria-label="Coiffeur de la série" className="flex flex-col gap-2">
          <span className={label}>Coiffeur</span>
          <div className="grid grid-cols-2 gap-2">
            {[{ id: "any", firstName: "Sans préférence" } as StaffChoice, ...options.choices].map(
              (c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={staffId === c.id}
                  onClick={() => setStaffId(c.id)}
                  className={choice(staffId === c.id)}
                >
                  {c.firstName}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}

      <div role="group" aria-label="Fin de la série" className="flex flex-col gap-2">
        <span className={label}>Fin</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={endKind === "count"}
            onClick={() => setEndKind("count")}
            className={choice(endKind === "count")}
          >
            Nombre de RDV
          </button>
          <button
            type="button"
            aria-pressed={endKind === "until"}
            onClick={() => setEndKind("until")}
            className={choice(endKind === "until")}
          >
            Jusqu’au
          </button>
        </div>
        {endKind === "count" ? (
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              aria-label="Un RDV de moins"
              disabled={total <= minTotal}
              onClick={() => setTotal((n) => Math.max(minTotal, n - 1))}
              className="flex h-12 w-12 items-center justify-center border border-line-strong text-[20px] disabled:text-stone-dark"
            >
              −
            </button>
            <span
              className="min-w-8 text-center text-[22px] font-light tabular-nums"
              aria-live="polite"
            >
              {total}
            </span>
            <button
              type="button"
              aria-label="Un RDV de plus"
              disabled={total >= 30}
              onClick={() => setTotal((n) => Math.min(30, n + 1))}
              className="flex h-12 w-12 items-center justify-center border border-line-strong text-[20px] disabled:text-stone-dark"
            >
              +
            </button>
            <span className="text-[13px] leading-snug text-stone">
              {mode === "repeat" ? "RDV en tout, celui-ci compris" : "RDV de plus"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 pt-1">
            <label htmlFor="series-until" className="sr-only">
              Dernier jour de la série
            </label>
            <input
              id="series-until"
              type="date"
              min={firstDay}
              max={limit}
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              className="h-12 w-full min-w-0 border border-line-strong bg-ink px-4 text-[16px] text-ivory [color-scheme:dark]"
            />
          </div>
        )}
      </div>

      <section aria-label="Dates de la série" className="flex flex-col gap-2">
        <span className={label}>
          {plan
            ? `${okCount} RDV ${okCount > 1 ? "seront réservés" : "sera réservé"}${
                skipped > 0
                  ? ` · ${skipped} date${skipped > 1 ? "s" : ""} sautée${skipped > 1 ? "s" : ""}`
                  : ""
              }`
            : end
              ? "Calcul des dates…"
              : "Choisissez une date de fin"}
        </span>
        {plan ? (
          <ul className="flex max-h-[260px] flex-col overflow-y-auto border-t border-line-subtle">
            {plan.dates.map((d) => (
              <li
                key={d.key}
                data-skipped={d.ok ? undefined : ""}
                className="flex min-h-12 flex-col justify-center gap-0.5 border-b border-line-subtle py-1.5"
              >
                <span className={`text-[14px] ${d.ok ? "" : "text-stone line-through"}`}>
                  {d.label}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 text-[12px] text-stone">
                  {d.ok ? d.detail : `Sautée · ${d.detail}`}
                  {!d.ok && d.date ? (
                    <Link
                      href={`/equipe/reserver?client=${customerId}&depuis=${appointmentId}&jour=${d.date}`}
                      className="flex min-h-10 items-center text-ivory-soft underline underline-offset-4"
                    >
                      Réserver à une autre heure
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <AuthorPicker team={team} value={authorId} onChange={setAuthorId} label="Qui réserve ?" />
      {error ? (
        <p role="alert" className="border border-brick p-3 text-[13px] leading-normal">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className={ghostButton}>
          Retour
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={confirm}
          className="h-[52px] bg-ivory text-[11px] font-medium uppercase tracking-[0.2em] text-ink disabled:bg-disabled disabled:text-stone-dark"
        >
          {pending ? "…" : okCount > 0 ? `Confirmer ${okCount} RDV` : "Confirmer"}
        </button>
      </div>
    </div>
  );
}
