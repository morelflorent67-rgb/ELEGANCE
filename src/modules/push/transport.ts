/**
 * Ce qu'on envoie à un iPhone (D-124). Le texte est celui de la notification ; `data` dit à l'app quoi ouvrir au toucher.
 * Rien de plus que ce que la notification affiche : pas d'adresse, pas de numéro.
 */
export interface PushMessage {
  title: string;
  body: string;
  data: { kind: "offer"; offerId: string } | { kind: "appointment"; appointmentId: string };
}

/** `invalid_token` : Apple dit que l'appareil n'existe plus (app désinstallée) : on oublie le jeton. */
export type PushResult = "sent" | "invalid_token" | "failed";

export interface PushTransport {
  send(token: string, message: PushMessage): Promise<PushResult>;
}

/** Transport des tests : garde ce qu'on lui a envoyé et répond ce qu'on lui demande. */
export function createFakePush(
  reply: (token: string) => PushResult = () => "sent",
): PushTransport & { sent: { token: string; message: PushMessage }[] } {
  const sent: { token: string; message: PushMessage }[] = [];
  return {
    sent,
    async send(token, message) {
      sent.push({ token, message });
      return reply(token);
    },
  };
}
