"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { appSecret } from "@/lib/env";
import { setWinbackOptOut } from "@/modules/customers/winback-optout";
import { winbackOptOutSubject, verifyToken } from "@/modules/security/token";

/**
 * « Ne plus recevoir ces messages » (R-88, D-74). Le lien de l'email est signé : il identifie le client sans connexion.
 * Le changement se fait par ce bouton (POST) et non à l'ouverture du lien : les messageries ouvrent parfois les liens
 * d'avance pour les analyser.
 */
export async function optOutWinbackAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(String(formData.get("c") ?? ""));
  const token = String(formData.get("t") ?? "");
  if (!id.success || !verifyToken(appSecret(), winbackOptOutSubject(id.data), token)) {
    redirect("/relance/desinscription");
  }
  await setWinbackOptOut(db(), id.data, true);
  redirect(`/relance/desinscription?c=${id.data}&t=${encodeURIComponent(token)}&fait=1`);
}
