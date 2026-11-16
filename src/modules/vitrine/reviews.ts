/**
 * Texte du bandeau d'avis de l'accueil (D-112). Le total cumulé vient des réglages (`salon_settings.review_count`) ;
 * on l'arrondit à la centaine inférieure pour ne jamais en annoncer plus qu'il n'y en a : 1 043 donne « Plus de 1 000 avis ».
 * Rien sous 100 avis, ou si le réglage est vide : pas de bandeau.
 */
export function reviewHeadline(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count)) return null;
  const floor = Math.floor(count / 100) * 100;
  if (floor < 100) return null;
  // Espace insécable : « 1 000 » ne se coupe pas en fin de ligne.
  const grouped = String(floor).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `Plus de ${grouped} avis`;
}
