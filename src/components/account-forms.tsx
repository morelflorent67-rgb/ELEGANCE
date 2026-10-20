"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
  signUpAction,
} from "@/app/_actions/account";
import { idleState, type FormState } from "@/app/_actions/form-state";
import { Alert, Field, btnPrimary, inputClass } from "./ui";

// Formulaires de compte. Ils servent sur les pages /connexion et /inscription et dans l'étape 4 de la réservation.
// `onSuccess` reçoit la fiche du client : la page décide où aller, l'étape 4 reste sur place.

type Success = Required<Pick<FormState, "customer" | "booking">>;

function useAccountForm(
  action: (previous: FormState, formData: FormData) => Promise<FormState>,
  onSuccess?: (result: Success) => void,
) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const handled = useRef<FormState | null>(null);
  useEffect(() => {
    if (state.status === "ok" && state.customer && state.booking && handled.current !== state) {
      handled.current = state;
      onSuccess?.({ customer: state.customer, booking: state.booking });
    }
  }, [state, onSuccess]);
  return { state, formAction, pending };
}

function FormMessage({ state }: { state: FormState }) {
  if (state.status !== "error" || !state.message) return null;
  return <Alert kind="error" title={state.message} />;
}

const errorProps = (state: FormState, name: string) => ({
  "aria-invalid": state.fieldErrors?.[name] ? true : undefined,
  "aria-describedby": state.fieldErrors?.[name] ? `${name}-error` : undefined,
});

export function LoginForm({
  idPrefix = "login",
  onSuccess,
  forgotHref = "/mot-de-passe-oublie",
}: {
  idPrefix?: string;
  onSuccess?: (result: Success) => void;
  forgotHref?: string;
}) {
  const { state, formAction, pending } = useAccountForm(loginAction, onSuccess);
  return (
    <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <Field id={`${idPrefix}-email`} label="Email" error={state.fieldErrors?.email}>
        <input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="vous@exemple.fr"
          defaultValue={state.values?.email}
          className={inputClass}
          {...errorProps(state, "email")}
        />
      </Field>
      <Field id={`${idPrefix}-password`} label="Mot de passe" error={state.fieldErrors?.password}>
        <input
          id={`${idPrefix}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          {...errorProps(state, "password")}
        />
      </Field>
      <Link
        href={forgotHref}
        className="inline-flex min-h-11 items-center self-start text-body-sm text-ivory-soft"
      >
        Mot de passe oublié ?
      </Link>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

export function SignUpForm({
  idPrefix = "signup",
  onSuccess,
}: {
  idPrefix?: string;
  onSuccess?: (result: Success) => void;
}) {
  const { state, formAction, pending } = useAccountForm(signUpAction, onSuccess);
  const v = state.values ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-2.5">
        <Field id={`${idPrefix}-firstName`} label="Prénom" error={state.fieldErrors?.firstName}>
          <input
            id={`${idPrefix}-firstName`}
            name="firstName"
            type="text"
            autoComplete="given-name"
            defaultValue={v.firstName}
            className={inputClass}
            {...errorProps(state, "firstName")}
          />
        </Field>
        <Field id={`${idPrefix}-lastName`} label="Nom" error={state.fieldErrors?.lastName}>
          <input
            id={`${idPrefix}-lastName`}
            name="lastName"
            type="text"
            autoComplete="family-name"
            defaultValue={v.lastName}
            className={inputClass}
            {...errorProps(state, "lastName")}
          />
        </Field>
      </div>
      <Field
        id={`${idPrefix}-phone`}
        label="Téléphone"
        hint="Pour que le salon puisse vous joindre au sujet d'un rendez-vous."
        error={state.fieldErrors?.phone}
      >
        <input
          id={`${idPrefix}-phone`}
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={v.phone}
          className={inputClass}
          {...errorProps(state, "phone")}
        />
      </Field>
      <Field id={`${idPrefix}-email`} label="Email" error={state.fieldErrors?.email}>
        <input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={v.email}
          className={inputClass}
          {...errorProps(state, "email")}
        />
      </Field>
      <Field
        id={`${idPrefix}-password`}
        label="Mot de passe"
        hint="8 caractères minimum."
        error={state.fieldErrors?.password}
      >
        <input
          id={`${idPrefix}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          {...errorProps(state, "password")}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-start gap-3.5 text-body-sm text-ivory-soft">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-ivory"
            aria-invalid={state.fieldErrors?.acceptTerms ? true : undefined}
            aria-describedby={
              state.fieldErrors?.acceptTerms ? `${idPrefix}-terms-error` : undefined
            }
          />
          <span>
            J&rsquo;accepte les{" "}
            <Link href="/conditions" className="text-ivory underline underline-offset-4">
              conditions d&rsquo;utilisation
            </Link>{" "}
            et la{" "}
            <Link href="/confidentialite" className="text-ivory underline underline-offset-4">
              politique de confidentialité
            </Link>
            .
          </span>
        </label>
        {state.fieldErrors?.acceptTerms ? (
          <span id={`${idPrefix}-terms-error`} role="alert" className="text-body-sm text-brick">
            {state.fieldErrors.acceptTerms}
          </span>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Création…" : "Créer mon compte"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { state, formAction, pending } = useAccountForm(forgotPasswordAction);
  if (state.status === "ok") {
    return (
      <Alert kind="info" title="Demande envoyée">
        {state.message}
      </Alert>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <Field id="forgot-email" label="Email" error={state.fieldErrors?.email}>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="vous@exemple.fr"
          defaultValue={state.values?.email}
          className={inputClass}
          {...errorProps(state, "email")}
        />
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Envoi…" : "Recevoir le lien"}
      </button>
    </form>
  );
}

export function ResetPasswordForm() {
  const { state, formAction, pending } = useAccountForm(resetPasswordAction);
  if (state.status === "ok") {
    return (
      <div className="flex flex-col gap-5">
        <Alert kind="info" title={state.message ?? "Mot de passe modifié"} />
        <Link href="/reservation" className={btnPrimary}>
          Réserver
        </Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <Field
        id="new-password"
        label="Nouveau mot de passe"
        hint="8 caractères minimum."
        error={state.fieldErrors?.password}
      >
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          {...errorProps(state, "password")}
        />
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
