import { connection } from "next/server";
import postgres from "postgres";
import { db, sql } from "@/db/client";
import { CLIENT_OPTIONS, connectionOptions } from "@/db/connection-url";
import { databaseEnv } from "@/lib/env";
import { parisDate } from "@/lib/format";
import { countAppointmentsToHandle } from "@/modules/absences";
import { timeOnce, timeRuns } from "@/modules/diagnostic/timing";
import { loadDayPlanning } from "@/modules/planning";
import { listActiveStaff } from "@/modules/staff";

// Diagnostic de vitesse de la tablette (lot 8) : chronomètre, là où tourne la fonction (Dublin), la base, les
// chargements du planning et le service d'authentification de Supabase. Ne renvoie que des durées, jamais de
// données. Une mesure toutes les 10 s au plus par instance. À retirer à la bascule (voir docs/decisions.md).

const startedAt = Date.now();
let invocations = 0;
let lastRun = 0;

export async function GET() {
  await connection();
  invocations++;
  const now = Date.now();
  if (now - lastRun < 10_000) return new Response("Réessayez dans 10 s.", { status: 429 });
  lastRun = now;

  const instance = {
    region: process.env.VERCEL_REGION ?? "local",
    ageSeconds: Math.round((now - startedAt) / 1000),
    invocation: invocations,
  };

  // La première requête de l'instance paie l'ouverture des connexions (TLS, authentification auprès du pooler).
  const firstQuery = Math.round(await timeOnce(() => sql()`select 1`));
  const warmQuery = await timeRuns(5, () => sql()`select 1`);
  const newConnection = await timeRuns(2, async () => {
    const { url, ssl } = connectionOptions(databaseEnv().DATABASE_URL);
    const client = postgres(url, { ...CLIENT_OPTIONS, max: 1, ssl });
    try {
      await client`select 1`;
    } finally {
      await client.end({ timeout: 1 });
    }
  });

  const database = db();
  const today = parisDate(new Date());
  const planning = {
    loadDayPlanning: await timeRuns(3, () => loadDayPlanning(database, today)),
    listActiveStaff: await timeRuns(3, () => listActiveStaff(database)),
    countAppointmentsToHandle: await timeRuns(3, () => countAppointmentsToHandle(database)),
  };

  const auth: Record<string, unknown> = {};
  const supabaseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && key) {
    const call = (path: string, headers: Record<string, string> = {}) => () =>
      fetch(`${supabaseUrl}/auth/v1${path}`, {
        headers: { apikey: key, ...headers },
        cache: "no-store",
      }).then((r) => r.arrayBuffer());
    auth.jwks = await timeRuns(5, call("/.well-known/jwks.json"));
    auth.settings = await timeRuns(5, call("/settings"));
    // Même chemin que getUser() et le renouvellement d'un jeton : le service d'authentification lui-même.
    auth.userInvalidToken = await timeRuns(5, call("/user", { authorization: "Bearer invalide" }));
  }

  return Response.json(
    {
      instance,
      database: { firstQuery, warmQuery, newConnection },
      planning,
      auth,
      totalMs: Math.round(Date.now() - now),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
