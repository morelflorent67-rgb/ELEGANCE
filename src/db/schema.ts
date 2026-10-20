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
export const actorType = pgEnum("actor_type", ["customer", "staff", "manager", "system"]);
export const emailType = pgEnum("email_type", [
  "confirmation",
  "reminder",
  "modification",
  "cancellation",
  "review_invitation",
]);
export const emailStatus = pgEnum("email_status", ["pending", "sent", "failed"]);

/** Réglages du salon : une seule ligne (principe 8, R-01 à R-07). */
export const salonSettings = pgTable(
  "salon_settings",
  {
    id: boolean("id").primaryKey().default(true),
    timezone: text("timezone").notNull().default("Europe/Paris"),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(60), // R-06
    maxHorizonDays: integer("max_horizon_days").notNull().default(42), // R-06
    onlineSlotStepMinutes: integer("online_slot_step_minutes").notNull().default(30), // R-04 (écart décidé le 20/10/2026)
    salonSlotStepMinutes: integer("salon_slot_step_minutes").notNull().default(15), // R-04
    changeCutoffHours: integer("change_cutoff_hours").notNull().default(48), // R-30
    maxUpcomingPerCustomer: integer("max_upcoming_per_customer").notNull().default(2), // R-25
    noShowBlockThreshold: integer("no_show_block_threshold").notNull().default(2), // R-52
    reminderHours: integer("reminder_hours").notNull().default(72), // R-61
    managerPinHash: text("manager_pin_hash"), // R-73
  },
  (t) => [
    check("salon_settings_single_row", sql`${t.id} = true`),
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
    anonymizedAt: instant("anonymized_at"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Un email = un compte (R-70), sans tenir compte de la casse ; les fiches anonymisées n'ont plus d'email.
    uniqueIndex("customer_email_unique")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
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
    createdByStaffId: uuid("created_by_staff_id").references(() => staff.id), // R-74
    adjustedAmountCents: integer("adjusted_amount_cents"), // R-53, R-54
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("appointment_order", sql`${t.endsAt} > ${t.startsAt}`),
    check("appointment_note_length", sql`char_length(${t.customerNote}) <= 300`),
    index("appointment_customer_idx").on(t.customerId, t.startsAt),
    index("appointment_staff_idx").on(t.staffId, t.startsAt),
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
