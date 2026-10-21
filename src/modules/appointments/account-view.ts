import { capitalize, formatDay, formatPrice, formatTime, parisDate } from "@/lib/format";
import type { AppointmentView } from "./queries";

// Ce que « Mes rendez-vous » affiche pour chaque RDV : libellés, délai de modification et état des boutons.
// Fonctions pures, testées : le serveur les calcule, le navigateur ne fait qu'afficher (R-30, R-31, R-32).

const HOUR = 3_600_000;

/** Nombre de jours de Paris entre deux instants (0 = même jour, 1 = demain…). */
function parisDaysBetween(from: Date, to: Date): number {
  const a = Date.parse(`${parisDate(from)}T00:00:00Z`);
  const b = Date.parse(`${parisDate(to)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export interface AccountAppointment {
  id: string;
  /** « Demain · mercredi 21 octobre », « Samedi 7 novembre »… */
  dayLabel: string;
  time: string;
  /** « Dans 18 jours » : seulement quand le RDV n'est ni aujourd'hui ni demain. */
  relative: string | null;
  items: { name: string; priceCents: number; durationMin: number }[];
  /** « avec Orhan », ou « Pour Lina, avec Orhan » (D-80). */
  staffLabel: string;
  /** R-30 : encore modifiable et annulable en ligne. Sinon : « Contactez le salon » (R-31, R-32). */
  changeable: boolean;
  /** « vendredi 6 novembre, 10:00 », quand le RDV est encore modifiable. */
  deadlineLabel: string | null;
}

export interface PastAccountAppointment {
  id: string;
  /** « Samedi 10 octobre · 10:30 » */
  whenLabel: string;
  /** « Coupe homme + Taillage barbe · 30 € · avec Enes » */
  summary: string;
  cancelled: boolean;
  /** « Annulé » ou « Annulé par le salon », sinon null. « Non venu » n'est jamais montré au client. */
  statusLabel: string | null;
}

/** À venir : confirmé et pas encore terminé. Tout le reste (passé, honoré, annulé) va dans « Passés ». */
export function splitAppointments(
  list: AppointmentView[],
  now: Date,
): { upcoming: AppointmentView[]; past: AppointmentView[] } {
  const upcoming = list
    .filter((a) => a.status === "confirmed" && a.endsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const ids = new Set(upcoming.map((a) => a.id));
  const past = list
    .filter((a) => !ids.has(a.id))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return { upcoming, past };
}

export function upcomingView(
  a: AppointmentView,
  now: Date,
  cutoffHours: number,
): AccountAppointment {
  const days = parisDaysBetween(now, a.startsAt);
  const date = capitalize(formatDay(a.startsAt));
  const dayLabel =
    days === 0
      ? `Aujourd'hui · ${formatDay(a.startsAt)}`
      : days === 1
        ? `Demain · ${formatDay(a.startsAt)}`
        : date;
  const deadline = new Date(a.startsAt.getTime() - cutoffHours * HOUR);
  const changeable = now.getTime() <= deadline.getTime();
  return {
    id: a.id,
    dayLabel,
    time: formatTime(a.startsAt),
    relative: days >= 2 ? `Dans ${days} jours` : null,
    items: a.items,
    staffLabel: a.forName
      ? `Pour ${a.forName}, avec ${a.staffFirstName}`
      : `avec ${a.staffFirstName}`,
    changeable,
    deadlineLabel: changeable ? `${formatDay(deadline)}, ${formatTime(deadline)}` : null,
  };
}

export function pastView(a: AppointmentView): PastAccountAppointment {
  const cancelled = a.status === "cancelled_by_customer" || a.status === "cancelled_by_salon";
  const names = a.items.map((i) => i.name).join(" + ");
  return {
    id: a.id,
    whenLabel: `${capitalize(formatDay(a.startsAt))} · ${formatTime(a.startsAt)}`,
    summary: `${names} · ${formatPrice(a.totalPriceCents)} · avec ${a.staffFirstName}${
      a.forName ? ` · pour ${a.forName}` : ""
    }`,
    cancelled,
    statusLabel:
      a.status === "cancelled_by_customer"
        ? "Annulé"
        : a.status === "cancelled_by_salon"
          ? "Annulé par le salon"
          : null,
  };
}
