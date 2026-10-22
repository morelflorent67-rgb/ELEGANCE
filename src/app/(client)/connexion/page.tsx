import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { LoginWithRedirect } from "./connexion-client";

export const metadata: Metadata = { title: "Connexion" };

export default function ConnexionPage() {
  return (
    <AuthPage
      title="Bon retour."
      lead="Connectez-vous pour retrouver vos rendez-vous et réserver plus vite."
      footer={
        <Link href="/inscription" className="min-h-11 px-1 py-3 text-[13px] text-ivory-soft">
          Pas encore de compte&nbsp;?{" "}
          <span className="text-ivory underline underline-offset-[3px]">Créer un compte</span>
        </Link>
      }
    >
      <Suspense>
        <LoginWithRedirect />
      </Suspense>
    </AuthPage>
  );
}
