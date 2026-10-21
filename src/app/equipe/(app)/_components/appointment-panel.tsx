"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { capitalize, formatDay, formatDuration, formatPrice, formatTime } from "@/lib/format";
import { centsToEuroInput, parseEuros } from "@/lib/money";
import type { StaffChoice } from "@/modules/catalog";
import type { DayPlanning, PlanningAppointment } from "@/modules/planning";
import { teamMessage, type TeamResult } from "../../_lib/messages";
import {
  adjustAmountAction,
  cancelAppointmentAsSalon,
  cancelSeriesAction,
  fetchSalonDays,
  fetchSalonStaffChoices,
  fetchSeriesAction,
  markNoShowAction,
  rescheduleAppointmentAsSalon,
  undoNoShowAction,
  type SalonDayView,
  type SeriesCardView,
} from "../../actions";
import { AuthorPicker, type TeamMemberView } from "./author-picker";
import { SeriesForm } from "./series-form";
import { SlotPicker, type PickedSalonSlot } from "./slot-picker";

type Mode =
  "idle" | "cancel" | "noshow" | "undo" | "move" | "amount" | "amount-reset" | "repeat" | "extend";

/** D-88 : ce RDV seul, celui-ci et les suivants, ou tous les RDV à venir de la série. */
type CancelScope = "one" | "following" | "all";

const STATUS_LABEL: Record<PlanningAppointment["status"], string> = {
  upcoming: "À venir",
  in_progress: "En cours",
  honored: "Honoré",
  no_show: "Lapin",
  cancelled: "Annulé",
};

const chip =
  "border border-line-strong px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-stone";
const ghostButton =
  "h-[52px] border border-line-strong text-[11px] uppercase tracking-[0.2em] text-ivory transition-colors duration-200 hover:bg-graphite-light";

const firstName = (name: string) => name.split(" ")[0] ?? name;

/** Fiche sans email (D-76) : personne n'est prévenu, l'équipe appelle. */
const NO_EMAIL = "pas d’email sur la fiche : prévenez le client par téléphone.";

