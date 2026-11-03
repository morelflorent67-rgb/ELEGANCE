export const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"] as const;
export type KeypadKey = (typeof KEYPAD_KEYS)[number];

const MAX_DIGITS = 7;

/** Ce que fait une touche du pavé sur un montant saisi en euros (une virgule, 2 décimales au plus, 7 chiffres au plus). */
export function pressKey(text: string, key: KeypadKey): string {
  if (key === "⌫") return text.slice(0, -1);
  if (key === ",") return text.includes(",") ? text : `${text === "" ? "0" : text},`;
  const decimals = text.includes(",") ? text.split(",")[1].length : 0;
  if (decimals >= 2 || text.replace(",", "").length >= MAX_DIGITS) return text;
  return text === "0" ? key : text + key;
}
