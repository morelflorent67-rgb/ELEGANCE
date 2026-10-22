"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CloseIcon,
  Mark,
  Note,
  PhoneIcon,
  cta,
} from "@/components/client/ui";
import { formatDuration, formatPrice } from "@/lib/format";
import { SALON } from "@/lib/salon";
import type { CatalogService, StaffChoice } from "@/modules/catalog";
import type { BookingState, CustomerProfile } from "@/modules/customers/accounts";
import { confirmBooking, fetchStaffChoices, rescheduleBooking } from "../actions";
import { DateStep, type PickedSlot } from "./date-step";
import { IdentityStep } from "./identity-step";
import { BlockedScreen, LimitScreen } from "./limit-screen";
import { RecapStep } from "./recap-step";
import { ServiceStep, totals, type TeamNames } from "./service-step";
import { StaffStep } from "./staff-step";

type Step = 1 | 2 | 3 | 4 | 5;
type Screen = Step | "limit" | "blocked";

/** Un RDV que le client déplace : ses prestations sont figées (R-16), seuls le coiffeur et le créneau changent. */
export interface EditingAppointment {
  id: string;
  staffId: string;
  /** « Mardi 10 novembre · 10:00 » */
  currentLabel: string;
  items: { id: string; name: string; priceCents: number; durationMin: number }[];
}

/**
 * Parcours ouvert déjà rempli :
 * - « repeat » (Reprendre le même RDV) : prestations et coiffeur d'un RDV passé, on commence au choix du créneau ;
 * - « edit » (Modifier) : un RDV à venir, on change le coiffeur et le créneau.
 */
export type Prefill =
  | { kind: "repeat"; serviceIds: string[]; staffId: string; choices: StaffChoice[] }
  | { kind: "edit"; appointment: EditingAppointment; choices: StaffChoice[] };

const TITLES: Record<Screen, string> = {
  1: "Prestations",
  2: "Coiffeur",
  3: "Créneau",
  4: "Votre compte",
  5: "Récapitulatif",
  limit: "Limite atteinte",
  blocked: "Réservation",
};

/** Ce que le navigateur garde dans l'historique pour que « retour » revienne à l'étape précédente. */
const HISTORY_KEY = "bookingScreen";

/**
 * Le parcours de réservation (D-16, maquettes « Lot12-Reservation ») : une étape à la fois, dans le même écran ;
 * une ligne de lumière balaie l'écran à chaque changement. Ce composant ne décide d'aucune règle : créneaux, refus
 * et délais viennent du serveur.
 */
