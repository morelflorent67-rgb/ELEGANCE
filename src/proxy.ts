import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rafraîchit la session Supabase du client sur les pages qui en ont besoin : un composant serveur ne peut pas
// écrire de cookie, donc c'est ici que le jeton renouvelé est posé. Aucun appel pour un visiteur sans session.
export async function proxy(request: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (process.env.AUTH_DRIVER === "memory" || !url || !key || !hasSession)
    return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // getClaims() renouvelle le jeton s'il a expiré et vérifie sa signature sur place : pas d'appel réseau à chaque page.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/reservation/:path*",
    "/compte/:path*",
    "/connexion",
    "/inscription",
    "/mot-de-passe/:path*",
    "/equipe/:path*",
  ],
};
