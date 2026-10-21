"use client";

import Link from "next/link";
import { useState } from "react";
import { logoutAction } from "@/app/_actions/account";
import { LoginForm, SignUpForm } from "@/components/account-forms";
import { Alert, CallButton, Field, btnPrimary, inputClass } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import type { BookingState, CustomerProfile } from "@/modules/customers/accounts";

/**
 * Étape 4 : connexion ou création de compte (R-70, R-71), « Pour qui ? » (R-28, D-80), note au salon (R-29), et
 * avertissements dès ici :
 * réservation en ligne bloquée par le gérant (R-52) ou déjà 2 RDV à venir (R-25).
 */
export function IdentityStep({
  customer,
  booking,
  note,
  onNote,
  forName,
  onForName,
  onAuthenticated,
  onLoggedOut,
  onContinue,
}: {
  customer: CustomerProfile | null;
  booking: BookingState | null;
  note: string;
  onNote: (note: string) => void;
  forName: string;
  onForName: (forName: string) => void;
  onAuthenticated: (customer: CustomerProfile, booking: BookingState) => void;
  onLoggedOut: () => void;
  onContinue: () => void;
}) {
  const [tab, setTab] = useState<"login" | "signup">("login");

  if (!customer) {
    return (
      <>
        <div
          role="tablist"
          aria-label="Connexion ou inscription"
          className="grid grid-cols-2 border-b border-line"
        >
          {(
            [
              ["login", "J'ai un compte"],
              ["signup", "Créer un compte"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={`h-12 border-b-2 text-body-sm ${tab === id ? "border-ivory text-ivory" : "border-transparent text-stone"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "login" ? (
            <LoginForm
              idPrefix="step"
              forgotHref="/mot-de-passe-oublie"
              onSuccess={({ customer: c, booking: b }) => onAuthenticated(c, b)}
            />
          ) : (
            <SignUpForm
              idPrefix="step-signup"
              onSuccess={({ customer: c, booking: b }) => onAuthenticated(c, b)}
            />
          )}
        </div>
      </>
    );
  }

  const logout = async () => {
    await logoutAction();
    onLoggedOut();
  };
  const identity = (
    <div className="flex flex-col gap-1.5 bg-charcoal p-4">
      <span className="text-label uppercase text-stone">Connecté</span>
      <span className="text-body-lg">
        {customer.firstName} {customer.lastName}
      </span>
      <span className="text-body-sm text-ivory-soft">
        {formatPhone(customer.phone)} · {customer.email}
      </span>
      <button
        type="button"
        onClick={logout}
        className="min-h-11 self-start text-body-sm text-stone underline underline-offset-4"
      >
        Ce n&rsquo;est pas vous ? Se déconnecter
      </button>
    </div>
  );

  if (booking?.blocked) {
    return (
      <>
        {identity}
        <Alert kind="error" title="Réservation en ligne indisponible">
          Plusieurs rendez-vous n&rsquo;ont pas été honorés. Pour réserver, appelez le salon : nous
          en parlerons ensemble.
        </Alert>
        <CallButton kind="primary" />
      </>
    );
  }

  if (booking && booking.upcoming >= booking.maxUpcoming) {
    return (
      <>
        {identity}
        <Alert kind="info" title={`Vous avez déjà ${booking.maxUpcoming} rendez-vous à venir`}>
          C&rsquo;est le maximum en ligne. Modifiez l&rsquo;un d&rsquo;eux, ou appelez le salon.
        </Alert>
        <Link href="/compte/rendez-vous" className={btnPrimary}>
          Voir mes rendez-vous
        </Link>
        <CallButton />
      </>
    );
  }

  return (
    <>
      {identity}
      <Field
        id="booking-for-name"
        label="Pour qui ?"
        optional
        hint="Vous réservez pour un proche ? Son prénom. Le rendez-vous reste à votre nom."
      >
        <input
          id="booking-for-name"
          type="text"
          maxLength={40}
          autoComplete="off"
          value={forName}
          onChange={(event) => onForName(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field id="booking-note" label="Note au salon" optional hint={`${note.length}/300`}>
        <textarea
          id="booking-note"
          rows={4}
          maxLength={300}
          value={note}
          onChange={(event) => onNote(event.target.value)}
          placeholder="Une précision pour votre coiffeur ?"
          className={`${inputClass} h-auto resize-none py-3.5`}
        />
      </Field>
      <button type="button" onClick={onContinue} className={btnPrimary}>
        Continuer
      </button>
    </>
  );
}
