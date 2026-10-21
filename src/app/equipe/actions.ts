"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { db } from "@/db/client";
import type { FormState } from "@/app/_actions/form-state";
import { DomainError } from "@/lib/domain-error";
import { capitalize, formatDay, formatDayShort, formatTime, parisDate } from "@/lib/format";
import { callerIp } from "@/lib/request-ip";
import { getAuthDriver } from "@/modules/auth";
import type { AuthUser } from "@/modules/auth/types";
import {
  getSlotsForRange,
  loadSettings,
  monthlyModesFor,
  ruleLabel,
  seriesLimit,
  type MonthlyMode,
  type SkipReason,
} from "@/modules/availability";
import {
  adjustAppointmentAmount,
  createAppointment,
  extendSeries,
  loadSalonMovable,
  loadSeriesView,
  markNoShow,
  previewExtend,
  previewRepeat,
  repeatAppointment,
  salonCancelAppointment,
  salonCancelSeries,
  salonRescheduleAppointment,
  seriesCancellable,
  SERIES_MAX_TOTAL,
  undoNoShow,
  type SeriesPlan,
} from "@/modules/booking";
import {
  declareAbsence,
  deleteAbsence,
  listAppointmentsToHandle,
  needsHold,
  needsHoldAny,
  releaseHeldEmails,
} from "@/modules/absences";
import { loadStaffChoices, loadStaffChoicesFor, type StaffChoice } from "@/modules/catalog";
import {
  createService,
  moveService,
  setServiceActive,
  updateService,
} from "@/modules/catalog/manage";
import {
  createSalonCustomer,
  mergeCustomers,
  updateSalonCustomer,
  type SameCustomer,
} from "@/modules/customers/salon-customers";
import {
  deleteCustomerAsManager,
  searchCustomers,
  setOnlineBookingBlocked,
} from "@/modules/customers/staff-view";
import {
  createStaffMember,
  moveStaffMember,
  renameStaffMember,
  setStaffActive,
} from "@/modules/staff/manage";
import {
  addClosure,
  removeClosure,
  setOpeningHours,
  type WeekHours,
} from "@/modules/schedule/manage";
import { sendEmailsForAppointment } from "@/modules/mail/send-now";
import { hitRateLimit } from "@/modules/security/rate-limit";
import { VITRINE_TAG } from "@/modules/vitrine/tag";
import { loginStaff, currentStaffUser, listActiveStaff } from "@/modules/staff";
import { unlockManager } from "@/modules/staff/manager";
import {
  grantManagerUnlock,
  managerUnlocked,
  revokeManagerUnlock,
  staffOrNull,
} from "./_lib/session";
import type { TeamResult } from "./_lib/messages";

// Actions de la tablette. Toute la logique et tous les contrôles sont dans les modules : ici on vérifie que la tablette
// est connectée en mode équipe (R-72), que le code gérant a été saisi pour ce qui le demande (R-73), puis on traduit
// les refus en codes que l'interface affiche en français.

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoInstant = z.iso.datetime();
const serviceIds = z.array(uuid).min(1).max(8);
const staffId = z.union([uuid, z.literal("any")]);

function fail(error: unknown): { ok: false; error: Extract<TeamResult, { ok: false }>["error"] } {
  if (error instanceof DomainError) return { ok: false, error: error.code };
  console.error("Erreur inattendue dans une action de la tablette :", error);
  return { ok: false, error: "failed" };
}

/** Exécute une action réservée à l'équipe. Sans session équipe : `not_signed_in`, rien n'est lu ni écrit. */
async function asStaff<T>(run: (user: AuthUser) => Promise<TeamResult<T>>): Promise<TeamResult<T>> {
  try {
    const user = await staffOrNull();
    if (!user) return { ok: false, error: "not_signed_in" };
    return await run(user);
  } catch (error) {
    return fail(error);
  }
}

