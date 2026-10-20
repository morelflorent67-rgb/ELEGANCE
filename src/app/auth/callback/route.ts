import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAuthDriver } from "@/modules/auth";
import { safeNext } from "@/lib/safe-redirect";

// Retour du lien de réinitialisation du mot de passe : échange le code contre une session, puis redirige.
export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/");
  if (!code || !(await getAuthDriver().exchangeRecoveryCode(code))) {
    redirect("/mot-de-passe-oublie?lien=invalide");
  }
  redirect(next);
}
