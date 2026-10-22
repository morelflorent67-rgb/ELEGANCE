"use client";

import { useActionState, useState, useTransition } from "react";
import { idleState, type FormState } from "@/app/_actions/form-state";
import Link from "next/link";
import { ClientSheet } from "@/components/client/sheet";
import { ArrowRight, Field, Note, PhoneIcon, Problem, cta, ghost } from "@/components/client/ui";
import { SALON } from "@/lib/salon";
import { formatPhone, normalizePhone } from "@/lib/phone";
import type { CustomerProfile } from "@/modules/customers/accounts";
import {
  changePasswordAction,
  deleteAccountAction,
  signOutAction,
  updateProfileAction,
} from "../actions";

const errorProps = (state: FormState, name: string) => ({
  "aria-invalid": state.fieldErrors?.[name] ? true : undefined,
  "aria-describedby": state.fieldErrors?.[name] ? `${name}-error` : undefined,
});

const rowLink =
  "flex min-h-14 w-full items-center justify-between border-t border-[rgb(239_233_221_/_0.12)] text-[14px]";

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-dark">
      {children}
    </h2>
  );
}

/** Coordonnées (R-70). Le mot de passe actuel n'apparaît que si l'email change. */
export function ProfileForm({ customer }: { customer: CustomerProfile }) {
  const [state, setState] = useState<FormState>(idleState);
  const [pending, start] = useTransition();
  const saved = state.customer ?? customer;
  const [values, setValues] = useState({
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: formatPhone(customer.phone),
    email: customer.email,
  });

  const set = (name: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [name]: event.target.value }));

  const emailChanged = values.email.trim().toLowerCase() !== saved.email.toLowerCase();
  // Le téléphone enregistré est normalisé (+33…) : on compare à la saisie normalisée.
  const dirty =
    values.firstName !== saved.firstName ||
    values.lastName !== saved.lastName ||
    normalizePhone(values.phone) !== saved.phone ||
    emailChanged;

  return (
    <section className="flex flex-col gap-5">
      <SectionTitle>Coordonnées</SectionTitle>
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          start(async () => {
            const next = await updateProfileAction(state, data);
            setState(next);
            if (next.status === "ok" && next.customer) {
              setValues({
                firstName: next.customer.firstName,
                lastName: next.customer.lastName,
                phone: formatPhone(next.customer.phone),
                email: next.customer.email,
              });
            }
          });
        }}
      >
        {state.status === "error" && state.message ? <Problem title={state.message} /> : null}
        <div className="grid grid-cols-2 gap-4">
          <Field id="info-firstName" label="Prénom" error={state.fieldErrors?.firstName}>
            <input
              id="info-firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              value={values.firstName}
              onChange={set("firstName")}
              {...errorProps(state, "firstName")}
            />
          </Field>
          <Field id="info-lastName" label="Nom" error={state.fieldErrors?.lastName}>
            <input
              id="info-lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              value={values.lastName}
              onChange={set("lastName")}
              {...errorProps(state, "lastName")}
            />
          </Field>
        </div>
        <Field id="info-phone" label="Téléphone" error={state.fieldErrors?.phone}>
          <input
            id="info-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={set("phone")}
            {...errorProps(state, "phone")}
          />
        </Field>
        <Field id="info-email" label="Email" error={state.fieldErrors?.email}>
          <input
            id="info-email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={set("email")}
            {...errorProps(state, "email")}
          />
        </Field>
        {emailChanged ? (
          <Field
            id="info-currentPassword"
            label="Mot de passe actuel"
            hint="Pour changer d'email, confirmez votre mot de passe."
            error={state.fieldErrors?.currentPassword}
          >
            <input
              id="info-currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              {...errorProps(state, "currentPassword")}
            />
          </Field>
        ) : null}
        <button type="submit" disabled={!dirty || pending} className={cta}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {state.status === "ok" && !dirty ? (
          <div
            role="status"
            className="flex animate-step-in items-center gap-3 border border-[rgb(239_233_221_/_0.28)] px-4 py-3.5"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-sage)"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <span className="text-[14px]">{state.message}</span>
          </div>
        ) : null}
      </form>
    </section>
  );
}

