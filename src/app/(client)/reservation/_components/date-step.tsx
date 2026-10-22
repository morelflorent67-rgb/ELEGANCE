"use client";

import { useEffect, useRef, useState } from "react";
import { GoldBanner, PhoneIcon, Problem, ghost } from "@/components/client/ui";
import { formatDuration } from "@/lib/format";
import { SALON } from "@/lib/salon";
import { nearestSlots, periodsOf } from "@/lib/slot-view";
import { fetchDays, fetchToday, type DayView, type SlotView } from "../actions";
import { WaitlistSheet } from "./waitlist-sheet";

export interface PickedSlot extends SlotView {
  /** « AAAA-MM-JJ » */
  date: string;
  /** « Samedi 24 octobre » */
  dayLabel: string;
  /** « Sam. 24 oct. » */
  short: string;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/**
 * Étape 3 : « Quand ? ». Une bande de jours qui défile sur tout l'horizon de réservation (D-96, R-06), jours fermés
 * et complets compris, puis les créneaux du jour (à l'heure et à la demie, D-65), matin et après-midi, qui
 * apparaissent en cascade. Tout vient du serveur : ici on ne fait qu'afficher.
 */
export function DateStep({
  serviceIds,
  appointmentId,
  previousLabel,
  staffId,
  staffLabel,
  durationMin,
  selectedIso,
  lost,
  signedIn,
  onPick,
  onTrySansPreference,
}: {
  serviceIds: string[];
  /** Déplacement d'un RDV : le serveur calcule les créneaux d'après ce RDV (durée figée, sans se bloquer lui-même). */
  appointmentId?: string;
  /** Déplacement : le créneau actuel, rappelé en tête. */
  previousLabel?: string;
  staffId: string;
  staffLabel: string;
  durationMin: number;
  selectedIso: string | null;
  /** Le créneau choisi vient d'être pris (ou n'est plus réservable) : on le montre barré, avec des voisins. */
  lost: { time: string; date: string; reason: "taken" | "gone" } | null;
  /** Le client est connecté : la liste d'attente (D-73) est liée à son compte. */
  signedIn: boolean;
  onPick: (slot: PickedSlot) => void;
  onTrySansPreference: () => void;
}) {
  const [days, setDays] = useState<DayView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [cascade, setCascade] = useState(0);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const strip = useRef<HTMLDivElement>(null);

  // Tout l'horizon d'un coup (une seule lecture de la base côté serveur) ; on recharge si le coiffeur change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const range = await fetchToday();
        const result = await fetchDays({
          serviceIds,
          staffId,
          from: range.today,
          days: daysBetween(range.today, range.lastBookable) + 1,
          ...(appointmentId ? { appointmentId } : {}),
        });
        if (cancelled) return;
        if (!result.ok) throw new Error(result.error);
        setDays(result.days);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceIds, staffId, appointmentId]);

  // Jour affiché : celui que le client a touché ; sinon celui du créneau choisi ou perdu ; sinon le premier libre.
  const dayIndex = (() => {
    if (!days) return -1;
    const wanted =
      chosen ??
      lost?.date ??
      (selectedIso ? days.find((d) => d.slots.some((s) => s.iso === selectedIso))?.date : null);
    const found = wanted ? days.findIndex((d) => d.date === wanted) : -1;
    if (found >= 0) return found;
    const firstOpen = days.findIndex((d) => d.slots.length > 0);
    return firstOpen >= 0 ? firstOpen : 0;
  })();
  const day = days && dayIndex >= 0 ? days[dayIndex] : null;
  const noneAtAll = !!days && days.every((d) => d.slots.length === 0);

  // Le jour choisi reste visible dans la bande.
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-index="${dayIndex}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [dayIndex]);

  const pick = (slot: SlotView) => {
    if (!day) return;
    onPick({ ...slot, date: day.date, dayLabel: day.label, short: day.short });
  };

  const lostHere = lost && day && lost.date === day.date ? lost : null;
  const suggestions = lostHere ? nearestSlots(day!.slots, lostHere.time) : [];
  const listed: (SlotView & { lost?: boolean })[] = day ? [...day.slots] : [];
  if (lostHere && !listed.some((s) => s.time === lostHere.time) && lostHere.reason === "taken") {
    listed.push({ iso: "", time: lostHere.time, lost: true });
    listed.sort((a, b) => a.time.localeCompare(b.time));
  }

  return (
    <div className="flex flex-col gap-[22px] pb-9 pt-[26px]">
      <div className="flex flex-col gap-2.5 px-6">
        <h1 className="overflow-hidden font-display text-[40px] leading-[1.05]">
          <span className="s-tl block">Quand ?</span>
        </h1>
        <p className="s-up text-[14px] text-stone" style={{ animationDelay: "180ms" }}>
          Départs à l&rsquo;heure et à la demie · {formatDuration(durationMin)}
        </p>
        {previousLabel ? (
          <p className="s-up text-[13px] text-stone-dark" style={{ animationDelay: "200ms" }}>
            Aujourd&rsquo;hui : <span className="line-through">{previousLabel}</span>
          </p>
        ) : null}
      </div>

      {lostHere ? (
        <div className="px-6">
          <GoldBanner>
            <span className="text-[14px] leading-normal text-ivory">
              {lostHere.reason === "taken"
                ? `${lostHere.time} vient d'être réservé par un autre client.`
                : `${lostHere.time} n'est plus réservable.`}{" "}
              Votre sélection est conservée, choisissez un autre horaire
              {suggestions.length ? " :" : "."}
            </span>
            {suggestions.length ? (
              <span className="flex gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.iso}
                    type="button"
                    onClick={() => pick(s)}
                    aria-label={`Choisir ${s.time}`}
                    className="h-11 flex-1 border border-[rgb(239_233_221_/_0.4)] text-[14px] tabular-nums"
                  >
                    {s.time}
                  </button>
                ))}
              </span>
            ) : null}
          </GoldBanner>
        </div>
      ) : null}

      {failed ? (
        <div className="flex flex-col gap-4 px-6">
          <Problem title="Impossible de charger les créneaux">
            Réessayez dans un instant, ou appelez le salon.
          </Problem>
          <a href={SALON.phoneHref} className={ghost}>
            <PhoneIcon />
            Appeler le salon
          </a>
        </div>
      ) : !days ? (
        <p role="status" className="px-6 text-[14px] text-stone">
          Chargement des créneaux…
        </p>
      ) : (
        <>
          <div
            className="s-up flex items-baseline justify-between px-6"
            style={{ animationDelay: "240ms" }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ivory-soft">
              {day?.monthLabel}
            </span>
            <span className="text-[11px] text-stone-dark">{days.length} jours</span>
          </div>
          <div
            ref={strip}
            className="s-up overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
            style={{ animationDelay: "280ms" }}
          >
            <div role="listbox" aria-label="Jour" className="relative flex w-max gap-2 px-6 pb-2.5">
              {days.map((d, i) => {
                const on = i === dayIndex;
                const mark = d.state === "closed" ? "fermé" : d.state === "full" ? "complet" : "•";
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="option"
                    data-index={i}
                    aria-selected={on}
                    aria-label={`${d.label}${d.state === "closed" ? ", fermé" : d.state === "full" ? ", complet" : `, ${d.slots.length} horaire${d.slots.length > 1 ? "s" : ""}`}`}
                    onClick={() => {
                      setChosen(d.date);
                      setCascade((n) => n + 1);
                    }}
                    className={`tap relative flex h-[76px] w-[52px] shrink-0 flex-col items-center justify-center gap-[5px] border border-[rgb(239_233_221_/_0.12)] ${d.state === "closed" ? "opacity-35" : d.state === "full" ? "opacity-55" : ""}`}
                  >
                    <span
                      aria-hidden="true"
                      className="tap-on pointer-events-none absolute -inset-px border border-[rgb(239_233_221_/_0.55)]"
                      style={{ opacity: on ? 1 : 0 }}
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone">
                      {d.dow}
                    </span>
                    <span className="font-display text-[25px] leading-none tabular-nums">
                      {d.num}
                    </span>
                    <span className="flex h-2 items-center text-[9px] tracking-[0.06em] text-stone-dark">
                      {mark}
                    </span>
                  </button>
                );
              })}
              <span
                aria-hidden="true"
                className="dind absolute bottom-0 left-6 h-0.5 w-[52px] bg-gold"
                style={{ transform: `translateX(${dayIndex * 60}px)` }}
              />
            </div>
          </div>

          {day ? (
            <div className={`flex flex-col gap-[18px] px-6 ${cascade % 2 ? "dB" : "dA"}`}>
              <div className="flex items-baseline justify-between border-b border-[rgb(239_233_221_/_0.12)] pb-3">
                <h2 className="font-display text-[24px]">{day.label}</h2>
                <span className="text-[12px] text-stone-dark">
                  {day.state === "closed"
                    ? "Fermé"
                    : day.slots.length
                      ? `${day.slots.length} horaire${day.slots.length > 1 ? "s" : ""}`
                      : "Complet"}
                </span>
              </div>
              {day.slots.length === 0 && !lostHere ? (
                <div className="s-sl flex flex-col gap-4">
                  <p className="text-[14px] leading-[1.55] text-stone">
                    {day.state === "closed"
                      ? "Le salon est fermé ce jour-là. Choisissez un autre jour dans la liste."
                      : `Tout est réservé ce jour-là${staffId === "any" ? "" : ` avec ${staffLabel}`}. Essayez un autre jour.`}
                  </p>
                  {day.state === "full" && !appointmentId ? (
                    <button
                      type="button"
                      onClick={() => setWaitlistOpen(true)}
                      className={ghost}
                    >
                      Me prévenir si une place se libère
                    </button>
                  ) : null}
                  {noneAtAll ? (
                    <>
                      <p className="text-[14px] leading-[1.55] text-ivory-soft">
                        Aucun créneau en ligne sur toute la période
                        {staffId === "any" ? "" : ` avec ${staffLabel}`}.
                      </p>
                      {staffId !== "any" ? (
                        <button type="button" onClick={onTrySansPreference} className={ghost}>
                          Essayer sans préférence
                        </button>
                      ) : null}
                      <a href={SALON.phoneHref} className={ghost}>
                        <PhoneIcon />
                        Appeler le salon
                      </a>
                    </>
                  ) : null}
                </div>
              ) : null}
              {periodsOf(listed).map((period) => (
                <div key={period.label} className="flex flex-col gap-2.5">
                  <span className="s-sl text-[10px] font-semibold uppercase tracking-[0.26em] text-stone-dark">
                    {period.label}
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {period.slots.map((slot, k) => {
                      const on = !slot.lost && slot.iso === selectedIso;
                      return (
                        <button
                          key={`${slot.time}${slot.iso}`}
                          type="button"
                          aria-pressed={on}
                          aria-disabled={slot.lost || undefined}
                          aria-label={`${day.label}, ${slot.time}${slot.lost ? ", déjà réservé" : ""}`}
                          onClick={() => !slot.lost && pick(slot)}
                          className={`s-sl tap relative h-[46px] border text-[14px] tabular-nums ${
                            slot.lost
                              ? "border-[rgb(184_147_90_/_0.5)] text-stone-dark opacity-80"
                              : on
                                ? "border-transparent bg-[rgb(239_233_221_/_0.1)]"
                                : "border-[rgb(239_233_221_/_0.2)]"
                          }`}
                          style={{ animationDelay: `${k * 22}ms` }}
                        >
                          <span
                            aria-hidden="true"
                            className="tap-on pointer-events-none absolute -inset-px border border-ivory"
                            style={{ opacity: on ? 1 : 0 }}
                          />
                          {slot.time}
                          {slot.lost ? (
                            <span
                              aria-hidden="true"
                              className="e-strike absolute inset-x-2.5 top-1/2 h-px bg-gold"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
      {days && day && !appointmentId ? (
        <WaitlistSheet
          key={day.date}
          open={waitlistOpen}
          onClose={() => setWaitlistOpen(false)}
          days={days}
          initialDate={day.date}
          serviceIds={serviceIds}
          staffId={staffId}
          staffLabel={staffLabel}
          signedIn={signedIn}
        />
      ) : null}
    </div>
  );
}
