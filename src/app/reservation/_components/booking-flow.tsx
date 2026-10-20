"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui";
import { formatPrice } from "@/lib/format";
import { SALON } from "@/lib/salon";
import { prefersReducedMotion } from "@/lib/motion";
import type { CatalogService, StaffChoice } from "@/modules/catalog";
import type { BookingState, CustomerProfile } from "@/modules/customers/accounts";
import { confirmBooking, fetchStaffChoices } from "../actions";
import { DateStep, type PickedSlot } from "./date-step";
import { IdentityStep } from "./identity-step";
import { RecapStep } from "./recap-step";
import { ServiceStep, totals } from "./service-step";
import { StaffStep } from "./staff-step";
import { StepFrame, type StepStatus } from "./step-frame";

type StepNo = 1 | 2 | 3 | 4 | 5;

/**
 * Le parcours de réservation sur une seule page (D-16) : chaque étape validée se replie en un résumé modifiable.
 * Ce composant ne décide d'aucune règle : créneaux, refus et délais viennent du serveur.
 */
export function BookingFlow({
  catalog,
  customer: initialCustomer,
  booking: initialBooking,
  cutoffHours,
}: {
  catalog: CatalogService[];
  customer: CustomerProfile | null;
  booking: BookingState | null;
  cutoffHours: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<StepNo>(1);
  const [done, setDone] = useState<0 | StepNo>(0);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState("any");
  const [choices, setChoices] = useState<StaffChoice[] | null>(null);
  const [choicesFailed, setChoicesFailed] = useState(false);
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  // Instant où le créneau a été choisi, pour avertir si le RDV est à moins de 48 h (R-32, information seulement :
  // le serveur décide, à la création, si le RDV se modifie en ligne).
  const [pickedAt, setPickedAt] = useState(0);
  const [notice, setNotice] = useState<"taken" | "gone" | null>(null);
  const [note, setNote] = useState("");
  const [customer, setCustomer] = useState(initialCustomer);
  const [booking, setBooking] = useState(initialBooking);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const first = useRef(true);
  const servicesAtOpen = useRef<string[]>([]);

  const { rows: services, priceCents, durationMin } = totals(catalog, serviceIds);

  const statusOf = (n: StepNo): StepStatus => (n === open ? "open" : n <= done ? "done" : "todo");

  // Fait défiler jusqu'à l'étape qui s'ouvre (jamais au premier affichage).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document
      .getElementById(`step-${open}`)
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, [open]);

  // Étape 2 : coiffeurs habilités pour les prestations choisies (R-13).
  useEffect(() => {
    if (open !== 2 || choices) return;
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
  }, [open, choices, serviceIds]);

  const goTo = (n: StepNo, completed: 0 | StepNo) => {
    setOpen(n);
    setDone(completed);
  };

  const edit = (n: StepNo) => {
    if (n === 1) servicesAtOpen.current = serviceIds;
    goTo(n, (n - 1) as 0 | StepNo);
  };

  const continueFromServices = () => {
    const changed =
      servicesAtOpen.current.length !== serviceIds.length ||
      servicesAtOpen.current.some((id, i) => id !== serviceIds[i]);
    if (changed) {
      // Autres prestations : le coiffeur proposé et le créneau ne sont plus fiables.
      setChoices(null);
      setStaffId("any");
      setSlot(null);
    }
    servicesAtOpen.current = serviceIds;
    goTo(2, 1);
  };

  const pickStaff = (id: string) => {
    if (id !== staffId) setSlot(null);
    setStaffId(id);
  };

  const staffName =
    staffId === "any" ? null : (choices?.find((c) => c.id === staffId)?.firstName ?? null);
  const staffLabel = staffName ? `avec ${staffName}` : "Sans préférence";

  const confirm = async () => {
    if (!slot) return;
    setSubmitting(true);
    setProblem(null);
    const result = await confirmBooking({
      serviceIds,
      staffId,
      startsAt: slot.iso,
      note: note.trim() || undefined,
    });
    if (result.ok) {
      router.push(`/reservation/confirmation?rdv=${result.appointmentId}`);
      return; // on garde « Confirmation… » jusqu'au changement de page
    }
    setSubmitting(false);
    switch (result.error) {
      case "slot_unavailable":
        setNotice("taken");
        setSlot(null);
        goTo(3, 2);
        break;
      case "too_soon":
      case "too_far":
      case "closed":
      case "outside_hours":
      case "off_grid":
      case "in_past":
        setNotice("gone");
        setSlot(null);
        goTo(3, 2);
        break;
      case "too_many_upcoming":
        setBooking((b) => (b ? { ...b, upcoming: b.maxUpcoming } : b));
        goTo(4, 3);
        break;
      case "customer_blocked":
        setBooking((b) => (b ? { ...b, blocked: true } : b));
        goTo(4, 3);
        break;
      case "not_signed_in":
        setCustomer(null);
        goTo(4, 3);
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

  const progressOf = (n: StepNo) =>
    n === open ? "current" : n < open || n <= done ? "past" : "future";

  return (
    <div className="min-h-dvh">
      <PageHeader backHref="/" label="Réservation" />
      <div
        role="progressbar"
        aria-label="Avancement de la réservation"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={open}
        className="mx-auto flex w-full max-w-[640px] items-center gap-1.5 px-6 pb-4"
      >
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const state = progressOf(n);
          return (
            <div
              key={n}
              className={`flex-1 transition-[height,background-color] duration-[280ms] ${
                state === "current"
                  ? "h-[3px] bg-led shadow-[0_0_8px_1px_rgb(255_255_255_/_0.45)]"
                  : state === "past"
                    ? "h-0.5 bg-ivory"
                    : "h-0.5 bg-line-strong"
              }`}
            />
          );
        })}
      </div>

      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-2.5 px-4 pb-12">
        <StepFrame
          n={1}
          title="Choisissez une prestation"
          status={statusOf(1)}
          summaryLabel="Prestation"
          summary={
            <>
              {services.map((s) => (
                <span key={s.id}>
                  {s.name} · {formatPrice(s.priceCents)}
                </span>
              ))}
              <button
                type="button"
                onClick={() => edit(1)}
                className="min-h-11 self-start text-button-sm uppercase text-ivory"
              >
                Ajouter une prestation à la suite
              </button>
            </>
          }
          onEdit={() => edit(1)}
        >
          <ServiceStep
            catalog={catalog}
            selected={serviceIds}
            onChange={setServiceIds}
            onContinue={continueFromServices}
          />
        </StepFrame>

        <StepFrame
          n={2}
          title="Avec qui ?"
          status={statusOf(2)}
          summaryLabel="Coiffeur"
          summary={<span>{staffLabel}</span>}
          onEdit={() => edit(2)}
        >
          <StaffStep
            choices={choices}
            failed={choicesFailed}
            selected={staffId}
            onSelect={pickStaff}
            onContinue={() => goTo(3, 2)}
          />
        </StepFrame>

        <StepFrame
          n={3}
          title="Date et heure"
          status={statusOf(3)}
          summaryLabel="Date et heure"
          summary={slot ? <span>{`${slot.dayLabel} · ${slot.time}`}</span> : null}
          onEdit={() => edit(3)}
        >
          {open === 3 ? (
            <DateStep
              serviceIds={serviceIds}
              staffId={staffId}
              staffName={staffName}
              selectedIso={slot?.iso ?? null}
              notice={notice}
              onPick={(picked) => {
                setSlot(picked);
                setPickedAt(Date.now());
                setNotice(null);
                goTo(4, 3);
              }}
              onTrySansPreference={() => {
                setStaffId("any");
                setSlot(null);
              }}
            />
          ) : null}
        </StepFrame>

        <StepFrame
          n={4}
          title="Vos coordonnées"
          status={statusOf(4)}
          summaryLabel="Coordonnées"
          summary={customer ? <span>{`${customer.firstName} ${customer.lastName}`}</span> : null}
          onEdit={() => edit(4)}
        >
          <IdentityStep
            customer={customer}
            booking={booking}
            note={note}
            onNote={setNote}
            onAuthenticated={(c, b) => {
              setCustomer(c);
              setBooking(b);
            }}
            onLoggedOut={() => {
              setCustomer(null);
              setBooking(null);
            }}
            onContinue={() => goTo(5, 4)}
          />
        </StepFrame>

        <StepFrame
          n={5}
          title="Récapitulatif"
          status={statusOf(5)}
          summaryLabel="Confirmation"
          summary={null}
          onEdit={() => edit(5)}
        >
          {slot ? (
            <RecapStep
              services={services}
              priceCents={priceCents}
              durationMin={durationMin}
              slot={slot}
              staffLabel={staffLabel}
              note={note}
              cutoffHours={cutoffHours}
              changeableOnline={changeableOnline}
              submitting={submitting}
              problem={problem}
              onConfirm={confirm}
            />
          ) : null}
        </StepFrame>
      </main>
    </div>
  );
}
