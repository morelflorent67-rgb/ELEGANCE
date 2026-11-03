"use client";

import { useState, useTransition } from "react";
import { teamMessage } from "../../_lib/messages";
import { moveAppointmentByDragAction } from "../../actions";
import { AuthorPicker, type TeamMemberView } from "./author-picker";

export interface PendingMove {
  appointmentId: string;
  customerFirstName: string;
  hasEmail: boolean;
  fromStaffName: string;
  fromTime: string;
  toStaffId: string;
  toStaffName: string;
  toTime: string;
  /** Jour affiché, « AAAA-MM-JJ ». */
  date: string;
  startMinute: number;
}

/**
 * Confirmation d'un RDV glissé (D-110, R-95) : rien ne bouge avant elle. Sur une tablette partagée, un doigt qui glisse
 * par erreur ne doit ni déplacer un RDV ni écrire au client ; le prénom de qui déplace est obligatoire (R-74).
 */
export function MoveConfirm({
  move,
  team,
  onClose,
  onDone,
}: {
  move: PendingMove;
  team: TeamMemberView[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sameStaff = move.fromStaffName === move.toStaffName;

  const confirm = () => {
    if (!authorId) return;
    startTransition(async () => {
      setError(null);
      const result = await moveAppointmentByDragAction({
        appointmentId: move.appointmentId,
        staffId: move.toStaffId,
        date: move.date,
        minute: move.startMinute,
        authorId,
      });
      if (!result.ok) return setError(teamMessage(result.error));
      const email = result.held
        ? "l’email attend la confirmation du gérant."
        : move.hasEmail
          ? "le client reçoit un email."
          : "pas d’email sur la fiche : prévenez le client par téléphone.";
      onDone(
        `Rendez-vous de ${move.customerFirstName} déplacé à ${move.toTime}${sameStaff ? "" : ` avec ${move.toStaffName}`} · ${email}`,
      );
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/70 lg:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Confirmer le déplacement"
        className="flex max-h-[88dvh] w-full max-w-[480px] flex-col gap-4 overflow-y-auto border border-line-strong bg-charcoal p-6 animate-panel-in"
      >
        <h2 className="text-[18px] font-light leading-snug">
          Déplacer le rendez-vous de {move.customerFirstName} ?
        </h2>
        <p className="text-[15px] leading-normal text-ivory-soft">
          De {move.fromTime} avec {move.fromStaffName}
          <br />à <span className="text-ivory">{move.toTime}</span>
          {sameStaff ? "" : <> avec <span className="text-ivory">{move.toStaffName}</span></>}
        </p>
        <p className="text-[13px] leading-normal text-stone">
          Appelez d’abord le client. Un email lui confirme le nouveau créneau ; pour un rendez-vous à
          traiter, il attend la confirmation du gérant.
        </p>
        <AuthorPicker team={team} value={authorId} onChange={setAuthorId} label="Qui déplace ?" />
        {error ? (
          <p role="alert" className="border border-brick p-3 text-[13px] leading-normal">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[52px] border border-line-strong text-[11px] uppercase tracking-[0.2em] text-ivory hover:bg-graphite-light"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!authorId || pending}
            onClick={confirm}
            className="h-[52px] bg-ivory text-[11px] font-medium uppercase tracking-[0.2em] text-ink disabled:bg-disabled disabled:text-stone-dark"
          >
            {pending ? "…" : "Déplacer"}
          </button>
        </div>
      </section>
    </div>
  );
}
