"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Field, inputClass } from "@/components/ui";
import type { SameCustomer } from "@/modules/customers/salon-customers";
import { teamMessage, type TeamResult } from "../../_lib/messages";
import type { CustomerFormResult } from "../../actions";

// Fiche sans compte (D-76) : prénom, nom et téléphone obligatoires, email facultatif. Le même formulaire sert à la
// création (réservation au salon) et à la correction (fiche client). Les contrôles sont faits par le serveur.

export interface CustomerFields {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export const EMPTY_FIELDS: CustomerFields = { firstName: "", lastName: "", phone: "", email: "" };

const smallChoice =
  "flex h-11 items-center border border-line-strong px-3 text-[11px] uppercase tracking-[0.2em] transition-colors duration-200 hover:bg-graphite-light";

export function CustomerForm({
  idPrefix,
  initial = EMPTY_FIELDS,
  submitLabel,
  extra,
  ready = true,
  onSubmit,
  onDone,
  onPick,
  onCancel,
}: {
  idPrefix: string;
  initial?: CustomerFields;
  submitLabel: string;
  /** Sous les champs : par exemple « Qui corrige ? » pour une correction (R-74). */
  extra?: ReactNode;
  /** Faux tant qu'il manque autre chose que les champs (l'auteur d'une correction). */
  ready?: boolean;
  onSubmit: (
    fields: CustomerFields,
    samePhoneConfirmed: boolean,
  ) => Promise<TeamResult<{ result: CustomerFormResult }>>;
  onDone: (customerId: string, fields: CustomerFields) => void;
  /** Choisir la fiche existante proposée (même email, ou même numéro). */
  onPick?: (existing: SameCustomer) => void;
  onCancel?: () => void;
}) {
  const [fields, setFields] = useState<CustomerFields>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState<SameCustomer | null>(null);
  const [samePhone, setSamePhone] = useState<SameCustomer[] | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof CustomerFields) => (value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    if (key === "phone") setSamePhone(null);
    if (key === "email") setEmailTaken(null);
  };

  const submit = (samePhoneConfirmed: boolean) => {
    setProblem(null);
    startTransition(async () => {
      const response = await onSubmit(fields, samePhoneConfirmed);
      if (!response.ok) {
        setProblem(teamMessage(response.error));
        return;
      }
      const result = response.result;
      if (result.ok) {
        onDone(result.customerId, fields);
      } else if (result.error === "fields") {
        setErrors(result.fieldErrors);
      } else if (result.error === "email_taken") {
        setEmailTaken(result.existing);
      } else {
        setSamePhone(result.existing);
      }
    });
  };

  const input = (key: keyof CustomerFields, label: string, type: string, optional = false) => {
    const id = `${idPrefix}-${key}`;
    return (
      <Field id={id} label={label} optional={optional} error={errors[key] || undefined}>
        <input
          id={id}
          type={type}
          value={fields[key]}
          onChange={(event) => set(key)(event.target.value)}
          autoComplete="off"
          aria-invalid={errors[key] ? true : undefined}
          className={inputClass}
        />
      </Field>
    );
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
      className="flex flex-col gap-3.5"
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {input("firstName", "Prénom", "text")}
        {input("lastName", "Nom", "text")}
      </div>
      {input("phone", "Téléphone", "tel")}
      {input("email", "Email", "email", true)}

      {emailTaken ? (
        <div role="alert" className="flex flex-col gap-2.5 border border-brick p-3 text-[14px]">
          <span>
            Cette adresse est déjà celle de la fiche de {emailTaken.name}
            {emailTaken.hasAccount ? " (avec compte)" : ""}.
          </span>
          {onPick ? (
            <button type="button" onClick={() => onPick(emailTaken)} className={smallChoice}>
              Choisir cette fiche
            </button>
          ) : null}
        </div>
      ) : null}

      {samePhone ? (
        <div
          role="alert"
          className="flex flex-col gap-2.5 border border-line-strong p-3 text-[14px]"
        >
          <span>
            {samePhone.length === 1
              ? "Une fiche a déjà ce numéro"
              : "Des fiches ont déjà ce numéro"}{" "}
            : est-ce la même personne ?
          </span>
          <ul className="flex flex-col gap-2">
            {samePhone.map((other) => (
              <li key={other.id} className="flex items-center justify-between gap-3">
                <span>
                  {other.name}
                  <span className="text-stone">{other.hasAccount ? "" : " · sans compte"}</span>
                </span>
                {onPick ? (
                  <button type="button" onClick={() => onPick(other)} className={smallChoice}>
                    Choisir
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(true)}
            className={`${smallChoice} self-start`}
          >
            Non, créer une nouvelle fiche
          </button>
        </div>
      ) : null}

      {extra}

      {problem ? (
        <p role="alert" className="border border-brick p-3 text-[14px] leading-normal">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="submit"
          disabled={pending || !ready}
          className="h-[52px] flex-1 bg-ivory px-5 text-[12px] font-medium uppercase tracking-[0.22em] text-ink disabled:bg-disabled disabled:text-stone-dark"
        >
          {pending ? "Enregistrement…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-[52px] border border-line-strong px-5 text-[11px] uppercase tracking-[0.2em]"
          >
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}
