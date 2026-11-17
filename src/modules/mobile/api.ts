import { DateTime } from "luxon";
import { z } from "zod";
import type { Database } from "@/db/types";
import { DomainError } from "@/lib/domain-error";
import { formatDuration, formatPrice, formatTime, parisDate } from "@/lib/format";
import {
  SALON,
  SALON_ACCESS,
  salonAddressLine,
  salonApplePlansUrl,
  salonDirectionsUrl,
  salonMapsUrl,
  salonWazeUrl,
} from "@/lib/salon";
import { dayNames } from "@/lib/slot-view";
import { pastView, splitAppointments, upcomingView } from "@/modules/appointments/account-view";
import { listCustomerAppointments } from "@/modules/appointments/queries";
import { createPostgresDriver } from "@/modules/auth/postgres-driver";
import type { AuthDriver } from "@/modules/auth/types";
import { getSlotsForRange, loadSettings } from "@/modules/availability";
import {
  cancelAppointment,
  createAppointment,
  loadChangeableAppointment,
  rescheduleAppointment,
} from "@/modules/booking";
import { loadRepeatSource } from "@/modules/appointments/queries";
import { loadStaffChoices, loadStaffChoicesFor } from "@/modules/catalog";
import {
  currentCustomer,
  customerBookingState,
  loginCustomer,
  registerCustomer,
  requestPasswordReset,
  type AccountResult,
  type CustomerProfile,
} from "@/modules/customers/accounts";
import { changePassword, deleteAccount, updateProfile, type ProfileResult } from "@/modules/customers/profile";
import { getLoyaltyCard } from "@/modules/loyalty";
import { loyaltyEntryLabel, typicalVisitPoints } from "@/modules/loyalty/labels";
import { hitRateLimit } from "@/modules/security/rate-limit";
import { calendarSubject, signToken } from "@/modules/security/token";
import { LEGAL_SLUGS, LEGAL_UPDATED, legalDocument } from "@/modules/vitrine/legal";
import { readVitrine, type VitrineData } from "@/modules/vitrine/load";
import {
  acceptOffer,
  declineOffer,
  joinWaitlist,
  leaveWaitlist,
  listCustomerWaitlist,
  loadOffer,
  WINDOW_LABELS,
} from "@/modules/waitlist";
import { createBearerStore } from "./bearer";

// API de l'app iPhone (D-123, lot 25). Aucune règle ici : chaque fonction identifie le client par son jeton, limite les
// essais avec les mêmes compteurs que le site, appelle le module du site (`booking`, `waitlist`, `customers`…), et
// traduit le résultat en JSON. Un refus métier devient `{ code }` (le `DomainError` du module) : l'app a la table de
// traduction. Les effets de bord (email, réveil de la liste d'attente) sont demandés comme dans les actions du site.
//
// Les dépendances du serveur (base, horloge, envoi, `after`) arrivent en paramètre : l'API se teste sur une base de test.

export interface MobileEnv {
  db: Database;
  /** En-tête `Authorization` de la requête. */
  authorization: string | null;
  /** Adresse de l'appelant, pour limiter les essais. */
  ip: string;
  siteUrl: string;
  /** Secret des liens signés (agenda). */
  secret?: string;
  now?: Date;
  sendResetEmail: (to: string, link: string) => Promise<void>;
  /** Après la réponse (`after` de Next) : l'envoi n'attend pas. */
  defer: (task: () => Promise<unknown> | unknown) => void;
  effects: {
    /** Envoie les emails d'un RDV (R-60) ; en cas d'échec ils restent dans la file, le cron les reprend. */
    sendAppointmentEmails: (appointmentId: string) => Promise<void>;
    /** D-100 : une place libérée est proposée à la liste d'attente. */
    wakeWaitlist: () => Promise<void>;
  };
  /** Carte, équipe, horaires : la lecture en cache de la vitrine en production. */
  loadVitrine?: () => Promise<VitrineData>;
}

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown> = {}, status = 200): ApiResult => ({ status, body });
const fail = (status: number, code: string, extra: Record<string, unknown> = {}): ApiResult => ({
  status,
  body: { code, ...extra },
});

