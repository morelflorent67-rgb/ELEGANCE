"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { idleState } from "@/app/_actions/form-state";
import { Alert, Eyebrow, Field, LedLine, btnPrimary } from "@/components/ui";
import { unlockManagerAction } from "../../actions";

/** Le code gérant (R-73, D-53) : 6 chiffres, demandé avant toute fonction réservée au gérant. */
export function ManagerGate() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(unlockManagerAction, idleState);
  const handled = useRef(state);
  useEffect(() => {
    if (state.status === "ok" && handled.current !== state) {
      handled.current = state;
      router.refresh();
    }
  }, [state, router]);

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>Espace gérant</Eyebrow>
          <h1 className="text-title-2">Code gérant</h1>
          <p className="text-body text-ivory-soft">
            Cet espace est réservé au gérant. L’espace se verrouille seul après 5 minutes sans
            action.
          </p>
        </div>
        <LedLine />
        <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
          {state.status === "error" && state.message ? (
            <Alert kind="error" title={state.message} />
          ) : null}
          <Field id="manager-code" label="Code à 6 chiffres">
            <input
              id="manager-code"
              name="code"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="off"
              className="h-14 w-full min-w-0 border border-line-strong bg-ink px-4 text-center text-[24px] tracking-[0.5em] text-ivory"
            />
          </Field>
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Vérification…" : "Déverrouiller"}
          </button>
        </form>
      </div>
    </main>
  );
}
