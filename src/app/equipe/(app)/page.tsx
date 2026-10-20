import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DateTime } from "luxon";
import { z } from "zod";
import { db } from "@/db/client";
import { parisDate } from "@/lib/format";
import { loadDayPlanning } from "@/modules/planning";
import { listActiveStaff } from "@/modules/staff";
import { requireStaff } from "../_lib/session";
import { PlanningBoard } from "./_components/planning-board";

export const metadata: Metadata = { title: "Planning" };

export default function PlanningPage(props: PageProps<"/equipe">) {
  return (
    <Suspense fallback={<Loading />}>
      <Planning searchParams={props.searchParams} />
    </Suspense>
  );
}

function Loading() {
  return (
    <p role="status" className="px-6 py-10 text-body-sm text-stone">
      Chargement du planning…
    </p>
  );
}

const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idParam = z.uuid();

// Le planning est relu à chaque affichage : rien n'est mis en cache (R-72).
async function Planning({ searchParams }: { searchParams: PageProps<"/equipe">["searchParams"] }) {
  await connection();
  await requireStaff();
  const query = await searchParams;
  const database = db();

  const now = new Date();
  const today = parisDate(now);
  const asked = dateParam.safeParse(query.jour);
  const valid = asked.success && DateTime.fromISO(asked.data).isValid;
  const date = valid ? asked.data : today;
  const selected = idParam.safeParse(query.rdv);

  const [day, team] = await Promise.all([
    loadDayPlanning(database, date, now),
    listActiveStaff(database),
  ]);
  const shift = (days: number) =>
    DateTime.fromISO(date, { zone: "Europe/Paris" }).plus({ days }).toISODate()!;

  return (
    <PlanningBoard
      key={date}
      day={day}
      today={today}
      isToday={date === today}
      prevDate={shift(-1)}
      nextDate={shift(1)}
      team={team.map((m) => ({ id: m.id, firstName: m.firstName }))}
      initialSelectedId={selected.success ? selected.data : null}
    />
  );
}