const NOT_SIGNED_IN = fail(401, "not_signed_in");
const INVALID = fail(400, "invalid");

const uuid = z.uuid();
const serviceIds = z.array(z.uuid()).min(1).max(8);
const staffId = z.union([z.uuid(), z.literal("any")]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Statut HTTP d'un refus métier : le code, lui, est ce que l'app lit. */
function statusOf(code: string): number {
  switch (code) {
    case "appointment_not_found":
    case "offer_not_found":
      return 404;
    case "customer_blocked":
    case "wrong_password":
      return 403;
    case "slot_unavailable":
    case "email_taken":
    case "slots_available":
    case "waitlist_full":
    case "too_many_upcoming":
    case "offer_closed":
    case "offer_expired":
      return 409;
    default:
      return 422;
  }
}

function fromError(error: unknown): ApiResult {
  if (error instanceof DomainError) return fail(statusOf(error.code), error.code);
  console.error("Erreur inattendue dans l'API mobile :", error);
  return fail(500, "failed");
}

function fromAccount(result: Extract<AccountResult | ProfileResult, { ok: false }>): ApiResult {
  switch (result.error) {
    case "invalid":
      return fail(400, "invalid", { fieldErrors: result.fieldErrors });
    case "rate_limited":
      return fail(429, "rate_limited", { retryAfterSeconds: result.retryAfterSeconds });
    case "invalid_credentials":
      return fail(401, "invalid_credentials");
    case "failed":
      return fail(500, "failed");
    default:
      return fail(statusOf(result.error), result.error);
  }
}

export function createMobileApi(env: MobileEnv) {
  const { db } = env;
  const now = () => env.now ?? new Date();
  const store = createBearerStore(env.authorization);
  const driver: AuthDriver = createPostgresDriver({
    db,
    store,
    now,
    sendResetEmail: env.sendResetEmail,
  });

  async function customerOrNull(): Promise<CustomerProfile | null> {
    return currentCustomer(db, driver);
  }

  /** Corps de réponse d'une connexion ou d'une inscription : le jeton à ranger dans le trousseau de l'iPhone. */
  async function session(customer: CustomerProfile, status: number): Promise<ApiResult> {
    return ok(
      { token: store.issued(), customer, booking: await customerBookingState(db, customer.id, now()) },
      status,
    );
  }

  async function limited(key: string, limit: number, windowSeconds: number): Promise<ApiResult | null> {
    const result = await hitRateLimit(db, key, { limit, windowSeconds }, now());
    return result.allowed ? null : fail(429, "rate_limited", { retryAfterSeconds: result.retryAfterSeconds });
  }

  /** Enveloppe d'une route réservée au client connecté : accès, puis erreurs métier traduites. */
  async function asCustomer(run: (customer: CustomerProfile) => Promise<ApiResult>): Promise<ApiResult> {
    try {
      const customer = await customerOrNull();
      if (!customer) return NOT_SIGNED_IN;
      return await run(customer);
    } catch (error) {
      return fromError(error);
    }
  }

  const sendEmails = (appointmentId: string) => env.defer(() => env.effects.sendAppointmentEmails(appointmentId));
  const wake = () => env.defer(() => env.effects.wakeWaitlist());

  return {
    // --- Compte ---------------------------------------------------------------------------------------------------

    async register(input: unknown): Promise<ApiResult> {
      try {
        const result = await registerCustomer(db, driver, input, { ip: env.ip, now: now() });
        return result.ok ? await session(result.customer, 201) : fromAccount(result);
      } catch (error) {
        return fromError(error);
      }
    },

    async login(input: unknown): Promise<ApiResult> {
      try {
        const result = await loginCustomer(db, driver, input, { ip: env.ip, now: now() });
        return result.ok ? await session(result.customer, 200) : fromAccount(result);
      } catch (error) {
        return fromError(error);
      }
    },

    /** Ferme la session du jeton ; sans effet (et sans erreur) si le jeton est déjà mort. */
    async logout(): Promise<ApiResult> {
      try {
        await driver.signOut();
        return ok();
      } catch (error) {
        return fromError(error);
      }
    },

    /** Le lien de l'email ouvre le site (acceptable, plan lot 25) : même fonction que le formulaire du site. */
    async forgotPassword(input: unknown): Promise<ApiResult> {
      try {
        const result = await requestPasswordReset(
          db,
          driver,
          input,
          `${env.siteUrl}/auth/callback?next=/mot-de-passe/nouveau`,
          { ip: env.ip, now: now() },
        );
        return result.ok ? ok() : fromAccount(result);
      } catch (error) {
        return fromError(error);
      }
    },

    me: () =>
      asCustomer(async (customer) =>
        ok({ customer, booking: await customerBookingState(db, customer.id, now()) }),
      ),

    updateMe: (input: unknown) =>
      asCustomer(async (customer) => {
        const result = await updateProfile(db, driver, customer.id, input, { now: now() });
        return result.ok ? ok({ customer: result.customer }) : fromAccount(result);
      }),

    changePassword: (input: unknown) =>
      asCustomer(async (customer) => {
        const result = await changePassword(db, driver, customer.id, input, { now: now() });
        return result.ok ? ok() : fromAccount(result);
      }),

    /** Apple 5.1.1(v) : suppression du compte depuis l'app, même fonction que le site (R-75). */
    deleteMe: (input: unknown) =>
      asCustomer(async (customer) => {
        const result = await deleteAccount(db, driver, customer.id, input, { now: now() });
        return result.ok ? ok() : fromAccount(result);
      }),

    // --- Réservation ----------------------------------------------------------------------------------------------

    /** Coiffeurs proposés pour des prestations, ou pour un RDV qu'on déplace (R-13, R-16, R-20). */
    async staffChoices(input: unknown): Promise<ApiResult> {
      const parsed = z
        .object({ serviceIds: serviceIds.optional(), appointmentId: uuid.optional() })
        .safeParse(input);
      if (!parsed.success || (!parsed.data.serviceIds && !parsed.data.appointmentId)) return INVALID;
      const { appointmentId, serviceIds: ids } = parsed.data;
      if (appointmentId) {
        return asCustomer(async (customer) => {
          const moving = await loadChangeableAppointment(db, customer.id, appointmentId, now());
          return ok({ choices: await loadStaffChoicesFor(db, moving.services) });
        });
      }
      try {
        return ok({ choices: await loadStaffChoices(db, ids!, "online") });
      } catch (error) {
        return fromError(error);
      }
    },

    /** Créneaux de plusieurs jours, jours fermés et complets compris (D-96) : calculés par le module de disponibilité. */
    async days(input: unknown): Promise<ApiResult> {
      const parsed = z
        .object({
          serviceIds: z.array(z.uuid()).max(8),
          staffId,
          from: isoDate,
          days: z.number().int().min(1).max(92),
          appointmentId: uuid.optional(),
        })
        .safeParse(input);
      if (!parsed.success || (!parsed.data.appointmentId && parsed.data.serviceIds.length === 0)) return INVALID;
      const { appointmentId, ...range } = parsed.data;

      const run = async (moving?: Awaited<ReturnType<typeof loadChangeableAppointment>>): Promise<ApiResult> => {
        const refused = await limited(`slots:ip:${env.ip}`, 300, 600);
        if (refused) return refused;
        const settings = await loadSettings(db);
        const current = now();
        const days = await getSlotsForRange(db, {
          ...range,
          audience: "online",
          now: current,
          ...(moving
            ? {
                moving: {
                  appointmentId: moving.id,
                  services: moving.services,
                  durationMinutes: moving.durationMinutes,
                },
              }
            : {}),
        });
        return ok({
          today: parisDate(current),
          lastBookable: DateTime.fromJSDate(current, { zone: settings.timezone })
            .plus({ days: settings.maxHorizonDays })
            .toISODate(),
          days: days.map((d) => {
            const names = dayNames(d.date);
            return {
              date: d.date,
              label: names.long,
              short: names.short,
              dow: names.dow,
              num: names.num,
              monthLabel: `${names.month} ${names.year}`,
              state: d.closed ? "closed" : d.slots.length === 0 ? "full" : "open",
              slots: d.slots.map((s) => ({ iso: s.startsAt.toISOString(), time: formatTime(s.startsAt) })),
            };
          }),
        });
      };

      if (appointmentId) {
        return asCustomer(async (customer) =>
          run(await loadChangeableAppointment(db, customer.id, appointmentId, now())),
        );
      }
      try {
        return await run();
      } catch (error) {
        return fromError(error);
      }
    },

    book: (input: unknown) =>
      asCustomer(async (customer) => {
        const parsed = z
          .object({
            serviceIds,
            staffId,
            startsAt: z.iso.datetime(),
            note: z.string().max(300).optional(),
            forName: z.string().max(200).optional(),
          })
          .safeParse(input);
        if (!parsed.success) return INVALID;
        const refused = await limited(`book:customer:${customer.id}`, 10, 900);
        if (refused) return refused;
        const note = parsed.data.note?.trim();
        const forName = parsed.data.forName?.trim();
        const created = await createAppointment(
          db,
          {
            customerId: customer.id,
            serviceIds: parsed.data.serviceIds,
            staffId: parsed.data.staffId,
            startsAt: new Date(parsed.data.startsAt),
            source: "online",
            ...(note ? { note } : {}),
            ...(forName ? { forName } : {}),
          },
          now(),
        );
        // R-60 : l'email part après la réponse.
        sendEmails(created.id);
        return ok({ appointmentId: created.id }, 201);
      }),

    // --- Mes rendez-vous ------------------------------------------------------------------------------------------

    appointments: () =>
      asCustomer(async (customer) => {
        const current = now();
        const [list, settings, booking, waitlist] = await Promise.all([
          listCustomerAppointments(db, customer.id),
          loadSettings(db),
          customerBookingState(db, customer.id, current),
          listCustomerWaitlist(db, customer.id, current),
        ]);
        const { upcoming, past } = splitAppointments(list, current);
        return ok({
          upcoming: upcoming.map((a) => {
            const view = upcomingView(a, current, settings.changeCutoffHours);
            const minutes = Math.max(0, Math.round((a.startsAt.getTime() - current.getTime()) / 60_000));
            return {
              id: a.id,
              startsAt: a.startsAt.toISOString(),
              endsAt: a.endsAt.toISOString(),
              dayLabel: view.dayLabel,
              time: view.time,
              relative: view.relative,
              /** Dans le délai de modification : « dans 50 min » (R-31). */
              soon: view.changeable ? null : `dans ${formatDuration(minutes)}`,
              items: view.items,
              what: a.items.map((i) => i.name).join(" + "),
              staffFirstName: a.staffFirstName,
              staffLabel: view.staffLabel,
              forName: a.forName,
              totalPriceCents: a.totalPriceCents,
              price: formatPrice(a.totalPriceCents),
              changeable: view.changeable,
              deadlineLabel: view.deadlineLabel,
              repeated: view.repeated,
              calendarUrl: env.secret
                ? `${env.siteUrl}/api/agenda/${a.id}?t=${signToken(env.secret, calendarSubject(a.id))}`
                : null,
            };
          }),
          past: past.map((a) => {
            const view = pastView(a);
            return { ...view, startsAt: a.startsAt.toISOString(), canRepeat: !view.cancelled };
          }),
          booking,
          changeCutoffHours: settings.changeCutoffHours,
          waitlist: waitlist.map((w) => ({
            id: w.id,
            days: w.days,
            daysLabel: w.days.map((d) => dayNames(d).short).join(", "),
            window: w.window,
            windowLabel: WINDOW_LABELS[w.window],
            staffLabel: w.staffFirstName ? `avec ${w.staffFirstName}` : "sans préférence de coiffeur",
            what: w.serviceNames.join(" + "),
            offer: w.offer
              ? {
                  id: w.offer.id,
                  startsAt: w.offer.startsAt.toISOString(),
                  expiresAt: w.offer.expiresAt.toISOString(),
                  label: `${dayNames(parisDate(w.offer.startsAt)).short} à ${formatTime(w.offer.startsAt)}`,
                  until: formatTime(w.offer.expiresAt),
                }
              : null,
          })),
        });
      }),

    /** Déplace un RDV (R-30) ; même créneau et même coiffeur = rien à faire. */
    reschedule: (appointmentId: string, input: unknown) =>
      asCustomer(async (customer) => {
        const parsed = z.object({ appointmentId: uuid, staffId, startsAt: z.iso.datetime() }).safeParse({
          ...(typeof input === "object" && input !== null ? input : {}),
          appointmentId,
        });
        if (!parsed.success) return INVALID;
        const refused = await limited(`change:customer:${customer.id}`, 20, 900);
        if (refused) return refused;
        const moved = await rescheduleAppointment(
          db,
          {
            customerId: customer.id,
            appointmentId: parsed.data.appointmentId,
            staffId: parsed.data.staffId,
            startsAt: new Date(parsed.data.startsAt),
          },
          now(),
        );
        if (moved.changed) {
          sendEmails(parsed.data.appointmentId);
          wake(); // D-100 : l'ancien créneau est libre
        }
        return ok({ appointmentId: parsed.data.appointmentId, changed: moved.changed });
      }),

    cancel: (appointmentId: string) =>
      asCustomer(async (customer) => {
        const id = uuid.safeParse(appointmentId);
        if (!id.success) return INVALID;
        const refused = await limited(`change:customer:${customer.id}`, 20, 900);
        if (refused) return refused;
        const result = await cancelAppointment(db, { customerId: customer.id, appointmentId: id.data }, now());
        if (!result.alreadyCancelled) {
          sendEmails(id.data);
          wake(); // D-100 : la place libérée est proposée à la liste d'attente
        }
        return ok();
      }),

    /** « Reprendre le même RDV » : prestations et coiffeur d'un RDV passé. */
    repeatSource: (appointmentId: string) =>
      asCustomer(async (customer) => {
        const id = uuid.safeParse(appointmentId);
        if (!id.success) return INVALID;
        const source = await loadRepeatSource(db, customer.id, id.data);
        return source ? ok(source) : fail(404, "appointment_not_found");
      }),

    // --- Liste d'attente ------------------------------------------------------------------------------------------

    joinWaitlist: (input: unknown) =>
      asCustomer(async (customer) => {
        const parsed = z
          .object({
            serviceIds,
            staffId,
            days: z.array(isoDate).min(1).max(14),
            window: z.enum(["morning", "afternoon", "day"]),
          })
          .safeParse(input);
        if (!parsed.success) return INVALID;
        const refused = await limited(`waitlist:customer:${customer.id}`, 10, 900);
        if (refused) return refused;
        await joinWaitlist(db, { customerId: customer.id, ...parsed.data }, now());
        return ok({ days: new Set(parsed.data.days).size }, 201);
      }),

    offer: (offerId: string) =>
      asCustomer(async (customer) => {
        const id = uuid.safeParse(offerId);
        if (!id.success) return INVALID;
        const current = now();
        const offer = await loadOffer(db, customer.id, id.data, current);
        if (!offer) return fail(404, "offer_not_found");
        const settings = await loadSettings(db);
        return ok({
          offer: {
            id: offer.id,
            entryId: offer.entryId,
            state: offer.state,
            startsAt: offer.startsAt.toISOString(),
            endsAt: offer.endsAt.toISOString(),
            expiresAt: offer.expiresAt.toISOString(),
            until: formatTime(offer.expiresAt),
            staff: offer.staffFirstName,
            services: offer.items.map((i) => i.name).join(" + "),
            items: offer.items,
            totalPriceCents: offer.totalPriceCents,
            price: formatPrice(offer.totalPriceCents),
          },
          maxUpcoming: settings.maxUpcomingPerCustomer,
          now: current.toISOString(),
        });
      }),

    /** « Prendre cette place » (R-83). Une place perdue ou expirée passe tout de suite à la personne suivante. */
    async acceptOffer(offerId: string): Promise<ApiResult> {
      const result = await asCustomer(async (customer) => {
        const id = uuid.safeParse(offerId);
        if (!id.success) return INVALID;
        const refused = await limited(`waitlist-offer:customer:${customer.id}`, 20, 900);
        if (refused) return refused;
        const created = await acceptOffer(db, { customerId: customer.id, offerId: id.data }, now());
        sendEmails(created.id);
        return ok({ appointmentId: created.id }, 201);
      });
      if (!result.body.appointmentId && result.status !== 401 && result.status !== 400) wake();
      return result;
    },

    declineOffer: (offerId: string) =>
      asCustomer(async (customer) => {
        const id = uuid.safeParse(offerId);
        if (!id.success) return INVALID;
        await declineOffer(db, { customerId: customer.id, offerId: id.data }, now());
        wake();
        return ok();
      }),

    leaveWaitlist: (entryId: string) =>
      asCustomer(async (customer) => {
        const id = uuid.safeParse(entryId);
        if (!id.success) return INVALID;
        await leaveWaitlist(db, { customerId: customer.id, entryId: id.data });
        wake();
        return ok();
      }),

    // --- Fidélité -------------------------------------------------------------------------------------------------

    loyalty: () =>
      asCustomer(async (customer) => {
        const [card, pointsPerVisit] = await Promise.all([
          getLoyaltyCard(db, customer.id, now()),
          typicalVisitPoints(db),
        ]);
        return ok({
          card: {
            ...card,
            history: card.history.map((h) => ({
              id: h.id,
              dateLabel: dayNames(parisDate(h.appointmentStartsAt ?? h.createdAt)).short,
              label: loyaltyEntryLabel(h),
              points: h.points,
            })),
          },
          pointsPerVisit,
        });
      }),

    // --- Vitrine (publique) ---------------------------------------------------------------------------------------

    /** Carte, équipe, horaires, accès et textes légaux : tout vient de la base, rien n'est en dur dans l'app. */
    async vitrine(): Promise<ApiResult> {
      try {
        const data = await (env.loadVitrine ? env.loadVitrine() : readVitrine(db, now()));
        return ok({
          ...data,
          salon: { name: SALON.name, tagline: SALON.tagline },
          access: {
            address: salonAddressLine,
            phoneDisplay: SALON.phoneDisplay,
            phoneHref: SALON.phoneHref,
            email: SALON.email,
            mapsUrl: salonMapsUrl,
            directionsUrl: salonDirectionsUrl,
            applePlansUrl: salonApplePlansUrl,
            wazeUrl: salonWazeUrl,
            instagram: SALON.instagram,
            ways: SALON_ACCESS,
          },
          legal: LEGAL_SLUGS.map((slug) => legalDocument(slug, data.rules)),
          legalUpdated: LEGAL_UPDATED,
        });
      } catch (error) {
        return fromError(error);
      }
    },
  };
}

export type MobileApi = ReturnType<typeof createMobileApi>;
