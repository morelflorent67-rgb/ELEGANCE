import "server-only";
import { after, connection } from "next/server";
import { db } from "@/db/client";
import { appSecret, siteUrl } from "@/lib/env";
import { callerIp } from "@/lib/request-ip";
import { sendPasswordResetEmail } from "@/modules/auth";
import { sendEmailsForAppointment } from "@/modules/mail/send-now";
import { createMobileApi, type ApiResult, type MobileApi } from "@/modules/mobile/api";
import { getVitrine } from "@/modules/vitrine/cache";
import { wakeWaitlist } from "@/modules/waitlist/run";

// Colle entre une requête HTTP et `createMobileApi` (src/modules/mobile/api.ts) : toute la logique est là-bas, testée sur
// une base réelle. Une route de ce dossier ne fait que lire le corps JSON et appeler la méthode correspondante.

/** Corps JSON de la requête ; `undefined` s'il est absent ou illisible (l'API répond alors « invalid »). */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export interface MobileRequest {
  api: MobileApi;
  body: () => Promise<unknown>;
}

export async function handle(
  request: Request,
  run: (call: MobileRequest) => Promise<ApiResult>,
): Promise<Response> {
  await connection();
  const database = db();
  const api = createMobileApi({
    db: database,
    authorization: request.headers.get("authorization"),
    ip: await callerIp(),
    siteUrl: siteUrl(),
    secret: appSecret(),
    sendResetEmail: sendPasswordResetEmail,
    defer: (task) => after(task),
    effects: {
      sendAppointmentEmails: (id) => sendEmailsForAppointment(database, id),
      wakeWaitlist: async () => {
        await wakeWaitlist(database);
      },
    },
    loadVitrine: getVitrine,
  });
  const result = await run({ api, body: () => readJson(request) });
  // Réponses propres à un client : jamais mises en cache, ni par l'app ni par un intermédiaire.
  return Response.json(result.body, { status: result.status, headers: { "cache-control": "private, no-store" } });
}
