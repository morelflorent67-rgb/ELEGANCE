"use client";

import { useActionState } from "react";
import { idleState } from "@/app/_actions/form-state";
import { Alert, Field, btnPrimary, inputClass } from "@/components/ui";
import { loginStaffAction } from "../actions";

export function StaffLoginForm() {
  const [state, formAction, pending] = useActionState(loginStaffAction, idleState);
  return (
    <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
      {state.status === "error" && state.message ? (
        <Alert kind="error" title={state.message} />
      ) : null}
      <Field id="staff-email" label="Email" error={state.fieldErrors?.email}>
        <input
          id="staff-email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.values?.email}
          className={inputClass}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={state.fieldErrors?.email ? "staff-email-error" : undefined}
        />
      </Field>
      <Field id="staff-password" label="Mot de passe" error={state.fieldErrors?.password}>
        <input
          id="staff-password"
          name="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          aria-describedby={state.fieldErrors?.password ? "staff-password-error" : undefined}
        />
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Connexion…" : "Ouvrir la tablette"}
      </button>
    </form>
  );
}
