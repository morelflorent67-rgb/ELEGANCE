import { formatPrice } from "@/lib/format";
import { SALON } from "@/lib/salon";
import { schemaOpeningHours } from "./hours";
import type { VitrineData } from "./load";

// Référencement local : le salon décrit pour les moteurs de recherche (schema.org), à partir de la base.

const euros = (cents: number) => (cents / 100).toFixed(2);

export function salonJsonLd(data: VitrineData, baseUrl: string) {
  const prices = data.services.map((s) => s.priceCents);
  return {
    "@context": "https://schema.org",
    "@type": "HairSalon" as const,
    "@id": `${baseUrl}/#salon`,
    name: SALON.name,
    url: baseUrl,
    image: `${baseUrl}/photos/salon-wide.jpg`,
    description:
      "Salon de coiffure homme et barbe à Schiltigheim, près de Strasbourg. Sur rendez-vous, réservation en ligne.",
    telephone: SALON.phoneHref.replace(/^tel:/, ""),
    priceRange:
      prices.length > 0
        ? `${formatPrice(Math.min(...prices))} - ${formatPrice(Math.max(...prices))}`
        : undefined,
    address: {
      "@type": "PostalAddress" as const,
      streetAddress: SALON.street,
      postalCode: SALON.postalCode,
      addressLocality: SALON.city,
      addressCountry: "FR",
    },
    openingHoursSpecification: schemaOpeningHours(data.week),
    sameAs: [SALON.instagram, SALON.snapchat],
    hasOfferCatalog: {
      "@type": "OfferCatalog" as const,
      name: "Prestations",
      itemListElement: data.services.map((s) => ({
        "@type": "Offer" as const,
        price: euros(s.priceCents),
        priceCurrency: "EUR",
        itemOffered: { "@type": "Service" as const, name: s.name },
      })),
    },
  };
}

/** JSON à placer dans une balise `<script type="application/ld+json">` : `<` est échappé, rien ne peut la fermer. */
export const jsonLdScript = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c");
