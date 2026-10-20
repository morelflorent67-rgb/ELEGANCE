import { connection } from "next/server";
import { db } from "@/db/client";
import { countAppointmentsToHandle } from "@/modules/absences";
import { staffOrNull } from "../../_lib/session";
import { TeamNav } from "./team-nav";

/** La barre de la tablette, avec le nombre de rendez-vous à traiter. Sans session équipe, aucun compte n'est lu. */
export async function TeamNavLoader() {
  await connection();
  const user = await staffOrNull();
  const toHandle = user ? await countAppointmentsToHandle(db()) : 0;
  return <TeamNav toHandle={toHandle} />;
}
