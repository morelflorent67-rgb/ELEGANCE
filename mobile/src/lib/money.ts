/** 2800 → « 28 € », 1250 → « 12,50 € » ; même rendu que le site. */
export function formatPrice(cents: number): string {
  const whole = cents % 100 === 0;
  const amount = (cents / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `${amount.replace(/[  ]/g, " ")} €`;
}

/** 30 → « 30 min », 75 → « 1 h 15 », 120 → « 2 h ». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}
