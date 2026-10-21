"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { idleState } from "@/app/_actions/form-state";
import { Sheet } from "@/components/sheet";
import { Field, inputClass } from "@/components/ui";
import { capitalize, formatDay, formatTime, parisDate } from "@/lib/format";
import type {
  AppointmentToHandle,
  FreeColleague,
  HandleReason,
  HeldEmail,
  ManagedAbsence,
} from "@/modules/absences";
import type { StaffChoice } from "@/modules/catalog";
import { teamMessage, type TeamResult } from "../../_lib/messages";
import {
  cancelAppointmentAsSalon,
  declareAbsenceAction,
  deleteAbsenceAction,
  fetchSalonDays,
  fetchSalonStaffChoices,
  releaseHeldEmailsAction,
  rescheduleAppointmentAsSalon,
  unlockManagerAction,
  type SalonDayView,
} from "../../actions";
import { AuthorPicker } from "../_components/author-picker";
import { SlotPicker, type PickedSalonSlot } from "../_components/slot-picker";

type Member = { id: string; firstName: string };
type Item = AppointmentToHandle & { colleagues: FreeColleague[] };

const MOTIFS = ["Congé", "Maladie", "Formation", "Autre"];
const TYPE_LABEL: Record<HeldEmail["type"], string> = {
  confirmation: "Confirmation",
  modification: "Déplacement",
  cancellation: "Annulation",
  reminder: "Rappel",
  review_invitation: "Avis",
  series_confirmation: "RDV répétés",
};

const ghost =
  "flex h-12 items-center justify-center border border-line-strong px-3 text-[12px] hover:bg-graphite-light disabled:text-stone-dark disabled:hover:bg-transparent";
const primary =
  "flex h-[52px] items-center justify-center bg-ivory px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-ink disabled:bg-disabled disabled:text-stone-dark";

