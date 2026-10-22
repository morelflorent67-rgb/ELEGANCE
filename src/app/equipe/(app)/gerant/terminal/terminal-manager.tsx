"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { teamMessage } from "../../../_lib/messages";
import { pairTerminalAction, unpairTerminalAction } from "../../../actions";

const field =
  "h-[52px] w-full min-w-0 border border-line-strong bg-ink px-4 text-[16px] text-ivory";

/** Relier ou délier le terminal d'encaissement (D-105). Les codes se tapent ici, jamais dans le chat. */
export function TerminalManager({
  keyAvailable,
  configured,
  merchantCode,
}: {
  keyAvailable: boolean;
  configured: boolean;
  merchantCode: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [merchant, setMerchant] = useState("");
  const [pairing, setPairing] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pair = () =>
    startTransition(async () => {
      setError(null);
      const result = await pairTerminalAction({ merchantCode: merchant, pairingCode: pairing });
      if (!result.ok) return setError(teamMessage(result.error));
      setMerchant("");
      setPairing("");
      router.refresh();
    });

  const unpair = () =>
    startTransition(async () => {
      setError(null);
      const result = await unpairTerminalAction();
      if (!result.ok) return setError(teamMessage(result.error));
      router.refresh();
    });

  return (
    <section aria-label="Terminal" className="flex flex-col gap-4">
      {!keyAvailable ? (
        <p role="status" className="border border-line-strong p-4 text-[14px] leading-normal">
          La clé d’API SumUp n’est pas encore installée sur le site : le terminal ne peut pas être
          relié.
        </p>
      ) : null}
      {configured ? (
        <div className="flex flex-col gap-3 border border-line-strong p-4">
          <span className="text-[16px]">Terminal relié</span>
          <span className="text-[14px] text-stone">Code marchand · {merchantCode}</span>
          <button
            type="button"
            disabled={pending}
            onClick={unpair}
            className="h-[52px] self-start border border-brick px-6 text-[11px] uppercase tracking-[0.2em] text-brick"
          >
            Délier le terminal
          </button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            pair();
          }}
        >
          <ol className="list-decimal pl-5 text-[14px] leading-relaxed text-ivory-soft">
            <li>Sur le terminal : se déconnecter, puis Connexions, API, « Connecter ».</li>
            <li>
              Taper ci-dessous le code marchand du compte et le code affiché (valable 5 minutes).
            </li>
          </ol>
          <label className="flex flex-col gap-2 text-label uppercase text-stone">
            Code marchand
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-2 text-label uppercase text-stone">
            Code d’appairage
            <input
              value={pairing}
              onChange={(e) => setPairing(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              className={field}
            />
          </label>
          <button
            type="submit"
            disabled={pending || !keyAvailable || !merchant.trim() || !pairing.trim()}
            className="h-[52px] self-start bg-ivory px-8 text-[11px] uppercase tracking-[0.2em] text-ink disabled:opacity-40"
          >
            Relier le terminal
          </button>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-[14px] leading-normal text-brick">
          {error}
        </p>
      ) : null}
    </section>
  );
}