/** Idem pour une fonction gérant (R-73) : le code doit avoir été saisi il y a moins de 5 minutes. */
async function asManager<T>(
  run: (user: AuthUser) => Promise<TeamResult<T>>,
): Promise<TeamResult<T>> {
  return asStaff(async (user) => {
    if (!(await managerUnlocked(user))) return { ok: false, error: "manager_locked" };
    const result = await run(user);
    // « 5 minutes après la dernière action » : une action réussie prolonge le déverrouillage.
    if (result.ok) {
      await grantManagerUnlock(user);
      // La carte, l'équipe, les horaires et les fermetures ne se changent que par ici : la vitrine, qui les garde en
      // cache, repart de la base tout de suite. Une purge de trop est sans conséquence.
      updateTag(VITRINE_TAG);
    }
    return result;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Connexion de la tablette (R-72)

const wait = (seconds: number) =>
  seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} secondes`;

export async function loginStaffAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") };
  const result = await loginStaff(
    db(),
    getAuthDriver(),
    { ...values, password: String(formData.get("password") ?? "") },
    { ip: await callerIp() },
  );
  if (result.ok) redirect("/equipe");
  if (result.error === "invalid") {
    return { status: "error", fieldErrors: result.fieldErrors, values };
  }
  if (result.error === "rate_limited") {
    return {
      status: "error",
      values,
      message: `Trop d'essais. Réessayez dans ${wait(result.retryAfterSeconds)}.`,
    };
  }
  return {
    status: "error",
    values,
    message:
      result.error === "invalid_credentials"
        ? "Email ou mot de passe incorrect."
        : "Une erreur est survenue. Réessayez.",
  };
}

export async function logoutStaffAction(): Promise<void> {
  await getAuthDriver().signOut();
  await revokeManagerUnlock();
  redirect("/equipe/connexion");
}

// ---------------------------------------------------------------------------------------------------------------
// Recherche d'un client (R-26)

export interface CustomerHitView {
  id: string;
  name: string;
  maskedPhone: string;
  /** « 10 oct. », ou null. */
  lastVisitLabel: string | null;
  upcoming: number;
  hasAccount: boolean;
  hasEmail: boolean;
}

const shortDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "short",
});

