// Faux pilotes (connexion en mémoire, faux terminal d'encaissement, emails « journal ») : réservés aux tests.
// Interdits par défaut ; seuls les environnements de test posent `ALLOW_TEST_DRIVERS=true`. Sur le serveur du site,
// cette variable n'existe jamais : même si `AUTH_DRIVER=memory` ou `PAYMENT_DRIVER=fake` traînent dans l'environnement,
// l'application refuse de s'en servir (D-115).

type Env = Record<string, string | undefined>;

export function assertTestDriversAllowed(name: string, env: Env = process.env): void {
  if (env.ALLOW_TEST_DRIVERS !== "true") {
    throw new Error(`${name} est interdit : il faut ALLOW_TEST_DRIVERS=true, réservé aux tests (jamais sur le serveur).`);
  }
}

export function authDriverKind(env: Env = process.env): "memory" | "postgres" {
  if (env.AUTH_DRIVER === "memory") {
    assertTestDriversAllowed("AUTH_DRIVER=memory", env);
    return "memory";
  }
  return "postgres";
}

export function paymentDriverKind(env: Env = process.env): "fake" | "real" {
  if (env.PAYMENT_DRIVER === "fake") {
    assertTestDriversAllowed("PAYMENT_DRIVER=fake", env);
    return "fake";
  }
  return "real";
}

/**
 * En production sans Brevo, un transport « journal » marquerait les emails comme envoyés alors que rien ne part.
 * Les tests de bout en bout tournent sur un build de production sans Brevo : ils l'autorisent explicitement.
 */
export function logTransportAllowed(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" || env.ALLOW_TEST_DRIVERS === "true";
}