/** Changement de mot de passe : l'ancien est exigé. */
export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, idleState);
  return (
    <section className="flex flex-col gap-5 border-t border-[rgb(239_233_221_/_0.12)] pt-7">
      <SectionTitle>Mot de passe</SectionTitle>
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        {state.status === "error" && state.message ? <Problem title={state.message} /> : null}
        <Field
          id="currentPassword"
          label="Mot de passe actuel"
          error={state.fieldErrors?.currentPassword}
        >
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            {...errorProps(state, "currentPassword")}
          />
        </Field>
        <Field
          id="newPassword"
          label="Nouveau mot de passe"
          hint="8 caractères minimum."
          error={state.fieldErrors?.newPassword}
        >
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            {...errorProps(state, "newPassword")}
          />
        </Field>
        <button type="submit" disabled={pending} className={ghost}>
          {pending ? "Enregistrement…" : "Changer le mot de passe"}
        </button>
        {state.status === "ok" ? (
          <div
            role="status"
            className="flex animate-step-in items-center gap-3 border border-[rgb(239_233_221_/_0.28)] px-4 py-3.5"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-sage)"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <span className="text-[14px]">{state.message}</span>
          </div>
        ) : null}
      </form>
    </section>
  );
}

/** Déconnexion et suppression du compte (R-75). */
export function AccountActions({ imminentAppointment }: { imminentAppointment: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteAccountAction, idleState);

  return (
    <section className="flex flex-col gap-3.5 pt-2">
      <div className="flex flex-col border-b border-[rgb(239_233_221_/_0.12)]">
        <Link href="/conditions" className={rowLink}>
          Conditions et confidentialité
          <ArrowRight size={16} color="#c9c3b7" />
        </Link>
        <form action={signOutAction}>
          <button type="submit" className={rowLink}>
            Se déconnecter
          </button>
        </form>
      </div>
      <div className="flex flex-col gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center self-start text-[13px] text-stone-dark underline underline-offset-[3px]"
        >
          Supprimer mon compte
        </button>
        <span className="text-[12px] leading-normal text-stone-dark">
          Vos coordonnées seront effacées et vos rendez-vous à venir annulés.
        </span>
      </div>

      <ClientSheet
        open={open}
        onClose={() => setOpen(false)}
        titleId="delete-title"
        role="alertdialog"
      >
        <h2 id="delete-title" className="font-display text-[34px] leading-[1.08]">
          Supprimer votre compte ?
        </h2>
        {imminentAppointment ? (
          <>
            <Note>
              <span className="text-ivory">Votre prochain rendez-vous est trop proche.</span> Pour
              le modifier, l&rsquo;annuler ou supprimer votre compte, appelez le salon.
            </Note>
            <a href={SALON.phoneHref} className={cta}>
              <PhoneIcon color="#0b0a09" />
              Appeler le salon
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-12 text-[13px] text-ivory-soft"
            >
              Garder mon compte
            </button>
          </>
        ) : (
          <form action={formAction} className="flex flex-col gap-5" noValidate>
            <p className="text-[14px] leading-[1.6] text-ivory-soft">
              Vos coordonnées sont effacées et vos rendez-vous à venir sont annulés. Vos rendez-vous
              passés sont conservés sans votre nom. Cette action est définitive.
            </p>
            {state.status === "error" && state.message ? <Problem title={state.message} /> : null}
            <Field
              id="delete-password"
              label="Confirmez avec votre mot de passe"
              error={state.fieldErrors?.password}
            >
              <input
                id="delete-password"
                name="password"
                type="password"
                autoComplete="current-password"
                {...errorProps(state, "password")}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <button type="submit" disabled={pending} className={cta}>
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-12 text-[13px] text-ivory-soft"
              >
                Garder mon compte
              </button>
            </div>
          </form>
        )}
      </ClientSheet>
    </section>
  );
}
