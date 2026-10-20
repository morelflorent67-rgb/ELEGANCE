"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DayPlanning, PlanningAppointment } from "@/modules/planning";
import { formatTime } from "@/lib/format";
import { AppointmentPanel } from "./appointment-panel";
import type { TeamMemberView } from "./author-picker";

// Le planning du jour (R-72) : une colonne par coiffeur, 96 px par heure. Tout est calculé côté serveur ; ici on
// place les blocs et on ouvre la fiche. L'écran se met à jour seul toutes les 30 secondes (D-54).

const PX_PER_MINUTE = 1.6;
const REFRESH_MS = 30_000;

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

const countLabel = (n: number) =>
  n === 0 ? "Aucun rendez-vous" : n === 1 ? "1 rendez-vous" : `${n} rendez-vous`;

function HexBadge({ initial }: { initial: string }) {
  return (
    <span className="relative flex h-[22px] w-6 items-center justify-center" aria-hidden="true">
      <svg width="24" height="22" viewBox="0 0 24 22" fill="none" className="absolute left-0 top-0">
        <path d="M6.5 0.5H17.5L23.5 11L17.5 21.5H6.5L0.5 11Z" stroke="#ffffff" strokeWidth="1" />
      </svg>
      <span className="relative text-[10px]">{initial}</span>
    </span>
  );
}

const STATUS_TAG: Partial<
  Record<PlanningAppointment["status"], { word: string; className: string }>
> = {
  in_progress: { word: "En cours", className: "border-gold text-gold" },
  no_show: { word: "Lapin", className: "border-brick text-brick" },
  honored: { word: "Honoré", className: "border-line-strong text-stone" },
};

function blockTag(appt: PlanningAppointment) {
  const status = STATUS_TAG[appt.status];
  if (status) return status;
  if (appt.source === "salon") return { word: "Salon", className: "border-line-strong text-stone" };
  return null;
}

