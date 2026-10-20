// Photos du salon (traitement sombre homogène de la passation design, voir docs/design/README.md §7).
// Les fichiers sont dans public/photos ; next/image les sert en AVIF/WebP aux tailles utiles.

export interface Photo {
  src: string;
  width: number;
  height: number;
  /** Description pour les lecteurs d'écran. */
  alt: string;
  /** Légende courte, en capitales sous la photo. */
  caption: string;
}

export const photos = {
  hero: {
    src: "/photos/hero-hex-v.jpg",
    width: 780,
    height: 1040,
    alt: "Le plafond hexagonal de lignes LED au-dessus des postes du salon",
    caption: "Le plafond de lumière",
  },
  postesWide: {
    src: "/photos/salon-wide.jpg",
    width: 1170,
    height: 601,
    alt: "Les postes alignés sous le plafond hexagonal de lignes LED",
    caption: "Les postes, sous le plafond de lumière",
  },
  fauteuils: {
    src: "/photos/stitch-v.jpg",
    width: 600,
    height: 764,
    alt: "Dossier de fauteuil capitonné à surpiqûres dorées",
    caption: "Les fauteuils",
  },
  lumiere: {
    src: "/photos/bulb-v.jpg",
    width: 500,
    height: 640,
    alt: "Suspension en métal à ampoule à filament",
    caption: "La lumière",
  },
  attente: {
    src: "/photos/lounge-salon.jpg",
    width: 1170,
    height: 688,
    alt: "Espace d'attente avec canapés en cuir et poutres en bois",
    caption: "L'attente — canapés en cuir et café",
  },
} satisfies Record<string, Photo>;

/** La galerie de la page Le salon, dans l'ordre de la maquette. */
export const gallery: Photo[] = [
  {
    src: "/photos/row-wide.jpg",
    width: 1170,
    height: 714,
    alt: "Les postes sous le plafond hexagonal",
    caption: "Les postes",
  },
  {
    src: "/photos/wall-full.jpg",
    width: 1166,
    height: 715,
    alt: "Le mur de l'entrée",
    caption: "L'entrée",
  },
  {
    src: "/photos/chair-full.jpg",
    width: 1168,
    height: 713,
    alt: "Fauteuil capitonné et mur végétal",
    caption: "Les fauteuils",
  },
  {
    src: "/photos/neon-full.jpg",
    width: 1167,
    height: 712,
    alt: "Le coin photo",
    caption: "Le coin photo",
  },
  {
    src: "/photos/room-green.jpg",
    width: 1170,
    height: 713,
    alt: "Le second espace et sa suspension",
    caption: "La lumière",
  },
  {
    src: "/photos/lounge-wide.jpg",
    width: 1167,
    height: 710,
    alt: "L'espace d'attente",
    caption: "L'attente",
  },
];
