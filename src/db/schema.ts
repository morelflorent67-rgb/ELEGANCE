import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Modèle de données (transmission-code.md). Les contraintes qui ne s'écrivent pas ici (exclusion R-23,
// sécurité par ligne) sont dans la migration SQL « constraints_and_rls ».
// Heures : timestamptz, stockées en UTC (principe 3). Jours et horaires d'ouverture : heure locale du salon.

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const staffRole = pgEnum("staff_role", ["barber", "apprentice"]);
export const appointmentStatus = pgEnum("appointment_status", [
  "confirmed",
  "honored",
  "no_show",
  "cancelled_by_customer",
  "cancelled_by_salon",
]);
export const appointmentSource = pgEnum("appointment_source", ["online", "salon"]);
/** D'où vient une fiche client : inscription en ligne, créée à la tablette, ou importée du fichier du salon (D-70). */
export const customerOrigin = pgEnum("customer_origin", ["account", "salon", "import"]);
export const actorType = pgEnum("actor_type", ["customer", "staff", "manager", "system"]);
export const emailType = pgEnum("email_type", [
  "confirmation",
  "reminder",
  "modification",
  "cancellation",
  "review_invitation",
  "series_confirmation",
  "waitlist_offer",
  "winback",
]);
/** Liste d'attente (D-73, D-100) : plage de la journée voulue, avant midi, après midi, ou toute la journée. */
export const waitlistWindow = pgEnum("waitlist_window", ["morning", "afternoon", "day"]);
export const waitlistEntryStatus = pgEnum("waitlist_entry_status", ["active", "fulfilled", "removed"]);
export const waitlistOfferStatus = pgEnum("waitlist_offer_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
  "lost",
]);
/** RDV répétés (D-71) : toutes les 1 à 4 semaines, ou chaque mois. */
export const seriesFrequency = pgEnum("series_frequency", ["weekly", "monthly"]);
/** « Chaque mois » : le même quantième, le même rang de jour (« 2e mardi ») ou le dernier tel jour du mois (D-85). */
export const seriesMonthlyMode = pgEnum("series_monthly_mode", [
  "day_of_month",
  "weekday_rank",
  "last_weekday",
]);
/** Encaissement au terminal (D-105) : en cours sur le terminal, réussi, refusé ou expiré, annulé par l'équipe. */
export const paymentStatus = pgEnum("payment_status", ["pending", "successful", "failed", "cancelled"]);
export const emailStatus = pgEnum("email_status", ["pending", "sent", "failed"]);

/** Réglages du salon : une seule ligne (principe 8, R-01 à R-07). */
export const salonSettings = pgTable(
  "salon_settings",
  {
    id: boolean("id").primaryKey().default(true),
    timezone: text("timezone").notNull().default("Europe/Paris"),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(60), // R-06
    maxHorizonDays: integer("max_horizon_days").notNull().default(42), // R-06
    onlineSlotStepMinutes: integer("online_slot_step_minutes").notNull().default(30), // R-04, D-65
    salonSlotStepMinutes: integer("salon_slot_step_minutes").notNull().default(30), // R-04, D-65 (15 avant le 21/10/2026)
    changeCutoffHours: integer("change_cutoff_hours").notNull().default(1), // R-30, D-63
    maxUpcomingPerCustomer: integer("max_upcoming_per_customer").notNull().default(5), // R-25, D-66
    noShowBlockThreshold: integer("no_show_block_threshold").notNull().default(2), // R-52
    reminderHours: integer("reminder_hours").notNull().default(24), // R-61, D-64
    /** Page d'avis externe vers laquelle mène l'invitation (R-64). Vide : aucune invitation n'est envoyée. */
    reviewUrl: text("review_url"),
    /** Durée pendant laquelle une place libérée est gardée pour une seule personne de la liste d'attente (D-100). */
    waitlistHoldMinutes: integer("waitlist_hold_minutes").notNull().default(15),
    /** Délai après le dernier RDV honoré avant « Nous serions ravis de vous revoir » (D-74). */
    winbackAfterDays: integer("winback_after_days").notNull().default(15),
    /** Terminal d'encaissement SumUp Solo (D-105) : code marchand et identifiant du terminal appairé. La clé d'API reste dans l'environnement. */
    paymentMerchantCode: text("payment_merchant_code"),
    paymentReaderId: text("payment_reader_id"),
    managerPinHash: text("manager_pin_hash"), // R-73
  },
  (t) => [
    check("salon_settings_single_row", sql`${t.id} = true`),
    check("salon_settings_review_url", sql`${t.reviewUrl} is null or ${t.reviewUrl} ~ '^https?://[^ ]+$'`),
    check("salon_settings_waitlist", sql`${t.waitlistHoldMinutes} > 0 and ${t.winbackAfterDays} > 0`),
    check("salon_settings_positive", sql`${t.minNoticeMinutes} >= 0 and ${t.maxHorizonDays} > 0`),
    check(
      "salon_settings_steps",
      sql`${t.onlineSlotStepMinutes} > 0 and ${t.salonSlotStepMinutes} > 0`,
    ),
  ],
);