/** Les heures de la grille de 15 minutes, de 6 h à 23 h 45 (R-04). */
const TIMES = Array.from({ length: 72 }, (_, i) => {
  const minutes = 6 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

const whenOf = (date: Date) => `${capitalize(formatDay(date))} · ${formatTime(date)}`;

function reasonLabel(reason: HandleReason, staffFirstName: string): string {
  switch (reason.kind) {
    case "absence":
      return `${staffFirstName} est absent${reason.reason ? ` (${reason.reason.toLowerCase()})` : ""}`;
    case "closure":
      return `Le salon est fermé ce jour-là${reason.reason ? ` (${reason.reason.toLowerCase()})` : ""}`;
    case "outside_hours":
      return "Hors des horaires d’ouverture";
    case "staff_left":
      return `${staffFirstName} a quitté l’équipe`;
    case "not_eligible":
      return `${staffFirstName} ne réalise plus cette prestation`;
  }
}

/** « Mar. 3 nov. · 14:00–16:00 » ou « Du … au … » pour des journées entières. */
function absenceLabel(a: ManagedAbsence): string {
  const wholeDays = formatTime(a.startsAt) === "00:00" && formatTime(a.endsAt) === "00:00";
  if (!wholeDays) {
    return `${capitalize(formatDay(a.startsAt))} · ${formatTime(a.startsAt)} à ${formatTime(a.endsAt)}`;
  }
  const last = new Date(a.endsAt.getTime() - 12 * 3_600_000);
  const first = capitalize(formatDay(a.startsAt));
  return formatDay(a.startsAt) === formatDay(last) ? first : `Du ${first.toLowerCase()} au ${formatDay(last)}`;
}

type Sheeted =
  | { kind: "delete"; absence: ManagedAbsence }
  | { kind: "cancel"; item: Item }
  | { kind: "colleague"; item: Item; colleague: FreeColleague }
  | { kind: "move"; item: Item };

/**
 * Absences et rendez-vous à traiter (R-40 à R-43, D-55 à D-57). L'équipe déclare l'absence et traite chaque rendez-vous
 * (confier à un collègue, déplacer, annuler) : le planning est à jour tout de suite. Les emails restent retenus jusqu'à
 * la confirmation du gérant avec son code.
 */
export function AbsencesBoard({
  today,
  team,
  absences,
  toHandle,
  held,
  managerUnlocked,
}: {
  today: string;
  team: Member[];
  absences: ManagedAbsence[];
  toHandle: Item[];
  held: HeldEmail[];
  managerUnlocked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  // Formulaire de déclaration.
  const [staffId, setStaffId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [hours, setHours] = useState(false);
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("16:00");
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [formAuthor, setFormAuthor] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Feuille d'action (supprimer, confier, déplacer, annuler) : l'auteur est choisi à chaque fois (R-74).
  const [sheet, setSheet] = useState<Sheeted | null>(null);
  const [sheetAuthor, setSheetAuthor] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [choices, setChoices] = useState<StaffChoice[]>([]);
  const [moveStaffId, setMoveStaffId] = useState<string | null>(null);
  const [slot, setSlot] = useState<PickedSalonSlot | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Le message de confirmation disparaît seul.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 12000);
    return () => clearTimeout(timer);
  }, [notice]);

  const onFailure = (code: Parameters<typeof teamMessage>[0]) => teamMessage(code);

  const declare = () => {
    if (!staffId || !formAuthor) return;
    setFormError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await declareAbsenceAction({
        staffId,
        startDate,
        endDate: hours ? startDate : endDate,
        ...(hours ? { startTime, endTime } : {}),
        reason: motif,
        authorId: formAuthor,
      });
      if (!result.ok) {
        setFormError(onFailure(result.error));
        return;
      }
      const who = team.find((m) => m.id === staffId)?.firstName ?? "";
      setNotice(
        `Absence enregistrée. Les créneaux de ${who} sont fermés.${
          result.toHandle > 0
            ? ` ${result.toHandle} rendez-vous à traiter.`
            : " Aucun rendez-vous n’est touché."
        }`,
      );
      setFormAuthor(null);
      router.refresh();
    });
  };

  const openSheet = (next: Sheeted) => {
    setSheetError(null);
    setSheetAuthor(null);
    setSlot(null);
    setSheet(next);
    if (next.kind === "move") {
      setMoveStaffId(null);
      fetchSalonStaffChoices({ appointmentId: next.item.id }).then((result) => {
        if (result.ok) setChoices(result.choices);
        else setSheetError(onFailure(result.error));
      });
    }
  };
  const closeSheet = () => {
    setSheet(null);
    setSheetError(null);
  };

  const moveAppointmentId = sheet?.kind === "move" ? sheet.item.id : undefined;
  const loadDays = useCallback(
    (from: string, days: number): Promise<TeamResult<{ days: SalonDayView[] }>> =>
      fetchSalonDays({
        serviceIds: [],
        staffId: moveStaffId ?? "any",
        from,
        days,
        appointmentId: moveAppointmentId,
      }),
    [moveStaffId, moveAppointmentId],
  );

  const sheetReady =
    !!sheet && !!sheetAuthor && !pending && (sheet.kind !== "move" || slot !== null);

  const confirmSheet = () => {
    if (!sheet || !sheetAuthor) return;
    setSheetError(null);
    startTransition(async () => {
      let message = "";
      let result: TeamResult<{ held?: boolean }>;
      if (sheet.kind === "delete") {
        result = await deleteAbsenceAction({ absenceId: sheet.absence.id, authorId: sheetAuthor });
        message = `Absence de ${sheet.absence.staffFirstName} supprimée. Ses créneaux sont rouverts.`;
      } else if (sheet.kind === "cancel") {
        result = await cancelAppointmentAsSalon({
          appointmentId: sheet.item.id,
          authorId: sheetAuthor,
        });
        message = `Rendez-vous de ${sheet.item.customerName} annulé`;
      } else if (sheet.kind === "colleague") {
        result = await rescheduleAppointmentAsSalon({
          appointmentId: sheet.item.id,
          staffId: sheet.colleague.id,
          startsAt: sheet.item.startsAt.toISOString(),
          authorId: sheetAuthor,
        });
        message = `Rendez-vous de ${sheet.item.customerName} confié à ${sheet.colleague.firstName}`;
      } else if (slot) {
        result = await rescheduleAppointmentAsSalon({
          appointmentId: sheet.item.id,
          staffId: moveStaffId ?? "any",
          startsAt: slot.iso,
          authorId: sheetAuthor,
        });
        message = `Rendez-vous de ${sheet.item.customerName} déplacé au ${slot.dayLabel.toLowerCase()}, ${slot.time}`;
      } else {
        return;
      }
      if (!result.ok) {
        setSheetError(onFailure(result.error));
        if (result.error === "slot_unavailable") {
          setSlot(null);
          setReloadKey((k) => k + 1);
        }
        return;
      }
      const isHeld = "held" in result && result.held === true;
      setNotice(
        sheet.kind === "delete"
          ? message
          : isHeld
            ? `${message} · l’email attend la confirmation du gérant.`
            : `${message} · le client reçoit un email.`,
      );
      setSheet(null);
      router.refresh();
    });
  };

  const release = () => {
    setNotice(null);
    startTransition(async () => {
      const result = await releaseHeldEmailsAction();
      if (!result.ok) {
        setNotice(onFailure(result.error));
        router.refresh();
        return;
      }
      setNotice(
        `${result.count} email${result.count > 1 ? "s" : ""} confirmé${result.count > 1 ? "s" : ""} : les clients vont être prévenus.`,
      );
      router.refresh();
    });
  };

  const canDeclare = !!staffId && !!formAuthor && !pending;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto md:flex md:overflow-hidden">
      {/* Déclarer une absence */}
      <section
        aria-label="Déclarer une absence"
        className="flex flex-col gap-5 border-line-subtle px-6 py-7 md:w-[460px] md:shrink-0 md:overflow-y-auto md:border-r [&>*]:shrink-0"
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-[0.3em] text-stone">Absences</span>
          <h1 className="text-[26px] font-light leading-tight">Déclarer une absence</h1>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="pb-2.5 text-body-sm text-ivory-soft">Qui ?</legend>
          <div className="grid grid-cols-2 gap-2">
            {team.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={staffId === m.id}
                onClick={() => setStaffId(m.id)}
                className={`h-[52px] border text-[15px] ${
                  staffId === m.id ? "border-ivory bg-ivory text-ink" : "border-line-strong"
                }`}
              >
                {m.firstName}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field id="absence-from" label="Du">
            <input
              id="absence-from"
              type="date"
              className={inputClass}
              min={today}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
            />
          </Field>
          <Field id="absence-to" label="Au (inclus)">
            <input
              id="absence-to"
              type="date"
              className={inputClass}
              min={startDate}
              value={hours ? startDate : endDate}
              disabled={hours}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { value: false, label: "Journée entière" },
            { value: true, label: "Quelques heures" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={hours === o.value}
              onClick={() => setHours(o.value)}
              className={`h-12 border text-[14px] ${
                hours === o.value ? "border-ivory bg-ivory text-ink" : "border-line-strong"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {hours ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id="absence-start" label="De">
              <select
                id="absence-start"
                className={inputClass}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              >
                {TIMES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field id="absence-end" label="À">
              <select
                id="absence-end"
                className={inputClass}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              >
                {TIMES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}

        <Field id="absence-motif" label="Motif">
          <select
            id="absence-motif"
            className={inputClass}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          >
            {MOTIFS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>

        <AuthorPicker
          team={team}
          value={formAuthor}
          onChange={setFormAuthor}
          label="Qui déclare l’absence ?"
        />

        {formError ? (
          <p role="alert" className="border border-brick p-3 text-[14px] leading-normal">
            {formError}
          </p>
        ) : null}
        <button type="button" disabled={!canDeclare} onClick={declare} className={primary}>
          {pending ? "…" : "Enregistrer l’absence"}
        </button>

        <div className="flex flex-col gap-2 border-t border-line pt-5">
          <h2 className="text-label uppercase tracking-[0.3em] text-stone">Absences à venir</h2>
          {absences.length === 0 ? (
            <p className="text-[14px] text-stone">Aucune absence prévue.</p>
          ) : (
            <ul>
              {absences.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 border-b border-line-subtle py-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px]">{a.staffFirstName}</span>
                    <span className="text-[12px] text-stone">
                      {absenceLabel(a)}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Supprimer l’absence de ${a.staffFirstName}, ${absenceLabel(a)}`}
                    onClick={() => openSheet({ kind: "delete", absence: a })}
                    className={`${ghost} h-11 border-line text-brick`}
                  >
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Rendez-vous à traiter */}
      <section
        aria-label="Rendez-vous à traiter"
        className="flex min-w-0 flex-1 flex-col gap-4 px-6 py-7 md:overflow-y-auto [&>*]:shrink-0"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[20px] font-light">Rendez-vous à traiter</h2>
          <span className="text-[13px] text-stone">
            {toHandle.length === 0
              ? "Tout est traité"
              : `${toHandle.length} à traiter`}
          </span>
        </div>
        <p className="text-[14px] leading-normal text-stone">
          Appelez le client, puis choisissez une action. Le planning est mis à jour tout de suite ;
          les emails restent en attente jusqu’à la confirmation du gérant.
        </p>

        {notice ? (
          <p role="status" className="border border-line-strong p-3.5 text-[14px] leading-normal">
            {notice}
          </p>
        ) : null}

        <HeldBanner held={held} unlocked={managerUnlocked} pending={pending} onRelease={release} />

        {toHandle.length === 0 ? (
          <p className="text-[14px] text-ivory-soft">
            Aucun rendez-vous n’est touché par une absence, une fermeture ou un changement
            d’horaires.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {toHandle.map((item) => (
              <li key={item.id} className="flex flex-col gap-3.5 bg-charcoal px-5 py-4.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-label uppercase tracking-[0.24em] text-gold">
                      {whenOf(item.startsAt)}
                    </span>
                    <span className="text-[17px]">{item.customerName}</span>
                    <span className="text-[13px] text-stone">
                      {item.services.join(" + ")} · avec {item.staffFirstName}
                    </span>
                    <span className="text-[13px] text-brick">
                      {item.reasons.map((r) => reasonLabel(r, item.staffFirstName)).join(" · ")}
                    </span>
                    {item.heldEmail ? (
                      <span className="text-[12px] text-ivory-soft">
                        Un email attend la confirmation du gérant.
                      </span>
                    ) : null}
                  </div>
                  {item.phone ? (
                    <a
                      href={`tel:${item.phone.replace(/\s/g, "")}`}
                      aria-label={`Appeler ${item.customerName}`}
                      className="flex h-12 w-12 shrink-0 items-center justify-center border border-line-strong"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />
                      </svg>
                    </a>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.colleagues.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={`Confier le rendez-vous de ${item.customerName} à ${c.firstName}`}
                      onClick={() => openSheet({ kind: "colleague", item, colleague: c })}
                      className={ghost}
                    >
                      Confier à {c.firstName}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label={`Déplacer le rendez-vous de ${item.customerName}`}
                    onClick={() => openSheet({ kind: "move", item })}
                    className={ghost}
                  >
                    Déplacer
                  </button>
                  <button
                    type="button"
                    aria-label={`Annuler le rendez-vous de ${item.customerName}`}
                    onClick={() => openSheet({ kind: "cancel", item })}
                    className={`${ghost} border-brick text-brick`}
                  >
                    Annuler et prévenir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={sheet !== null} onClose={closeSheet} titleId="absence-sheet-title">
        {sheet ? (
          <div className="flex max-h-[76dvh] flex-col gap-4 overflow-y-auto pr-1">
            <h2 id="absence-sheet-title" className="text-title-3">
              {sheet.kind === "delete"
                ? `Supprimer l’absence de ${sheet.absence.staffFirstName} ?`
                : sheet.kind === "cancel"
                  ? `Annuler le rendez-vous de ${sheet.item.customerName} ?`
                  : sheet.kind === "colleague"
                    ? `Confier à ${sheet.colleague.firstName} ?`
                    : "Déplacer le rendez-vous"}
            </h2>
            <p className="text-body-sm leading-normal text-ivory-soft">
              {sheet.kind === "delete"
                ? "Ses créneaux se rouvrent. Les rendez-vous déjà déplacés ou annulés ne changent pas."
                : sheet.kind === "cancel"
                  ? "Appelez d’abord le client pour vous excuser. Son email d’annulation part quand le gérant confirme."
                  : sheet.kind === "colleague"
                    ? `${whenOf(sheet.item.startsAt)} : même heure, mêmes prestations, même prix. Appelez d’abord le client ; son email part quand le gérant confirme.`
                    : "Appelez d’abord le client. Son email avec le nouveau créneau part quand le gérant confirme."}
            </p>

            {sheet.kind === "move" ? (
              <div className="flex flex-col gap-3.5">
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
                        className={`h-12 border text-[14px] ${
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
                  startDate={parisDate(sheet.item.startsAt)}
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

            <AuthorPicker team={team} value={sheetAuthor} onChange={setSheetAuthor} />
            {sheetError ? (
              <p role="alert" className="border border-brick p-3 text-[14px] leading-normal">
                {sheetError}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={closeSheet} className={`${ghost} h-[52px]`}>
                Retour
              </button>
              <button type="button" disabled={!sheetReady} onClick={confirmSheet} className={primary}>
                {pending ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </main>
  );
}

/**
 * Les emails retenus (R-43) : liste de ce qui attend, puis, avec le code gérant, un bouton qui les libère.
 * Sans le code, on le demande ici même : le gérant n'a pas à quitter l'écran.
 */
function HeldBanner({
  held,
  unlocked,
  pending,
  onRelease,
}: {
  held: HeldEmail[];
  unlocked: boolean;
  pending: boolean;
  onRelease: () => void;
}) {
  const router = useRouter();
  const [state, formAction, unlocking] = useActionState(unlockManagerAction, idleState);
  const handled = useRef(state);
  useEffect(() => {
    if (state.status === "ok" && handled.current !== state) {
      handled.current = state;
      router.refresh();
    }
  }, [state, router]);

  if (held.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Emails en attente de confirmation"
      className="flex flex-col gap-3 border border-gold p-4.5"
    >
      <h3 className="text-[16px]">
        {held.length} email{held.length > 1 ? "s" : ""} en attente de confirmation du gérant
      </h3>
      <ul className="flex flex-col gap-1 text-[13px] text-ivory-soft">
        {held.map((h) => (
          <li key={h.id}>
            {TYPE_LABEL[h.type]} · {h.customerName} · {whenOf(h.startsAt)}
          </li>
        ))}
      </ul>
      {unlocked ? (
        <button type="button" disabled={pending} onClick={onRelease} className={primary}>
          {pending ? "…" : "Confirmer et prévenir les clients"}
        </button>
      ) : (
        <form action={formAction} className="flex flex-col gap-2.5" noValidate>
          <Field id="release-code" label="Code gérant, pour confirmer l’envoi">
            <input
              id="release-code"
              name="code"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="off"
              className="h-[52px] w-full min-w-0 border border-line-strong bg-ink px-4 text-center text-[20px] tracking-[0.5em] text-ivory"
            />
          </Field>
          {state.status === "error" && state.message ? (
            <p role="alert" className="border border-brick p-3 text-[14px] leading-normal">
              {state.message}
            </p>
          ) : null}
          <button type="submit" disabled={unlocking} className={primary}>
            {unlocking ? "Vérification…" : "Déverrouiller"}
          </button>
        </form>
      )}
    </div>
  );
}
