import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { SignUpWithRedirect } from "./inscription-client";

export const metadata: Metadata = { title: "Créer un compte" };

export default function InscriptionPage() {
  return (
    <AuthPage
      backHref="/connexion"
      title="Créer un compte"
      lead="Pour réserver en ligne et gérer vos rendez-vous."
      footer={
        <div className="flex items-center justify-center gap-2 text-body-sm text-stone">
          Déjà un compte ?
          <Link href="/connexion" className="inline-flex min-h-11 items-center text-ivory">
            Se connecter
          </Link>
        </div>
      }
    >
      <Suspense>
        <SignUpWithRedirect />
      </Suspense>
    </AuthPage>
  );
}
