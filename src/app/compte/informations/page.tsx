import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountNav } from "@/components/account-nav";
import { Eyebrow, PageHeader } from "@/components/ui";
import { db } from "@/db/client";
import { getAuthDriver } from "@/modules/auth";
import { currentCustomer } from "@/modules/customers/accounts";
import { hasImminentAppointment } from "@/modules/customers/profile";
import { AccountActions, PasswordForm, ProfileForm } from "./informations-forms";

export const metadata: Metadata = { title: "Mes informations" };

export default function MesInformationsPage() {
  return (
    <div className="min-h-dvh">
      <PageHeader backHref="/" />
      <Suspense
        fallback={
          <p role="status" className="px-6 py-10 text-center text-body-sm text-stone">
            Chargement…
          </p>
        }
      >
        <Informations />
      </Suspense>
    </div>
  );
}

// R-76 : les informations du client. Les contrôles (mot de passe, unicité de l'email, délai de modification (R-30) avant de
// supprimer un compte) sont refaits côté serveur à chaque action.
async function Informations() {
  await connection();
  const database = db();
  const customer = await currentCustomer(database, getAuthDriver());
  if (!customer) redirect("/connexion?next=/compte/informations");
  const imminent = await hasImminentAppointment(database, customer.id);

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-8 px-6 pb-16 pt-6">
      <div className="flex flex-col gap-3">
        <Eyebrow>Mon compte</Eyebrow>
        <h1 className="text-title-1">Mes informations</h1>
      </div>
      <AccountNav current="informations" />
      <ProfileForm customer={customer} />
      <PasswordForm />
      <AccountActions imminentAppointment={imminent} />
    </main>
  );
}
