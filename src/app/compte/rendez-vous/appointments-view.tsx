"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, CalendarIcon, CallButton, btnPrimary, btnSecondary } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { capitalize, formatDuration, formatPrice, lessThanHours } from "@/lib/format";
import { SALON } from "@/lib/salon";
import type {
  AccountAppointment,
  PastAccountAppointment,
} from "@/modules/appointments/account-view";
import { cancelAppointmentAction } from "../actions";

export type UpcomingCard = AccountAppointment & { calendarUrl: string };

const btnDanger =
  "flex h-[52px] w-full items-center justify-center border border-brick px-6 text-button-sm uppercase text-brick transition-colors duration-200 hover:bg-graphite-light disabled:opacity-60";

function cancelMessage(error: string): string {
  switch (error) {
    case "change_too_late":
      return "Il est trop tard pour annuler en ligne. Appelez le salon.";
    case "not_modifiable":
    case "appointment_not_found":
      return "Ce rendez-vous n'est plus modifiable. Actualisez la page.";
    case "rate_limited":
      return "Trop d'essais. Réessayez dans quelques minutes.";
    case "not_signed_in":
      return "Votre session a expiré. Reconnectez-vous.";
    default:
      return "Une erreur est survenue. Réessayez, ou appelez le salon.";
  }
}

