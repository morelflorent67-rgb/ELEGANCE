// Numéros de téléphone (R-70). Clientèle francophone : on accepte les numéros français en notation
// nationale (06 12 34 56 78) ou internationale (+33 6 12 34 56 78), et tout numéro international
// en « + » (8 à 15 chiffres). On stocke la forme internationale sans espace : +33612345678.

export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s.\-()]/g, "");

  if (/^0[1-9]\d{8}$/.test(compact)) return `+33${compact.slice(1)}`;
  if (/^0033[1-9]\d{8}$/.test(compact)) return `+33${compact.slice(4)}`;
  if (/^\+33[1-9]\d{8}$/.test(compact)) return compact;
  if (/^\+33/.test(compact)) return null; // faux numéro français : la longueur ne correspond pas
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  return null;
}

/** Affichage : +33612345678 → 06 12 34 56 78 ; les autres numéros restent tels quels. */
export function formatPhone(e164: string): string {
  const match = /^\+33([1-9])(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return match ? `0${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}` : e164;
}
