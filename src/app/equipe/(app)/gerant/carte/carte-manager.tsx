"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { Field, inputClass } from "@/components/ui";
import { formatDuration, formatPrice } from "@/lib/format";
import { centsToEuroInput, parseEuros } from "@/lib/money";
import type { ManagedService } from "@/modules/catalog/manage";
import { teamMessage } from "../../../_lib/messages";
import {
  createServiceAction,
  moveServiceAction,
  setServiceActiveAction,
  updateServiceAction,
} from "../../../actions";

type Role = "barber" | "apprentice";
interface Member {
  id: string;
  firstName: string;
  role: Role;
}

const ROLE_LABEL: Record<Role, string> = { barber: "Coiffeurs", apprentice: "Apprentis" };

const ghost =
  "flex h-11 items-center justify-center border border-line-strong px-4 text-[12px] hover:bg-graphite-light disabled:text-stone-dark disabled:hover:bg-transparent";
const iconButton =
  "flex h-11 w-11 items-center justify-center border border-line text-ivory-soft hover:bg-graphite-light disabled:text-stone-dark disabled:hover:bg-transparent";

const DURATIONS = Array.from({ length: 32 }, (_, i) => (i + 1) * 15); // R-10 : 15 min à 8 h

interface Draft {
  /** Absent : nouvelle prestation. */
  id?: string;
  name: string;
  category: string;
  price: string;
  durationMin: number;
  performedBy: Role;
  bookableOnline: boolean;
  staffIds: string[];
}

const blankDraft = (team: Member[]): Draft => ({
  name: "",
  category: "",
  price: "",
  durationMin: 30,
  performedBy: "barber",
  bookableOnline: true,
  staffIds: team.filter((m) => m.role === "barber").map((m) => m.id),
});

const draftOf = (s: ManagedService): Draft => ({
  id: s.id,
  name: s.name,
  category: s.category ?? "",
  price: centsToEuroInput(s.priceCents),
  durationMin: s.durationMin,
  performedBy: s.performedBy,
  bookableOnline: s.bookableOnline,
  staffIds: s.staffIds,
});

