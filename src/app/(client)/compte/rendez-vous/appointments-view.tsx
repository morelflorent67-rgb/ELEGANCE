"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientSheet } from "@/components/client/sheet";
import { ArrowRight, Hexagon, PhoneIcon, Problem, chip, cta, ghost } from "@/components/client/ui";
import { capitalize, hoursPhrase, lessThanHours } from "@/lib/format";
import { SALON } from "@/lib/salon";
import type { PastAccountAppointment } from "@/modules/appointments/account-view";
import { cancelAppointmentAction } from "../actions";

export interface UpcomingCard {
  id: string;
  /** « sam » */
  dow: string;
  num: number;
  /** « oct. » */
  month: string;
  /** « Samedi 24 octobre · 15:30 » */
  longLabel: string;
  time: string;
  /** « dans 50 min » quand le RDV n'est plus modifiable en ligne (R-31). */
  soon: string | null;
  what: string;
  staff: string;
  price: string;
  forName: string | null;
  repeated: boolean;
  changeable: boolean;
  deadlineLabel: string | null;
  calendarUrl: string;
}

const divider = "border-[rgb(239_233_221_/_0.1)]";

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

/**
 * « Mes rendez-vous » (R-76, maquette « Lot12-Rdv-2-Liste ») : le compteur sur la limite (R-25), les RDV à venir
 * (modifier, annuler jusqu'au délai, R-30 ; ensuite, appeler, R-31), les RDV passés (« Reprendre ») et « Mon compte ».
 */
