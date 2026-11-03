// Glisser-déposer d'un RDV dans le planning (D-110, R-95). Fonctions pures : elles disent où tombe le bloc et si cet
// endroit est libre, pour que la tablette l'annonce avant le dépôt. Le serveur reste seul juge (R-23, R-13, horaires).

export interface DragColumn {
  staffId: string;
  appointments: { id: string; startMinute: number; endMinute: number }[];
  absences: { startMinute: number; endMinute: number }[];
}

export type DropProblem = "occupied" | "absent" | "closed" | "past";

/** Le bloc s'aligne sur la grille des créneaux du salon (heure pile, demie…) et reste dans la journée affichée. */
export function snapMinute(
  rawMinute: number,
  step: number,
  bounds: { min: number; max: number },
  duration: number,
): number {
  const snapped = Math.round(rawMinute / step) * step;
  return Math.min(Math.max(snapped, bounds.min), Math.max(bounds.min, bounds.max - duration));
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

/**
 * Pourquoi le RDV ne peut pas tomber là, ou null si l'endroit paraît libre : dans le passé (jour courant), hors des
 * horaires ou à cheval sur la pause, sur une absence, sur un autre RDV du coiffeur. Un RDV voisin qui touche sans
 * chevaucher ne gêne pas.
 */
export function dropProblem(input: {
  columns: DragColumn[];
  ranges: { from: number; to: number }[];
  target: { staffId: string; startMinute: number };
  duration: number;
  movingId: string;
  /** Minute actuelle du jour affiché (jour courant seulement) : on ne dépose pas avant. */
  nowMinute: number | null;
}): DropProblem | null {
  const { columns, ranges, target, duration, movingId, nowMinute } = input;
  const start = target.startMinute;
  const end = start + duration;
  if (nowMinute !== null && start < nowMinute) return "past";
  if (!ranges.some((r) => start >= r.from && end <= r.to)) return "closed";
  const column = columns.find((c) => c.staffId === target.staffId);
  if (!column) return "closed";
  if (column.absences.some((a) => overlaps(start, end, a.startMinute, a.endMinute))) return "absent";
  if (
    column.appointments.some(
      (a) => a.id !== movingId && overlaps(start, end, a.startMinute, a.endMinute),
    )
  ) {
    return "occupied";
  }
  return null;
}

export const DROP_PROBLEM_LABEL: Record<DropProblem, string> = {
  occupied: "Déjà pris",
  absent: "Absent",
  closed: "Fermé",
  past: "Passé",
};

/** Vrai quand la position ne change rien (même coiffeur, même heure). */
export const sameSpot = (
  from: { staffId: string; startMinute: number },
  to: { staffId: string; startMinute: number },
) => from.staffId === to.staffId && from.startMinute === to.startMinute;

/**
 * Choix de l'appui : au toucher, un appui long (pour ne pas gêner le défilement) ; à la souris, un déplacement de
 * quelques pixels. Un doigt qui bouge avant la fin de l'appui long fait défiler la page : pas de glisser.
 */
export const LONG_PRESS_MS = 250;
export const TOUCH_SLOP_PX = 8;
export const MOUSE_SLOP_PX = 5;
