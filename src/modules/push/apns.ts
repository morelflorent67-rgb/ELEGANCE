import { createPrivateKey, sign } from "node:crypto";
import http2 from "node:http2";
import type { PushMessage, PushResult, PushTransport } from "./transport";

/**
 * Envoi direct à Apple (APNs), sans passer par un service tiers (D-124) : HTTP/2 et un jeton signé ES256 avec la clé `.p8`
 * du compte Apple Developer, tout avec Node (aucune dépendance). Le jeton est valable 1 h chez Apple : on le renouvelle
 * toutes les 40 minutes.
 */
export interface ApnsConfig {
  /** Contenu du fichier `.p8` (« -----BEGIN PRIVATE KEY----- … »), les retours à la ligne peuvent être écrits « \n ». */
  key: string;
  keyId: string;
  teamId: string;
  /** Identifiant de l'app : `fr.elegancestrasbourg.app`. */
  topic: string;
  /** Les versions TestFlight et App Store utilisent la production ; seule une version de développement utilise le bac à sable. */
  production: boolean;
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** Jeton d'authentification APNs (JWT ES256). Exporté pour le test. */
export function apnsJwt(config: Pick<ApnsConfig, "key" | "keyId" | "teamId">, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: nowSeconds }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(config.key.replace(/\\n/g, "\n")),
    dsaEncoding: "ieee-p1363", // la signature brute (r || s) que demande ES256, pas le format DER
  });
  return `${header}.${claims}.${base64url(signature)}`;
}

/** Corps envoyé à Apple. Exporté pour le test. */
export function apnsBody(message: PushMessage): string {
  return JSON.stringify({
    aps: { alert: { title: message.title, body: message.body }, sound: "default" },
    data: message.data,
  });
}

/** Réponse d'Apple → résultat. 410 et ces raisons : l'appareil ne reçoit plus rien, le jeton est à oublier. */
export function apnsResult(status: number, reason: string | undefined): PushResult {
  if (status === 200) return "sent";
  if (
    status === 410 ||
    reason === "BadDeviceToken" ||
    reason === "Unregistered" ||
    reason === "DeviceTokenNotForTopic"
  ) {
    return "invalid_token";
  }
  return "failed";
}

export function createApnsTransport(config: ApnsConfig, now: () => Date = () => new Date()): PushTransport {
  let jwt: { value: string; at: number } | null = null;
  const token = () => {
    const seconds = Math.floor(now().getTime() / 1000);
    if (!jwt || seconds - jwt.at > 40 * 60) jwt = { value: apnsJwt(config, seconds), at: seconds };
    return jwt.value;
  };
  const origin = config.production ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";

  return {
    send(deviceToken, message) {
      return new Promise<PushResult>((resolve) => {
        const client = http2.connect(origin);
        const done = (result: PushResult) => {
          client.close();
          resolve(result);
        };
        client.on("error", () => done("failed"));
        const request = client.request({
          ":method": "POST",
          ":path": `/3/device/${deviceToken}`,
          authorization: `bearer ${token()}`,
          "apns-topic": config.topic,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        });
        let status = 0;
        let raw = "";
        request.on("response", (headers) => {
          status = Number(headers[":status"]);
        });
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => (raw += chunk));
        request.on("end", () => {
          let reason: string | undefined;
          try {
            reason = (JSON.parse(raw) as { reason?: string }).reason;
          } catch {
            reason = undefined;
          }
          done(apnsResult(status, reason));
        });
        request.on("error", () => done("failed"));
        request.setTimeout(10_000, () => {
          request.close();
          done("failed");
        });
        request.end(apnsBody(message));
      });
    },
  };
}
