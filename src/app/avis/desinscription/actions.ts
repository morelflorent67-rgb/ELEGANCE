"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { appSecret } from "@/lib/env";
import { setReviewOptOut } from "@/modules/customers/review-optout";
import { reviewOptOutSubject, verifyToken } from "@/modules/security/token";

/**
 * « Ne plus recevoir ces invitations » (R-64). Le lien de l'email est signé : il identifie le client sans connexion.
 * Le changement se fait par ce bouton (POST) et non à l'ouverture du lien : les messageries ouvrent parfois les liens
 * d'avance pour les analyser.
 */
export async function optOutReviewsAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(String(formData.get("c") ?? ""));
  const token = String(formData.get("t") ?? "");
  if (!id.success || !verifyToken(appSecret(), reviewOptOutSubject(id.data), token)) {
    redirect("/avis/desinscription");
  }
  await setReviewOptOut(db(), id.data);
  redirect(`/avis/desinscription?c=${id.data}&t=${encodeURIComponent(token)}&fait=1`);
}
