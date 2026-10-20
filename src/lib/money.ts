/**
 * Lit un prix saisi en euros (« 18 », « 18,50 », « 12 € ») et rend des centimes, ou null si le texte n'est pas un
 * prix (R-10). Pas de calcul en virgule flottante : les centimes se lisent dans le texte.
 */
export function parseEuros(text: string): number | null {
  const clean = text.replace(/[\s  €]/g, "").replace(",", ".");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** 1800 → « 18 », 1850 → « 18,50 » : la valeur d'un champ de saisie, sans symbole. */
export function centsToEuroInput(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, "0")}`;
}
