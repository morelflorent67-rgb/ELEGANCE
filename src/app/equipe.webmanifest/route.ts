import { tabletManifest } from "@/lib/web-app";

// Manifeste de la tablette (D-69) : l'icône ouvre le planning.
export function GET() {
  return Response.json(tabletManifest(), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
