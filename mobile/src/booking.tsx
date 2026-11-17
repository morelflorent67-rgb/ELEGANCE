import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// État de la réservation en cours, gardé en mémoire pendant tout le parcours : une session expirée au dernier écran
// renvoie à la connexion puis revient à la même étape, sans rien perdre.

export interface BookingDraft {
  serviceIds: string[];
  /** « any » = sans préférence. */
  staffId: string;
  /** Début du créneau choisi, en ISO UTC (rendu tel quel par le serveur). */
  startsAt: string | null;
  /** « Mercredi 18 novembre · 10:00 », pour le récapitulatif. */
  slotLabel: string | null;
  forName: string;
  note: string;
  /** Renseigné quand on déplace un RDV existant : les prestations viennent du RDV, jamais de l'app. */
  movingId: string | null;
}

const EMPTY: BookingDraft = {
  serviceIds: [],
  staffId: "any",
  startsAt: null,
  slotLabel: null,
  forName: "",
  note: "",
  movingId: null,
};

interface BookingValue {
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
  reset: (initial?: Partial<BookingDraft>) => void;
}

const BookingContext = createContext<BookingValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft>(EMPTY);
  const value = useMemo<BookingValue>(
    () => ({
      draft,
      update: (patch) => setDraft((d) => ({ ...d, ...patch })),
      reset: (initial = {}) => setDraft({ ...EMPTY, ...initial }),
    }),
    [draft],
  );
  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingValue {
  const value = useContext(BookingContext);
  if (!value) throw new Error("useBooking doit être appelé sous BookingProvider");
  return value;
}
