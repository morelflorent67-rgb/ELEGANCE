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

/** Lien « Ne plus recevoir ces invitations » de l'email d'avis (R-64). */
export const reviewOptOutSubject = (customerId: string) => `avis-desinscription:${customerId}`;
