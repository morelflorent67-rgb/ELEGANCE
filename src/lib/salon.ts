// Coordonnées publiques du salon : identité, pas réglages de gestion (ceux-ci sont en base, voir salon_settings).
// Une seule source pour la vitrine, les emails et les boutons « Appeler ».
export const SALON = {
  name: "Elegance Strasbourg",
  tagline: "Bien plus qu'une coupe",
  street: "162 route de Bischwiller",
  postalCode: "67300",
  city: "Schiltigheim",
  phoneDisplay: "03 88 97 74 68",
  phoneHref: "tel:+33388977468",
  instagram: "https://www.instagram.com/elegance_strasbourg",
  snapchat: "https://www.snapchat.com/add/barb.hair",
} as const;

export const salonAddressLine = `${SALON.street}, ${SALON.postalCode} ${SALON.city}`;

export const salonMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${SALON.name} ${salonAddressLine}`,
)}`;
