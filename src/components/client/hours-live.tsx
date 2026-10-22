"use client";

import { useSyncExternalStore } from "react";
import { weekRows, type WeekHours } from "@/modules/vitrine/hours";
import {
  closureLabel,
  hoursSentence,
  openStatus,
  zonedNow,
  type Closure,
} from "@/modules/vitrine/status";
import { Eyebrow, InfoIcon } from "./ui";
import { InView } from "./in-view";

// L'heure change pendant que la page est ouverte : l'état se recalcule chaque minute. Côté serveur (page servie
// depuis le cache), l'instant n'est pas connu : rien n'est écrit avant l'arrivée dans le navigateur.
const subscribe = (onChange: () => void) => {
  const id = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(id);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

const STEP = 36;
const START = 150;

/** Horaires : la semaine en lignes de lumière, le jour actuel encadré d'or, l'état qui s'écrit lettre à lettre. */
export function HoursLive({ week, closures }: { week: WeekHours; closures: Closure[] }) {
  const minute = useSyncExternalStore(subscribe, minuteNow, noMinute);
  const now = minute === null ? null : zonedNow(new Date(minute * 60_000));
  const status = now ? openStatus(week, closures, now) : null;

  let index = 0;
  const words = (status?.headline ?? "").split(" ").map((word) => {
    const chars = [...word].map((c) => ({ c, delay: START + index++ * STEP }));
    index++;
    return chars;
  });
  const typedEnd = START + (status?.headline.length ?? 0) * STEP;
  const rows = weekRows(week);
  const next = closures[0];

  return (
    <InView aria-labelledby="horaires-titre" className="flex flex-col gap-[22px] px-6 py-14">
      <Eyebrow className="s-up">Horaires</Eyebrow>
      <div className="flex min-h-[124px] flex-col gap-3.5">
        <h2
          id="horaires-titre"
          aria-label={status ? `${status.headline}. ${status.detail}` : "Horaires"}
          className="flex max-w-[300px] flex-wrap items-end font-display text-[50px] leading-[1.02] tracking-[-0.01em]"
        >
          {words.map((chars, w) => (
            <span key={w} aria-hidden="true" className="mr-[0.24em] inline-flex whitespace-nowrap">
              {chars.map((ch, i) => (
                <span key={i} className="s-ch" style={{ animationDelay: `${ch.delay}ms` }}>
                  {ch.c}
                </span>
              ))}
            </span>
          ))}
          {status ? (
            <span
              aria-hidden="true"
              className="s-caret mb-2 ml-1 inline-block h-10 w-px bg-ivory"
              style={{ animationDelay: `${typedEnd}ms` }}
            />
          ) : null}
        </h2>
        {status?.detail ? (
          <p
            className="s-up flex items-center gap-3 text-[14px] text-ivory-soft"
            style={{ animationDelay: `${typedEnd + 120}ms` }}
          >
            <span aria-hidden="true" className="s-pulse h-[7px] w-[7px] rounded-[50%] bg-gold" />
            {status.detail}
          </p>
        ) : null}
      </div>

      <span
        aria-hidden="true"
        className="s-line -mb-[22px] mt-2.5 block h-px bg-[rgb(239_233_221_/_0.14)]"
        style={{ animationDelay: "250ms" }}
      />
      <ul aria-label="Horaires de la semaine" className="flex flex-col">
        {rows.map((row, i) => {
          const today = now ? now.weekday === i + 1 : false;
          const tone = today ? "text-ivory" : row.closed ? "text-stone-dark" : "text-ivory-soft";
          return (
            <li key={row.label} className="relative">
              {today ? (
                <>
                  <div
                    aria-hidden="true"
                    className="h-fill absolute -inset-x-2.5 inset-y-1"
                    style={{
                      background:
                        "linear-gradient(90deg, rgb(184 147 90 / 0.14), rgb(184 147 90 / 0.04))",
                    }}
                  />
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 362 64"
                    preserveAspectRatio="none"
                    fill="none"
                    className="absolute -left-2.5 top-0 h-full w-[calc(100%+20px)] overflow-visible"
                  >
                    <rect
                      className="h-box"
                      pathLength="1"
                      x="0.5"
                      y="4.5"
                      width="361"
                      height="55"
                      stroke="rgb(184 147 90 / 0.55)"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <span
                    aria-hidden="true"
                    className="h-dot absolute right-0 top-1/2 -mt-1 h-2 w-2 rounded-[50%] bg-gold"
                  />
                </>
              ) : null}
              <div
                className="s-up relative grid min-h-16 grid-cols-[150px_minmax(0,1fr)] items-center"
                style={{ animationDelay: `${350 + i * 70}ms` }}
              >
                <span className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${tone}`}>
                  {row.label}
                  {today ? <span className="sr-only"> (aujourd&rsquo;hui)</span> : null}
                </span>
                <span
                  className={`flex flex-col gap-[3px] text-[14px] leading-[1.35] tabular-nums ${tone}`}
                >
                  {row.closed ? "Fermé" : row.ranges.map((r) => <span key={r}>{r}</span>)}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="s-line block h-px bg-[rgb(239_233_221_/_0.14)]"
                style={{ animationDelay: `${420 + i * 70}ms` }}
              />
            </li>
          );
        })}
      </ul>

      {next ? (
        <div
          className="s-up flex items-center gap-3 border border-[rgb(184_147_90_/_0.4)] px-4 py-3.5"
          style={{ animationDelay: "1300ms" }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
            Fermeture
          </span>
          <span className="text-[14px] text-ivory">{closureLabel(next)}</span>
        </div>
      ) : null}
      <p
        className="s-up flex gap-3 text-[13px] leading-[1.55] text-stone"
        style={{ animationDelay: "1400ms" }}
      >
        <InfoIcon />
        {hoursSentence(week)}
      </p>
    </InView>
  );
}
