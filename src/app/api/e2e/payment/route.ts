import { connection } from "next/server";
import { sharedFakeTerminal } from "@/modules/payments/fake";

// Réservé aux tests de bout en bout (E2E_ROUTES=1, PAYMENT_DRIVER=fake) : joue le client qui paie, ou pas, sur le
// faux terminal. Le résultat est ensuite relu par le site comme avec le vrai SumUp. Introuvable partout ailleurs.
export async function POST(request: Request) {
  await connection();
  if (process.env.E2E_ROUTES !== "1" || process.env.PAYMENT_DRIVER !== "fake") {
    return new Response("Introuvable", { status: 404 });
  }
  const terminal = sharedFakeTerminal();
  const body = (await request.json()) as {
    action: "complete" | "reset" | "offline" | "last";
    reference?: string;
    status?: "successful" | "failed";
    value?: boolean;
  };
  if (body.action === "reset") terminal.reset();
  else if (body.action === "offline") terminal.offline = body.value ?? true;
  else if (body.action === "complete") {
    const reference = body.reference ?? terminal.sent.at(-1)?.reference;
    if (!reference) return Response.json({ ok: false }, { status: 409 });
    terminal.complete(reference, { status: body.status ?? "successful" });
  }
  return Response.json({ ok: true, sent: terminal.sent });
}