export function PlanningBoard({
  day,
  today,
  isToday,
  prevDate,
  nextDate,
  team,
  initialSelectedId,
}: {
  day: DayPlanning;
  today: string;
  isToday: boolean;
  prevDate: string;
  nextDate: string;
  team: TeamMemberView[];
  initialSelectedId: string | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [toast, setToast] = useState<string | null>(null);
  const busy = useRef(false);

  // Rafraîchissement automatique : jamais pendant une action en cours, jamais écran caché.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !busy.current) router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  const [nowMinute, setNowMinute] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const parts = new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      }).formatToParts(new Date());
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
      setNowMinute(get("hour") * 60 + get("minute"));
    };
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, []);

  const all = useMemo(() => day.columns.flatMap((c) => c.appointments), [day]);
  const selected = all.find((a) => a.id === selectedId) ?? null;

  // La grille couvre les horaires d'ouverture, élargis si un RDV ou une absence en sort.
  const { gridStart, gridEnd } = useMemo(() => {
    const starts = [
      ...day.ranges.map((r) => r.from),
      ...all.map((a) => a.startMinute),
      ...day.columns.flatMap((c) => c.absences.map((a) => a.startMinute)),
    ];
    const ends = [
      ...day.ranges.map((r) => r.to),
      ...all.map((a) => a.endMinute),
      ...day.columns.flatMap((c) => c.absences.map((a) => a.endMinute)),
    ];
    return {
      gridStart: Math.floor((starts.length ? Math.min(...starts) : 10 * 60) / 60) * 60,
      gridEnd: Math.ceil((ends.length ? Math.max(...ends) : 19 * 60) / 60) * 60,
    };
  }, [day, all]);

  const top = (minute: number) => (minute - gridStart) * PX_PER_MINUTE;
  const hours: number[] = [];
  for (let m = gridStart; m <= gridEnd; m += 60) hours.push(m);
  const pauses = day.ranges.slice(1).map((r, i) => ({ from: day.ranges[i].to, to: r.from }));
  const columnsTemplate = `56px repeat(${Math.max(day.columns.length, 1)}, minmax(0, 1fr))`;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section
        aria-label={`Planning du ${day.label}`}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <header className="flex min-h-[72px] shrink-0 flex-wrap items-center gap-3 border-b border-line-subtle px-5 py-2">
          <Link
            href={`/equipe?jour=${prevDate}`}
            aria-label="Jour précédent"
            className="flex h-12 w-12 items-center justify-center border border-line-strong"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <div className="flex min-w-[170px] flex-col gap-0.5 px-2">
            <span className="text-label uppercase tracking-[0.26em] text-gold">
              {isToday ? "Aujourd’hui" : " "}
            </span>
            <h1 className="text-[20px] font-light">{day.label}</h1>
          </div>
          <Link
            href={`/equipe?jour=${nextDate}`}
            aria-label="Jour suivant"
            className="flex h-12 w-12 items-center justify-center border border-line-strong"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          {!isToday ? (
            <Link
              href="/equipe"
              className="flex h-12 items-center border border-line-strong px-4 text-[11px] uppercase tracking-[0.2em]"
            >
              Aujourd’hui
            </Link>
          ) : null}
          <form action="/equipe" method="get" className="flex items-center gap-2">
            <label htmlFor="planning-date" className="sr-only">
              Aller à une date
            </label>
            <input
              id="planning-date"
              type="date"
              name="jour"
              defaultValue={day.date}
              className="h-12 w-[160px] border border-line-strong bg-ink px-3 text-[15px] text-ivory"
            />
            <button
              type="submit"
              className="h-12 border border-line-strong px-4 text-[11px] uppercase tracking-[0.2em]"
            >
              Aller
            </button>
          </form>
          <span className="ml-auto text-[13px] text-stone">{countLabel(day.count)}</span>
          <Link
            href="/equipe/reserver"
            className="flex h-12 items-center gap-2.5 bg-ivory px-5 text-[12px] font-medium uppercase tracking-[0.22em] text-ink"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nouveau RDV
          </Link>
        </header>

        {!day.open ? (
          <p
            role="status"
            className="border-b border-line-subtle px-5 py-3 text-body-sm text-ivory-soft"
          >
            Le salon est fermé ce jour-là.
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[640px]">
            <div
              className="sticky top-0 z-10 grid border-b border-line bg-ink"
              style={{ gridTemplateColumns: columnsTemplate }}
            >
              <span />
              {day.columns.map((col) => (
                <div
                  key={col.staff.id}
                  className="flex h-[52px] items-center gap-2.5 border-l border-line-subtle px-3"
                >
                  <HexBadge initial={col.staff.firstName.charAt(0)} />
                  <span className="text-[15px]">{col.staff.firstName}</span>
                  <span className="ml-auto text-[12px] text-stone">
                    {col.appointments.length === 0 ? "Libre" : `${col.appointments.length} RDV`}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="relative grid"
              style={{ gridTemplateColumns: columnsTemplate, height: top(gridEnd) + 8 }}
            >
              <div className="relative text-[12px] tabular-nums text-stone" aria-hidden="true">
                {hours.map((m) => (
                  <span
                    key={m}
                    className="absolute right-2.5 -translate-y-1/2"
                    style={{ top: top(m) + 8 }}
                  >
                    {hhmm(m)}
                  </span>
                ))}
              </div>

              {day.columns.map((col) => (
                <div
                  key={col.staff.id}
                  role="group"
                  aria-label={`Rendez-vous de ${col.staff.firstName}`}
                  className="relative border-l border-line-subtle"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(180deg, transparent 0, transparent 47px, rgba(239,233,221,0.06) 47px, rgba(239,233,221,0.06) 48px)",
                    backgroundPosition: "0 8px",
                  }}
                >
                  {col.absences.map((a, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-1 flex flex-col gap-1 border border-line p-2.5"
                      style={{
                        top: top(a.startMinute) + 8,
                        height: (a.endMinute - a.startMinute) * PX_PER_MINUTE,
                        backgroundImage:
                          "repeating-linear-gradient(135deg, rgba(239,233,221,0.07) 0, rgba(239,233,221,0.07) 1px, transparent 1px, transparent 9px)",
                      }}
                    >
                      <span className="text-[11px] uppercase tracking-[0.2em] text-ivory-soft">
                        Absent
                      </span>
                      {a.reason ? <span className="text-[13px] text-stone">{a.reason}</span> : null}
                    </div>
                  ))}
                  {col.appointments.map((appt) => {
                    const tag = blockTag(appt);
                    const height = Math.max(
                      24,
                      (appt.endMinute - appt.startMinute) * PX_PER_MINUTE - 2,
                    );
                    const tall = height >= 70;
                    const on = appt.id === selectedId;
                    const tone =
                      appt.status === "no_show"
                        ? "border-brick bg-charcoal"
                        : appt.status === "honored"
                          ? "border-line-subtle bg-charcoal text-stone"
                          : appt.status === "in_progress"
                            ? "border-line-strong bg-graphite-light"
                            : "border-line-strong bg-graphite";
                    return (
                      <button
                        key={appt.id}
                        type="button"
                        onClick={() => setSelectedId(on ? null : appt.id)}
                        aria-pressed={on}
                        aria-label={`${formatTime(appt.startsAt)}, ${appt.customerName}, ${appt.summary}, avec ${col.staff.firstName}${tag ? `, ${tag.word}` : ""}`}
                        className={`absolute inset-x-1 flex flex-col justify-center gap-0.5 overflow-hidden border px-2.5 text-left ${tone} ${
                          on ? "outline outline-2 outline-offset-2 outline-ivory" : ""
                        }`}
                        style={{ top: top(appt.startMinute) + 8, height }}
                      >
                        <span className="flex items-center gap-2 whitespace-nowrap text-[13px]">
                          <span className="min-w-0 flex-1 truncate">
                            <span className="tabular-nums text-stone">
                              {formatTime(appt.startsAt)}
                            </span>{" "}
                            <span className={appt.status === "no_show" ? "line-through" : ""}>
                              {appt.customerName}
                            </span>
                          </span>
                          {tag ? (
                            <span
                              className={`border px-1.5 py-px text-[10px] uppercase tracking-[0.14em] ${tag.className}`}
                            >
                              {tag.word}
                            </span>
                          ) : null}
                        </span>
                        {tall ? (
                          <span className="truncate whitespace-nowrap text-[12px] text-ivory-soft">
                            {appt.summary}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}

              {pauses.map((p) => (
                <div
                  key={p.from}
                  aria-label={`Pause de ${hhmm(p.from)} à ${hhmm(p.to)}`}
                  className="pointer-events-none absolute flex items-center justify-center border-y border-line"
                  style={{
                    left: 56,
                    right: 0,
                    top: top(p.from) + 8,
                    height: (p.to - p.from) * PX_PER_MINUTE,
                    backgroundImage:
                      "repeating-linear-gradient(180deg, rgba(11,10,9,0.92) 0, rgba(11,10,9,0.92) 7px, rgba(239,233,221,0.08) 7px, rgba(239,233,221,0.08) 8px)",
                  }}
                >
                  <span className="text-[11px] uppercase tracking-[0.32em] text-stone">
                    Pause · {hhmm(p.from)} – {hhmm(p.to)}
                  </span>
                </div>
              ))}

              {isToday && nowMinute !== null && nowMinute >= gridStart && nowMinute <= gridEnd ? (
                <>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute h-px bg-led"
                    style={{
                      left: 48,
                      right: 0,
                      top: top(nowMinute) + 8,
                      boxShadow: "0 0 8px 1px rgba(255,255,255,0.5)",
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute h-[9px] w-[9px] bg-gold"
                    style={{ left: 44, top: top(nowMinute) + 4 }}
                  />
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <AppointmentPanel
        key={selected?.id ?? "none"}
        day={day}
        today={today}
        isToday={isToday}
        appointment={selected}
        team={team}
        toast={toast}
        onToast={setToast}
        onSelect={setSelectedId}
        onBusy={(value) => {
          busy.current = value;
        }}
      />
    </div>
  );
}
