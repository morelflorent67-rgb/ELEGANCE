"use client";

import { useActionState, useState, useTransition } from "react";
import { idleState, type FormState } from "@/app/_actions/form-state";
import { Sheet } from "@/components/sheet";
import { Alert, CallButton, Field, btnPrimary, btnSecondary, inputClass } from "@/components/ui";
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

const btnDanger =
  "flex h-[52px] w-full items-center justify-center border border-brick px-6 text-button-sm uppercase text-brick transition-colors duration-200 hover:bg-graphite-light disabled:opacity-60";

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <svg width="12" height="11" viewBox="0 0 12 11" fill="none" aria-hidden="true">
        <path d="M3 .5H9L11.5 5.5L9 10.5H3L.5 5.5Z" stroke="var(--color-gold)" strokeWidth="1" />
      </svg>
      <h2 className="text-label font-normal uppercase text-stone">{children}</h2>
    </div>
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
    <section className="flex flex-col gap-[18px]">
      <SectionTitle>Coordonnées</SectionTitle>
      <form
        className="flex flex-col gap-[18px]"
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
        {state.status === "error" && state.message ? (
          <Alert kind="error" title={state.message} />
        ) : null}
        <div className="grid grid-cols-2 gap-2.5">
          <Field id="info-firstName" label="Prénom" error={state.fieldErrors?.firstName}>
            <input
              id="info-firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              value={values.firstName}
              onChange={set("firstName")}
              className={inputClass}
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
              className={inputClass}
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
            className={inputClass}
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
            className={inputClass}
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
              className={inputClass}
              {...errorProps(state, "currentPassword")}
            />
          </Field>
        ) : null}
        <button type="submit" disabled={!dirty || pending} className={btnPrimary}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {state.status === "ok" && !dirty ? (
          <div
            role="status"
            className="flex animate-step-in items-center gap-3 border border-line-strong px-4 py-3.5"
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
            <span className="text-body-sm">{state.message}</span>
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
    <section className="flex flex-col gap-[18px] border-t border-line-subtle pt-8">
      <SectionTitle>Mot de passe</SectionTitle>
      <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
        {state.status === "error" && state.message ? (
          <Alert kind="error" title={state.message} />
        ) : null}
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
            className={inputClass}
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
            className={inputClass}
            {...errorProps(state, "newPassword")}
          />
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="flex h-[52px] w-full items-center justify-center border border-line-strong px-6 text-button-sm uppercase text-ivory transition-colors duration-200 hover:bg-graphite-light disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Changer le mot de passe"}
        </button>
        {state.status === "ok" ? (
          <div
            role="status"
            className="flex animate-step-in items-center gap-3 border border-line-strong px-4 py-3.5"
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
            <span className="text-body-sm">{state.message}</span>
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
    <section className="flex flex-col gap-3.5 border-t border-line-subtle pt-8">
      <form action={signOutAction}>
        <button
          type="submit"
          className="flex min-h-[52px] w-full items-center justify-between border-b border-line-subtle text-[16px]"
        >
          Se déconnecter
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </form>
      <div className="flex flex-col gap-2.5 pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center self-start text-[15px] text-brick underline underline-offset-4"
        >
          Supprimer mon compte
        </button>
        <span className="text-body-sm leading-normal text-stone">
          Vos coordonnées seront effacées et vos rendez-vous à venir annulés.
        </span>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} titleId="delete-title">
        <h2 id="delete-title" className="text-title-2">
          Supprimer votre compte ?
        </h2>
        {imminentAppointment ? (
          <>
            <Alert kind="info" title="Vous avez un rendez-vous dans moins de 48 h">
              Pour le modifier, l&rsquo;annuler ou supprimer votre compte, appelez le salon.
            </Alert>
            <CallButton kind="primary" />
            <button type="button" onClick={() => setOpen(false)} className={btnSecondary}>
              Garder mon compte
            </button>
          </>
        ) : (
          <form action={formAction} className="flex flex-col gap-5" noValidate>
            <p className="text-body-sm leading-normal text-ivory-soft">
              Vos coordonnées sont effacées et vos rendez-vous à venir sont annulés. Vos rendez-vous
              passés sont conservés sans votre nom. Cette action est définitive.
            </p>
            {state.status === "error" && state.message ? (
              <Alert kind="error" title={state.message} />
            ) : null}
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
                className={inputClass}
                {...errorProps(state, "password")}
              />
            </Field>
            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={() => setOpen(false)} className={btnPrimary}>
                Garder mon compte
              </button>
              <button type="submit" disabled={pending} className={btnDanger}>
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </section>
  );
}
