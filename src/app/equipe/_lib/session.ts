import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { appSecret } from "@/lib/env";
import { getAuthDriver } from "@/modules/auth";
import type { AuthUser } from "@/modules/auth/types";
import { currentStaffUser } from "@/modules/staff";
import {
  MANAGER_UNLOCK_MINUTES,
  isManagerUnlocked,
  issueManagerUnlock,
} from "@/modules/staff/manager-unlock";

// Accès à la tablette (R-72) et aux fonctions gérant (R-73). Chaque page et chaque action vérifie l'accès elle-même :
// une page ne se fie jamais à la mise en page qui l'entoure.

export const MANAGER_COOKIE = "elegance-manager";

/** Le compte équipe de la session, ou null. */
export const staffOrNull = (): Promise<AuthUser | null> => currentStaffUser(getAuthDriver());

/** Pour une page : renvoie vers la connexion de la tablette si personne n'est connecté en mode équipe. */
export async function requireStaff(): Promise<AuthUser> {
  const user = await staffOrNull();
  if (!user) redirect("/equipe/connexion");
  return user;
}

/** Le code gérant a-t-il été saisi il y a moins de 5 minutes sur cette tablette (R-73, D-53) ? */
export async function managerUnlocked(user: AuthUser, now: Date = new Date()): Promise<boolean> {
  const proof = (await cookies()).get(MANAGER_COOKIE)?.value;
  return isManagerUnlocked(appSecret(), user.id, proof, now);
}

/** Pose (ou prolonge) la preuve du code gérant : à n'appeler que depuis une action. */
export async function grantManagerUnlock(user: AuthUser, now: Date = new Date()): Promise<void> {
  // « Secure » seulement en https (production sur Vercel) : un cookie Secure ne repart pas sur le serveur de test en http.
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(MANAGER_COOKIE, issueManagerUnlock(appSecret(), user.id, now), {
    httpOnly: true,
    sameSite: "strict",
    path: "/equipe",
    maxAge: MANAGER_UNLOCK_MINUTES * 60,
    secure,
  });
}

export async function revokeManagerUnlock(): Promise<void> {
  (await cookies()).delete({ name: MANAGER_COOKIE, path: "/equipe" });
}
