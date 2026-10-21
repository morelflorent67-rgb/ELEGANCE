import { clientManifest } from "@/lib/web-app";

// Manifeste des clients (D-69) : le site installé sur l'écran d'accueil d'un téléphone.
export function GET() {
  return Response.json(clientManifest(), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
