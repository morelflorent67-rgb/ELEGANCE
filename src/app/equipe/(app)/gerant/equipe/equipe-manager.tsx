"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { Field, inputClass } from "@/components/ui";
import type { ManagedStaff } from "@/modules/staff/manage";
import { teamMessage, type TeamError } from "../../../_lib/messages";
import {
  createStaffAction,
  moveStaffAction,
  renameStaffAction,
  setStaffActiveAction,
} from "../../../actions";

type Role = "barber" | "apprentice";
const ROLE_LABEL: Record<Role, string> = { barber: "Coiffeur", apprentice: "Apprenti" };

const ghost =
  "flex h-11 items-center justify-center border border-line-strong px-4 text-[12px] hover:bg-graphite-light disabled:text-stone-dark disabled:hover:bg-transparent";
const iconButton =
  "flex h-11 w-11 items-center justify-center border border-line text-ivory-soft hover:bg-graphite-light disabled:text-stone-dark disabled:hover:bg-transparent";

type Dialog =
  | { kind: "add"; firstName: string; role: Role }
  | { kind: "rename"; member: ManagedStaff; firstName: string }
  | { kind: "remove"; member: ManagedStaff };

/** « Équipe et habilitations » (R-02, R-13, D-57) : ajouter, renommer, ordonner, retirer un membre. */
export function EquipeManager({ members }: { members: ManagedStaff[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const active = members.filter((m) => m.active);
  const left = members.filter((m) => !m.active);

  /** Si le code gérant a expiré, on revient à la saisie du code. */
  const onFailure = (code: TeamError): string => {
    if (code === "manager_locked") router.push("/equipe/gerant");
    return teamMessage(code);
  };

  const run = (task: () => Promise<{ ok: true } | { ok: false; error: TeamError }>) => {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) setError(onFailure(result.error));
      else router.refresh();
    });
  };

  /** Pour une feuille : ferme si c'est réussi, sinon affiche le refus dans la feuille. */
  const runInDialog = (task: () => Promise<{ ok: true } | { ok: false; error: TeamError }>) => {
    setDialogError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setDialogError(onFailure(result.error));
        return;
      }
      setDialog(null);
      router.refresh();
    });
  };

  const submit = () => {
    if (!dialog) return;
    if (dialog.kind === "add") {
      runInDialog(() => createStaffAction({ firstName: dialog.firstName, role: dialog.role }));
    } else if (dialog.kind === "rename") {
      runInDialog(() =>
        renameStaffAction({ staffId: dialog.member.id, firstName: dialog.firstName }),
      );
    } else {
      runInDialog(() => setStaffActiveAction({ staffId: dialog.member.id, active: false }));
    }
  };

  const open = (next: Dialog) => {
    setDialogError(null);
    setDialog(next);
  };

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <p role="alert" className="border border-brick p-4 text-[14px] leading-normal">
          {error}
        </p>
      ) : null}

      <section aria-label="Équipe" className="flex flex-col">
        <ul className="border-t border-line">
          {active.map((m, index) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-subtle py-3"
            >
              <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                <span className="text-[17px]">{m.firstName}</span>
                <span className="text-[12px] text-stone">
                  {ROLE_LABEL[m.role]} · {m.serviceCount} prestation
                  {m.serviceCount > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Monter ${m.firstName}`}
                  disabled={pending || index === 0}
                  onClick={() => run(() => moveStaffAction({ staffId: m.id, direction: "up" }))}
                  className={iconButton}
                >
                  <Arrow up />
                </button>
                <button
                  type="button"
                  aria-label={`Descendre ${m.firstName}`}
                  disabled={pending || index === active.length - 1}
                  onClick={() => run(() => moveStaffAction({ staffId: m.id, direction: "down" }))}
                  className={iconButton}
                >
                  <Arrow />
                </button>
                <button
                  type="button"
                  aria-label={`Renommer ${m.firstName}`}
                  onClick={() => open({ kind: "rename", member: m, firstName: m.firstName })}
                  className={ghost}
                >
                  Renommer
                </button>
                <button
                  type="button"
                  aria-label={`Retirer ${m.firstName} de l’équipe`}
                  onClick={() => open({ kind: "remove", member: m })}
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
          onClick={() => open({ kind: "add", firstName: "", role: "barber" })}
          className="mt-4 flex h-[52px] items-center gap-2.5 self-start border border-dashed border-line-strong px-5 text-[12px] uppercase tracking-[0.2em] hover:bg-graphite-light"
        >
          <span aria-hidden="true" className="text-gold">
            +
          </span>
          Ajouter un membre
        </button>
      </section>

      {left.length > 0 ? (
        <section aria-label="Anciens membres" className="flex flex-col gap-2">
          <h2 className="border-b border-line pb-2 text-label uppercase tracking-[0.3em] text-stone">
            Retirés de l’équipe
          </h2>
          <p className="text-[13px] leading-normal text-stone">
            Ils n’ont plus de colonne et ne reçoivent plus de réservation. Leurs rendez-vous passés
            restent dans l’historique.
          </p>
          <ul>
            {left.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-4 border-b border-line-subtle py-3"
              >
                <span className="flex-1 text-[15px] text-stone">
                  {m.firstName} · {ROLE_LABEL[m.role]}
                </span>
                <button
                  type="button"
                  aria-label={`Remettre ${m.firstName} dans l’équipe`}
                  disabled={pending}
                  onClick={() => run(() => setStaffActiveAction({ staffId: m.id, active: true }))}
                  className={ghost}
                >
                  Remettre dans l’équipe
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Sheet open={dialog !== null} onClose={() => setDialog(null)} titleId="team-title">
        {dialog ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <h2 id="team-title" className="text-title-3">
              {dialog.kind === "add"
                ? "Ajouter un membre"
                : dialog.kind === "rename"
                  ? `Renommer ${dialog.member.firstName}`
                  : `Retirer ${dialog.member.firstName} de l’équipe ?`}
            </h2>

            {dialog.kind === "remove" ? (
              <p className="text-body-sm leading-normal text-ivory-soft">
                Il n’apparaîtra plus au planning ni à la réservation. Ses rendez-vous à venir restent
                en place : il faudra les confier à un collègue, les déplacer ou les annuler. Vous
                pourrez le remettre dans l’équipe à tout moment.
              </p>
            ) : (
              <>
                <Field id="team-name" label="Prénom">
                  <input
                    id="team-name"
                    className={inputClass}
                    value={dialog.firstName}
                    maxLength={40}
                    required
                    autoComplete="off"
                    onChange={(e) => setDialog({ ...dialog, firstName: e.target.value })}
                  />
                </Field>
                {dialog.kind === "add" ? (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="pb-2 text-body-sm text-ivory-soft">Rôle</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {(["barber", "apprentice"] as const).map((role) => (
                        <button
                          key={role}
                          type="button"
                          aria-pressed={dialog.role === role}
                          onClick={() => setDialog({ ...dialog, role })}
                          className={`h-12 border text-[14px] ${
                            dialog.role === role
                              ? "border-ivory bg-ivory text-ink"
                              : "border-line-strong"
                          }`}
                        >
                          {ROLE_LABEL[role]}
                        </button>
                      ))}
                    </div>
                    <span className="text-[12px] leading-normal text-stone">
                      Il réalisera d’office toutes les prestations de la carte de son rôle ; vous
                      pourrez ajuster dans « Carte et tarifs ». Le rôle ne change pas ensuite.
                    </span>
                  </fieldset>
                ) : null}
              </>
            )}

            {dialogError ? (
              <p role="alert" className="border border-brick p-3 text-[14px] leading-normal">
                {dialogError}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setDialog(null)} className={`${ghost} h-[52px]`}>
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending}
                className={
                  dialog.kind === "remove"
                    ? "flex h-[52px] items-center justify-center border border-brick px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-brick"
                    : "flex h-[52px] items-center justify-center bg-ivory px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-ink disabled:bg-disabled disabled:text-stone-dark"
                }
              >
                {pending ? "…" : dialog.kind === "remove" ? "Retirer" : "Enregistrer"}
              </button>
            </div>
          </form>
        ) : null}
      </Sheet>
    </div>
  );
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}
