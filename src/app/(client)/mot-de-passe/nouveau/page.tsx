import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/account-forms";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function NouveauMotDePassePage() {
  return (
    <AuthPage
      title="Nouveau mot de passe"
      lead="Choisissez un mot de passe de 8 caractères minimum."
    >
      <ResetPasswordForm />
    </AuthPage>
  );
}
