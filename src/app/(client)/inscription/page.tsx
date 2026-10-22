import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { SignUpWithRedirect } from "./inscription-client";

export const metadata: Metadata = { title: "Créer un compte" };

export default function InscriptionPage() {
  return (
    <AuthPage
      title="Votre compte"
      lead="Pour réserver en ligne et gérer vos rendez-vous."
      footer={
        <Link href="/connexion" className="min-h-11 px-1 py-3 text-[13px] text-ivory-soft">
          Déjà client&nbsp;?{" "}
          <span className="text-ivory underline underline-offset-[3px]">Se connecter</span>
        </Link>
      }
    >
      <Suspense>
        <SignUpWithRedirect />
      </Suspense>
    </AuthPage>
  );
}
