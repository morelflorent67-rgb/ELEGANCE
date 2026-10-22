"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ClientSheet } from "@/components/client/sheet";
import { CheckBox, Problem, cta, ghost } from "@/components/client/ui";
import { joinWaitlistAction } from "../../attente/actions";
import type { DayView } from "../actions";

const WINDOWS = [
  { value: "morning", label: "Le matin", hint: "avant midi" },
  { value: "afternoon", label: "L'après-midi", hint: "à partir de midi" },
  { value: "day", label: "Toute la journée", hint: "dès qu'une place se libère" },
] as const;

type WindowValue = (typeof WINDOWS)[number]["value"];

const MESSAGES: Record<string, string> = {
  slots_available: "Une place est déjà libre sur l'un de ces jours : réservez-la directement.",
  waitlist_full: "Vous êtes déjà inscrit sur 5 listes d'attente. Retirez-en une dans Mes rendez-vous.",
  customer_blocked: "La réservation en ligne est indisponible. Appelez le salon.",
  rate_limited: "Trop d'essais. Réessayez dans quelques minutes.",
  invalid_waitlist: "Ces jours ne sont plus réservables. Choisissez-en d'autres.",
};

/**
 * « Me prévenir si une place se libère » (R-80, maquette « Lot12-Attente ») : le client choisit un ou plusieurs jours
 * complets et une plage ; quand une place qui lui convient se libère, elle lui est gardée quelques minutes. Les jours
 * viennent de la bande de la réservation ; le serveur revérifie tout (une place libre refuse l'inscription).
 */
export function WaitlistSheet({
  open,
  onClose,
  days,
  initialDate,
  serviceIds,
  staffId,
  staffLabel,
  signedIn,
}: {
  open: boolean;
  onClose: () => void;
  /** Les jours de la bande ; seuls les jours « complets » se choisissent. */
  days: DayView[];
  initialDate: string;
  serviceIds: string[];
  staffId: string;
  staffLabel: string;
  signedIn: boolean;
}) {
  const fullDays = days.filter((d) => d.state === "full");
  const [picked, setPicked] = useState<string[]>([initialDate]);
  const [window, setWindow] = useState<WindowValue>("day");
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (date: string) =>
    setPicked((current) =>
      current.includes(date) ? current.filter((d) => d !== date) : [...current, date].slice(-14),
    );

  const submit = () => {
    setProblem(null);
    startTransition(async () => {
      const result = await joinWaitlistAction({ serviceIds, staffId, days: picked, window });
      if (result.ok) setDone(result.days);
      else if (result.error === "not_signed_in") setProblem("signin");
      else setProblem(MESSAGES[result.error] ?? "Impossible de vous inscrire pour le moment. Réessayez.");
    });
  };

  const close = () => {
    onClose();
    // La feuille se referme avant de se remettre à zéro.
    setTimeout(() => {
      setDone(null);
      setProblem(null);
    }, 300);
  };

  return (
    <ClientSheet open={open} onClose={close} titleId="waitlist-title">
      {done !== null ? (
        <>
          <h2 id="waitlist-title" className="font-display text-[30px] leading-[1.1]">
            Vous êtes sur la liste.
          </h2>
          <p className="text-[14px] leading-[1.6] text-stone">
            Dès qu&rsquo;une place se libère {done > 1 ? "l'un de ces jours" : "ce jour-là"}, nous
            vous écrivons : elle vous est gardée quelques minutes. Vous retrouvez et retirez votre
            inscription dans Mes rendez-vous.
          </p>
          <button type="button" onClick={close} className={cta}>
            Compris
          </button>
        </>
      ) : (
        <>
          <h2 id="waitlist-title" className="font-display text-[30px] leading-[1.1]">
            Me prévenir si une place se libère
          </h2>
          <p className="text-[14px] leading-[1.6] text-stone">
            {staffId === "any" ? "Sans préférence de coiffeur" : `Avec ${staffLabel}`}. Le premier
            inscrit reçoit la place, gardée quelques minutes.
          </p>

          <fieldset className="flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone">
              Quels jours ?
            </legend>
            <div className="flex max-h-[168px] flex-col overflow-y-auto">
              {fullDays.map((d) => {
                const on = picked.includes(d.date);
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(d.date)}
                    className="flex min-h-11 items-center gap-3 border-b border-[rgb(239_233_221_/_0.12)] text-left text-[14px]"
                  >
                    <CheckBox checked={on} />
                    {d.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone">
              À quel moment ?
            </legend>
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                type="button"
                role="radio"
                aria-checked={window === w.value}
                onClick={() => setWindow(w.value)}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-[rgb(239_233_221_/_0.12)] text-left text-[14px]"
              >
                <span>{w.label}</span>
                <span className="text-[12px] text-stone-dark">
                  {window === w.value ? "✓ " : ""}
                  {w.hint}
                </span>
              </button>
            ))}
          </fieldset>

          {problem === "signin" ? (
            <Problem title="Connectez-vous pour vous inscrire">
              La liste d&rsquo;attente est liée à votre compte.{" "}
              <Link href="/connexion?next=/reservation" className="underline underline-offset-[3px]">
                Se connecter ou créer un compte
              </Link>
            </Problem>
          ) : problem ? (
            <Problem title={problem} />
          ) : null}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending || picked.length === 0 || !signedIn}
              className={cta}
            >
              {pending ? "Un instant…" : "Me prévenir"}
            </button>
            {!signedIn ? (
              <Link href="/connexion?next=/reservation" className={ghost}>
                Me connecter pour m&rsquo;inscrire
              </Link>
            ) : (
              <button type="button" onClick={close} className={ghost}>
                Annuler
              </button>
            )}
          </div>
        </>
      )}
    </ClientSheet>
  );
}
