import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/db/client";
import { countAppointmentsToHandle } from "@/modules/absences";

/**
 * Rappel affiché sur les écrans du gérant : un changement d'équipe, d'horaires ou de carte peut laisser des rendez-vous
 * qui ne tiennent plus (D-57). Rien ne s'affiche quand tout est traité.
 */
export async function ToHandleNotice() {
  await connection();
  const count = await countAppointmentsToHandle(db());
  if (count === 0) return null;
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-gold p-4 text-[14px] leading-normal">
      <span>
        {count} rendez-vous {count > 1 ? "sont" : "est"} à traiter (absence, fermeture, horaires ou équipe).
      </span>
      <Link href="/equipe/absences" className="underline underline-offset-4">
        Voir les rendez-vous à traiter
      </Link>
    </p>
  );
}
