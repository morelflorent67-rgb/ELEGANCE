import { createHmac, timingSafeEqual } from "node:crypto";

// Jetons signés pour les liens utilisables sans connexion (ex. « Ajouter à l'agenda » dans un email).
// Le jeton ne contient aucune donnée : c'est la signature du sujet (« agenda:<id> »), recalculée à la vérification.

export function signToken(secret: string, subject: string): string {
  return createHmac("sha256", secret).update(subject).digest("base64url");
}

export function verifyToken(secret: string, subject: string, token: string): boolean {
  const expected = Buffer.from(signToken(secret, subject));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const calendarSubject = (appointmentId: string) => `agenda:${appointmentId}`;

/** « Ajouter à l'agenda » de l'email d'une série (D-91) : toutes ses dates à venir. */
export const seriesCalendarSubject = (seriesId: string) => `agenda-serie:${seriesId}`;

/** Lien « Ne plus recevoir ces invitations » de l'email d'avis (R-64). */
export const reviewOptOutSubject = (customerId: string) => `avis-desinscription:${customerId}`;

/** Lien « Ne plus recevoir ces messages » de l'email « Nous serions ravis de vous revoir » (D-74). */
export const winbackOptOutSubject = (customerId: string) => `relance-desinscription:${customerId}`;
