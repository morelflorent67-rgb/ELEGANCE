// Forme des réponses de `/api/mobile/v1` (voir src/modules/mobile/api.ts du site). Ces types ne portent aucune règle :
// ce sont des étiquettes pour le typage. Le serveur calcule tout (créneaux, délais, points, libellés).

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface BookingState {
  blocked: boolean;
  upcoming: number;
  maxUpcoming: number;
}

export interface SessionResponse {
  token: string;
  customer: Customer;
  booking: BookingState;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  durationMin: number;
  performedBy: "barber" | "apprentice";
  bookableOnline: boolean;
}

export interface DayRange {
  opensAt: string;
  closesAt: string;
}

export interface Vitrine {
  rules: {
    changeCutoffHours: number;
    maxUpcomingPerCustomer: number;
    waitlistHoldMinutes: number;
    loyaltyEnabled: boolean;
    loyaltyThreshold: number;
  };
  loyaltyPitch: string | null;
  reviewCount: number | null;
  services: Service[];
  team: { id: string; firstName: string; role: "barber" | "apprentice" }[];
  week: Record<number, DayRange[]>;
  closures: { startsOn: string; endsOn: string; reason: string | null }[];
  salon: { name: string; tagline: string };
  legal: LegalDocument[];
  legalUpdated: string;
  access: {
    address: string;
    phoneDisplay: string;
    phoneHref: string;
    email: string;
    mapsUrl: string;
    directionsUrl: string;
    applePlansUrl: string;
    wazeUrl: string;
    instagram: string;
    ways: { kind: string; title: string; detail: string }[];
  };
}

export interface LegalDocument {
  slug: "mentions-legales" | "confidentialite" | "conditions";
  tab: string;
  title: string;
  description: string;
  sections: { num: string; id: string; title: string; body: string }[];
}

export interface StaffChoice {
  id: string;
  firstName: string;
  role: "barber" | "apprentice";
}

export interface Slot {
  iso: string;
  time: string;
}

export interface Day {
  date: string;
  label: string;
  short: string;
  dow: string;
  num: number;
  monthLabel: string;
  state: "open" | "full" | "closed";
  slots: Slot[];
}

export interface DaysResponse {
  today: string;
  lastBookable: string;
  days: Day[];
}

export interface UpcomingAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  dayLabel: string;
  time: string;
  relative: string | null;
  soon: string | null;
  what: string;
  staffFirstName: string;
  staffLabel: string;
  forName: string | null;
  price: string;
  totalPriceCents: number;
  changeable: boolean;
  deadlineLabel: string | null;
  repeated: boolean;
  calendarUrl: string | null;
}

export interface PastAppointment {
  id: string;
  whenLabel: string;
  summary: string;
  cancelled: boolean;
  statusLabel: string | null;
  canRepeat: boolean;
}

export interface WaitlistLine {
  id: string;
  daysLabel: string;
  windowLabel: string;
  staffLabel: string;
  what: string;
  offer: { id: string; label: string; until: string; expiresAt: string } | null;
}

export interface AppointmentsResponse {
  upcoming: UpcomingAppointment[];
  past: PastAppointment[];
  booking: BookingState;
  changeCutoffHours: number;
  waitlist: WaitlistLine[];
}

export interface OfferResponse {
  offer: {
    id: string;
    state: "pending" | "accepted" | "declined" | "expired" | "lost";
    startsAt: string;
    expiresAt: string;
    until: string;
    staff: string;
    services: string;
    price: string;
  };
  maxUpcoming: number;
  now: string;
}

export interface LoyaltyResponse {
  card: {
    enabled: boolean;
    balance: number;
    threshold: number;
    rewardsAvailable: number;
    pointsToNext: number;
    cells: { fill: 0 | 0.5 | 1 }[];
    history: { id: string; dateLabel: string; label: string; points: number }[];
  };
  pointsPerVisit: number;
}
