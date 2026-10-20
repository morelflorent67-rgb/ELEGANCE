"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Field, inputClass } from "@/components/ui";
import type { DayRange, ManagedClosure, WeekHours } from "@/modules/schedule/manage";
import { teamMessage, type TeamError } from "../../../_lib/messages";
import {
  addClosureAction,
  removeClosureAction,
  saveHoursAction,
} from "../../../actions";

const DAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Lundi" },
  { weekday: 2, label: "Mardi" },
  { weekday: 3, label: "Mercredi" },
  { weekday: 4, label: "Jeudi" },
  { weekday: 5, label: "Vendredi" },
  { weekday: 6, label: "Samedi" },
  { weekday: 7, label: "Dimanche" },
];

/** Ce que reçoit un jour qu'on ouvre : le rythme habituel du salon. */
const DEFAULT_DAY: DayRange[] = [
  { opensAt: "10:00", closesAt: "12:00" },
  { opensAt: "13:00", closesAt: "19:00" },
];
const MAX_RANGES = 3;

const ghost =
  "flex h-11 items-center justify-center border border-line-strong px-4 text-[12px] hover:bg-graphite-light disabled:text-stone-dark disabled:hover:bg-transparent";

/** Toutes les heures de 6 h à 23 h 45 sur la grille de 15 minutes (R-04), et la valeur actuelle si elle sort de là. */
function timeOptions(current: string): string[] {
  const options: string[] = [];
  for (let minutes = 6 * 60; minutes < 24 * 60; minutes += 15) {
    options.push(
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
  }
  return options.includes(current) ? options : [...options, current].sort();
}

/** Une nouvelle plage démarre une heure après la précédente et dure une heure (modifiable). */
function nextRange(last: DayRange): DayRange {
  const shift = (time: string, minutes: number) => {
    const total = Math.min(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + minutes, 23 * 60 + 45);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  return { opensAt: shift(last.closesAt, 60), closesAt: shift(last.closesAt, 120) };
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const label = (iso: string) => dateFormat.format(new Date(`${iso}T12:00:00Z`));

/** « Horaires et fermetures » (R-01, R-03) : plages par jour, puis fermetures exceptionnelles. */
export function HorairesManager({
  week: initialWeek,
  closures,
  today,
}: {
  week: WeekHours;
  closures: ManagedClosure[];
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [week, setWeek] = useState<WeekHours>(initialWeek);
  const [saved, setSaved] = useState(JSON.stringify(initialWeek));
  const [hoursMessage, setHoursMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [closureError, setClosureError] = useState<string | null>(null);
  const [form, setForm] = useState({ startsOn: today, endsOn: today, reason: "" });

  const dirty = JSON.stringify(week) !== saved;

  const onFailure = (code: TeamError): string => {
    if (code === "manager_locked") router.push("/equipe/gerant");
    return teamMessage(code);
  };

  const setDay = (weekday: number, ranges: DayRange[]) => {
    setHoursMessage(null);
    setWeek((w) => ({ ...w, [weekday]: ranges }));
  };
  const setRange = (weekday: number, index: number, change: Partial<DayRange>) =>
    setDay(
      weekday,
      week[weekday].map((r, i) => (i === index ? { ...r, ...change } : r)),
    );

  const saveHours = () => {
    setHoursMessage(null);
    startTransition(async () => {
      const result = await saveHoursAction({ week });
      if (!result.ok) {
        setHoursMessage({ kind: "error", text: onFailure(result.error) });
        return;
      }
      setSaved(JSON.stringify(week));
      setHoursMessage({ kind: "ok", text: "Horaires enregistrés." });
      router.refresh();
    });
  };

  const addClosure = () => {
    setClosureError(null);
    startTransition(async () => {
      const result = await addClosureAction(form);
      if (!result.ok) {
        setClosureError(onFailure(result.error));
        return;
      }
      setForm({ startsOn: today, endsOn: today, reason: "" });
      router.refresh();
    });
  };

  const removeClosure = (closureId: number) => {
    setClosureError(null);
    startTransition(async () => {
      const result = await removeClosureAction({ closureId });
      if (!result.ok) setClosureError(onFailure(result.error));
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Horaires d’ouverture" className="flex flex-col gap-3">
        <h2 className="border-b border-line pb-2 text-label uppercase tracking-[0.3em] text-stone">
          Horaires d’ouverture
        </h2>
        <ul>
          {DAYS.map(({ weekday, label: dayLabel }) => {
            const ranges = week[weekday];
            const isOpen = ranges.length > 0;
            return (
              <li
                key={weekday}
                className="flex flex-wrap items-start gap-x-5 gap-y-3 border-b border-line-subtle py-4"
              >
                <div className="flex h-11 w-[170px] items-center justify-between gap-3">
                  <span className={isOpen ? "text-[16px]" : "text-[16px] text-stone"}>
                    {dayLabel}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOpen}
                    aria-label={`Ouvert le ${dayLabel.toLowerCase()}`}
                    onClick={() => setDay(weekday, isOpen ? [] : DEFAULT_DAY)}
                    className={`flex h-8 w-14 shrink-0 items-center border p-[3px] ${
                      isOpen ? "justify-end border-ivory bg-ivory" : "justify-start border-line-strong"
                    }`}
                  >
                    <span className={`h-6 w-6 ${isOpen ? "bg-ink" : "bg-stone"}`} />
                  </button>
                </div>

                {isOpen ? (
                  <div className="flex min-w-[260px] flex-1 flex-col gap-2">
                    {ranges.map((range, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`${dayLabel}, plage ${index + 1}, ouverture`}
                          className={`${inputClass} !h-11 !w-[128px] !px-3 tabular-nums`}
                          value={range.opensAt}
                          onChange={(e) => setRange(weekday, index, { opensAt: e.target.value })}
                        >
                          {timeOptions(range.opensAt).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <span aria-hidden="true" className="text-stone">
                          à
                        </span>
                        <select
                          aria-label={`${dayLabel}, plage ${index + 1}, fermeture`}
                          className={`${inputClass} !h-11 !w-[128px] !px-3 tabular-nums`}
                          value={range.closesAt}
                          onChange={(e) => setRange(weekday, index, { closesAt: e.target.value })}
                        >
                          {timeOptions(range.closesAt).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        {ranges.length > 1 ? (
                          <button
                            type="button"
                            aria-label={`Retirer la plage ${index + 1} du ${dayLabel.toLowerCase()}`}
                            onClick={() =>
                              setDay(
                                weekday,
                                ranges.filter((_, i) => i !== index),
                              )
                            }
                            className="flex h-11 w-11 items-center justify-center border border-line text-brick"
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {ranges.length < MAX_RANGES ? (
                      <button
                        type="button"
                        onClick={() => setDay(weekday, [...ranges, nextRange(ranges.at(-1)!)])}
                        className="min-h-11 self-start text-[13px] text-ivory-soft underline underline-offset-4"
                        aria-label={`Ajouter une plage le ${dayLabel.toLowerCase()}`}
                      >
                        Ajouter une plage
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <span className="flex h-11 items-center text-[14px] text-stone">Fermé</span>
                )}
              </li>
            );
          })}
        </ul>

        {hoursMessage ? (
          <p
            role={hoursMessage.kind === "error" ? "alert" : "status"}
            className={`border p-3 text-[14px] leading-normal ${
              hoursMessage.kind === "error" ? "border-brick" : "border-line-strong"
            }`}
          >
            {hoursMessage.text}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={saveHours}
          className="flex h-14 w-full max-w-[360px] items-center justify-center bg-ivory px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-ink disabled:bg-disabled disabled:text-stone-dark"
        >
          {pending ? "…" : "Enregistrer les horaires"}
        </button>
      </section>

      <section aria-label="Fermetures exceptionnelles" className="flex flex-col gap-3">
        <h2 className="border-b border-line pb-2 text-label uppercase tracking-[0.3em] text-stone">
          Fermetures exceptionnelles
        </h2>
        <p className="text-[13px] leading-normal text-stone">
          Jours fériés, congés annuels : plus aucun créneau n’est proposé ces jours-là. Les
          fermetures terminées ne sont plus affichées.
        </p>

        {closures.length === 0 ? (
          <p className="text-[14px] text-stone">Aucune fermeture prévue.</p>
        ) : (
          <ul className="border-t border-line-subtle">
            {closures.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-4 border-b border-line-subtle py-3"
              >
                <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                  <span className="text-[15px]">
                    {c.startsOn === c.endsOn
                      ? label(c.startsOn)
                      : `Du ${label(c.startsOn)} au ${label(c.endsOn)}`}
                  </span>
                  {c.reason ? <span className="text-[12px] text-stone">{c.reason}</span> : null}
                </div>
                <button
                  type="button"
                  aria-label={`Supprimer la fermeture${c.reason ? ` ${c.reason}` : ""} du ${label(c.startsOn)}`}
                  disabled={pending}
                  onClick={() => removeClosure(c.id)}
                  className={`${ghost} border-line text-brick`}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-col gap-3 border border-line p-5"
          onSubmit={(event) => {
            event.preventDefault();
            addClosure();
          }}
        >
          <h3 className="text-[16px]">Ajouter une fermeture</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field id="closure-from" label="Du">
              <input
                id="closure-from"
                type="date"
                className={inputClass}
                min={today}
                value={form.startsOn}
                required
                onChange={(e) =>
                  setForm({
                    ...form,
                    startsOn: e.target.value,
                    endsOn: form.endsOn < e.target.value ? e.target.value : form.endsOn,
                  })
                }
              />
            </Field>
            <Field id="closure-to" label="Au (inclus)">
              <input
                id="closure-to"
                type="date"
                className={inputClass}
                min={form.startsOn}
                value={form.endsOn}
                required
                onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
              />
            </Field>
          </div>
          <Field id="closure-reason" label="Motif" optional>
            <input
              id="closure-reason"
              className={inputClass}
              maxLength={80}
              placeholder="Jour férié, congés annuels…"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </Field>
          {closureError ? (
            <p role="alert" className="border border-brick p-3 text-[14px] leading-normal">
              {closureError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="flex h-[52px] items-center justify-center border border-line-strong px-6 text-[11px] uppercase tracking-[0.2em] hover:bg-graphite-light disabled:text-stone-dark"
          >
            Ajouter la fermeture
          </button>
        </form>
      </section>
    </div>
  );
}
