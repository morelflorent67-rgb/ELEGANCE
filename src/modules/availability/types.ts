export type Audience = "online" | "salon";

/** Réglages lus en base (jamais en dur) qui pilotent le calcul des créneaux. */
export interface EngineSettings {
  timezone: string;
  minNoticeMinutes: number;
  maxHorizonDays: number;
  onlineSlotStepMinutes: number;
  salonSlotStepMinutes: number;
}

/** Plage d'ouverture : weekday 1 = lundi … 7 = dimanche ; heures locales « HH:mm » ou « HH:mm:ss ». */
export interface OpeningRange {
  weekday: number;
  opensAt: string;
  closesAt: string;
}

/** Fermeture exceptionnelle : jours entiers, bornes incluses, « AAAA-MM-JJ ». */
export interface Closure {
  startsOn: string;
  endsOn: string;
}

export interface BusyInterval {
  staffId: string;
  startsAt: Date;
  endsAt: Date;
}

/** Tout ce que le calcul a besoin de savoir, sans accès à la base. */
export interface Snapshot {
  settings: EngineSettings;
  openingHours: OpeningRange[];
  closures: Closure[];
  /** RDV qui occupent un coiffeur (confirmé, honoré, non venu) : voir R-23. */
  appointments: BusyInterval[];
  absences: BusyInterval[];
  /**
   * Places gardées pour une personne de la liste d'attente (D-100) : elles bloquent la réservation en ligne des autres,
   * pas celle du salon.
   */
  holds?: BusyInterval[];
}

export type RejectionReason =
  "in_past" | "too_soon" | "too_far" | "closed" | "outside_hours" | "off_grid" | "busy" | "held";

export type SlotCheck = { ok: true } | { ok: false; reason: RejectionReason };

export interface Slot {
  startsAt: Date;
  /** Coiffeurs libres à cet horaire, dans l'ordre fourni. */
  staffIds: string[];
}
