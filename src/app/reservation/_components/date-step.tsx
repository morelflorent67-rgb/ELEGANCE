"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, CalendarIcon, CallButton, btnSecondary } from "@/components/ui";
import { fetchDays, fetchToday, type DayView, type SlotView } from "../actions";

export interface PickedSlot extends SlotView {
  dayLabel: string;
}

const PAGE_DAYS = 7;
const VISIBLE_SLOTS = 8;

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const merge = (current: DayView[], incoming: DayView[]) => {
  const byDate = new Map(current.map((d) => [d.date, d]));
  for (const day of incoming) byDate.set(day.date, day);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Étape 3 : les jours en accordéon, les créneaux libres du jour, « Voir plus » et un calendrier pour une date lointaine.
 * Tout vient du serveur (créneaux, délais de R-06) ; ici on ne fait qu'afficher.
 */
export function DateStep({
  serviceIds,
  appointmentId,
  staffId,
  staffName,
  selectedIso,
  notice,
  onPick,
  onTrySansPreference,
}: {
  serviceIds: string[];
  /** Déplacement d'un RDV : le serveur calcule les créneaux d'après ce RDV (durée figée, sans se bloquer lui-même). */
  appointmentId?: string;
  staffId: string;
  staffName: string | null;
  selectedIso: string | null;
  /** Le créneau choisi n'est plus disponible : vos autres choix sont conservés. */
  notice: "taken" | "gone" | null;
  onPick: (slot: PickedSlot) => void;
  onTrySansPreference: () => void;
}) {
  const [days, setDays] = useState<DayView[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bounds, setBounds] = useState<{ today: string; lastBookable: string } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [noneInWeek, setNoneInWeek] = useState(false);
  const [next, setNext] = useState<{ day: DayView; time: string } | null | "none">(null);
  const [picking, setPicking] = useState(false);
  const [pickedDateMessage, setPickedDateMessage] = useState<string | null>(null);
  // Jours trouvés par la recherche de prochaine disponibilité, affichés quand le client le demande.
  const [pending, setPending] = useState<DayView[]>([]);

  const load = useCallback(
    async (from: string, count: number) => {
      const result = await fetchDays({
        serviceIds,
        staffId,
        from,
        days: count,
        ...(appointmentId ? { appointmentId } : {}),
      });
      if (!result.ok) throw new Error(result.error);
      return result.days;
    },
    [serviceIds, staffId, appointmentId],
  );

  // Première lecture : la semaine qui vient ; sinon on cherche la prochaine disponibilité.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const range = await fetchToday();
        if (cancelled) return;
        setBounds(range);
        const first = await load(range.today, PAGE_DAYS);
        if (cancelled) return;
        setCursor(addDays(range.today, PAGE_DAYS));
        if (first.length > 0) {
          setDays(first);
          setOpenDate(first[0].date);
          return;
        }
        setNoneInWeek(true);
        let from = addDays(range.today, PAGE_DAYS);
        while (from <= range.lastBookable) {
          const found = await load(from, PAGE_DAYS);
          if (cancelled) return;
          if (found.length > 0) {
            setNext({ day: found[0], time: found[0].slots[0].time });
            setCursor(addDays(from, PAGE_DAYS));
            setPending(found);
            return;
          }
          from = addDays(from, PAGE_DAYS);
        }
        setNext("none");
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const showNext = () => {
    setDays((current) => merge(current, pending));
    setOpenDate(pending[0]?.date ?? null);
    setNoneInWeek(false);
    setNext(null);
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const more = await load(cursor, PAGE_DAYS);
      setDays((current) => merge(current, more));
      setCursor(addDays(cursor, PAGE_DAYS));
      if (more[0]) setOpenDate(more[0].date);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const pickDate = async (date: string) => {
    setPickedDateMessage(null);
    if (!date) return;
    try {
      const found = await load(date, 1);
      if (found.length === 0) {
        setPickedDateMessage("Aucun créneau ce jour-là. Choisissez une autre date.");
        return;
      }
      setDays((current) => merge(current, found));
      setOpenDate(found[0].date);
      setPicking(false);
    } catch {
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <div className="flex flex-col gap-4">
        <Alert kind="error" title="Impossible de charger les créneaux">
          Réessayez dans un instant, ou appelez le salon.
        </Alert>
        <CallButton />
      </div>
    );
  }

  const canLoadMore = !!cursor && !!bounds && cursor <= bounds.lastBookable;

  return (
    <>
      {notice ? (
        <Alert
          kind="error"
          title={
            notice === "taken" ? "Ce créneau vient d'être pris" : "Ce créneau n'est plus disponible"
          }
        >
          Choisissez-en un autre : vos autres choix sont conservés.
        </Alert>
      ) : null}

      {loading && days.length === 0 ? (
        <p role="status" className="py-6 text-body-sm text-stone">
          Chargement des créneaux…
        </p>
      ) : null}

      {!loading && noneInWeek && days.length === 0 ? (
        <div className="flex flex-col gap-4">
          {staffId !== "any" && staffName ? (
            <Alert kind="info" title={`${staffName} n'a plus de créneau cette semaine`}>
              {next && next !== "none"
                ? `Prochaine disponibilité avec ${staffName} : ${next.day.label.toLowerCase()}, ${next.time}.`
                : "Aucun créneau avec ce coiffeur dans les 6 prochaines semaines."}
            </Alert>
          ) : (
            <Alert kind="info" title="Aucun créneau cette semaine">
              {next && next !== "none"
                ? `Prochaine disponibilité : ${next.day.label.toLowerCase()}, ${next.time}.`
                : "Aucun créneau dans les 6 prochaines semaines."}
            </Alert>
          )}
          {next && next !== "none" ? (
            <button type="button" onClick={showNext} className={btnSecondary}>
              Voir le {next.day.label.toLowerCase()}
            </button>
          ) : null}
          {staffId !== "any" ? (
            <button type="button" onClick={onTrySansPreference} className={btnSecondary}>
              Essayer sans préférence
            </button>
          ) : null}
          <CallButton />
        </div>
      ) : null}

      {days.length > 0 ? (
        <ul className="flex flex-col">
          {days.map((day) => {
            const isOpen = openDate === day.date;
            const showAll = expanded.has(day.date);
            const slots = showAll ? day.slots : day.slots.slice(0, VISIBLE_SLOTS);
            return (
              <li key={day.date} className="flex flex-col border-t border-line">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`day-${day.date}`}
                  onClick={() => setOpenDate(isOpen ? null : day.date)}
                  className="flex min-h-[60px] items-center gap-4 text-left"
                >
                  <span className="flex-1 text-body-lg">{day.label}</span>
                  <span className="text-body-sm text-stone">
                    {day.slots.length} créneau{day.slots.length > 1 ? "x" : ""}
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-gold)"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d={isOpen ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"} />
                  </svg>
                </button>
                {isOpen ? (
                  <div
                    id={`day-${day.date}`}
                    className="flex animate-step-in flex-col gap-2.5 pb-[18px] pt-0.5"
                  >
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map((slot) => {
                        const selected = slot.iso === selectedIso;
                        return (
                          <button
                            key={slot.iso}
                            type="button"
                            aria-pressed={selected}
                            aria-label={`${day.label}, ${slot.time}`}
                            onClick={() => onPick({ ...slot, dayLabel: day.label })}
                            className={`h-12 border text-[15px] tabular-nums transition-colors duration-200 ${
                              selected
                                ? "border-ivory bg-ivory text-ink"
                                : "border-line-strong text-ivory hover:bg-graphite-light"
                            }`}
                          >
                            {slot.time}
                          </button>
                        );
                      })}
                    </div>
                    {!showAll && day.slots.length > VISIBLE_SLOTS ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(new Set(expanded).add(day.date))}
                        className="flex min-h-11 items-center gap-2.5 self-start text-button-sm uppercase text-ivory"
                      >
                        Voir plus
                        <span className="h-px w-6 bg-gold" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {days.length > 0 && canLoadMore ? (
        <button type="button" disabled={loading} onClick={loadMore} className={btnSecondary}>
          {loading ? "Chargement…" : "Voir les jours suivants"}
        </button>
      ) : null}

      {bounds && !failed ? (
        <div className="flex flex-col gap-2.5">
          {picking ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="other-date" className="text-body-sm text-ivory-soft">
                Choisir une date
              </label>
              <input
                id="other-date"
                type="date"
                min={bounds.today}
                max={bounds.lastBookable}
                onChange={(event) => pickDate(event.target.value)}
                className="h-[52px] w-full border border-line-strong bg-ink px-4 text-[16px] text-ivory"
              />
              {pickedDateMessage ? (
                <span role="alert" className="text-body-sm text-brick">
                  {pickedDateMessage}
                </span>
              ) : null}
            </div>
          ) : (
            <button type="button" onClick={() => setPicking(true)} className={btnSecondary}>
              <CalendarIcon />
              Choisir une autre date
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
