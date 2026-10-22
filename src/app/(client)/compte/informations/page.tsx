import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PanelAuth } from "@/components/client/panel-auth";
import { PanelBody, PanelHeader } from "@/components/client/panel";
import { db } from "@/db/client";
import { getAuthDriver } from "@/modules/auth";
import { currentCustomer } from "@/modules/customers/accounts";
import { hasImminentAppointment } from "@/modules/customers/profile";
import { AccountActions, PasswordForm, ProfileForm } from "./informations-forms";

export const metadata: Metadata = { title: "Mon compte" };

export default function MonComptePage() {
  return (
    <>
      <PanelHeader back={{ href: "/compte/rendez-vous", label: "Mes rendez-vous" }} />
      <PanelBody>
        <Suspense
          fallback={
            <p role="status" className="py-10 text-center text-[14px] text-stone">
              Chargement…
            </p>
          }
        >
          <Informations />
        </Suspense>
      </PanelBody>
    </>
  );
}

// R-76 : les informations du client. Les contrôles (mot de passe, unicité de l'email, délai de modification (R-30) avant de
// supprimer un compte) sont refaits côté serveur à chaque action.
async function Informations() {
  await connection();
  const database = db();
  const customer = await currentCustomer(database, getAuthDriver());
  if (!customer) return <PanelAuth next="/compte/informations" />;
  const imminent = await hasImminentAppointment(database, customer.id);

  return (
    <>
      <h1
        className="s-up font-display text-[40px] leading-[1.05]"
        style={{ animationDelay: "120ms" }}
      >
        Mon compte
      </h1>
      <div className="s-up flex flex-col gap-7" style={{ animationDelay: "170ms" }}>
        <ProfileForm customer={customer} />
        <PasswordForm />
        <AccountActions imminentAppointment={imminent} />
      </div>
    </>
  );
}
