import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/db/client";
import { signOutAction } from "@/app/compte/actions";
import { getAuthDriver } from "@/modules/auth";
import { currentCustomer } from "@/modules/customers/accounts";

/** Pied du menu : qui est connecté, ou le moyen de se connecter. Lu à chaque affichage (session). */
export async function MenuAccount() {
  await connection();
  const customer = await currentCustomer(db(), getAuthDriver());
  if (!customer) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm text-stone">Pas encore de compte ?</span>
        <Link href="/connexion" className="flex min-h-11 items-center text-body-sm text-ivory-soft">
          Se connecter
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-body-sm text-stone">
        Connecté : {customer.firstName} {customer.lastName}
      </span>
      <form action={signOutAction}>
        <button type="submit" className="flex min-h-11 items-center text-body-sm text-ivory-soft">
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
