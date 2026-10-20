"use client";

import { useEffect, useState } from "react";
import { teamMessage, type TeamResult } from "../../_lib/messages";
import type { SalonDayView } from "../../actions";

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Lundi de la semaine de `date`, « AAAA-MM-JJ » : la semaine s'affiche du lundi au dimanche. */
const weekStart = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
};

export interface PickedSalonSlot {
  iso: string;
  time: string;
  dayLabel: string;
}

/**
 * Jours et créneaux du salon (pas de 15 minutes, sans délai de réservation : R-04, R-27). Tout vient du serveur :
 * `load` demande les 7 jours d'une semaine, la tablette ne calcule aucun créneau.
 */
export function SlotPicker({
  load,
  today,
  startDate,
  value,
  onPick,
  reloadKey,
}: {
  load: (from: string, days: number) => Promise<TeamResult<{ days: SalonDayView[] }>>;
  /** « AAAA-MM-JJ », heure de Paris. */
  today: string;
  /** Jour affiché au départ (ex. le jour du RDV qu'on déplace). */
  startDate?: string;
  value: string | null;
  onPick: (slot: PickedSalonSlot) => void;
  /** Change quand les prestations ou le coiffeur changent : les créneaux sont relus. */
  reloadKey: string;
}) {
  const [week, setWeek] = useState(() =>
    weekStart(startDate && startDate >= today ? startDate : today),
  );
  const [days, setDays] = useState<SalonDayView[]>([]);
  const [selected, setSelected] = useState<string | null>(startDate ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await load(week, 7);
      if (cancelled) return;
      if (result.ok) {
        setDays(result.days);
        setError(null);
        setSelected((current) =>
          current && result.days.some((d) => d.date === current && !d.closed)
            ? current
            : (result.days.find((d) => d.slots.length > 0)?.date ?? null),
        );
      } else {
        setError(teamMessage(result.error));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, week, reloadKey]);

  const day = days.find((d) => d.date === selected);
  const canGoBack = week > weekStart(today);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Semaine précédente"
          disabled={!canGoBack}
          onClick={() => setWeek(addDays(week, -7))}
          className="flex h-11 w-11 shrink-0 items-center justify-center border border-line-strong text-ivory disabled:opacity-30"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div role="tablist" aria-label="Jours" className="grid flex-1 grid-cols-7 gap-1.5">
          {(days.length > 0 ? days : placeholderDays(week)).map((d) => {
            const on = d.date === selected;
            const full = !d.closed && d.slots.length === 0 && days.length > 0;
            const unavailable = d.closed || full;
            return (
              <button
                key={d.date}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`${d.label}${d.closed ? ", fermé" : full ? ", complet" : ""}`}
                disabled={unavailable || days.length === 0}
                onClick={() => setSelected(d.date)}
                className={`flex h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 border transition-colors duration-200 ${
                  on
                    ? "border-ivory bg-ivory text-ink"
                    : unavailable
                      ? "border-line text-stone-dark"
                      : "border-line-strong text-ivory hover:bg-graphite-light"
                }`}
              >
                <span className="text-[11px] uppercase tracking-[0.12em]">{d.weekday}</span>
                <span className="text-[15px]">{d.closed ? "Fermé" : full ? "Complet" : d.day}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Semaine suivante"
          onClick={() => setWeek(addDays(week, 7))}
          className="flex h-11 w-11 shrink-0 items-center justify-center border border-line-strong text-ivory"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {error ? (
        <p role="alert" className="border border-brick p-3 text-body-sm text-ivory">
          {error}
        </p>
      ) : loading && days.length === 0 ? (
        <p role="status" className="text-body-sm text-stone">
          Chargement des créneaux…
        </p>
      ) : day && day.slots.length > 0 ? (
        <div
          className="grid grid-cols-4 gap-2 lg:grid-cols-6"
          aria-label={`Créneaux du ${day.label}`}
        >
          {day.slots.map((slot) => {
            const on = value === slot.iso;
            return (
              <button
                key={slot.iso}
                type="button"
                aria-pressed={on}
                aria-label={`${day.label}, ${slot.time}`}
                onClick={() => onPick({ iso: slot.iso, time: slot.time, dayLabel: day.label })}
                className={`h-12 border text-[15px] tabular-nums transition-colors duration-200 ${
                  on
                    ? "border-ivory bg-ivory text-ink"
                    : "border-line-strong text-ivory hover:bg-graphite-light"
                }`}
              >
                {slot.time}
              </button>
            );
          })}
        </div>
      ) : (
        <p role="status" className="text-body-sm text-stone">
          Aucun créneau libre cette semaine. Essayez la semaine suivante.
        </p>
      )}
    </div>
  );
}

/** Sept cases vides le temps du premier chargement : la grille ne saute pas. */
function placeholderDays(week: string): SalonDayView[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(week, i);
    return { date, weekday: "", day: Number(date.slice(8)), label: date, closed: false, slots: [] };
  });
}
