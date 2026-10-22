"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoginForm, SignUpForm } from "@/components/account-forms";
import { SwitchAuth } from "./switch-auth";

/**
 * Connexion ou création du compte dans le panneau (maquette « Lot12-Rdv-1-Connexion ») : une fois connecté, la page
 * se recharge et le panneau montre les rendez-vous. Email seul (D-95).
 */
export function PanelAuth({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const login = mode === "login";
  const done = () => (next ? router.push(next) : router.refresh());

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h1
          className="s-up font-display text-[40px] leading-[1.05]"
          style={{ animationDelay: "120ms" }}
        >
          {login ? "Bon retour." : "Votre compte"}
        </h1>
        <p
          className="s-up text-[14px] leading-[1.55] text-stone"
          style={{ animationDelay: "180ms" }}
        >
          {login
            ? "Connectez-vous pour retrouver vos rendez-vous."
            : "Il vous permet de réserver, de modifier ou d'annuler en ligne."}
        </p>
      </div>
      <div className="s-up" style={{ animationDelay: "230ms" }}>
        {login ? (
          <LoginForm key="login" idPrefix="panel" onSuccess={done} />
        ) : (
          <SignUpForm key="signup" idPrefix="panel-signup" onSuccess={done} />
        )}
      </div>
      <SwitchAuth login={login} onSwitch={() => setMode(login ? "signup" : "login")} />
    </>
  );
}
