"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { capitalize, formatDay, formatDuration, formatPrice, formatTime } from "@/lib/format";
import type { StaffChoice } from "@/modules/catalog";
import type { DayPlanning, PlanningAppointment } from "@/modules/planning";
import { teamMessage, type TeamResult } from "../../_lib/messages";
import {
  cancelAppointmentAsSalon,
  fetchSalonDays,
  fetchSalonStaffChoices,
  markNoShowAction,
  rescheduleAppointmentAsSalon,
  undoNoShowAction,
  type SalonDayView,
} from "../../actions";
import { AuthorPicker, type TeamMemberView } from "./author-picker";
import { SlotPicker, type PickedSalonSlot } from "./slot-picker";

type Mode = "idle" | "cancel" | "noshow" | "undo" | "move";

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

export function AppointmentPanel({
  day,
  today,
  isToday,
  appointment,
  team,
  toast,
  onToast,
  onSelect,
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
    setMode(next);
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
      if (mode === "cancel") {
        result = await cancelAppointmentAsSalon({ appointmentId: appointment.id, authorId });
        message = `Rendez-vous de ${firstName(appointment.customerName)} annulé · le client reçoit un email d’annulation.`;
      } else if (mode === "noshow") {
        result = await markNoShowAction({ appointmentId: appointment.id, authorId });
        message = `Lapin signalé pour ${firstName(appointment.customerName)}.`;
      } else if (mode === "undo") {
        result = await undoNoShowAction({ appointmentId: appointment.id, authorId });
        message = `Lapin retiré pour ${firstName(appointment.customerName)}.`;
      } else if (mode === "move" && slot) {
        result = await rescheduleAppointmentAsSalon({
          appointmentId: appointment.id,
          staffId: moveStaffId ?? "any",
          startsAt: slot.iso,
          authorId,
        });
        message = `Rendez-vous de ${firstName(appointment.customerName)} déplacé au ${slot.dayLabel.toLowerCase()}, ${slot.time} · le client reçoit un email.`;
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
      onToast(message);
      close();
      if (mode === "cancel") onSelect(null);
      router.refresh();
    });
  };

  // ------------------------------------------------------------------------------------------------ aucune fiche
  if (!appointment) {
    return (
      <>
        <aside className="hidden w-[340px] shrink-0 flex-col gap-5 border-l border-line-subtle bg-charcoal px-6 py-7 lg:flex">
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
                    <span className="text-[14px]">{n.customerName}</span>
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
  const needsSlot = mode === "move";
  const ready = !!authorId && (!needsSlot || !!slot) && !pending;
  const phoneHref = `tel:${a.phone.replace(/\s/g, "")}`;

  return (
    <>
      <aside
        aria-label={`Fiche du rendez-vous de ${a.customerName}`}
        className="fixed inset-x-0 bottom-0 z-30 flex max-h-[88dvh] flex-col overflow-y-auto border-t border-line bg-charcoal px-6 pb-6 pt-5 animate-panel-in lg:static lg:max-h-none lg:w-[340px] lg:shrink-0 lg:border-l lg:border-t-0"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-label uppercase tracking-[0.26em] text-gold">{when}</span>
            <h2 className="text-[26px] font-light leading-tight">
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
        </div>

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
        ) : (
          <div className="mt-6 flex flex-col gap-4 border border-ivory p-4.5 animate-panel-in lg:mt-auto">
            <span className="text-[16px]">
              {mode === "cancel"
                ? `Annuler le rendez-vous de ${firstName(a.customerName)} ?`
                : mode === "noshow"
                  ? `Signaler un lapin pour ${firstName(a.customerName)} ?`
                  : mode === "undo"
                    ? `Retirer le lapin de ${firstName(a.customerName)} ?`
                    : "Déplacer le rendez-vous"}
            </span>
            {mode === "cancel" ? (
              <p className="text-[13px] leading-normal text-stone">
                Appelez d’abord le client : un email d’annulation lui est envoyé aussitôt.
              </p>
            ) : null}
            {mode === "move" ? (
              <div className="flex flex-col gap-3.5">
                <p className="text-[13px] leading-normal text-stone">
                  Appelez d’abord le client : un email lui confirme le nouveau créneau.
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
