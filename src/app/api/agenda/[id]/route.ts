import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { appSecret } from "@/lib/env";
import { buildIcs } from "@/modules/calendar/ics";
import { loadCalendarEvent } from "@/modules/calendar/event";
import { calendarSubject, verifyToken } from "@/modules/security/token";

// « Ajouter à l'agenda » (R-60). Lien signé : utilisable depuis l'email sans être connecté.
export async function GET(request: Request, ctx: RouteContext<"/api/agenda/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t") ?? "";

  // Même réponse pour un lien invalide et un RDV inconnu : on ne révèle rien.
  if (!z.uuid().safeParse(id).success || !verifyToken(appSecret(), calendarSubject(id), token)) {
    return new Response("Lien invalide.", { status: 404 });
  }
  const event = await loadCalendarEvent(db(), id);
  if (!event) return new Response("Lien invalide.", { status: 404 });

  return new Response(buildIcs(event), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="rendez-vous-elegance.ics"',
      "cache-control": "private, no-store",
    },
  });
}