/** Plages d'ouverture : weekday 1 = lundi … 7 = dimanche. La pause est le trou entre deux plages (R-01, R-04). */
export const openingHours = pgTable(
  "opening_hours",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    weekday: smallint("weekday").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
  },
  (t) => [
    check("opening_hours_weekday", sql`${t.weekday} between 1 and 7`),
    check("opening_hours_order", sql`${t.opensAt} < ${t.closesAt}`),
    unique("opening_hours_unique").on(t.weekday, t.opensAt),
  ],
);

/** Fermetures exceptionnelles, jours entiers, bornes incluses (R-03). */
export const closure = pgTable(
  "closure",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    reason: text("reason"),
  },
  (t) => [check("closure_order", sql`${t.endsOn} >= ${t.startsOn}`)],
);

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name").notNull(),
  role: staffRole("role").notNull(), // R-02, R-13
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0), // ordre d'affichage, départage « Sans préférence » (R-20)
});

export const service = pgTable(
  "service",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    category: text("category"), // groupe d'affichage dans la carte (« Coupes », « Barbe et soin »…)
    priceCents: integer("price_cents").notNull(), // R-10, R-15
    durationMin: integer("duration_min").notNull(), // R-10 : multiple de 15
    performedBy: staffRole("performed_by").notNull(), // R-12, R-18
    bookableOnline: boolean("bookable_online").notNull().default(true), // R-17
    active: boolean("active").notNull().default(true), // une prestation retirée est désactivée, jamais supprimée (R-16)
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    check("service_duration", sql`${t.durationMin} > 0 and ${t.durationMin} % 15 = 0`),
    check("service_price", sql`${t.priceCents} >= 0`),
  ],
);

/** Habilitations : quels membres réalisent quelles prestations (R-12, R-13). */
export const serviceStaff = pgTable(
  "service_staff",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.staffId] })],
);

export const customer = pgTable(
  "customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: uuid("auth_user_id").unique(), // compte Supabase ; vidé à l'anonymisation (R-75)
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    email: text("email"),
    onlineBookingBlocked: boolean("online_booking_blocked").notNull().default(false), // R-52
    reviewOptOut: boolean("review_opt_out").notNull().default(false), // R-64 : ne veut plus des invitations à un avis
    winbackOptOut: boolean("winback_opt_out").notNull().default(false), // R-84 : ne veut plus des relances (D-74)
    /** Sans compte de connexion tant que `authUserId` est vide ; l'origine reste après le rattachement (D-70). */
    origin: customerOrigin("origin").notNull().default("account"),
    /** Historique repris du fichier du salon, affiché à titre indicatif sur la fiche (D-77). */
    legacyVisits: integer("legacy_visits"),
    legacyLastVisitOn: date("legacy_last_visit_on", { mode: "string" }),
    /** Premier email reçu par une fiche importée : il a dit d'où vient l'adresse (D-78). */
    originNoticeSentAt: instant("origin_notice_sent_at"),
    anonymizedAt: instant("anonymized_at"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Un email = une fiche (R-70), sans tenir compte de la casse ; les fiches anonymisées n'ont plus d'email.
    uniqueIndex("customer_email_unique")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
    // Fiches au même numéro (doublons possibles, D-79) et recherche par téléphone.
    index("customer_phone_idx").on(t.phone),
    check("customer_legacy_visits", sql`${t.legacyVisits} is null or ${t.legacyVisits} >= 0`),
  ],
);

