import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

// Les pages publiques à référencer. L'adresse vient de SITE_URL : le domaine définitif n'est jamais écrit en dur.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const pages: [path: string, priority: number][] = [
    ["", 1],
    ["/prestations", 0.9],
    ["/salon", 0.8],
    ["/reservation", 0.8],
    ["/mentions-legales", 0.2],
    ["/confidentialite", 0.2],
    ["/conditions", 0.2],
  ];
  return pages.map(([path, priority]) => ({ url: `${base}${path}`, priority }));
}
