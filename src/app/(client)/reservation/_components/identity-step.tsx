"use client";

import { useState } from "react";
import { LoginForm, SignUpForm } from "@/components/account-forms";
import { SwitchAuth } from "@/components/client/switch-auth";
import type { BookingState, CustomerProfile } from "@/modules/customers/accounts";

/**
 * Étape 4 : création du compte ou connexion (R-70, R-71 ; email seul, D-95). Une fois connecté, le parcours
 * reprend : un client bloqué (R-52) ou déjà au maximum de RDV à venir (R-25) le sait aussitôt.
 */
export function IdentityStep({
  onAuthenticated,
}: {
  onAuthenticated: (customer: CustomerProfile, booking: BookingState) => void;
}) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const login = mode === "login";

  return (
    <div className="flex flex-col gap-6 px-6 pb-9 pt-[26px]">
      <div className="flex flex-col gap-2.5">
        <h1 className="overflow-hidden font-display text-[40px] leading-[1.05]">
          <span className="s-tl block">{login ? "Bon retour." : "Votre compte"}</span>
        </h1>
        <p
          className="s-up text-[14px] leading-[1.55] text-stone"
          style={{ animationDelay: "180ms" }}
        >
          {login
            ? "Connectez-vous pour finaliser le rendez-vous."
            : "Il vous permet de modifier ou d'annuler en ligne."}
        </p>
      </div>
      <div className="s-up" style={{ animationDelay: "220ms" }}>
        {login ? (
          <LoginForm
            key="login"
            idPrefix="step"
            forgotHref="/mot-de-passe-oublie"
            onSuccess={({ customer, booking }) => onAuthenticated(customer, booking)}
          />
        ) : (
          <SignUpForm
            key="signup"
            idPrefix="step-signup"
            onSuccess={({ customer, booking }) => onAuthenticated(customer, booking)}
          />
        )}
      </div>
      <SwitchAuth login={login} onSwitch={() => setMode(login ? "signup" : "login")} />
    </div>
  );
}
