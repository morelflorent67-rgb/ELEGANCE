"use client";

import { ClockIcon, Field, Problem } from "@/components/client/ui";
import { formatDuration, formatPrice, hoursPhrase, lessThanHours } from "@/lib/format";
import { SALON } from "@/lib/salon";
import { endTime } from "@/lib/slot-view";
import type { CustomerProfile } from "@/modules/customers/accounts";
import type { PickedSlot } from "./date-step";

/**
 * Étape 5 : « Tout est prêt ? ». « Pour qui ? » (R-28, D-80) et la note au salon (R-29, 300 caractères), puis
 * « Confirmer » dans la barre du bas. Paiement sur place uniquement (D-07, D-34, D-98). R-32 : un RDV pris dans le
 * délai de modification ne se modifie pas en ligne, et le client en est averti ici.
 */
export function RecapStep({
  services,
  priceCents,
  durationMin,
  slot,
  staffLabel,
  staffRole,
  editing,
  previousLabel,
  note,
  onNote,
  forName,
  onForName,
  customer,
  cutoffHours,
  changeableOnline,
  problem,
  callSalon,
  onEdit,
}: {
  services: { id: string; name: string; priceCents: number }[];
  priceCents: number;
  durationMin: number;
  slot: PickedSlot;
  staffLabel: string;
  staffRole: string;
  editing: boolean;
  /** Déplacement d'un RDV : le créneau actuel, rappelé au-dessus du nouveau. */
  previousLabel?: string;
  note: string;
  onNote: (note: string) => void;
  forName: string;
  onForName: (name: string) => void;
  customer: CustomerProfile | null;
  cutoffHours: number;
  changeableOnline: boolean;
  problem: string | null;
  /** Le RDV n'est plus modifiable en ligne : la barre propose d'appeler le salon (R-31). */
  callSalon: boolean;
  onEdit: (step: 1 | 2 | 3) => void;
}) {
  const rows: {
    label: string;
    value: string;
    sub: string;
    edit?: { step: 1 | 2 | 3; aria: string };
  }[] = [
    {
      label: "Quand",
      value: slot.dayLabel,
      sub: `${slot.time} – ${endTime(slot.time, durationMin)}`,
      edit: { step: 3, aria: "Modifier la date" },
    },
    {
      label: "Avec",
      value: staffLabel,
      sub: staffRole,
      edit: { step: 2, aria: "Modifier le coiffeur" },
    },
    {
      label: "Soins",
      value: services.map((s) => s.name).join(" + "),
      sub: formatDuration(durationMin),
      ...(editing ? {} : { edit: { step: 1 as const, aria: "Modifier les prestations" } }),
    },
  ];

  return (
    <div className="flex flex-col gap-6 px-6 pb-9 pt-[26px]">
      <h1 className="overflow-hidden font-display text-[40px] leading-[1.05]">
        <span className="s-tl block">Tout est prêt ?</span>
      </h1>

      {previousLabel ? (
        <p
          className="s-up flex flex-col gap-1 text-[13px] text-stone"
          style={{ animationDelay: "160ms" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-dark">
            Avant
          </span>
          <span className="line-through">{previousLabel}</span>
        </p>
      ) : null}

      <dl className="flex flex-col border-t border-[rgb(239_233_221_/_0.12)]">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className="s-up grid min-h-[58px] grid-cols-[74px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[rgb(239_233_221_/_0.12)] py-2.5"
            style={{ animationDelay: `${200 + i * 50}ms` }}
          >
            <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-dark">
              {row.label}
            </dt>
            <dd className="flex flex-col gap-[3px] text-[15px] leading-[1.4]">
              <span>{row.value}</span>
              <span className="text-[12px] tabular-nums text-stone">{row.sub}</span>
            </dd>
            {row.edit ? (
              <button
                type="button"
                onClick={() => onEdit(row.edit!.step)}
                aria-label={row.edit.aria}
                className="min-h-11 pl-2 text-[12px] text-ivory-soft underline underline-offset-[3px]"
              >
                Modifier
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <div
          className="s-up grid min-h-[58px] grid-cols-[74px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[rgb(239_233_221_/_0.12)] py-2.5"
          style={{ animationDelay: "350ms" }}
        >
          <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-dark">
            Total
          </dt>
          <dd className="flex flex-col gap-[3px] text-[15px] leading-[1.4]">
            Sur place
            <span className="text-[12px] text-stone">Carte ou espèces</span>
          </dd>
          <dd className="font-display text-[26px] tabular-nums">{formatPrice(priceCents)}</dd>
        </div>
      </dl>

      {editing ? null : (
        <>
          <div className="s-up" style={{ animationDelay: "380ms" }}>
            <Field
              id="booking-for-name"
              label="Pour qui ?"
              aside="facultatif"
              hint={
                forName.trim()
                  ? `Pour ${forName.trim()} — le rendez-vous reste à votre nom.`
                  : "Pour un fils, un ami… Le rendez-vous reste à votre nom."
              }
            >
              <input
                id="booking-for-name"
                type="text"
                maxLength={40}
                autoComplete="off"
                placeholder="Prénom de la personne"
                value={forName}
                onChange={(event) => onForName(event.target.value)}
                aria-describedby="booking-for-name-hint"
              />
            </Field>
          </div>
          <div className="s-up" style={{ animationDelay: "430ms" }}>
            <Field
              id="booking-note"
              label="Une précision ?"
              aside={
                <span className={note.length >= 280 ? "text-gold" : ""}>{note.length} / 300</span>
              }
            >
              <textarea
                id="booking-note"
                rows={3}
                maxLength={300}
                value={note}
                onChange={(event) => onNote(event.target.value.slice(0, 300))}
                placeholder="Une coupe en photo, une allergie, un retard possible…"
              />
            </Field>
          </div>
        </>
      )}

      <p
        className="s-up flex gap-3 text-[13px] leading-[1.55] text-stone"
        style={{ animationDelay: "480ms" }}
      >
        <ClockIcon />
        <span>
          {changeableOnline
            ? `Modifiable ou annulable en ligne jusqu'à ${hoursPhrase(cutoffHours)} avant le rendez-vous. Paiement sur place.`
            : `Ce rendez-vous est dans ${lessThanHours(cutoffHours)} : pour le modifier ou l'annuler, appelez le salon au ${SALON.phoneDisplay}.`}
        </span>
      </p>
      {customer ? (
        <p className="text-[12px] text-stone-dark">
          Au nom de {customer.firstName} {customer.lastName} · {customer.email}
        </p>
      ) : null}

      {problem ? (
        <Problem title={problem}>
          {callSalon ? "Appelez le salon pour tout changement." : null}
        </Problem>
      ) : null}
    </div>
  );
}
