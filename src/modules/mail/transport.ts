// Envoi des emails. Brevo en production ; un transport « journal » qui n'envoie rien en développement.

export interface EmailMessage {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
}

/** `permanent` : inutile de réessayer (adresse refusée, clé invalide). Sinon, l'envoi sera repris. */
export class EmailSendError extends Error {
  readonly permanent: boolean;

  constructor(message: string, permanent: boolean) {
    super(message);
    this.name = "EmailSendError";
    this.permanent = permanent;
  }
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export function createBrevoTransport(options: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  fetchImpl?: typeof fetch;
}): EmailTransport {
  const { apiKey, fromEmail, fromName, fetchImpl = fetch } = options;
  return {
    async send(message) {
      let response: Response;
      try {
        response = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            sender: { email: fromEmail, name: fromName },
            to: [
              { email: message.to.email, ...(message.to.name ? { name: message.to.name } : {}) },
            ],
            subject: message.subject,
            htmlContent: message.html,
            textContent: message.text,
          }),
        });
      } catch (error) {
        // Réseau coupé, délai dépassé : transitoire.
        throw new EmailSendError(`Brevo injoignable : ${(error as Error).message}`, false);
      }
      if (response.ok) return;
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      // 4xx = demande refusée (clé, adresse, expéditeur) : permanent, sauf 408 et 429 qui passent.
      const permanent =
        response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
      throw new EmailSendError(`Brevo ${response.status} : ${detail}`, permanent);
    },
  };
}

export function createLogTransport(log: (line: string) => void = console.log): EmailTransport {
  return {
    async send(message) {
      log(`[email non envoyé : transport « journal »] à ${message.to.email} — ${message.subject}`);
    },
  };
}
