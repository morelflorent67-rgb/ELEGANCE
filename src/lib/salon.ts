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

/** Itinéraire jusqu'au salon (accueil, D-98). */
export const salonDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  salonAddressLine,
)}`;
export const salonWazeUrl = `https://waze.com/ul?q=${encodeURIComponent(
  `${SALON.street} ${SALON.city}`,
)}&navigate=yes`;

/** Venir au salon (D-98, confirmé par Florent le 22 octobre 2026). */
export const SALON_ACCESS = [
  { kind: "parking", title: "Parking", detail: "Hôtel de ville" },
  { kind: "bus", title: "Bus 60 · C3", detail: "Arrêt Mairie" },
  { kind: "bike", title: "Vélo", detail: "Piste cyclable" },
] as const;
