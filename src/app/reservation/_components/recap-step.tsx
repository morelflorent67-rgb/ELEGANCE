"use client";

import { Alert, CallButton, btnPrimary } from "@/components/ui";
import { capitalize, formatDuration, formatPrice, hoursPhrase, lessThanHours } from "@/lib/format";
import { SALON, salonAddressLine } from "@/lib/salon";
import type { PickedSlot } from "./date-step";

/**
 * Étape 5 : récapitulatif et confirmation. Paiement sur place uniquement (D-07, D-34).
 * R-32 : un RDV pris dans le délai de modification ne se modifie pas en ligne, et le client en est averti ici.
 */
export function RecapStep({
  services,
  priceCents,
  durationMin,
  slot,
  staffLabel,
  note,
  cutoffHours,
  changeableOnline,
  submitting,
  problem,
  onConfirm,
  previousLabel,
  confirmLabel = "Confirmer",
  callSalon = false,
}: {
  services: { id: string; name: string; priceCents: number }[];
  priceCents: number;
  durationMin: number;
  slot: PickedSlot;
  staffLabel: string;
  note: string;
  cutoffHours: number;
  changeableOnline: boolean;
  submitting: boolean;
  problem: string | null;
  onConfirm: () => void;
  /** Déplacement d'un RDV : le créneau actuel, rappelé au-dessus du nouveau. */
  previousLabel?: string;
  confirmLabel?: string;
  /** Le RDV n'est plus modifiable en ligne : au lieu de confirmer, on propose d'appeler le salon (R-31). */
  callSalon?: boolean;
}) {
  return (
    <>
      {previousLabel ? (
        <div className="flex flex-col gap-1">
          <span className="text-label uppercase text-stone">Avant</span>
          <span className="text-[15px] text-stone line-through">{previousLabel}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase text-gold">{capitalize(slot.dayLabel)}</span>
        <span className="text-[32px] font-light tabular-nums">{slot.time}</span>
      </div>

      <ul className="flex flex-col border-t border-line">
        {services.map((service) => (
          <li
            key={service.id}
            className="flex min-h-12 items-center justify-between gap-3 border-b border-line text-[15px]"
          >
            <span>{service.name}</span>
            <span>{formatPrice(service.priceCents)}</span>
          </li>
        ))}
        <li className="flex min-h-12 items-center justify-between gap-3 text-[15px]">
          <span className="text-stone">Total · {formatDuration(durationMin)}</span>
          <span className="text-[17px]">{formatPrice(priceCents)}</span>
        </li>
      </ul>

      <div className="flex items-center gap-3 text-body-sm text-ivory-soft">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <rect x="2.5" y="5.5" width="19" height="13" />
          <path d="M2.5 10h19" />
        </svg>
        Paiement sur place.
      </div>

      <div className="flex flex-col gap-1.5 text-body-sm text-ivory-soft">
        <span>{staffLabel}</span>
        <span>{salonAddressLine}</span>
        {note.trim() ? <span className="text-stone">Note : {note.trim()}</span> : null}
      </div>

      <div role="status" className="flex gap-3 border border-line-strong p-3.5">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          className="shrink-0"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span className="text-body-sm leading-normal text-ivory-soft">
          {changeableOnline
            ? `Modifiable ou annulable jusqu'à ${hoursPhrase(cutoffHours)} avant. Ensuite, appelez le salon.`
            : `Ce rendez-vous est dans ${lessThanHours(cutoffHours)} : pour le modifier ou l'annuler, appelez le salon au ${SALON.phoneDisplay}.`}
        </span>
      </div>

      {problem ? <Alert kind="error" title={problem} /> : null}

      {callSalon ? (
        <CallButton kind="primary" />
      ) : (
        <button type="button" disabled={submitting} onClick={onConfirm} className={btnPrimary}>
          {submitting ? "Confirmation…" : confirmLabel}
        </button>
      )}
    </>
  );
}
