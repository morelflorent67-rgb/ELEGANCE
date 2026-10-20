"use server";

import { db } from "@/db/client";
import type { FormState } from "./form-state";
import { siteUrl } from "@/lib/env";
import { callerIp } from "@/lib/request-ip";
import { getAuthDriver } from "@/modules/auth";
import {
  customerBookingState,
  loginCustomer,
  registerCustomer,
  requestPasswordReset,
  setNewPassword,
  type AccountResult,
  type CustomerProfile,
} from "@/modules/customers/accounts";

// Actions des formulaires de compte. Toute la logique et tous les contrôles sont dans le module `customers` :
// ici, on traduit seulement les formulaires et les refus en messages pour le client.

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

const wait = (seconds: number) =>
  seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} secondes`;

function failure(
  result: Extract<AccountResult, { ok: false }>,
  values: Record<string, string>,
): FormState {
  switch (result.error) {
    case "invalid":
      return { status: "error", fieldErrors: result.fieldErrors, values };
    case "email_taken":
      return {
        status: "error",
        values,
        message: "Un compte existe déjà avec cette adresse email. Connectez-vous.",
      };
    case "invalid_credentials":
      return { status: "error", values, message: "Email ou mot de passe incorrect." };
    case "rate_limited":
      return {
        status: "error",
        values,
        message: `Trop d'essais. Réessayez dans ${wait(result.retryAfterSeconds)}.`,
      };
    default:
      return {
        status: "error",
        values,
        message: "Une erreur est survenue. Réessayez, ou appelez le salon.",
      };
  }
}

async function success(customer: CustomerProfile): Promise<FormState> {
  return { status: "ok", customer, booking: await customerBookingState(db(), customer.id) };
}

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  };
  const result = await registerCustomer(
    db(),
    getAuthDriver(),
    {
      ...values,
      password: text(formData, "password"),
      acceptTerms: formData.get("acceptTerms") === "on",
    },
    { ip: await callerIp() },
  );
  return result.ok ? success(result.customer) : failure(result, values);
}

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { email: text(formData, "email") };
  const result = await loginCustomer(
    db(),
    getAuthDriver(),
    { ...values, password: text(formData, "password") },
    { ip: await callerIp() },
  );
  return result.ok ? success(result.customer) : failure(result, values);
}

export async function logoutAction(): Promise<void> {
  await getAuthDriver().signOut();
}

export async function forgotPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { email: text(formData, "email") };
  const result = await requestPasswordReset(
    db(),
    getAuthDriver(),
    values,
    `${siteUrl()}/auth/callback?next=/mot-de-passe/nouveau`,
    { ip: await callerIp() },
  );
  if (result.ok) {
    return {
      status: "ok",
      message:
        "Si un compte existe avec cette adresse, un email vient de vous être envoyé avec un lien pour choisir un nouveau mot de passe.",
    };
  }
  if (result.error === "invalid")
    return { status: "error", fieldErrors: result.fieldErrors, values };
  return {
    status: "error",
    values,
    message: `Trop de demandes. Réessayez dans ${wait(result.retryAfterSeconds)}.`,
  };
}

export async function resetPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await setNewPassword(getAuthDriver(), { password: text(formData, "password") });
  if (result.ok) return { status: "ok", message: "Votre mot de passe a été modifié." };
  if (result.error === "invalid") return { status: "error", fieldErrors: result.fieldErrors };
  return {
    status: "error",
    message: "Ce lien n'est plus valable. Demandez-en un nouveau depuis « Mot de passe oublié ».",
  };
}