/** « Carte et tarifs » (R-10 à R-13, R-16, R-17) : ajouter, modifier, retirer, ordonner, habiliter. */
export function CarteManager({ services, team }: { services: ManagedService[]; team: Member[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ManagedService | null>(null);

  const shown = services.filter((s) => s.active);
  const removed = services.filter((s) => !s.active);
  const groups = [...new Set(services.map((s) => s.category).filter(Boolean))] as string[];
  const nameOf = (id: string) => team.find((m) => m.id === id)?.firstName ?? "";

  /** Si le code gérant a expiré, on revient à la saisie du code. */
  const onFailure = (code: Parameters<typeof teamMessage>[0]): string => {
    if (code === "manager_locked") router.push("/equipe/gerant");
    return teamMessage(code);
  };

  const run = (task: () => Promise<{ ok: true } | { ok: false; error: Parameters<typeof teamMessage>[0] }>) => {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) setError(onFailure(result.error));
      else router.refresh();
    });
  };

  const move = (id: string, direction: "up" | "down") =>
    run(() => moveServiceAction({ serviceId: id, direction }));

  const setActive = (id: string, active: boolean) =>
    run(async () => {
      const result = await setServiceActiveAction({ serviceId: id, active });
      setRemoving(null);
      return result;
    });

  const save = () => {
    if (!draft) return;
    const priceCents = parseEuros(draft.price);
    if (priceCents === null) {
      setFormError("Le prix n’est pas valide. Exemple : 18 ou 12,50.");
      return;
    }
    setFormError(null);
    const common = {
      name: draft.name,
      category: draft.category.trim() || null,
      priceCents,
      durationMin: draft.durationMin,
      bookableOnline: draft.bookableOnline,
      staffIds: draft.staffIds,
    };
    startTransition(async () => {
      const result = draft.id
        ? await updateServiceAction({ serviceId: draft.id, ...common })
        : await createServiceAction({ ...common, performedBy: draft.performedBy });
      if (!result.ok) {
        setFormError(onFailure(result.error));
        return;
      }
      setDraft(null);
      router.refresh();
    });
  };

  const candidates = draft ? team.filter((m) => m.role === draft.performedBy) : [];
  const toggleStaff = (id: string) =>
    setDraft((d) =>
      d
        ? { ...d, staffIds: d.staffIds.includes(id) ? d.staffIds.filter((s) => s !== id) : [...d.staffIds, id] }
        : d,
    );

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <p role="alert" className="border border-brick p-4 text-[14px] leading-normal">
          {error}
        </p>
      ) : null}

      <section aria-label="Prestations de la carte" className="flex flex-col">
        <ul className="border-t border-line">
          {shown.map((s, index) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-subtle py-3"
            >
              <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                <span className="text-[16px]">{s.name}</span>
                <span className="text-[12px] text-stone">
                  {s.category ?? "Sans groupe"} · {ROLE_LABEL[s.performedBy]} ·{" "}
                  {s.staffIds.length > 0 ? s.staffIds.map(nameOf).join(", ") : "personne d’habilité"}
                </span>
              </div>
              <span className="w-16 text-[14px] tabular-nums text-ivory-soft">
                {formatDuration(s.durationMin)}
              </span>
              <span className="w-16 text-[15px] tabular-nums">{formatPrice(s.priceCents)}</span>
              <span
                className={`w-20 text-[12px] ${s.bookableOnline ? "text-ivory-soft" : "text-gold"}`}
              >
                {s.bookableOnline ? "En ligne" : "Sur appel"}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Monter ${s.name}`}
                  disabled={pending || index === 0}
                  onClick={() => move(s.id, "up")}
                  className={iconButton}
                >
                  <Arrow up />
                </button>
                <button
                  type="button"
                  aria-label={`Descendre ${s.name}`}
                  disabled={pending || index === shown.length - 1}
                  onClick={() => move(s.id, "down")}
                  className={iconButton}
                >
                  <Arrow />
                </button>
                <button
                  type="button"
                  aria-label={`Modifier ${s.name}`}
                  onClick={() => {
                    setFormError(null);
                    setDraft(draftOf(s));
                  }}
                  className={ghost}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  aria-label={`Retirer ${s.name}`}
                  onClick={() => setRemoving(s)}
                  className={`${ghost} border-line text-brick`}
                >
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setDraft(blankDraft(team));
          }}
          className="mt-4 flex h-[52px] items-center gap-2.5 self-start border border-dashed border-line-strong px-5 text-[12px] uppercase tracking-[0.2em] hover:bg-graphite-light"
        >
          <span aria-hidden="true" className="text-gold">
            +
          </span>
          Ajouter une prestation
        </button>
      </section>

      {removed.length > 0 ? (
        <section aria-label="Prestations retirées" className="flex flex-col gap-2">
          <h2 className="border-b border-line pb-2 text-label uppercase tracking-[0.3em] text-stone">
            Retirées de la carte
          </h2>
          <p className="text-[13px] leading-normal text-stone">
            Ces prestations ne se réservent plus. Elles restent dans l’historique des rendez-vous.
          </p>
          <ul>
            {removed.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-4 border-b border-line-subtle py-3"
              >
                <span className="flex-1 text-[15px] text-stone">{s.name}</span>
                <span className="text-[14px] tabular-nums text-stone">
                  {formatPrice(s.priceCents)}
                </span>
                <button
                  type="button"
                  aria-label={`Remettre ${s.name} dans la carte`}
                  disabled={pending}
                  onClick={() => setActive(s.id, true)}
                  className={ghost}
                >
                  Remettre en carte
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Sheet open={draft !== null} onClose={() => setDraft(null)} titleId="service-title">
        {draft ? (
          <form
            className="flex max-h-[72dvh] flex-col gap-4 overflow-y-auto pr-1"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <h2 id="service-title" className="text-title-3">
              {draft.id ? "Modifier la prestation" : "Ajouter une prestation"}
            </h2>

            <Field id="svc-name" label="Nom">
              <input
                id="svc-name"
                className={inputClass}
                value={draft.name}
                maxLength={80}
                required
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>

            <Field id="svc-group" label="Groupe" optional hint="Ex. Coupes, Barbe et soin, Techniques.">
              <input
                id="svc-group"
                className={inputClass}
                list="svc-groups"
                value={draft.category}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
              <datalist id="svc-groups">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="svc-price" label="Prix (€)">
                <input
                  id="svc-price"
                  className={inputClass}
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft.price}
                  required
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </Field>
              <Field id="svc-duration" label="Durée">
                <select
                  id="svc-duration"
                  className={inputClass}
                  value={draft.durationMin}
                  onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) })}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {formatDuration(d)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-body-sm text-ivory-soft">Réalisée par</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["barber", "apprentice"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={draft.performedBy === role}
                    disabled={draft.id !== undefined}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        performedBy: role,
                        staffIds: team.filter((m) => m.role === role).map((m) => m.id),
                      })
                    }
                    className={`h-12 border text-[14px] ${
                      draft.performedBy === role
                        ? "border-ivory bg-ivory text-ink"
                        : "border-line-strong"
                    } disabled:opacity-70`}
                  >
                    {ROLE_LABEL[role]}
                  </button>
                ))}
              </div>
              {draft.id ? (
                <span className="text-[12px] text-stone">
                  On ne change pas cela après coup. Pour l’autre catégorie, ajoutez une nouvelle
                  prestation.
                </span>
              ) : null}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-body-sm text-ivory-soft">Réservation</legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: true, label: "En ligne" },
                  { value: false, label: "Sur appel" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={draft.bookableOnline === o.value}
                    onClick={() => setDraft({ ...draft, bookableOnline: o.value })}
                    className={`h-12 border text-[14px] ${
                      draft.bookableOnline === o.value
                        ? "border-ivory bg-ivory text-ink"
                        : "border-line-strong"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <span className="text-[12px] text-stone">
                « Sur appel » : la prestation reste affichée avec un bouton d’appel, le salon peut la
                réserver à la tablette.
              </span>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-body-sm text-ivory-soft">Qui la réalise ?</legend>
              <div className="grid grid-cols-2 gap-2">
                {candidates.map((m) => {
                  const on = draft.staffIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleStaff(m.id)}
                      className={`flex h-12 items-center gap-3 border px-4 text-[14px] ${
                        on ? "border-ivory" : "border-line-strong text-ivory-soft"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-4 w-4 items-center justify-center border text-[11px] leading-none ${
                          on ? "border-ivory bg-ivory text-ink" : "border-line-strong"
                        }`}
                      >
                        {on ? "✓" : ""}
                      </span>
                      {m.firstName}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {formError ? (
              <p role="alert" className="border border-brick p-3 text-[14px] leading-normal">
                {formError}
              </p>
            ) : null}

            <div className="sticky bottom-0 grid grid-cols-2 gap-2.5 bg-charcoal pt-2">
              <button type="button" onClick={() => setDraft(null)} className={`${ghost} h-[52px]`}>
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex h-[52px] items-center justify-center bg-ivory px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-ink disabled:bg-disabled disabled:text-stone-dark"
              >
                {pending ? "…" : "Enregistrer"}
              </button>
            </div>
          </form>
        ) : null}
      </Sheet>

      <Sheet open={removing !== null} onClose={() => setRemoving(null)} titleId="remove-title">
        {removing ? (
          <>
            <h2 id="remove-title" className="text-title-3">
              Retirer « {removing.name} » de la carte ?
            </h2>
            <p className="text-body-sm leading-normal text-ivory-soft">
              Elle n’apparaîtra plus à la réservation. Les rendez-vous déjà pris sont conservés, avec
              leur prix. Vous pourrez la remettre en carte à tout moment.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setRemoving(null)} className={`${ghost} h-[52px]`}>
                Retour
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setActive(removing.id, false)}
                className="flex h-[52px] items-center justify-center border border-brick px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-brick"
              >
                {pending ? "…" : "Retirer"}
              </button>
            </div>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}