export function BookingFlow({
  catalog,
  team,
  customer: initialCustomer,
  booking: initialBooking,
  cutoffHours,
  prefill,
  notice: pageNotice,
}: {
  catalog: CatalogService[];
  team: TeamNames;
  customer: CustomerProfile | null;
  booking: BookingState | null;
  cutoffHours: number;
  prefill?: Prefill;
  /** Message du serveur à afficher en tête (ex. une prestation qui n'est plus réservable en ligne). */
  notice?: string;
}) {
  const router = useRouter();
  const editing = prefill?.kind === "edit" ? prefill.appointment : null;
  const steps: Step[] = editing ? [2, 3, 5] : [1, 2, 3, 4, 5];
  const firstScreen: Screen = prefill ? 3 : 1;

  const [screen, setScreen] = useState<Screen>(firstScreen);
  const [sweep, setSweep] = useState(0);
  const [serviceIds, setServiceIds] = useState<string[]>(
    prefill?.kind === "repeat" ? prefill.serviceIds : [],
  );
  const [staffId, setStaffId] = useState(
    prefill?.kind === "repeat" ? prefill.staffId : (editing?.staffId ?? "any"),
  );
  const [choices, setChoices] = useState<StaffChoice[] | null>(prefill?.choices ?? null);
  const [choicesFailed, setChoicesFailed] = useState(false);
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  // Instant où le créneau a été choisi, pour avertir si le RDV tombe dans le délai de modification (R-32, information
  // seulement : le serveur décide, à la création, si le RDV se modifie en ligne).
  const [pickedAt, setPickedAt] = useState(0);
  const [lost, setLost] = useState<{ time: string; date: string; reason: "taken" | "gone" } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [forName, setForName] = useState("");
  const [customer, setCustomer] = useState(initialCustomer);
  const [booking, setBooking] = useState(initialBooking);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const scroller = useRef<HTMLElement>(null);
  // Les prestations pour lesquelles le coiffeur et le créneau ont été choisis.
  const [servicesAtStaff, setServicesAtStaff] = useState<string[]>(serviceIds);

  const picked = totals(catalog, serviceIds);
  const services = editing ? editing.items : picked.rows;
  const priceCents = editing
    ? editing.items.reduce((sum, i) => sum + i.priceCents, 0)
    : picked.priceCents;
  const durationMin = editing
    ? editing.items.reduce((sum, i) => sum + i.durationMin, 0)
    : picked.durationMin;

  // Chaque écran a son entrée dans l'historique : « retour » (bouton du téléphone ou flèche) revient à l'écran
  // précédent sans quitter la page ; l'adresse ne change pas.
  const show = useCallback((next: Screen) => {
    setScreen(next);
    setSweep((n) => n + 1);
    scroller.current?.scrollTo({ top: 0 });
  }, []);

  // `replace` : l'écran remplace le précédent dans l'historique (après la connexion, « retour » ne revient pas au
  // formulaire de compte).
  const goTo = (next: Screen, replace = false) => {
    const state = { ...window.history.state, [HISTORY_KEY]: next };
    if (replace) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    show(next);
  };

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: firstScreen }, "");
    const onPop = (event: PopStateEvent) => {
      const saved = (event.state as Record<string, unknown> | null)?.[HISTORY_KEY];
      if (saved !== undefined) show(saved as Screen);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [firstScreen, show]);

  // Étape 2 : coiffeurs habilités pour les prestations choisies (R-13).
  useEffect(() => {
    if (screen !== 2 || choices) return;
    let cancelled = false;
    (async () => {
      const result = await fetchStaffChoices({ serviceIds });
      if (cancelled) return;
      if (result.ok) {
        setChoices(result.choices);
        setChoicesFailed(false);
        // Le coiffeur déjà choisi doit rester valable : sinon retour à « Sans préférence » (R-20).
        setStaffId((current) =>
          current === "any" || result.choices.some((c) => c.id === current) ? current : "any",
        );
      } else {
        setChoicesFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, choices, serviceIds]);

  const continueFromServices = () => {
    const changed =
      servicesAtStaff.length !== serviceIds.length ||
      servicesAtStaff.some((id, i) => id !== serviceIds[i]);
    if (changed) {
      // Autres prestations : le coiffeur proposé et le créneau ne sont plus fiables.
      setChoices(null);
      setStaffId("any");
      setSlot(null);
    }
    setServicesAtStaff(serviceIds);
    goTo(2);
  };

  const pickStaff = (id: string) => {
    if (id !== staffId) {
      setSlot(null);
      setLost(null);
    }
    setStaffId(id);
  };

  /** Après le créneau : l'identification, sauf si le client est connu ; un client bloqué ou au maximum le sait ici. */
  const afterSlot = (state: BookingState | null, known: boolean, replace = false) => {
    if (editing) return goTo(5);
    if (!known) return goTo(4);
    if (state?.blocked) return goTo("blocked", replace);
    if (state && state.upcoming >= state.maxUpcoming) return goTo("limit", replace);
    goTo(5, replace);
  };

  const staffName =
    staffId === "any" ? null : (choices?.find((c) => c.id === staffId)?.firstName ?? null);
  const apprentices =
    (choices ?? []).length > 0 && (choices ?? []).every((c) => c.role === "apprentice");
  const anyLabel = (choices ?? []).map((c) => c.firstName).join(" ou ") || "Sans préférence";
  const staffLabel = staffName ?? anyLabel;

  const confirm = async () => {
    if (!slot) return;
    setSubmitting(true);
    setProblem(null);
    const result = editing
      ? await rescheduleBooking({ appointmentId: editing.id, staffId, startsAt: slot.iso })
      : await confirmBooking({
          serviceIds,
          staffId,
          startsAt: slot.iso,
          note: note.trim() || undefined,
          forName: forName.trim() || undefined,
        });
    if (result.ok) {
      if ("changed" in result && !result.changed) {
        setSubmitting(false);
        setProblem("C'est déjà le créneau de votre rendez-vous. Choisissez-en un autre.");
        return;
      }
      router.push(
        `/reservation/confirmation?rdv=${result.appointmentId}${editing ? "&modifie=1" : ""}`,
      );
      return; // on garde « Confirmation… » jusqu'au changement de page
    }
    setSubmitting(false);
    switch (result.error) {
      case "slot_unavailable":
        setLost({ time: slot.time, date: slot.date, reason: "taken" });
        setSlot(null);
        goTo(3);
        break;
      case "too_soon":
      case "too_far":
      case "closed":
      case "outside_hours":
      case "off_grid":
      case "in_past":
        setLost({ time: slot.time, date: slot.date, reason: "gone" });
        setSlot(null);
        goTo(3);
        break;
      case "too_many_upcoming":
        setBooking((b) => (b ? { ...b, upcoming: b.maxUpcoming } : b));
        goTo("limit");
        break;
      case "customer_blocked":
        setBooking((b) => (b ? { ...b, blocked: true } : b));
        goTo("blocked");
        break;
      case "not_signed_in":
        setCustomer(null);
        goTo(4);
        break;
      case "change_too_late":
      case "not_modifiable":
      case "appointment_not_found":
        // R-31 : passé le délai, le client appelle le salon.
        setLocked(true);
        setProblem("Ce rendez-vous ne peut plus être modifié en ligne.");
        break;
      case "rate_limited":
        setProblem("Trop d'essais. Réessayez dans quelques minutes.");
        break;
      default:
        setProblem(
          `Une erreur est survenue. Réessayez, ou appelez le salon au ${SALON.phoneDisplay}.`,
        );
    }
  };

  const changeableOnline = slot
    ? new Date(slot.iso).getTime() - pickedAt >= cutoffHours * 3_600_000
    : true;

  // La barre décrit seulement où elle mène ; l'action se décide au toucher.
  const runBar = (next: Screen | "confirm") => {
    if (next === "confirm") return confirm();
    if (next === 2) return continueFromServices();
    afterSlot(booking, !!customer);
  };

  const stepIndex = typeof screen === "number" ? steps.indexOf(screen) : -1;
  const exitHref = editing ? "/compte/rendez-vous" : "/";
  const back = () => {
    if (screen === firstScreen) router.push(exitHref);
    else window.history.back();
  };

  // Barre d'action du bas : ce qui est choisi, et le bouton qui fait avancer.
  let bar: {
    left: string;
    right: string;
    label: string;
    ok: boolean;
    next: Screen | "confirm";
  } | null = null;
  if (screen === 1) {
    bar = {
      left: services.length
        ? `${services.length} prestation${services.length > 1 ? "s" : ""} · ${formatDuration(durationMin)}`
        : "Aucune prestation choisie",
      right: services.length ? formatPrice(priceCents) : "",
      label: "Continuer",
      ok: services.length > 0,
      next: 2,
    };
  } else if (screen === 3) {
    bar = {
      left: slot ? `${slot.short} · ${slot.time}` : "Choisissez un horaire",
      right: slot ? staffLabel : "",
      label: "Continuer",
      ok: !!slot,
      next: 4,
    };
  } else if (screen === 5 && !locked) {
    bar = {
      left: editing ? "Même prestation, même prix" : "Paiement sur place",
      right: formatPrice(priceCents),
      label: submitting ? "Confirmation…" : editing ? "Confirmer la modification" : "Confirmer",
      ok: !!slot && !submitting,
      next: "confirm",
    };
  }

  return (
    <div className="client-flow fixed inset-y-0 left-1/2 z-10 flex w-full max-w-[430px] -translate-x-1/2 flex-col bg-[#0a0908]">
      <header className="flex h-[60px] shrink-0 items-center justify-between px-2.5">
        <button
          type="button"
          onClick={back}
          aria-label={screen === firstScreen ? "Quitter la réservation" : "Étape précédente"}
          className="flex h-11 w-11 items-center justify-center"
        >
          <ArrowLeft />
        </button>
        <div className="flex flex-col items-center gap-[3px]">
          <span className="flex items-center gap-[9px] text-[10px] font-semibold uppercase tracking-[0.3em] text-ivory-soft">
            <Mark size={7} />
            {editing && typeof screen === "number" ? "Modifier le RDV" : TITLES[screen]}
          </span>
          <span className="text-[11px] tabular-nums text-stone-dark">
            {stepIndex >= 0 ? `Étape ${stepIndex + 1} sur ${steps.length}` : SALON.name}
          </span>
        </div>
        <Link
          href={exitHref}
          aria-label="Quitter la réservation"
          className="flex h-11 w-11 items-center justify-center"
        >
          <CloseIcon />
        </Link>
      </header>
      {stepIndex >= 0 ? (
        <div
          role="progressbar"
          aria-label="Avancement de la réservation"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={stepIndex + 1}
          className="flex shrink-0 gap-1.5 px-6 pb-1"
        >
          {steps.map((n, i) => (
            <span
              key={n}
              className="relative h-px flex-1 overflow-hidden bg-[rgb(239_233_221_/_0.14)]"
            >
              <span
                className="seg absolute inset-0"
                style={{
                  background: i === stepIndex ? "#b8935a" : "#efe9dd",
                  transform: `scaleX(${i <= stepIndex ? 1 : 0})`,
                }}
              />
            </span>
          ))}
        </div>
      ) : null}

      <div className={`relative min-h-0 flex-1 ${sweep % 2 ? "swB" : "swA"}`}>
        <main ref={scroller} className="absolute inset-0 overflow-y-auto overflow-x-hidden">
          {pageNotice && screen === firstScreen ? (
            <div className="px-6 pt-5">
              <Note role="status">{pageNotice}</Note>
            </div>
          ) : null}
          {screen === 1 ? (
            <ServiceStep
              catalog={catalog}
              team={team}
              selected={serviceIds}
              onChange={setServiceIds}
            />
          ) : null}
          {screen === 2 ? (
            <StaffStep
              choices={choices}
              failed={choicesFailed}
              selected={staffId}
              apprentices={apprentices}
              onSelect={pickStaff}
              onPicked={() => goTo(3)}
            />
          ) : null}
          {screen === 3 ? (
            <DateStep
              serviceIds={serviceIds}
              {...(editing
                ? { appointmentId: editing.id, previousLabel: editing.currentLabel }
                : {})}
              staffId={staffId}
              staffLabel={staffLabel}
              durationMin={durationMin}
              selectedIso={slot?.iso ?? null}
              lost={lost}
              onPick={(next) => {
                setSlot(next);
                setPickedAt(Date.now());
                setLost(null);
              }}
              onTrySansPreference={() => {
                setStaffId("any");
                setSlot(null);
              }}
            />
          ) : null}
          {screen === 4 ? (
            <IdentityStep
              onAuthenticated={(c, b) => {
                setCustomer(c);
                setBooking(b);
                afterSlot(b, true, true);
              }}
            />
          ) : null}
          {screen === 5 && slot ? (
            <RecapStep
              services={services}
              priceCents={priceCents}
              durationMin={durationMin}
              slot={slot}
              staffLabel={staffLabel}
              staffRole={apprentices ? "Apprenti" : "Coiffeur"}
              editing={!!editing}
              previousLabel={editing?.currentLabel}
              note={note}
              onNote={setNote}
              forName={forName}
              onForName={setForName}
              customer={customer}
              cutoffHours={cutoffHours}
              changeableOnline={changeableOnline}
              problem={problem}
              callSalon={locked}
              onEdit={(n) => goTo(n)}
            />
          ) : null}
          {screen === "limit" && booking ? (
            <LimitScreen max={booking.maxUpcoming} onBack={() => goTo(3)} />
          ) : null}
          {screen === "blocked" ? <BlockedScreen /> : null}
        </main>
        <div
          aria-hidden="true"
          className="sw-line pointer-events-none absolute inset-y-0 left-0 w-[90px]"
          style={{
            background:
              "linear-gradient(90deg, rgb(239 233 221 / 0) 0%, rgb(239 233 221 / 0.07) 70%, rgb(239 233 221 / 0) 100%)",
          }}
        >
          <span className="absolute inset-y-0 right-[26px] w-px bg-led shadow-[0_0_12px_2px_rgb(255_255_255_/_0.55)]" />
        </div>
      </div>

      {bar ? (
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-[rgb(239_233_221_/_0.1)] bg-[#0a0908] px-6 pb-[18px] pt-3">
          <div aria-live="polite" className="flex min-h-5 items-baseline justify-between gap-3">
            <span className="text-[12px] tabular-nums text-stone">{bar.left}</span>
            <span className="font-display text-[22px] leading-none tabular-nums">{bar.right}</span>
          </div>
          <button type="button" onClick={() => runBar(bar.next)} disabled={!bar.ok} className={cta}>
            {bar.label}
            <ArrowRight color="#0b0a09" />
          </button>
        </div>
      ) : screen === 5 && locked ? (
        <div className="shrink-0 border-t border-[rgb(239_233_221_/_0.1)] px-6 pb-[18px] pt-3">
          <a href={SALON.phoneHref} className={cta}>
            <PhoneIcon color="#0b0a09" />
            Appeler le salon
          </a>
        </div>
      ) : null}
    </div>
  );
}