/** « Mes rendez-vous » : à venir (modifier, annuler, agenda) et passés (reprendre le même RDV). */
export function AppointmentsView({
  upcoming,
  past,
  cutoffHours,
  maxUpcoming,
  blocked,
}: {
  upcoming: UpcomingCard[];
  past: (PastAccountAppointment & { canRepeat: boolean })[];
  cutoffHours: number;
  maxUpcoming: number;
  blocked: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [toCancel, setToCancel] = useState<UpcomingCard | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = () => {
    setToCancel(null);
    setProblem(null);
  };

  const confirmCancel = async () => {
    if (!toCancel) return;
    setPending(true);
    setProblem(null);
    const result = await cancelAppointmentAction(toCancel.id);
    setPending(false);
    if (result.ok) {
      setToCancel(null);
      setDone(true);
      router.refresh();
      return;
    }
    setProblem(cancelMessage(result.error));
    if (result.error === "change_too_late" || result.error === "not_modifiable") router.refresh();
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Rendez-vous"
        className="grid grid-cols-2 border-b border-line"
      >
        {(
          [
            ["upcoming", `À venir · ${upcoming.length}`],
            ["past", "Passés"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            onClick={() => setTab(key)}
            className={`h-12 border-b-2 text-body-sm transition-colors duration-200 ${
              tab === key ? "border-ivory text-ivory" : "border-transparent text-stone"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {done ? (
        <Alert kind="info" title="Votre rendez-vous est annulé">
          Un email de confirmation vous a été envoyé.
        </Alert>
      ) : null}

      {blocked ? (
        <Alert kind="error" title="Réservation en ligne indisponible">
          Plusieurs rendez-vous n&rsquo;ont pas été honorés. Pour réserver, appelez le salon : nous
          en parlerons ensemble.
        </Alert>
      ) : null}

      {tab === "upcoming" ? (
        <div
          role="tabpanel"
          id="panel-upcoming"
          aria-labelledby="tab-upcoming"
          className="flex flex-col gap-4"
        >
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-3.5 px-2 py-12 text-center">
              <svg width="34" height="30" viewBox="0 0 34 30" fill="none" aria-hidden="true">
                <path d="M9 1H25L33 15L25 29H9L1 15Z" stroke="#ffffff" strokeWidth="1" />
              </svg>
              <span className="text-[18px]">Aucun rendez-vous à venir</span>
              <span className="text-body-sm text-stone">
                Votre prochain passage au salon s&rsquo;affichera ici.
              </span>
            </div>
          ) : (
            upcoming.map((a) => (
              <article
                key={a.id}
                className="flex animate-step-in flex-col gap-[18px] bg-graphite p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-label uppercase text-gold">{a.dayLabel}</span>
                    <span className="text-[34px] font-light tabular-nums">{a.time}</span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
                    {a.relative ? (
                      <span className="whitespace-nowrap text-body-sm text-stone">
                        {a.relative}
                      </span>
                    ) : null}
                    {/* D-92 : un RDV répété par le salon se reconnaît. */}
                    {a.repeated ? (
                      <span className="border border-line-strong px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-stone">
                        RDV répété
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="h-px bg-line" />
                <div className="flex flex-col gap-1.5 text-[15px]">
                  {a.items.map((item) => (
                    <span key={item.name} className="flex justify-between gap-3">
                      <span>
                        {item.name} · {formatDuration(item.durationMin)}
                      </span>
                      <span>{formatPrice(item.priceCents)}</span>
                    </span>
                  ))}
                  <span className="text-stone">
                    {a.staffLabel} · {SALON.street}
                  </span>
                </div>

                {a.changeable ? (
                  <>
                    <p className="text-body-sm text-stone">
                      Modifiable ou annulable jusqu&rsquo;au {a.deadlineLabel}.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <Link
                        href={`/reservation?modifier=${a.id}`}
                        className={`${btnSecondary} px-2`}
                      >
                        Modifier
                      </Link>
                      <button
                        type="button"
                        onClick={() => setToCancel(a)}
                        className={`${btnDanger} px-2`}
                      >
                        Annuler
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-body-sm leading-normal text-stone">
                      {capitalize(lessThanHours(cutoffHours))} avant : pour modifier ou annuler,
                      appelez le salon.
                    </p>
                    <CallButton />
                  </>
                )}
                <a
                  href={a.calendarUrl}
                  className="flex min-h-11 items-center gap-2.5 self-start text-body-sm text-ivory-soft"
                >
                  <CalendarIcon size={16} />
                  Ajouter à mon agenda
                </a>
              </article>
            ))
          )}
          <p className="text-body-sm text-stone">
            {maxUpcoming} rendez-vous à venir au maximum en ligne.
          </p>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-past"
          aria-labelledby="tab-past"
          className="flex flex-col gap-3"
        >
          {past.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-stone">
              Vos rendez-vous passés s&rsquo;afficheront ici.
            </p>
          ) : (
            past.map((a) => (
              <article
                key={a.id}
                className="flex animate-step-in flex-col gap-3.5 border border-line-subtle p-5"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-3">
                    <span className="text-label uppercase text-stone">{a.whenLabel}</span>
                    {a.statusLabel ? (
                      <span className="text-button-sm uppercase text-stone">{a.statusLabel}</span>
                    ) : null}
                  </div>
                  <span
                    className={`text-[15px] ${a.cancelled ? "text-stone line-through" : "text-ivory-soft"}`}
                  >
                    {a.summary}
                  </span>
                </div>
                {a.canRepeat ? (
                  <Link
                    href={`/reservation?reprendre=${a.id}`}
                    className="flex min-h-11 items-center gap-3 self-start text-button-sm uppercase text-ivory"
                  >
                    Reprendre le même RDV
                    <span className="h-px w-6 bg-gold" />
                  </Link>
                ) : null}
              </article>
            ))
          )}
        </div>
      )}

      <Sheet open={!!toCancel} onClose={close} titleId="cancel-title">
        {toCancel ? (
          <>
            <h2 id="cancel-title" className="text-title-2">
              Annuler ce rendez-vous ?
            </h2>
            <div className="flex flex-col gap-1.5 bg-graphite p-[18px]">
              <span className="text-label uppercase text-gold">
                {toCancel.dayLabel.replace(/^(Aujourd'hui|Demain) · /, "")} · {toCancel.time}
              </span>
              <span className="text-[15px]">
                {toCancel.items.map((i) => i.name).join(" + ")} ·{" "}
                {formatPrice(toCancel.items.reduce((sum, i) => sum + i.priceCents, 0))}
              </span>
              <span className="text-body-sm text-stone">{toCancel.staffLabel}</span>
            </div>
            <p className="text-body-sm leading-normal text-ivory-soft">
              Le créneau sera libéré pour un autre client. Vous recevrez un email de confirmation de
              l&rsquo;annulation.
            </p>
            {problem ? <Alert kind="error" title={problem} /> : null}
            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={close} className={btnPrimary}>
                Garder mon rendez-vous
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmCancel}
                className={btnDanger}
              >
                {pending ? "Annulation…" : "Oui, annuler"}
              </button>
            </div>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
