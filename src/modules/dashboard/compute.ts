import { isHonored, type StoredStatus } from "@/modules/appointments/status";

// Les chiffres du tableau de bord (R-53 à R-55). Fonction pure : elle reçoit les RDV d'une période et rend les totaux.
// Le chiffre d'affaires est un repère sans valeur comptable (R-55) : la caisse fait foi.

export interface DashboardAppointment {
  id: string;
  staffId: string;
  status: StoredStatus;
  source: "online" | "salon";
  startsAt: Date;
  endsAt: Date;
  /** Somme des prix figés des prestations du RDV (R-16). */
  priceCents: number;
  /** Montant corrigé à la clôture (R-53, R-54), ou null. */
  adjustedAmountCents: number | null;
}

export interface DashboardStaff {
  id: string;
  firstName: string;
  role: "barber" | "apprentice";
}

/** Un encaissement hors rendez-vous réussi (D-109) : passage sans RDV, produit, supplément. */
export interface DashboardWalkIn {
  staffId: string;
  amountCents: number;
}

export interface StaffTotals extends DashboardStaff {
  appointments: number;
  revenueCents: number;
  noShows: number;
}

export interface DashboardTotals {
  /** R-53 : les RDV honorés (R-51), au prix figé ou au montant ajusté, plus les encaissements hors rendez-vous (R-94). */
  revenueCents: number;
  /** R-94 : la part des encaissements hors rendez-vous dans le chiffre d'affaires, et leur nombre. */
  walkInCents: number;
  walkInCount: number;
  /** Rendez-vous de la période, annulés exclus : honorés, en cours, à venir et lapins. */
  appointmentCount: number;
  onlineCount: number;
  salonCount: number;
  /** Lapins (R-52). */
  noShowCount: number;
  /** RDV honorés dont le montant a été corrigé (R-54). */
  adjustedCount: number;
  perStaff: StaffTotals[];
}

/** Le montant que ce RDV apporte : l'ajustement s'il y en a un (même 0 €), sinon le prix figé. */
export const amountOf = (a: Pick<DashboardAppointment, "priceCents" | "adjustedAmountCents">) =>
  a.adjustedAmountCents ?? a.priceCents;

export function computeDashboard(
  appointments: DashboardAppointment[],
  staff: DashboardStaff[],
  now: Date,
  walkIns: DashboardWalkIn[] = [],
): DashboardTotals {
  const perStaff = new Map<string, StaffTotals>(
    staff.map((s) => [s.id, { ...s, appointments: 0, revenueCents: 0, noShows: 0 }]),
  );
  const totals: DashboardTotals = {
    revenueCents: 0,
    walkInCents: 0,
    walkInCount: 0,
    appointmentCount: 0,
    onlineCount: 0,
    salonCount: 0,
    noShowCount: 0,
    adjustedCount: 0,
    perStaff: [],
  };

  for (const a of appointments) {
    if (a.status === "cancelled_by_customer" || a.status === "cancelled_by_salon") continue;
    const row = perStaff.get(a.staffId);
    totals.appointmentCount++;
    if (a.source === "online") totals.onlineCount++;
    else totals.salonCount++;
    if (row) row.appointments++;

    if (a.status === "no_show") {
      totals.noShowCount++;
      if (row) row.noShows++;
    }
    if (isHonored(a, now)) {
      const amount = amountOf(a);
      totals.revenueCents += amount;
      if (a.adjustedAmountCents !== null) totals.adjustedCount++;
      if (row) row.revenueCents += amount;
    }
  }

  for (const w of walkIns) {
    totals.revenueCents += w.amountCents;
    totals.walkInCents += w.amountCents;
    totals.walkInCount++;
    const row = perStaff.get(w.staffId);
    if (row) row.revenueCents += w.amountCents;
  }

  totals.perStaff = [...perStaff.values()];
  return totals;
}
