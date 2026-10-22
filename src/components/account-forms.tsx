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
import { Field, Note, Problem, cta } from "./client/ui";

// Formulaires de compte (style des maquettes « Lot12- » : champs soulignés). Ils servent sur les pages /connexion et
// /inscription, dans le panneau « Mes rendez-vous » et à l'étape 4 de la réservation.
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
  return <Problem title={state.message} />;
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
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <Field id={`${idPrefix}-email`} label="Email" error={state.fieldErrors?.email}>
        <input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="karim.benali@email.fr"
          defaultValue={state.values?.email}
          {...errorProps(state, "email")}
        />
      </Field>
      <Field id={`${idPrefix}-password`} label="Mot de passe" error={state.fieldErrors?.password}>
        <input
          id={`${idPrefix}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          {...errorProps(state, "password")}
        />
      </Field>
      <Link
        href={forgotHref}
        className="inline-flex min-h-11 items-center self-start text-[13px] text-ivory-soft underline-offset-[3px]"
      >
        Mot de passe oublié ?
      </Link>
      <button type="submit" disabled={pending} className={cta}>
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
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-4">
        <Field id={`${idPrefix}-firstName`} label="Prénom" error={state.fieldErrors?.firstName}>
          <input
            id={`${idPrefix}-firstName`}
            name="firstName"
            type="text"
            autoComplete="given-name"
            defaultValue={v.firstName}
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
          placeholder="8 caractères minimum"
          {...errorProps(state, "password")}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-start gap-3.5 text-[13px] leading-[1.55] text-ivory-soft">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-[#efe9dd]"
            aria-invalid={state.fieldErrors?.acceptTerms ? true : undefined}
            aria-describedby={
              state.fieldErrors?.acceptTerms ? `${idPrefix}-terms-error` : undefined
            }
          />
          <span>
            J&rsquo;accepte les{" "}
            <Link href="/conditions" className="text-ivory underline underline-offset-[3px]">
              conditions d&rsquo;utilisation
            </Link>{" "}
            et la{" "}
            <Link href="/confidentialite" className="text-ivory underline underline-offset-[3px]">
              politique de confidentialité
            </Link>
            .
          </span>
        </label>
        {state.fieldErrors?.acceptTerms ? (
          <span id={`${idPrefix}-terms-error`} role="alert" className="text-[13px] text-brick">
            {state.fieldErrors.acceptTerms}
          </span>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className={cta}>
        {pending ? "Création…" : "Créer mon compte"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { state, formAction, pending } = useAccountForm(forgotPasswordAction);
  if (state.status === "ok") {
    return (
      <Note role="status">
        <span className="text-ivory">Demande envoyée.</span> {state.message}
      </Note>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <Field id="forgot-email" label="Email" error={state.fieldErrors?.email}>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="karim.benali@email.fr"
          defaultValue={state.values?.email}
          {...errorProps(state, "email")}
        />
      </Field>
      <button type="submit" disabled={pending} className={cta}>
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
        <Note role="status">{state.message ?? "Mot de passe modifié"}</Note>
        <Link href="/reservation" className={cta}>
          Réserver
        </Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
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
          placeholder="8 caractères minimum"
          {...errorProps(state, "password")}
        />
      </Field>
      <button type="submit" disabled={pending} className={cta}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
