import type { SessionStore } from "@/modules/auth/types";

// L'app iPhone envoie le même jeton de session que le cookie du site, dans `Authorization: Bearer` (D-123).
// Ce magasin remplace le cookie : il lit le jeton de la requête, et garde celui qu'une connexion vient d'ouvrir pour
// que la réponse le rende à l'app (l'app le range dans le trousseau de l'iPhone).

/** Jeton d'un en-tête `Authorization: Bearer …`, ou undefined s'il est absent ou mal formé. */
export function bearerToken(header: string | null | undefined): string | undefined {
  const match = /^Bearer ([^\s]+)$/i.exec(header?.trim() ?? "");
  return match?.[1];
}

export interface BearerStore extends SessionStore {
  get(): string | undefined;
  set(sessionId: string): void;
  clear(): void;
  /** Jeton ouvert pendant cette requête (connexion, inscription), à rendre à l'app. */
  issued(): string | undefined;
}

export function createBearerStore(authorization: string | null | undefined): BearerStore {
  let current = bearerToken(authorization);
  let issued: string | undefined;
  return {
    get: () => current,
    set(sessionId) {
      current = sessionId;
      issued = sessionId;
    },
    clear() {
      current = undefined;
      issued = undefined;
    },
    issued: () => issued,
  };
}