/**
 * Série de RDV répétés (D-71, D-83 à D-92) : la règle seulement. Chaque date est un RDV ordinaire qui pointe vers sa
 * série ; rien d'autre n'est stocké ici (les dates sautées se recalculent, l'annulation se lit dans les RDV).
 */
export const appointmentSeries = pgTable(
  "appointment_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    frequency: seriesFrequency("frequency").notNull(),
    /** « Toutes les N semaines », de 1 à 4 ; vide pour « chaque mois ». */
    intervalWeeks: smallint("interval_weeks"),
    monthlyMode: seriesMonthlyMode("monthly_mode"),
    /** Jour (heure de Paris) du premier RDV : point de départ de la règle. */
    anchorOn: date("anchor_on", { mode: "string" }).notNull(),
    /** Heure de début, heure de Paris, la même pour chaque date. */
    startTime: time("start_time").notNull(),
    /** Coiffeur demandé, ou vide pour « Sans préférence » (D-84). */
    staffId: uuid("staff_id").references(() => staff.id),
    /** Dernière date de la règle déjà examinée (posée ou sautée) : la prolongation reprend après (D-90). */
    lastPlannedOn: date("last_planned_on", { mode: "string" }).notNull(),
    createdByStaffId: uuid("created_by_staff_id")
      .notNull()
      .references(() => staff.id),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "appointment_series_rule",
      sql`(${t.frequency} = 'weekly' and ${t.intervalWeeks} between 1 and 4 and ${t.monthlyMode} is null)
       or (${t.frequency} = 'monthly' and ${t.intervalWeeks} is null and ${t.monthlyMode} is not null)`,
    ),
    check("appointment_series_planned", sql`${t.lastPlannedOn} >= ${t.anchorOn}`),
  ],
);

export const appointment = pgTable(
  "appointment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull() // R-07 : pas de RDV sans client
      .references(() => customer.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    startsAt: instant("starts_at").notNull(),
    endsAt: instant("ends_at").notNull(),
    status: appointmentStatus("status").notNull().default("confirmed"), // R-24
    source: appointmentSource("source").notNull(),
    customerNote: text("customer_note"), // R-29
    forName: text("for_name"), // R-28 : « Pour qui ? », le prénom du proche ; le RDV reste au nom du titulaire
    createdByStaffId: uuid("created_by_staff_id").references(() => staff.id), // R-74
    adjustedAmountCents: integer("adjusted_amount_cents"), // R-53, R-54
    /** RDV répété : la série dont il fait partie (D-71) ; hors limite de R-25 (D-87). */
    seriesId: uuid("series_id").references(() => appointmentSeries.id),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("appointment_order", sql`${t.endsAt} > ${t.startsAt}`),
    check("appointment_note_length", sql`char_length(${t.customerNote}) <= 300`),
    check("appointment_for_name_length", sql`char_length(${t.forName}) between 1 and 40`),
    index("appointment_customer_idx").on(t.customerId, t.startsAt),
    index("appointment_staff_idx").on(t.staffId, t.startsAt),
    index("appointment_series_idx").on(t.seriesId, t.startsAt),
  ],
);

/** Lignes de RDV : prix, durée et nom figés au moment de la réservation (R-14, R-16). */
export const appointmentItem = pgTable(
  "appointment_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointment.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id),
    nameSnapshot: text("name_snapshot").notNull(),
    priceCents: integer("price_cents").notNull(),
    durationMin: integer("duration_min").notNull(),
    position: smallint("position").notNull(),
  },
  (t) => [index("appointment_item_appointment_idx").on(t.appointmentId)],
);

export const absence = pgTable(
  "absence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    startsAt: instant("starts_at").notNull(),
    endsAt: instant("ends_at").notNull(),
    reason: text("reason"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("absence_order", sql`${t.endsAt} > ${t.startsAt}`),
    index("absence_staff_idx").on(t.staffId, t.startsAt),
  ],
);

/** Journal d'audit (R-43, R-54, R-74) : écrit aux lots 4 et 5. */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorType: actorType("actor_type").notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: instant("created_at").notNull().defaultNow(),
});

