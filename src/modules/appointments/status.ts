// État d'un RDV tel que le salon le voit (R-50, R-51). Fonction pure, testée : le serveur la calcule à chaque affichage.
//
// R-51 : une fois passé, un RDV est honoré par défaut ; l'équipe signale seulement les lapins. On ne programme donc
// aucune tâche pour « honorer » les RDV : un RDV confirmé dont la fin est passée EST honoré, à l'affichage et au
// chiffre d'affaires. Seuls « non venu » et les annulations s'enregistrent.

export type StoredStatus =
  "confirmed" | "honored" | "no_show" | "cancelled_by_customer" | "cancelled_by_salon";

export type PlanningStatus =
  | "upcoming" // confirmé, pas encore commencé
  | "in_progress" // confirmé, commencé et pas terminé
  | "honored" // R-51 : terminé et non signalé comme lapin
  | "no_show" // lapin (R-52)
  | "cancelled";

export function planningStatus(
  appointment: { status: StoredStatus; startsAt: Date; endsAt: Date },
  now: Date,
): PlanningStatus {
  switch (appointment.status) {
    case "no_show":
      return "no_show";
    case "cancelled_by_customer":
    case "cancelled_by_salon":
      return "cancelled";
    case "honored":
      return "honored";
    case "confirmed":
      if (now.getTime() >= appointment.endsAt.getTime()) return "honored";
      if (now.getTime() >= appointment.startsAt.getTime()) return "in_progress";
      return "upcoming";
  }
}

/** Un RDV qui compte au chiffre d'affaires indicatif (R-53) : honoré, d'après R-51. */
export const isHonored = (
  appointment: { status: StoredStatus; startsAt: Date; endsAt: Date },
  now: Date,
): boolean => planningStatus(appointment, now) === "honored";
