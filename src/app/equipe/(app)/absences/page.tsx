import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import {
  listAbsences,
  listAppointmentsToHandle,
  listFreeColleagues,
  listHeldEmails,
} from "@/modules/absences";
import { loadSettings } from "@/modules/availability";
import { listActiveStaff } from "@/modules/staff";
import { managerUnlocked, requireStaff } from "../../_lib/session";
import { AbsencesBoard } from "./absences-board";

export const metadata: Metadata = { title: "Absences" };

export default function AbsencesPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <Absences />
    </Suspense>
  );
}

async function Absences() {
  await connection();
  const user = await requireStaff();
  const now = new Date();
  const [settings, team, absences, toHandle, held] = await Promise.all([
    loadSettings(db()),
    listActiveStaff(db()),
    listAbsences(db(), now),
    listAppointmentsToHandle(db(), now),
    listHeldEmails(db()),
  ]);
  // R-42 : « confier à un collègue » n'est proposé que si un collègue habilité est libre sur le créneau.
  const colleagues = await Promise.all(
    toHandle.map(async (a) => [a.id, await listFreeColleagues(db(), a.id, now)] as const),
  );

  return (
    <AbsencesBoard
      today={DateTime.fromJSDate(now, { zone: settings.timezone }).toISODate()!}
      team={team}
      absences={absences}
      toHandle={toHandle.map((a) => ({
        ...a,
        colleagues: colleagues.find(([id]) => id === a.id)![1],
      }))}
      held={held}
      managerUnlocked={await managerUnlocked(user)}
    />
  );
}
