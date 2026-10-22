"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import type { FormState } from "@/app/_actions/form-state";
import { DomainError, type DomainErrorCode } from "@/lib/domain-error";
import { getAuthDriver } from "@/modules/auth";
import { cancelAppointment } from "@/modules/booking";
import { currentCustomer } from "@/modules/customers/accounts";
import {
  changePassword,
  deleteAccount,
  updateProfile,
  type ProfileResult,
} from "@/modules/customers/profile";
import { sendEmailsForAppointment } from "@/modules/mail/send-now";
import { wakeWaitlist } from "@/modules/waitlist/run";
import { hitRateLimit } from "@/modules/security/rate-limit";

// Actions de l'espace client. Toute la logique et tous les contrôles sont dans les modules `booking` et `customers` :
// ici on identifie le client de la session, on limite les essais et on traduit les refus en messages.

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

const wait = (seconds: number) =>
  seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} secondes`;

export type CancelResult =
  | { ok: true }
  | { ok: false; error: DomainErrorCode | "not_signed_in" | "rate_limited" | "invalid" | "failed" };

/** Annule un RDV du client connecté (R-30). Refus : délai dépassé (R-31), RDV déjà passé, RDV d'un autre client. */
export async function cancelAppointmentAction(appointmentId: string): Promise<CancelResult> {
  const id = z.uuid().safeParse(appointmentId);
  if (!id.success) return { ok: false, error: "invalid" };
  try {
    const customer = await currentCustomer(db(), getAuthDriver());
    if (!customer) return { ok: false, error: "not_signed_in" };
    const limit = await hitRateLimit(db(), `change:customer:${customer.id}`, {
      limit: 20,
      windowSeconds: 900,
    });
    if (!limit.allowed) return { ok: false, error: "rate_limited" };

    const result = await cancelAppointment(db(), {
      customerId: customer.id,
      appointmentId: id.data,
    });
    // L'email part après la réponse ; en cas d'échec il reste dans la file et le cron le reprend.
    if (!result.alreadyCancelled) {
      after(() => sendEmailsForAppointment(db(), id.data));
      // D-100 : la place libérée est proposée à la liste d'attente.
      after(() => wakeWaitlist(db()));
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.code };
    console.error("Annulation impossible :", error);
    return { ok: false, error: "failed" };
  }
}

function failure(
  result: Extract<ProfileResult, { ok: false }>,
  values: Record<string, string>,
): FormState {
  switch (result.error) {
    case "invalid":
      return { status: "error", fieldErrors: result.fieldErrors, values };
    case "wrong_password":
      return {
        status: "error",
        values,
        fieldErrors: { currentPassword: "Ce mot de passe n'est pas le bon." },
      };
    case "email_taken":
      return {
        status: "error",
        values,
        fieldErrors: { email: "Un autre compte utilise déjà cette adresse." },
      };
    case "rate_limited":
      return {
        status: "error",
        values,
        message: `Trop d'essais. Réessayez dans ${wait(result.retryAfterSeconds)}.`,
      };
    case "imminent_appointment":
      return {
        status: "error",
        values,
        message:
          "Votre prochain rendez-vous est trop proche pour être annulé en ligne : pour supprimer votre compte, appelez le salon.",
      };
    default:
      return {
        status: "error",
        values,
        message: "Une erreur est survenue. Réessayez, ou appelez le salon.",
      };
  }
}

const NOT_SIGNED_IN: FormState = {
  status: "error",
  message: "Votre session a expiré. Reconnectez-vous.",
};

export async function updateProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  };
  const customer = await currentCustomer(db(), getAuthDriver());
  if (!customer) return NOT_SIGNED_IN;
  const result = await updateProfile(db(), getAuthDriver(), customer.id, {
    ...values,
    currentPassword: text(formData, "currentPassword") || undefined,
  });
  if (!result.ok) return failure(result, values);
  return { status: "ok", message: "Vos informations sont à jour.", customer: result.customer };
}

export async function changePasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const customer = await currentCustomer(db(), getAuthDriver());
  if (!customer) return NOT_SIGNED_IN;
  const result = await changePassword(db(), getAuthDriver(), customer.id, {
    currentPassword: text(formData, "currentPassword"),
    newPassword: text(formData, "newPassword"),
  });
  if (!result.ok) {
    // Pour un mot de passe, l'erreur « mauvais mot de passe » s'affiche sous le champ de l'ancien.
    return failure(result, {});
  }
  return { status: "ok", message: "Votre mot de passe a été modifié." };
}

export async function deleteAccountAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const customer = await currentCustomer(db(), getAuthDriver());
  if (!customer) return NOT_SIGNED_IN;
  const result = await deleteAccount(db(), getAuthDriver(), customer.id, {
    password: text(formData, "password"),
  });
  if (!result.ok) {
    const state = failure(result, {});
    // Le champ de la suppression s'appelle « password ».
    if (state.fieldErrors?.currentPassword) {
      return { ...state, fieldErrors: { password: state.fieldErrors.currentPassword } };
    }
    return state;
  }
  redirect("/compte/supprime");
}

export async function signOutAction(): Promise<void> {
  await getAuthDriver().signOut();
  redirect("/");
}