export function AppointmentPanel({
  day,
  today,
  isToday,
  appointment,
  team,
  toast,
  onToast,
  onSelect,
  summaryCollapsed,
  onSummaryCollapsedChange,
  onBusy,
}: {
  day: DayPlanning;
  today: string;
  isToday: boolean;
  appointment: PlanningAppointment | null;
  team: TeamMemberView[];
  toast: string | null;
  onToast: (message: string | null) => void;
  onSelect: (id: string | null) => void;
  /** D-68 : le résumé du jour est replié ; une fiche ouverte s'affiche toujours. */
  summaryCollapsed: boolean;
  onSummaryCollapsedChange: (collapsed: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Déplacement : coiffeur et créneau choisis, et ce que le serveur propose.
  const [choices, setChoices] = useState<StaffChoice[]>([]);
  const [moveStaffId, setMoveStaffId] = useState<string | null>(appointment?.staffId ?? null);
  const [slot, setSlot] = useState<PickedSalonSlot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Montant encaissé (R-53, R-54), saisi en euros.
  const [amountText, setAmountText] = useState("");

  // Série du RDV (D-92), relue à chaque fiche ouverte ou changée ; « Annuler » choisit sa portée (D-88).
  const [loaded, setLoaded] = useState<{ key: string; series: SeriesCardView | null } | null>(null);
  const [cancelScope, setCancelScope] = useState<CancelScope>("one");
  const seriesKey = appointment?.seriesId
    ? `${appointment.id}:${appointment.seriesId}:${appointment.status}:${toast ?? ""}`
    : null;
  useEffect(() => {
    if (!seriesKey || !appointment) return;
    let cancelled = false;
    fetchSeriesAction({ appointmentId: appointment.id }).then((result) => {
      if (!cancelled && result.ok) setLoaded({ key: seriesKey, series: result.series });
    });
    return () => {
      cancelled = true;
    };
    // La clé résume le RDV, sa série, son statut et la dernière action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey]);
  const series = seriesKey && loaded?.key === seriesKey ? loaded.series : null;

  useEffect(() => {
    onBusy(mode !== "idle");
    return () => onBusy(false);
  }, [mode, onBusy]);

  // Le message de confirmation disparaît seul.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => onToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast, onToast]);

  const appointmentId = appointment?.id;
  const loadDays = useCallback(
    (from: string, days: number): Promise<TeamResult<{ days: SalonDayView[] }>> =>
      fetchSalonDays({
        serviceIds: [],
        staffId: moveStaffId ?? "any",
        from,
        days,
        appointmentId,
      }),
    [moveStaffId, appointmentId],
  );

  const open = (next: Mode) => {
    setError(null);
    setAuthorId(null);
    setSlot(null);
    setCancelScope("one");
    setMode(next);
    if (next === "amount" && appointment) {
      setAmountText(
        centsToEuroInput(appointment.adjustedAmountCents ?? appointment.totalPriceCents),
      );
    }
    if (next === "move" && appointment && choices.length === 0) {
      fetchSalonStaffChoices({ appointmentId: appointment.id }).then((result) => {
        if (result.ok) setChoices(result.choices);
        else setError(teamMessage(result.error));
      });
    }
  };

  const close = () => {
    setMode("idle");
    setError(null);
    setAuthorId(null);
    setSlot(null);
  };

  const confirm = () => {
    if (!appointment || !authorId) return;
    setError(null);
    startTransition(async () => {
      let message = "";
      let result: TeamResult<object>;
      if (mode === "cancel" && cancelScope !== "one") {
        const cancelled = await cancelSeriesAction({
          appointmentId: appointment.id,
          scope: cancelScope,
          authorId,
        });
        result = cancelled;
        message = cancelled.ok
          ? `${cancelled.cancelled} rendez-vous de ${firstName(appointment.customerName)} annulés · ${
              appointment.hasEmail
                ? "le client reçoit un seul email qui liste les dates."
                : NO_EMAIL
            }`
          : "";
      } else if (mode === "cancel") {
        result = await cancelAppointmentAsSalon({ appointmentId: appointment.id, authorId });
        message = `Rendez-vous de ${firstName(appointment.customerName)} annulé · ${
          appointment.hasEmail ? "le client reçoit un email d’annulation." : NO_EMAIL
        }`;
      } else if (mode === "noshow") {
        result = await markNoShowAction({ appointmentId: appointment.id, authorId });
        message = `Lapin signalé pour ${firstName(appointment.customerName)}.`;
      } else if (mode === "undo") {
        result = await undoNoShowAction({ appointmentId: appointment.id, authorId });
        message = `Lapin retiré pour ${firstName(appointment.customerName)}.`;
      } else if (mode === "amount" || mode === "amount-reset") {
        const cents = mode === "amount" ? parseEuros(amountText) : null;
        if (mode === "amount" && cents === null) {
          setError(teamMessage("invalid_amount"));
          return;
        }
        const adjusted = await adjustAmountAction({
          appointmentId: appointment.id,
          authorId,
          amountCents: cents,
        });
        result = adjusted;
        message = adjusted.ok
          ? `Montant ${adjusted.adjusted ? "corrigé" : "rétabli"} pour ${firstName(appointment.customerName)} : ${formatPrice(adjusted.amountCents)}.`
          : "";
      } else if (mode === "move" && slot) {
        result = await rescheduleAppointmentAsSalon({
          appointmentId: appointment.id,
          staffId: moveStaffId ?? "any",
          startsAt: slot.iso,
          authorId,
        });
        message = `Rendez-vous de ${firstName(appointment.customerName)} déplacé au ${slot.dayLabel.toLowerCase()}, ${slot.time} · ${
          appointment.hasEmail ? "le client reçoit un email." : NO_EMAIL
        }`;
      } else {
        return;
      }
      if (!result.ok) {
        setError(teamMessage(result.error));
        if (result.error === "slot_unavailable") {
          setSlot(null);
          setReloadKey((k) => k + 1);
        }
        return;
      }
      // R-43, D-56 : un rendez-vous à traiter (absence, fermeture…) ne prévient pas le client avant le gérant.
      const held = "held" in result && result.held === true;
      onToast(
        held ? `${message.split(" · ")[0]} · l’email attend la confirmation du gérant.` : message,
      );
      close();
      if (mode === "cancel") onSelect(null);
      router.refresh();
    });
  };

  // ------------------------------------------------------------------------------------------------ aucune fiche
  if (!appointment && summaryCollapsed) {
    return (
      <>
        {/* Replié, le résumé ne prend aucune place : seule une languette dépasse du bord droit, par-dessus le planning. */}
        <aside
          aria-label="Résumé du jour, replié"
          className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden items-center lg:flex"
        >
          <button
            type="button"
            onClick={() => onSummaryCollapsedChange(false)}
            aria-expanded={false}
            aria-label="Afficher le résumé du jour"
            className="pointer-events-auto flex h-16 w-9 items-center justify-center border border-r-0 border-line-strong bg-charcoal text-gold shadow-[0_0_18px_rgba(0,0,0,0.6)]"
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
          </button>
        </aside>
        <Toast message={toast} onClose={() => onToast(null)} />
      </>
    );
  }

  if (!appointment) {
    return (
      <>
        <aside
          aria-label="Résumé du jour"
          className="hidden w-[340px] shrink-0 flex-col gap-5 border-l border-line-subtle bg-charcoal px-6 py-7 lg:flex"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-label uppercase tracking-[0.3em] text-stone">
                {isToday ? "Aujourd’hui" : day.label}
              </span>
              <span className="text-[24px] font-light">
                {day.count === 0
                  ? "Aucun rendez-vous"
                  : day.count === 1
                    ? "1 rendez-vous"
                    : `${day.count} rendez-vous`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSummaryCollapsedChange(true)}
              aria-expanded={true}
              aria-label="Replier le résumé du jour"
              className="-mr-2 flex h-12 w-12 shrink-0 items-center justify-center border border-line-strong"
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
            </button>
          </div>
          {day.next.length > 0 ? (
            <div className="flex flex-col border-t border-line">
              <span className="pb-2 pt-4 text-label uppercase tracking-[0.3em] text-stone">
                À suivre
              </span>
              {day.next.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelect(n.id)}
                  className="flex min-h-[60px] items-center gap-3 border-b border-line-subtle text-left"
                >
                  <span className="w-12 text-[15px] tabular-nums">{formatTime(n.startsAt)}</span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[14px]">
                      {n.forName ? `${n.forName} · ${n.customerName}` : n.customerName}
                    </span>
                    <span className="text-[12px] text-stone">
                      {n.summary} · {n.staffFirstName}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-[13px] leading-normal text-stone">
            Touchez un rendez-vous pour ouvrir sa fiche.
          </p>
        </aside>
        <Toast message={toast} onClose={() => onToast(null)} />
      </>
    );
  }

  // ------------------------------------------------------------------------------------------------ fiche ouverte
  const a = appointment;
  const when = `${capitalize(formatDay(a.startsAt))} · ${formatTime(a.startsAt)}`;
  const started = a.status !== "upcoming" && a.status !== "cancelled";
  const canChange = a.status === "upcoming" || a.status === "in_progress";
  const canNoShow = a.status === "in_progress" || a.status === "honored";
  // R-53 : le montant se corrige une fois le RDV commencé, tant qu'il compte (ni lapin ni annulé).
  const canAdjust = a.status === "in_progress" || a.status === "honored";
  const amountTyped = parseEuros(amountText);
  const needsSlot = mode === "move";
  const ready =
    !!authorId && (!needsSlot || !!slot) && (mode !== "amount" || amountTyped !== null) && !pending;
  const phoneHref = `tel:${a.phone.replace(/\s/g, "")}`;

  return (
    <>
      <aside
        aria-label={`Fiche du rendez-vous de ${a.customerName}`}
        className={`fixed inset-x-0 bottom-0 z-30 flex max-h-[88dvh] flex-col overflow-y-auto border-t border-line bg-charcoal px-6 pb-6 pt-5 animate-panel-in lg:static lg:max-h-none lg:shrink-0 lg:border-l lg:border-t-0 ${
          mode === "repeat" || mode === "extend" ? "lg:w-[400px]" : "lg:w-[340px]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-label uppercase tracking-[0.26em] text-gold">{when}</span>
            {a.forName ? (
              <span className="text-[20px] font-light leading-tight">Pour {a.forName}</span>
            ) : null}
            <h2
              className={`font-light leading-tight ${a.forName ? "text-[16px] text-ivory-soft" : "text-[26px]"}`}
            >
              {a.forName ? "Au nom de " : null}
              <Link
                href={`/equipe/clients/${a.customerId}`}
                className="underline decoration-line-strong underline-offset-4"
              >
                {a.customerName}
              </Link>
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label="Fermer la fiche"
            className="flex h-12 w-12 shrink-0 items-center justify-center"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-1.5 text-[15px]">
          {a.items.map((item) => (
            <span key={item.name}>
              {item.name} · {formatPrice(item.priceCents)}
            </span>
          ))}
          {a.items.length > 1 ? (
            <span className="text-ivory-soft">Total · {formatPrice(a.totalPriceCents)}</span>
          ) : null}
          {a.adjustedAmountCents !== null ? (
            <span className="text-ivory">
              Montant encaissé · {formatPrice(a.adjustedAmountCents)}
              <span className="text-stone"> (carte : {formatPrice(a.totalPriceCents)})</span>
            </span>
          ) : null}
          <span className="text-stone">
            {formatDuration(a.durationMinutes)} · avec {a.staffFirstName}
          </span>
          <a
            href={phoneHref}
            className="flex min-h-10 items-center self-start tabular-nums text-ivory"
          >
            {a.phone}
          </a>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className={chip}>
            {a.source === "salon" ? `Salon${a.bookedBy ? ` · ${a.bookedBy}` : ""}` : "En ligne"}
          </span>
          <span className={`${chip} ${a.status === "no_show" ? "border-brick text-brick" : ""}`}>
            {STATUS_LABEL[a.status]}
          </span>
          {a.noShowCount > 0 && a.status !== "no_show" ? (
            <span className={`${chip} border-brick text-brick`}>
              {a.noShowCount} lapin{a.noShowCount > 1 ? "s" : ""}
            </span>
          ) : null}
          {a.blocked ? (
            <span className={`${chip} border-brick text-brick`}>Bloqué en ligne</span>
          ) : null}
          {a.hasAccount ? null : <span className={chip}>Sans compte</span>}
        </div>

        {series ? (
          <section
            aria-label="Série de rendez-vous"
            className="mt-4 flex flex-col gap-2 border border-line px-4 py-3.5"
          >
            <span className="text-label uppercase tracking-[0.24em] text-gold">↻ RDV répété</span>
            <span className="text-[14px] leading-normal text-ivory">
              {series.ruleLabel}
              {series.position
                ? ` · ${series.position === 1 ? "1er" : `${series.position}e`} sur ${series.total}`
                : ""}
            </span>
            {series.isLast ? (
              <span className="text-[13px] text-ivory-soft">Dernier RDV de la série</span>
            ) : null}
            {series.upcoming.length > 0 ? (
              <ul
                className="flex flex-col text-[13px] text-stone"
                aria-label="Dates à venir de la série"
              >
                {series.upcoming.slice(0, 6).map((u) => (
                  <li key={u.id} className={u.id === a.id ? "text-ivory" : ""}>
                    {u.label} · {u.staffFirstName}
                  </li>
                ))}
                {series.upcoming.length > 6 ? (
                  <li>
                    et {series.upcoming.length - 6} autre{series.upcoming.length - 6 > 1 ? "s" : ""}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </section>
        ) : null}

        {a.note ? (
          <div className="mt-4 flex flex-col gap-1.5 bg-ink px-4 py-3.5">
            <span className="text-label uppercase tracking-[0.24em] text-stone">
              Note du client
            </span>
            <span className="text-[14px] leading-normal text-ivory-soft">{a.note}</span>
          </div>
        ) : null}

        {mode === "idle" ? (
          <div className="mt-6 flex flex-col gap-2.5 lg:mt-auto lg:pt-6">
            {canChange ? (
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => open("move")} className={ghostButton}>
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => open("cancel")}
                  className="h-[52px] border border-brick text-[11px] uppercase tracking-[0.2em] text-brick"
                >
                  Annuler
                </button>
              </div>
            ) : null}
            {/* D-83, D-90 : la série se crée et se prolonge depuis la fiche. */}
            {canChange && !a.seriesId ? (
              <button type="button" onClick={() => open("repeat")} className={ghostButton}>
                ↻ Répéter ce RDV
              </button>
            ) : null}
            {a.seriesId && series ? (
              <button type="button" onClick={() => open("extend")} className={ghostButton}>
                ↻ Prolonger la série
              </button>
            ) : null}
            {canAdjust ? (
              <button
                type="button"
                onClick={() => open("amount")}
                className="h-[52px] text-[14px] text-ivory-soft underline underline-offset-4"
              >
                {a.adjustedAmountCents !== null
                  ? "Corriger le montant encaissé"
                  : "Corriger le montant"}
              </button>
            ) : null}
            {canNoShow ? (
              <button
                type="button"
                onClick={() => open("noshow")}
                className="h-[52px] text-[14px] text-brick underline underline-offset-4"
              >
                Signaler un lapin
              </button>
            ) : null}
            {a.status === "no_show" ? (
              <button
                type="button"
                onClick={() => open("undo")}
                className="h-[52px] text-[14px] text-ivory-soft underline underline-offset-4"
              >
                Retirer le lapin
              </button>
            ) : null}
            {!canChange && !canNoShow && a.status !== "no_show" ? (
              <p className="text-[13px] text-stone">
                {started ? "Ce rendez-vous est terminé." : "Ce rendez-vous est annulé."}
              </p>
            ) : null}
          </div>
        ) : mode === "repeat" || mode === "extend" ? (
          <div className="mt-6 flex flex-col gap-4 border border-ivory p-4.5 animate-panel-in">
            <span className="text-[16px]">
              {mode === "repeat" ? "Répéter ce rendez-vous" : "Prolonger la série"}
            </span>
            <SeriesForm
              mode={mode}
              appointmentId={a.id}
              customerId={a.customerId}
              series={series}
              team={team}
              hasEmail={a.hasEmail}
              onCancel={close}
              onDone={(message) => {
                onToast(message);
                close();
                router.refresh();
              }}
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4 border border-ivory p-4.5 animate-panel-in lg:mt-auto">
            <span className="text-[16px]">
              {mode === "cancel"
                ? `Annuler ${cancelScope === "one" ? "le rendez-vous" : "les rendez-vous"} de ${firstName(a.customerName)} ?`
                : mode === "noshow"
                  ? `Signaler un lapin pour ${firstName(a.customerName)} ?`
                  : mode === "undo"
                    ? `Retirer le lapin de ${firstName(a.customerName)} ?`
                    : mode === "amount"
                      ? `Montant encaissé pour ${firstName(a.customerName)}`
                      : mode === "amount-reset"
                        ? `Rétablir le prix de la carte (${formatPrice(a.totalPriceCents)}) ?`
                        : "Déplacer le rendez-vous"}
            </span>
            {mode === "cancel" &&
            series &&
            (series.followingCount > 1 || series.upcomingBefore > 0) ? (
              <div
                role="radiogroup"
                aria-label="Quels rendez-vous ?"
                className="flex flex-col gap-2"
              >
                {(
                  [
                    { scope: "one", label: "Ce RDV" },
                    ...(series.followingCount > 1
                      ? [
                          {
                            scope: "following",
                            label: `Celui-ci et les suivants (${series.followingCount})`,
                          },
                        ]
                      : []),
                    ...(series.upcomingBefore > 0
                      ? [
                          {
                            scope: "all",
                            label: `Tous les RDV à venir de la série (${series.upcomingBefore + series.followingCount})`,
                          },
                        ]
                      : []),
                  ] as { scope: CancelScope; label: string }[]
                ).map((option) => (
                  <button
                    key={option.scope}
                    type="button"
                    role="radio"
                    aria-checked={cancelScope === option.scope}
                    onClick={() => setCancelScope(option.scope)}
                    className={`min-h-12 border px-3 text-left text-[14px] transition-colors duration-200 ${
                      cancelScope === option.scope
                        ? "border-ivory bg-ivory text-ink"
                        : "border-line-strong hover:bg-graphite-light"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            {mode === "cancel" ? (
              <p className="text-[13px] leading-normal text-stone">
                Appelez d’abord le client. Un email d’annulation lui est ensuite envoyé ; pour un
                rendez-vous à traiter (absence, fermeture), il attend la confirmation du gérant.
              </p>
            ) : null}
            {mode === "amount" ? (
              <div className="flex flex-col gap-2.5">
                <label htmlFor="amount-input" className="text-label uppercase text-stone">
                  Montant (€)
                </label>
                <input
                  id="amount-input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amountText}
                  onChange={(event) => setAmountText(event.target.value)}
                  className="h-[52px] w-full min-w-0 border border-line-strong bg-ink px-4 text-[16px] tabular-nums text-ivory"
                />
                <p className="text-[13px] leading-normal text-stone">
                  Prix de la carte : {formatPrice(a.totalPriceCents)}. Chaque correction est
                  inscrite au journal ; le chiffre d’affaires du Bilan n’est qu’un repère, la caisse
                  fait foi.
                </p>
                {a.adjustedAmountCents !== null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMode("amount-reset");
                    }}
                    className="min-h-11 self-start text-[13px] text-ivory-soft underline underline-offset-4"
                  >
                    Rétablir le prix de la carte
                  </button>
                ) : null}
              </div>
            ) : null}
            {mode === "move" ? (
              <div className="flex flex-col gap-3.5">
                <p className="text-[13px] leading-normal text-stone">
                  Appelez d’abord le client. Un email lui confirme le nouveau créneau ; pour un
                  rendez-vous à traiter, il attend la confirmation du gérant.
                </p>
                {choices.length > 0 ? (
                  <div role="group" aria-label="Coiffeur" className="grid grid-cols-2 gap-2">
                    {choices.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={moveStaffId === c.id}
                        onClick={() => {
                          setMoveStaffId(c.id);
                          setSlot(null);
                        }}
                        className={`h-12 border text-[14px] transition-colors duration-200 ${
                          moveStaffId === c.id
                            ? "border-ivory bg-ivory text-ink"
                            : "border-line-strong hover:bg-graphite-light"
                        }`}
                      >
                        {c.firstName}
                      </button>
                    ))}
                  </div>
                ) : null}
                <SlotPicker
                  load={loadDays}
                  today={today}
                  startDate={day.date}
                  value={slot?.iso ?? null}
                  onPick={setSlot}
                  reloadKey={`${moveStaffId}:${reloadKey}`}
                  compact
                />
                {slot ? (
                  <p role="status" className="text-[14px] text-ivory">
                    Nouveau créneau : {slot.dayLabel.toLowerCase()}, {slot.time}
                  </p>
                ) : null}
              </div>
            ) : null}
            <AuthorPicker team={team} value={authorId} onChange={setAuthorId} />
            {error ? (
              <p role="alert" className="border border-brick p-3 text-[13px] leading-normal">
                {error}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={close} className={ghostButton}>
                Retour
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={confirm}
                className="h-[52px] bg-ivory text-[11px] font-medium uppercase tracking-[0.2em] text-ink disabled:bg-disabled disabled:text-stone-dark"
              >
                {pending ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        )}
      </aside>
      <Toast message={toast} onClose={() => onToast(null)} />
    </>
  );
}

function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 flex w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 border border-line-strong bg-charcoal p-3.5 text-[14px] leading-normal animate-panel-in"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#9bb58c"
        strokeWidth="1.8"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer le message"
        className="-m-2 flex h-10 w-10 items-center justify-center"
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
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
