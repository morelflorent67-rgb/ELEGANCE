import { connection } from "next/server";
import { sql } from "@/db/client";

// Sonde de santé : répond 200 si la base répond. Aucune donnée métier n'est exposée.
export async function GET() {
  await connection();
  try {
    await sql()`select 1`;
    return Response.json({ status: "ok", database: "ok" });
  } catch {
    return Response.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
