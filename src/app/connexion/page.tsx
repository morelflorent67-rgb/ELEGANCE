import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { btnSecondary } from "@/components/ui";
import { LoginWithRedirect } from "./connexion-client";

export const metadata: Metadata = { title: "Connexion" };

export default function ConnexionPage() {
  return (
    <AuthPage
      title="Connexion"
      lead="Retrouvez vos rendez-vous et réservez plus vite."
      footer={
        <>
          <span className="text-body">Pas encore de compte ?</span>
          <Link href="/inscription" className={btnSecondary}>
            Créer un compte
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginWithRedirect />
      </Suspense>
    </AuthPage>
  );
}