export async function searchCustomersAction(
  query: string,
): Promise<TeamResult<{ hits: CustomerHitView[] }>> {
  return asStaff<{ hits: CustomerHitView[] }>(async () => {
    const parsed = z.string().max(80).safeParse(query);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const hits = await searchCustomers(db(), parsed.data);
    return {
      ok: true,
      hits: hits.map((h) => ({
        id: h.id,
        name: h.name,
        maskedPhone: h.maskedPhone,
        lastVisitLabel: h.lastVisit ? shortDate.format(h.lastVisit) : null,
        upcoming: h.upcoming,
        hasAccount: h.hasAccount,
        hasEmail: h.hasEmail,
      })),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Fiches sans compte (D-70, D-76, D-79)

const customerFields = z.object({
  firstName: z.string().max(200),
  lastName: z.string().max(200),
  phone: z.string().max(40),
  email: z.string().max(320),
});

/** Refus d'une fiche : champs à corriger, email déjà pris, ou numéro déjà connu (la tablette demande confirmation). */
export type CustomerFormResult =
  | { ok: true; customerId: string }
  | { ok: false; error: "fields"; fieldErrors: Record<string, string> }
  | { ok: false; error: "email_taken"; existing: SameCustomer }
  | { ok: false; error: "phone_exists"; existing: SameCustomer[] };

export async function createSalonCustomerAction(
  input: unknown,
): Promise<TeamResult<{ result: CustomerFormResult }>> {
  const parsed = z
    .object({ fields: customerFields, samePhoneConfirmed: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff<{ result: CustomerFormResult }>(async () => {
    const limit = await hitRateLimit(db(), "salon-customer-create", {
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return { ok: false, error: "rate_limited" };
    const result = await createSalonCustomer(db(), parsed.data.fields, {
      samePhoneConfirmed: parsed.data.samePhoneConfirmed,
    });
    return { ok: true, result: formResult(result) };
  });
}

export async function updateSalonCustomerAction(
  input: unknown,
): Promise<TeamResult<{ result: CustomerFormResult }>> {
  const parsed = z
    .object({ customerId: uuid, authorId: z.string(), fields: customerFields })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff<{ result: CustomerFormResult }>(async () => {
    const result = await updateSalonCustomer(db(), {
      customerId: parsed.data.customerId,
      authorStaffId: parsed.data.authorId,
      fields: parsed.data.fields,
    });
    return { ok: true, result: formResult(result) };
  });
}

function formResult(result: Awaited<ReturnType<typeof createSalonCustomer>>): CustomerFormResult {
  if (result.ok) return result;
  if (result.error === "invalid") {
    return { ok: false, error: "fields", fieldErrors: result.fieldErrors };
  }
  return result;
}

/** Fusion de deux fiches de la même personne, par le gérant (D-79, R-73). */
export async function mergeCustomersAction(
  input: unknown,
): Promise<TeamResult<{ keptId: string }>> {
  const parsed = z.object({ keepId: uuid, mergeId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asManager<{ keptId: string }>(async (user) => {
    const result = await mergeCustomers(db(), {
      keepId: parsed.data.keepId,
      mergeId: parsed.data.mergeId,
      actorId: user.id,
    });
    return { ok: true, keptId: result.keptId };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Créneaux au salon (R-04, D-65 : heure pile ou demie ; R-27 : pas de délai de réservation)

export interface SalonDayView {
  /** « AAAA-MM-JJ » */
  date: string;
  /** « mar. » */
  weekday: string;
  /** 3 */
  day: number;
  /** « Mardi 3 novembre » */
  label: string;
  closed: boolean;
  slots: { iso: string; time: string }[];
}

export async function fetchSalonStaffChoices(
  input: unknown,
): Promise<TeamResult<{ choices: StaffChoice[] }>> {
  const parsed = z
    .object({ serviceIds: serviceIds.optional(), appointmentId: uuid.optional() })
    .safeParse(input);
  if (!parsed.success || (!parsed.data.serviceIds && !parsed.data.appointmentId)) {
    return { ok: false, error: "invalid" };
  }
  return asStaff(async () => {
    if (parsed.data.appointmentId) {
      const moving = await loadSalonMovable(db(), parsed.data.appointmentId);
      return { ok: true, choices: await loadStaffChoicesFor(db(), moving.services) };
    }
    return { ok: true, choices: await loadStaffChoices(db(), parsed.data.serviceIds!, "salon") };
  });
}

/** Les jours demandés, fermés compris (« Fermé » et non « Complet »), avec les créneaux du salon. */
export async function fetchSalonDays(
  input: unknown,
): Promise<TeamResult<{ days: SalonDayView[] }>> {
  const parsed = z
    .object({
      serviceIds: z.array(uuid).max(8),
      staffId,
      from: isoDate,
      days: z.number().int().min(1).max(14),
      appointmentId: uuid.optional(),
    })
    .safeParse(input);
  if (!parsed.success || (!parsed.data.appointmentId && parsed.data.serviceIds.length === 0)) {
    return { ok: false, error: "invalid" };
  }
  return asStaff(async () => {
    const { appointmentId, ...range } = parsed.data;
    const moving = appointmentId ? await loadSalonMovable(db(), appointmentId) : undefined;
    const days = await getSlotsForRange(db(), {
      ...range,
      audience: "salon",
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
    return {
      ok: true,
      days: days.map((d) => {
        const noon = DateTime.fromISO(d.date, { zone: "Europe/Paris" }).set({ hour: 12 });
        return {
          date: d.date,
          weekday: noon.setLocale("fr").toFormat("ccc"),
          day: noon.day,
          label: capitalize(formatDay(noon.toJSDate())),
          closed: d.closed,
          slots: d.slots.map((s) => ({
            iso: s.startsAt.toISOString(),
            time: formatTime(s.startsAt),
          })),
        };
      }),
    };
  });
}

/** Aujourd'hui, à l'heure de Paris, pour démarrer le sélecteur de créneaux. */
export async function fetchSalonToday(): Promise<{ today: string }> {
  const { timezone } = await loadSettings(db());
  return { today: DateTime.now().setZone(timezone).toISODate()! };
}

// ---------------------------------------------------------------------------------------------------------------
// Réservation, modification, annulation, lapins (R-26, R-27, R-33, R-51, R-74)

export async function createSalonAppointment(
  input: unknown,
): Promise<TeamResult<{ appointmentId: string; startsAtIso: string }>> {
  const parsed = z
    .object({
      customerId: uuid,
      serviceIds,
      staffId,
      startsAt: isoInstant,
      authorId: z.string(),
      forName: z.string().max(200).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    const created = await createAppointment(db(), {
      customerId: parsed.data.customerId,
      serviceIds: parsed.data.serviceIds,
      staffId: parsed.data.staffId,
      startsAt: new Date(parsed.data.startsAt),
      source: "salon",
      createdByStaffId: parsed.data.authorId,
      ...(parsed.data.forName ? { forName: parsed.data.forName } : {}),
    });
    after(() => sendEmailsForAppointment(db(), created.id));
    return { ok: true, appointmentId: created.id, startsAtIso: created.startsAt.toISOString() };
  });
}

/**
 * `held` : le rendez-vous était à traiter (absence, fermeture…) ou avait déjà un email retenu : l'email du client attend
 * la confirmation du gérant (R-43, D-56) au lieu de partir tout de suite (D-52).
 */
export async function rescheduleAppointmentAsSalon(
  input: unknown,
): Promise<TeamResult<{ changed: boolean; held: boolean }>> {
  const parsed = z
    .object({ appointmentId: uuid, staffId, startsAt: isoInstant, authorId: z.string() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    const hold = await needsHold(db(), parsed.data.appointmentId);
    const result = await salonRescheduleAppointment(db(), {
      appointmentId: parsed.data.appointmentId,
      staffId: parsed.data.staffId,
      startsAt: new Date(parsed.data.startsAt),
      authorStaffId: parsed.data.authorId,
      holdEmails: hold,
    });
    if (result.changed && !hold) {
      after(() => sendEmailsForAppointment(db(), parsed.data.appointmentId));
    }
    return { ok: true, changed: result.changed, held: hold && result.changed };
  });
}

export async function cancelAppointmentAsSalon(
  input: unknown,
): Promise<TeamResult<{ held: boolean }>> {
  const parsed = z.object({ appointmentId: uuid, authorId: z.string() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    const hold = await needsHold(db(), parsed.data.appointmentId);
    const result = await salonCancelAppointment(db(), {
      appointmentId: parsed.data.appointmentId,
      authorStaffId: parsed.data.authorId,
      holdEmails: hold,
    });
    if (!result.alreadyCancelled && !hold) {
      after(() => sendEmailsForAppointment(db(), parsed.data.appointmentId));
    }
    return { ok: true, held: hold && !result.alreadyCancelled };
  });
}

export async function markNoShowAction(
  input: unknown,
): Promise<TeamResult<{ noShowCount: number }>> {
  const parsed = z.object({ appointmentId: uuid, authorId: z.string() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    const result = await markNoShow(db(), {
      appointmentId: parsed.data.appointmentId,
      authorStaffId: parsed.data.authorId,
    });
    return { ok: true, noShowCount: result.noShowCount };
  });
}

/**
 * Corrige le montant encaissé d'un RDV à la clôture (R-53, R-54) : toute l'équipe, signée d'un prénom (R-74).
 * `amountCents` null rétablit le prix de la carte.
 */
export async function adjustAmountAction(
  input: unknown,
): Promise<TeamResult<{ amountCents: number; adjusted: boolean }>> {
  const parsed = z
    .object({
      appointmentId: uuid,
      authorId: z.string(),
      amountCents: z.number().int().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    const result = await adjustAppointmentAmount(db(), {
      appointmentId: parsed.data.appointmentId,
      authorStaffId: parsed.data.authorId,
      amountCents: parsed.data.amountCents,
    });
    return { ok: true, ...result };
  });
}

export async function undoNoShowAction(
  input: unknown,
): Promise<TeamResult<{ noShowCount: number }>> {
  const parsed = z.object({ appointmentId: uuid, authorId: z.string() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    const result = await undoNoShow(db(), {
      appointmentId: parsed.data.appointmentId,
      authorStaffId: parsed.data.authorId,
    });
    return { ok: true, noShowCount: result.noShowCount };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// RDV répétés (D-71, D-83 à D-92) : tout se fait depuis la fiche du RDV, dans le panneau de droite du planning

const repeatRule = z.discriminatedUnion("frequency", [
  z.object({
    frequency: z.literal("weekly"),
    intervalWeeks: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({
    frequency: z.literal("monthly"),
    monthlyMode: z.enum(["day_of_month", "weekday_rank", "last_weekday"]),
  }),
]);
const seriesEnd = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count"), total: z.number().int().min(1).max(SERIES_MAX_TOTAL) }),
  z.object({ kind: z.literal("until"), date: isoDate }),
]);

/** Une date de la série telle que la tablette l'affiche : retenue (avec son coiffeur) ou sautée (avec sa raison). */
export interface SeriesDateView {
  key: string;
  /** « Mardi 10 novembre · 10:00 », ou « Novembre » pour un mois sans ce jour. */
  label: string;
  /** « AAAA-MM-JJ », pour « Réserver à une autre heure » ; vide pour un mois sans ce jour. */
  date: string | null;
  ok: boolean;
  /** Coiffeur retenu, ou raison du saut. */
  detail: string;
}

export interface SeriesPlanView {
  ruleLabel: string;
  dates: SeriesDateView[];
  okCount: number;
}

const SKIP_LABEL: Record<SkipReason, string> = {
  no_such_day: "Ce jour n'existe pas ce mois-ci",
  closed: "Salon fermé",
  outside_hours: "Hors des horaires",
  off_grid: "Hors de la grille",
  busy: "Pas de coiffeur libre",
  in_past: "Déjà passé",
  too_soon: "Trop tôt",
  too_far: "Trop loin",
};

async function planView(plan: SeriesPlan, staffChoice: string | "any"): Promise<SeriesPlanView> {
  const team = new Map((await listActiveStaff(db())).map((m) => [m.id, m.firstName]));
  const month = (iso: string) =>
    capitalize(DateTime.fromISO(`${iso}-01`).setLocale("fr").toFormat("LLLL yyyy"));
  const dates = plan.dates.map((d): SeriesDateView => {
    if (d.ok) {
      return {
        key: d.date,
        label: `${capitalize(formatDay(d.startsAt))} · ${formatTime(d.startsAt)}`,
        date: d.date,
        ok: true,
        detail: `avec ${team.get(d.staffId) ?? ""}`,
      };
    }
    const busyLabel =
      staffChoice === "any"
        ? SKIP_LABEL.busy
        : `${team.get(staffChoice) ?? "Coiffeur"} pris ou absent`;
    return {
      key: d.date ?? d.month,
      label: d.date
        ? capitalize(
            formatDay(
              DateTime.fromISO(d.date, { zone: "Europe/Paris" }).set({ hour: 12 }).toJSDate(),
            ),
          )
        : month(d.month),
      date: d.date,
      ok: false,
      detail: d.reason === "busy" ? busyLabel : SKIP_LABEL[d.reason],
    };
  });
  return { ruleLabel: plan.ruleLabel, dates, okCount: dates.filter((d) => d.ok).length };
}

export interface RepeatOptionsView {
  /** « Mardi 10 novembre · 10:00 » */
  startLabel: string;
  /** Façons de répéter chaque mois possibles depuis ce RDV (D-85). */
  monthly: { mode: MonthlyMode; label: string }[];
  /** Coiffeurs habilités (R-13) et celui du RDV, proposé par défaut (D-84). */
  choices: StaffChoice[];
  staffId: string;
  /** Dernier jour possible (D-86), « AAAA-MM-JJ », et le premier jour après le RDV. */
  limit: string;
  firstDay: string;
}

/** Ce que propose « Répéter ce RDV » pour ce RDV : refus si le RDV ne se répète pas (annulé, terminé, déjà en série). */
export async function fetchRepeatOptions(
  input: unknown,
): Promise<TeamResult<{ options: RepeatOptionsView }>> {
  const parsed = z.object({ appointmentId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff<{ options: RepeatOptionsView }>(async () => {
    const database = db();
    const moving = await loadSalonMovable(database, parsed.data.appointmentId);
    const view = await loadSeriesView(database, moving.id);
    if (view) return { ok: false, error: "already_in_series" };
    const { timezone } = await loadSettings(database);
    const anchor = DateTime.fromJSDate(moving.startsAt, { zone: timezone }).toISODate()!;
    return {
      ok: true,
      options: {
        startLabel: `${capitalize(formatDay(moving.startsAt))} · ${formatTime(moving.startsAt)}`,
        monthly: monthlyModesFor(anchor).map((mode) => ({
          mode,
          label: ruleLabel(anchor, { frequency: "monthly", monthlyMode: mode }).replace(
            "Chaque mois, ",
            "",
          ),
        })),
        choices: await loadStaffChoicesFor(database, moving.services),
        staffId: moving.staffId,
        limit: seriesLimit(anchor),
        firstDay: DateTime.fromISO(anchor).plus({ days: 1 }).toISODate()!,
      },
    };
  });
}

const repeatInput = z.object({ appointmentId: uuid, rule: repeatRule, staffId, end: seriesEnd });

export async function previewRepeatAction(
  input: unknown,
): Promise<TeamResult<{ plan: SeriesPlanView }>> {
  const parsed = repeatInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => ({
    ok: true,
    plan: await planView(await previewRepeat(db(), parsed.data), parsed.data.staffId),
  }));
}

/** « Répéter ce RDV » (D-83) : un seul email part au client, qui liste les dates (D-91). */
export async function repeatAppointmentAction(
  input: unknown,
): Promise<TeamResult<{ plan: SeriesPlanView; created: number }>> {
  const parsed = repeatInput.extend({ authorId: z.string() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    const { authorId, ...rest } = parsed.data;
    const written = await repeatAppointment(db(), { ...rest, authorStaffId: authorId });
    after(() => sendEmailsForAppointment(db(), written.created[0].id));
    return {
      ok: true,
      plan: await planView(written, rest.staffId),
      created: written.created.length,
    };
  });
}

/** Ce que la fiche RDV montre de sa série (D-92), ou null. */
export interface SeriesCardView {
  ruleLabel: string;
  position: number | null;
  total: number;
  isLast: boolean;
  upcoming: { id: string; label: string; staffFirstName: string; date: string }[];
  upcomingBefore: number;
  followingCount: number;
  /** Coiffeur demandé à la création, pour l'aperçu de la prolongation. */
  staffChoice: string | "any";
  /** Dernier jour possible d'une prolongation (D-86, D-90) et premier jour après la dernière date prévue. */
  extendLimit: string;
  extendFirstDay: string;
}

export async function fetchSeriesAction(
  input: unknown,
): Promise<TeamResult<{ series: SeriesCardView | null }>> {
  const parsed = z.object({ appointmentId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff<{ series: SeriesCardView | null }>(async () => {
    const view = await loadSeriesView(db(), parsed.data.appointmentId);
    if (!view) return { ok: true, series: null };
    return {
      ok: true,
      series: {
        ruleLabel: view.ruleLabel,
        position: view.position,
        total: view.total,
        isLast: view.isLast,
        upcoming: view.upcoming.map((a) => ({
          id: a.id,
          label: `${capitalize(formatDayShort(a.startsAt))} · ${formatTime(a.startsAt)}`,
          staffFirstName: a.staffFirstName,
          date: parisDate(a.startsAt),
        })),
        upcomingBefore: view.upcomingBefore,
        followingCount: view.followingCount,
        staffChoice: view.staffChoice,
        extendLimit: view.extendLimit,
        extendFirstDay: view.extendFirstDay,
      },
    };
  });
}

const extendInput = z.object({ appointmentId: uuid, end: seriesEnd });

export async function previewExtendAction(
  input: unknown,
): Promise<TeamResult<{ plan: SeriesPlanView }>> {
  const parsed = extendInput.extend({ staffChoice: staffId }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => ({
    ok: true,
    plan: await planView(await previewExtend(db(), parsed.data), parsed.data.staffChoice),
  }));
}

/** « Prolonger la série » (D-90). */
export async function extendSeriesAction(
  input: unknown,
): Promise<TeamResult<{ plan: SeriesPlanView; created: number }>> {
  const parsed = extendInput
    .extend({ authorId: z.string(), staffChoice: staffId })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    const written = await extendSeries(db(), {
      appointmentId: parsed.data.appointmentId,
      end: parsed.data.end,
      authorStaffId: parsed.data.authorId,
    });
    after(() => sendEmailsForAppointment(db(), written.created[0].id));
    return {
      ok: true,
      plan: await planView(written, parsed.data.staffChoice),
      created: written.created.length,
    };
  });
}

/**
 * Annulation groupée (D-88) : « celui-ci et les suivants » ou tous les RDV à venir de la série. Un seul email ; retenu
 * pour le gérant si l'un des RDV était à traiter (R-43, D-56).
 */
export async function cancelSeriesAction(
  input: unknown,
): Promise<TeamResult<{ cancelled: number; held: boolean }>> {
  const parsed = z
    .object({ appointmentId: uuid, scope: z.enum(["following", "all"]), authorId: z.string() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    const database = db();
    const touched = await seriesCancellable(database, parsed.data);
    const hold = await needsHoldAny(
      database,
      touched.map((a) => a.id),
    );
    const { cancelled } = await salonCancelSeries(database, {
      appointmentId: parsed.data.appointmentId,
      scope: parsed.data.scope,
      authorStaffId: parsed.data.authorId,
      holdEmails: hold,
    });
    if (cancelled.length > 0 && !hold) {
      after(() => sendEmailsForAppointment(db(), cancelled[0]));
    }
    return { ok: true, cancelled: cancelled.length, held: hold && cancelled.length > 0 };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Espace gérant (R-73, R-52, R-75)

export async function unlockManagerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await currentStaffUser(getAuthDriver());
  if (!user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  const result = await unlockManager(db(), {
    code: String(formData.get("code") ?? "").trim(),
    staffUserId: user.id,
  });
  if (result.ok) {
    await grantManagerUnlock(user);
    return { status: "ok" };
  }
  switch (result.error) {
    case "wrong_code":
      return { status: "error", message: "Ce code n'est pas le bon." };
    case "not_configured":
      return {
        status: "error",
        message:
          "Aucun code gérant n'est encore défini. Il se définit avec la commande « pnpm manager:set-code ».",
      };
    default:
      return {
        status: "error",
        message: `Trop d'essais. Réessayez dans ${wait(result.retryAfterSeconds)}.`,
      };
  }
}

export async function setCustomerBlockedAction(input: unknown): Promise<TeamResult> {
  const parsed = z.object({ customerId: uuid, blocked: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asManager(async (user) => {
    await setOnlineBookingBlocked(db(), {
      customerId: parsed.data.customerId,
      blocked: parsed.data.blocked,
      actorId: user.id,
    });
    return { ok: true };
  });
}

export async function deleteCustomerAction(
  input: unknown,
): Promise<TeamResult<{ cancelled: number }>> {
  const parsed = z.object({ customerId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asManager<{ cancelled: number }>(async (user) => {
    // Plafond des essais : une suppression ne se fait pas à la chaîne.
    const limit = await hitRateLimit(db(), "manager-delete", { limit: 30, windowSeconds: 3600 });
    if (!limit.allowed) return { ok: false, error: "rate_limited" };
    const result = await deleteCustomerAsManager(db(), getAuthDriver(), {
      customerId: parsed.data.customerId,
      actorId: user.id,
    });
    return { ok: true, cancelled: result.cancelledAppointmentIds.length };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Carte et habilitations (R-10 à R-13, R-16, R-17) : réservées au gérant (R-73)

const serviceFields = {
  name: z.string().max(200),
  category: z.string().max(200).nullable(),
  priceCents: z.number(),
  durationMin: z.number(),
  bookableOnline: z.boolean(),
};

export async function createServiceAction(
  input: unknown,
): Promise<TeamResult<{ serviceId: string }>> {
  const parsed = z
    .object({
      ...serviceFields,
      performedBy: z.enum(["barber", "apprentice"]),
      staffIds: z.array(uuid).max(20),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_service" };
  return asManager<{ serviceId: string }>(async (user) => ({
    ok: true,
    serviceId: await createService(db(), parsed.data, user.id),
  }));
}

export async function updateServiceAction(input: unknown): Promise<TeamResult> {
  const parsed = z
    .object({ serviceId: uuid, ...serviceFields, staffIds: z.array(uuid).max(20) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_service" };
  return asManager(async (user) => {
    const { serviceId, ...changes } = parsed.data;
    await updateService(db(), serviceId, changes, user.id);
    return { ok: true };
  });
}

export async function setServiceActiveAction(input: unknown): Promise<TeamResult> {
  const parsed = z.object({ serviceId: uuid, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asManager(async (user) => {
    await setServiceActive(db(), parsed.data.serviceId, parsed.data.active, user.id);
    return { ok: true };
  });
}

export async function moveServiceAction(input: unknown): Promise<TeamResult> {
  const parsed = z.object({ serviceId: uuid, direction: z.enum(["up", "down"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asManager(async (user) => {
    await moveService(db(), parsed.data.serviceId, parsed.data.direction, user.id);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Équipe, horaires et fermetures (R-02, R-03, R-13, D-57) : réservés au gérant (R-73)

export async function createStaffAction(input: unknown): Promise<TeamResult<{ staffId: string }>> {
  const parsed = z
    .object({ firstName: z.string().max(200), role: z.enum(["barber", "apprentice"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_staff" };
  return asManager<{ staffId: string }>(async (user) => ({
    ok: true,
    staffId: await createStaffMember(db(), parsed.data, user.id),
  }));
}

export async function renameStaffAction(input: unknown): Promise<TeamResult> {
  const parsed = z.object({ staffId: uuid, firstName: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_staff" };
  return asManager(async (user) => {
    await renameStaffMember(db(), parsed.data.staffId, parsed.data.firstName, user.id);
    return { ok: true };
  });
}

export async function setStaffActiveAction(input: unknown): Promise<TeamResult> {
  const parsed = z.object({ staffId: uuid, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asManager(async (user) => {
    await setStaffActive(db(), parsed.data.staffId, parsed.data.active, user.id);
    return { ok: true };
  });
}

export async function moveStaffAction(input: unknown): Promise<TeamResult> {
  const parsed = z.object({ staffId: uuid, direction: z.enum(["up", "down"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asManager(async (user) => {
    await moveStaffMember(db(), parsed.data.staffId, parsed.data.direction, user.id);
    return { ok: true };
  });
}

export async function saveHoursAction(input: unknown): Promise<TeamResult> {
  const parsed = z
    .object({
      week: z.record(z.string(), z.array(z.object({ opensAt: z.string(), closesAt: z.string() }))),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_hours" };
  return asManager(async (user) => {
    const week: WeekHours = Object.fromEntries(
      Object.entries(parsed.data.week).map(([weekday, ranges]) => [Number(weekday), ranges]),
    );
    await setOpeningHours(db(), week, user.id);
    return { ok: true };
  });
}

export async function addClosureAction(input: unknown): Promise<TeamResult> {
  const parsed = z
    .object({ startsOn: isoDate, endsOn: isoDate, reason: z.string().max(200) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_closure" };
  return asManager(async (user) => {
    await addClosure(db(), parsed.data, user.id);
    return { ok: true };
  });
}

export async function removeClosureAction(input: unknown): Promise<TeamResult> {
  const parsed = z.object({ closureId: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asManager(async (user) => {
    await removeClosure(db(), parsed.data.closureId, user.id);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Absences et rendez-vous à traiter (R-40 à R-43, D-55 à D-57) : déclarées par l'équipe, confirmées par le gérant

export async function declareAbsenceAction(
  input: unknown,
): Promise<TeamResult<{ toHandle: number }>> {
  const parsed = z
    .object({
      staffId: uuid,
      startDate: isoDate,
      endDate: isoDate,
      startTime: z.string().max(5).optional(),
      endTime: z.string().max(5).optional(),
      reason: z.string().max(200),
      authorId: z.string(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_absence" };
  return asStaff<{ toHandle: number }>(async () => {
    const { authorId, ...absence } = parsed.data;
    await declareAbsence(db(), absence, authorId);
    return { ok: true, toHandle: (await listAppointmentsToHandle(db())).length };
  });
}

export async function deleteAbsenceAction(input: unknown): Promise<TeamResult> {
  const parsed = z.object({ absenceId: uuid, authorId: z.string() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return asStaff(async () => {
    await deleteAbsence(db(), parsed.data.absenceId, parsed.data.authorId);
    return { ok: true };
  });
}

/** R-43 : le gérant confirme, avec son code ; les emails retenus partent alors. */
export async function releaseHeldEmailsAction(): Promise<TeamResult<{ count: number }>> {
  return asManager<{ count: number }>(async (user) => {
    const released = await releaseHeldEmails(db(), user.id);
    for (const appointmentId of released.appointmentIds) {
      after(() => sendEmailsForAppointment(db(), appointmentId));
    }
    return { ok: true, count: released.count };
  });
}
