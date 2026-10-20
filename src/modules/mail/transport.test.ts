import { describe, expect, it } from "vitest";
import { EmailSendError, createBrevoTransport, type EmailMessage } from "./transport";

const message: EmailMessage = {
  to: { email: "thomas@exemple.fr", name: "Thomas" },
  subject: "Votre rendez-vous est confirmé",
  html: "<p>Bonjour</p>",
  text: "Bonjour",
};

function transportWith(respond: (init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = createBrevoTransport({
    apiKey: "cle-de-test",
    fromEmail: "salon@exemple.fr",
    fromName: "Elegance Strasbourg",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return respond(init!);
    },
  });
  return { transport, calls };
}

const failure = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(EmailSendError);
  return error as EmailSendError;
};

describe("transport Brevo (R-60)", () => {
  it("envoie le message à l'API Brevo avec la clé en en-tête et le bon contenu", async () => {
    const { transport, calls } = transportWith(() => new Response("{}", { status: 201 }));
    await transport.send(message);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["api-key"]).toBe("cle-de-test");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      sender: { email: "salon@exemple.fr", name: "Elegance Strasbourg" },
      to: [{ email: "thomas@exemple.fr", name: "Thomas" }],
      subject: "Votre rendez-vous est confirmé",
      htmlContent: "<p>Bonjour</p>",
      textContent: "Bonjour",
    });
  });

  it("n'envoie pas de nom de destinataire quand il n'y en a pas", async () => {
    const { transport, calls } = transportWith(() => new Response("{}", { status: 201 }));
    await transport.send({ ...message, to: { email: "thomas@exemple.fr" } });
    expect(JSON.parse(calls[0].init.body as string).to).toEqual([{ email: "thomas@exemple.fr" }]);
  });

  it("un refus de la demande (clé, adresse, expéditeur) est permanent : inutile de réessayer", async () => {
    for (const status of [400, 401, 403, 404]) {
      const { transport } = transportWith(() => new Response("refusé", { status }));
      expect((await failure(transport.send(message))).permanent, String(status)).toBe(true);
    }
  });

  it("une limite de débit, un délai dépassé ou une panne de Brevo sont passagers : l'envoi sera repris", async () => {
    for (const status of [408, 429, 500, 502, 503]) {
      const { transport } = transportWith(() => new Response("panne", { status }));
      expect((await failure(transport.send(message))).permanent, String(status)).toBe(false);
    }
  });

  it("un réseau coupé est passager", async () => {
    const { transport } = transportWith(() => {
      throw new Error("réseau coupé");
    });
    const error = await failure(transport.send(message));
    expect(error.permanent).toBe(false);
    expect(error.message).toContain("réseau coupé");
  });

  it("garde le détail de la réponse de Brevo pour le diagnostic, sans la clé", async () => {
    const { transport } = transportWith(
      () => new Response('{"message":"Sender not valid"}', { status: 400 }),
    );
    const error = await failure(transport.send(message));
    expect(error.message).toContain("Brevo 400");
    expect(error.message).toContain("Sender not valid");
    expect(error.message).not.toContain("cle-de-test");
  });
});
