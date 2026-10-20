import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

// Tant que ALLOW_INDEXING n'est pas « true » (voir layout.tsx), aucun moteur ne doit explorer le site.
export default function robots(): MetadataRoute.Robots {
  if (process.env.ALLOW_INDEXING !== "true") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Espaces privés : la tablette, le compte client, les étapes de connexion.
      disallow: [
        "/equipe",
        "/compte",
        "/api",
        "/connexion",
        "/inscription",
        "/mot-de-passe",
        "/mot-de-passe-oublie",
        "/reservation/confirmation",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
