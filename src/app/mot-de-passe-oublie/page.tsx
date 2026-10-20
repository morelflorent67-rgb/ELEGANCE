import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/account-forms";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function MotDePasseOubliePage() {
  return (
    <AuthPage
      backHref="/connexion"
      title="Mot de passe oublié"
      lead="Indiquez votre email : nous vous envoyons un lien pour choisir un nouveau mot de passe."
    >
      <ForgotPasswordForm />
    </AuthPage>
  );
}