export function AppointmentsView({
  firstName,
  upcoming,
  counted,
  past,
  cutoffHours,
  maxUpcoming,
  blocked,
}: {
  firstName: string;
  upcoming: UpcomingCard[];
  /** RDV qui comptent dans la limite (hors série, D-87). */
  counted: number;
  past: (PastAccountAppointment & { canRepeat: boolean })[];
  cutoffHours: number;
  maxUpcoming: number;
  blocked: boolean;
}) {
  const router = useRouter();
  const [toCancel, setToCancel] = useState<UpcomingCard | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);

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
      const cancelled = toCancel;
      setToCancel(null);
      // Le RDV est barré d'un trait doré puis sort ; le message reste 5 s.
      setLeaving(cancelled.id);
      setToast({
        key: Date.now(),
        text: `Rendez-vous du ${cancelled.longLabel.replace(" · ", " à ").toLowerCase()} annulé. Un email de confirmation vous a été envoyé.`,
      });
      window.setTimeout(() => router.refresh(), 720);
      return;
    }
    setProblem(cancelMessage(result.error));
    if (result.error === "change_too_late" || result.error === "not_modifiable") router.refresh();
  };

  const shownCount = leaving ? Math.max(0, counted - 1) : counted;

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1
          className="s-up font-display text-[40px] leading-[1.05]"
          style={{ animationDelay: "120ms" }}
        >
          Bonjour {firstName}.
        </h1>
        <div
          className="s-up flex items-center justify-between gap-3"
          style={{ animationDelay: "180ms" }}
        >
          <span aria-live="polite" className="text-[13px] tabular-nums text-stone">
            {shownCount} rendez-vous à venir sur {maxUpcoming}
          </span>
          <span aria-hidden="true" className="flex gap-[5px]">
            {Array.from({ length: maxUpcoming }, (_, i) => (
              <Hexagon key={i} filled={i < shownCount} />
            ))}
          </span>
        </div>
      </div>

      {blocked ? (
        <Problem title="Réservation en ligne indisponible">
          Plusieurs rendez-vous n&rsquo;ont pas été honorés. Pour réserver, appelez le salon : nous
          en parlerons ensemble.
        </Problem>
      ) : null}

      <div className="flex flex-col gap-3">
        {upcoming.length === 0 ? (
          <p className="py-[22px] text-[14px] text-stone">Aucun rendez-vous à venir.</p>
        ) : (
          upcoming.map((a, i) => {
            const locked = !a.changeable;
            return (
              <div key={a.id} className="s-up" style={{ animationDelay: `${240 + i * 60}ms` }}>
                <article
                  aria-label={`Rendez-vous du ${a.longLabel}`}
                  className={`relative border ${locked ? "border-[rgb(184_147_90_/_0.45)] bg-[rgb(184_147_90_/_0.05)]" : "border-[rgb(239_233_221_/_0.14)]"} ${leaving === a.id ? "card-out" : ""}`}
                >
                  {locked ? (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-px -left-px -top-px w-0.5 bg-gold"
                    />
                  ) : null}
                  <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-4 px-[18px] pb-4 pt-[18px]">
                    <div className="flex flex-col items-center gap-0.5 pt-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone">
                        {a.dow}
                      </span>
                      <span className="font-display text-[40px] leading-none">{a.num}</span>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-stone-dark">
                        {a.month}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-[5px]">
                      <span className="flex flex-wrap items-center gap-2.5 text-[16px] tabular-nums">
                        {a.time}
                        {a.soon ? (
                          <span className="flex items-center gap-[7px] text-[11px] text-gold">
                            <span
                              aria-hidden="true"
                              className="soon h-1.5 w-1.5 rounded-[50%] bg-gold"
                            />
                            {a.soon}
                          </span>
                        ) : null}
                        {/* D-92 : un RDV répété par le salon se reconnaît. */}
                        {a.repeated ? (
                          <span className="border border-[rgb(239_233_221_/_0.28)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-stone">
                            RDV répété
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[13px] leading-normal text-ivory-soft">{a.what}</span>
                      <span className="text-[12px] text-stone-dark">
                        avec {a.staff} · {a.price}
                      </span>
                      {a.forName ? (
                        <span className="text-[12px] text-gold">Pour {a.forName}</span>
                      ) : null}
                      <a
                        href={a.calendarUrl}
                        className="inline-flex min-h-11 items-center self-start text-[12px] text-ivory-soft underline underline-offset-[3px]"
                      >
                        Ajouter à mon agenda
                      </a>
                    </div>
                  </div>
                  {locked ? (
                    <div
                      className={`flex items-center justify-between gap-3 border-t ${divider} px-[18px] pb-3.5 pt-3`}
                    >
                      <span className="text-[12px] leading-normal text-stone">
                        {capitalize(lessThanHours(cutoffHours))} avant : modification ou annulation
                        par téléphone.
                      </span>
                      <a href={SALON.phoneHref} className={chip}>
                        <PhoneIcon size={12} />
                        Appeler
                      </a>
                    </div>
                  ) : (
                    <div className={`grid grid-cols-2 border-t ${divider}`}>
                      <Link
                        href={`/reservation?modifier=${a.id}`}
                        aria-label={`Modifier le rendez-vous du ${a.longLabel}`}
                        className={`flex min-h-12 items-center justify-center border-r ${divider} text-[10px] font-semibold uppercase tracking-[0.22em]`}
                      >
                        Modifier
                      </Link>
                      <button
                        type="button"
                        onClick={() => setToCancel(a)}
                        aria-label={`Annuler le rendez-vous du ${a.longLabel}`}
                        className="min-h-12 text-[10px] font-semibold uppercase tracking-[0.22em] text-ivory-soft"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                  <span
                    aria-hidden="true"
                    className="strike absolute inset-x-0 top-1/2 h-px bg-gold shadow-[0_0_8px_rgb(184_147_90_/_0.8)]"
                  />
                </article>
              </div>
            );
          })
        )}
        {upcoming.some((a) => a.changeable && a.deadlineLabel) ? (
          <p className="text-[12px] leading-normal text-stone-dark">
            Chaque rendez-vous se modifie ou s&rsquo;annule en ligne jusqu&rsquo;à{" "}
            {hoursPhrase(cutoffHours)} avant son début.
          </p>
        ) : null}
      </div>

      {blocked ? (
        <a href={SALON.phoneHref} className={`s-up ${ghost}`} style={{ animationDelay: "420ms" }}>
          <PhoneIcon />
          Appeler le salon
        </a>
      ) : (
        <Link
          href="/reservation"
          className={`s-up ${ghost} h-14`}
          style={{ animationDelay: "420ms" }}
        >
          Nouveau rendez-vous
          <ArrowRight size={16} color="#efe9dd" />
        </Link>
      )}

      {past.length > 0 ? (
        <section
          aria-labelledby="deja-venus"
          className="s-up flex flex-col"
          style={{ animationDelay: "480ms" }}
        >
          <h2
            id="deja-venus"
            className="pb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-dark"
          >
            Déjà venus
          </h2>
          {past.map((p) => (
            <div
              key={p.id}
              className={`flex min-h-14 items-center justify-between gap-3 border-t ${divider} py-1.5`}
            >
              <span className="flex flex-col gap-[3px]">
                <span className="text-[14px] text-ivory-soft">
                  {p.whenLabel}
                  {p.statusLabel ? (
                    <span className="text-stone-dark"> · {p.statusLabel}</span>
                  ) : null}
                </span>
                <span
                  className={`text-[12px] text-stone-dark ${p.cancelled ? "line-through" : ""}`}
                >
                  {p.summary}
                </span>
              </span>
              {p.canRepeat ? (
                <Link
                  href={`/reservation?reprendre=${p.id}`}
                  aria-label={`Reprendre le même RDV : ${p.summary}`}
                  className="flex min-h-11 shrink-0 items-center text-[12px] text-ivory underline underline-offset-[3px]"
                >
                  Reprendre
                </Link>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <Link
        href="/compte/informations"
        className="s-up flex min-h-[60px] items-center justify-between border-y border-[rgb(239_233_221_/_0.12)]"
        style={{ animationDelay: "540ms" }}
      >
        <span className="flex items-center gap-3.5 text-[14px]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#b8935a"
            strokeWidth="1.3"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </svg>
          Mon compte
        </span>
        <ArrowRight size={16} color="#c9c3b7" />
      </Link>

      {toast ? (
        <div
          key={toast.key}
          role="status"
          aria-live="polite"
          className="p-toast pointer-events-none fixed bottom-4 left-1/2 z-30 w-[calc(100%-32px)] max-w-[398px] -translate-x-1/2 bg-ivory text-ink"
        >
          <div className="flex items-center gap-3 px-4 py-3.5 text-[13px] leading-[1.45]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0b0a09"
              strokeWidth="1.5"
              className="shrink-0"
              aria-hidden="true"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {toast.text}
          </div>
          <span
            aria-hidden="true"
            className="p-drain block h-0.5 bg-gold"
            onAnimationEnd={() => setToast(null)}
          />
        </div>
      ) : null}

      <ClientSheet open={!!toCancel} onClose={close} titleId="cancel-title" role="alertdialog">
        {toCancel ? (
          <>
            <h2 id="cancel-title" className="font-display text-[34px] leading-[1.08]">
              Annuler ce rendez-vous ?
            </h2>
            <div
              className={`flex flex-col gap-[5px] border-y border-[rgb(239_233_221_/_0.12)] py-3.5`}
            >
              <span className="text-[16px] tabular-nums">{toCancel.longLabel}</span>
              <span className="text-[13px] text-stone">
                {toCancel.what} · avec {toCancel.staff}
              </span>
            </div>
            <p className="text-[13px] leading-[1.55] text-stone">
              Le créneau sera libéré tout de suite et un email de confirmation vous sera envoyé.
            </p>
            {problem ? <Problem title={problem} /> : null}
            <div className="flex flex-col gap-1.5">
              <button type="button" disabled={pending} onClick={confirmCancel} className={cta}>
                {pending ? "Annulation…" : "Oui, annuler"}
              </button>
              <button
                type="button"
                onClick={close}
                className="min-h-12 text-[13px] text-ivory-soft"
              >
                Garder mon rendez-vous
              </button>
            </div>
          </>
        ) : null}
      </ClientSheet>
    </>
  );
}