/**
 * Liste d'attente (D-73, D-100) : un client qui n'a trouvé aucun créneau demande à être prévenu. Les prestations
 * décident de la durée de la place cherchée ; sans coiffeur, « Sans préférence ».
 */
export const waitlistEntry = pgTable(
  "waitlist_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    serviceIds: uuid("service_ids").array().notNull(),
    staffId: uuid("staff_id").references(() => staff.id),
    /** Jours voulus, « AAAA-MM-JJ » (heure de Paris). */
    days: date("days", { mode: "string" }).array().notNull(),
    window: waitlistWindow("window").notNull(),
    status: waitlistEntryStatus("status").notNull().default("active"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("waitlist_entry_days", sql`cardinality(${t.days}) between 1 and 14`),
    check("waitlist_entry_services", sql`cardinality(${t.serviceIds}) between 1 and 8`),
    index("waitlist_entry_active_idx").on(t.status, t.createdAt),
    index("waitlist_entry_customer_idx").on(t.customerId),
  ],
);

/**
 * Une place proposée à une inscrite, gardée jusqu'à `expiresAt` (D-100). Une place n'est proposée qu'à une personne
 * à la fois, et une inscrite n'a qu'une offre en cours.
 */
export const waitlistOffer = pgTable(
  "waitlist_offer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => waitlistEntry.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    startsAt: instant("starts_at").notNull(),
    endsAt: instant("ends_at").notNull(),
    status: waitlistOfferStatus("status").notNull().default("pending"),
    expiresAt: instant("expires_at").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("waitlist_offer_order", sql`${t.endsAt} > ${t.startsAt}`),
    uniqueIndex("waitlist_offer_one_per_slot")
      .on(t.staffId, t.startsAt)
      .where(sql`${t.status} = 'pending'`),
    uniqueIndex("waitlist_offer_one_per_entry")
      .on(t.entryId)
      .where(sql`${t.status} = 'pending'`),
    index("waitlist_offer_entry_idx").on(t.entryId, t.status),
  ],
);

/**
 * Un encaissement lancé sur le terminal depuis la fiche RDV (R-89 à R-93). Une seule ligne « en cours » pour tout le
 * salon : il n'y a qu'un terminal.
 */
export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointment.id),
    amountCents: integer("amount_cents").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    /** Identifiant de la transaction côté SumUp (client_transaction_id), connu une fois le terminal joint. */
    providerReference: text("provider_reference"),
    failureReason: text("failure_reason"),
    startedByStaffId: uuid("started_by_staff_id")
      .notNull()
      .references(() => staff.id),
    createdAt: instant("created_at").notNull().defaultNow(),
    completedAt: instant("completed_at"),
  },
  (t) => [
    check("payment_amount", sql`${t.amountCents} > 0`),
    uniqueIndex("payment_one_pending").on(t.status).where(sql`${t.status} = 'pending'`),
    uniqueIndex("payment_provider_reference").on(t.providerReference),
    index("payment_appointment_idx").on(t.appointmentId, t.status),
  ],
);

/** File d'envoi des emails, avec reprise (R-60 à R-64, principe 7) : utilisée au lot 7. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: emailType("type").notNull(),
    toEmail: text("to_email").notNull(),
    appointmentId: uuid("appointment_id").references(() => appointment.id, {
      onDelete: "set null",
    }),
    status: emailStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: instant("next_attempt_at").notNull().defaultNow(),
    lastError: text("last_error"),
    /** Données propres au message qui ne se relisent pas dans le RDV (ex. l'ancien créneau d'un déplacement). */
    payload: jsonb("payload"),
    /** Retenu jusqu'à la confirmation du gérant : rien ne part au client sans elle (R-43, D-56). */
    heldForManager: boolean("held_for_manager").notNull().default(false),
    dedupeKey: text("dedupe_key").notNull().unique(), // un même message ne part pas deux fois
    createdAt: instant("created_at").notNull().defaultNow(),
    sentAt: instant("sent_at"),
  },
  (t) => [index("email_outbox_due_idx").on(t.status, t.nextAttemptAt)],
);

/** Compteurs de limitation d'essais (connexion, inscription, code gérant) : une ligne par clé, fenêtre glissante simple. */
export const rateLimit = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowEndsAt: instant("window_ends_at").notNull(),
});
