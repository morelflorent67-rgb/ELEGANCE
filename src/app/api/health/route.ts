import { connection } from "next/server";
import { db, sql } from "@/db/client";
import { outboxHealth } from "@/modules/mail/health";

// Sonde de santé pour le service de surveillance (lot 8) : 200 si tout va bien, 503 si la base ne répond pas ou si des
// emails dus ne partent plus (cron arrêté, Brevo injoignable). Des nombres seulement, aucune donnée métier.
export async function GET() {
  await connection();
  try {
    await sql()`select 1`;
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
  const emails = await outboxHealth(db());
  const healthy = emails.overdue === 0;
  return Response.json(
    { status: healthy ? "ok" : "degraded", database: "ok", emails },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
