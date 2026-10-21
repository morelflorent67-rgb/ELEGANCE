import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { appSecret } from "@/lib/env";
import { buildIcs } from "@/modules/calendar/ics";
import { loadSeriesCalendarEvents } from "@/modules/calendar/event";
import { seriesCalendarSubject, verifyToken } from "@/modules/security/token";

// « Ajouter à l'agenda » de l'email d'une série (D-91) : toutes ses dates à venir dans un seul fichier. Lien signé.
export async function GET(request: Request, ctx: RouteContext<"/api/agenda/serie/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t") ?? "";

  // Même réponse pour un lien invalide et une série inconnue ou terminée : on ne révèle rien.
  if (
    !z.uuid().safeParse(id).success ||
    !verifyToken(appSecret(), seriesCalendarSubject(id), token)
  ) {
    return new Response("Lien invalide.", { status: 404 });
  }
  const events = await loadSeriesCalendarEvents(db(), id);
  if (events.length === 0) return new Response("Lien invalide.", { status: 404 });

  return new Response(buildIcs(events), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="rendez-vous-elegance.ics"',
      "cache-control": "private, no-store",
    },
  });
}
