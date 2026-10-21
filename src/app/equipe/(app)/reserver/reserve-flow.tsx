"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Field, inputClass } from "@/components/ui";
import { formatDuration, formatPrice } from "@/lib/format";
import type { CatalogService, StaffChoice } from "@/modules/catalog";
import { teamMessage, type TeamResult } from "../../_lib/messages";
import {
  createSalonAppointment,
  createSalonCustomerAction,
  fetchSalonDays,
  fetchSalonStaffChoices,
  searchCustomersAction,
  type CustomerHitView,
  type SalonDayView,
} from "../../actions";
import { AuthorPicker, type TeamMemberView } from "../_components/author-picker";
import { CustomerForm, EMPTY_FIELDS, type CustomerFields } from "../_components/customer-form";
import { SlotPicker, type PickedSalonSlot } from "../_components/slot-picker";

// Réservation par le salon, par téléphone ou au comptoir (R-26, R-27). Le client se choisit parmi les fiches, avec ou
// sans compte, ou se crée sur place sans compte (D-76) ; « Pour qui ? » nomme un proche (D-80). Les créneaux (heure pile
// ou demie, D-65 ; sans délai de réservation) et tous les contrôles viennent du serveur.

export interface ClientView {
  id: string;
  name: string;
  phone: string;
  lastVisitLabel: string | null;
  upcoming: number;
  blocked: boolean;
  hasAccount: boolean;
  hasEmail: boolean;
}

/** Ce qui a été tapé dans la recherche pré-remplit la nouvelle fiche : un numéro, ou « prénom nom ». */
function prefill(text: string): CustomerFields {
  const trimmed = text.trim();
  if (/^[\d+\s.]+$/.test(trimmed)) return { ...EMPTY_FIELDS, phone: trimmed };
  const [firstName = "", ...rest] = trimmed.split(/\s+/);
  return { ...EMPTY_FIELDS, firstName, lastName: rest.join(" ") };
}

const NoAccountChip = () => (
  <span className="border border-line-strong px-1.5 py-px text-[10px] uppercase tracking-[0.14em] text-stone">
    Sans compte
  </span>
);

const stepTitle = "text-[20px] font-light";

const dateOf = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));

const smallButton =
  "flex h-11 items-center gap-2 px-3 text-[11px] uppercase tracking-[0.2em] transition-colors duration-200";

export function ReserveFlow({
  catalog,
  team,
  today,
  maxUpcoming,
  initialClient,
  initialServiceIds = [],
  initialStaffId = "any",
  initialDate,
}: {
  catalog: CatalogService[];
  team: TeamMemberView[];
  today: string;
  maxUpcoming: number;
  initialClient: ClientView | null;
  /** Prestations, coiffeur et jour d'une date sautée d'une série (D-84). */
  initialServiceIds?: string[];
  initialStaffId?: string | "any";
  initialDate?: string;
}) {
  const router = useRouter();
  const [client, setClient] = useState<ClientView | null>(initialClient);
  const [creating, setCreating] = useState(false);
  const [forName, setForName] = useState("");
  const [query, setQuery] = useState("");
  // Résultats de la dernière recherche, avec le texte cherché : un texte plus ancien ne s'affiche plus.
  const [found, setFound] = useState<{ text: string; hits: CustomerHitView[] } | null>(null);

  const [serviceIds, setServiceIds] = useState<string[]>(initialServiceIds);
  const [choices, setChoices] = useState<StaffChoice[]>([]);
  const [staffId, setStaffId] = useState<string | "any">(initialStaffId);
  const [slot, setSlot] = useState<PickedSalonSlot | null>(null);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; date: string; author: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Recherche : 250 ms après la dernière touche, 2 caractères au moins.
  useEffect(() => {
    if (client) return;
    const text = query.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchCustomersAction(text);
      if (cancelled) return;
      if (result.ok) {
        setFound({ text, hits: result.hits });
        setError(null);
      } else {
        setError(teamMessage(result.error));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, client]);

  // Les coiffeurs possibles dépendent des prestations (R-13, R-18).
  useEffect(() => {
    if (serviceIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const result = await fetchSalonStaffChoices({ serviceIds });
      if (cancelled) return;
      if (result.ok) {
        setChoices(result.choices);
        setStaffId((current) =>
          current === "any" || result.choices.some((c) => c.id === current) ? current : "any",
        );
      } else {
        setError(teamMessage(result.error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceIds]);

  const text = query.trim();
  const hits = found && found.text === text ? found.hits : [];
  const searched = !!found && found.text === text;

  const picked = serviceIds
    .map((id) => catalog.find((s) => s.id === id))
    .filter((s): s is CatalogService => !!s);
  const category = picked[0]?.performedBy;
  const totalCents = picked.reduce((sum, s) => sum + s.priceCents, 0);
  const totalMinutes = picked.reduce((sum, s) => sum + s.durationMin, 0);

  const groups: { title: string; items: CatalogService[] }[] = [];
  for (const service of catalog) {
    const group = groups.find((g) => g.title === service.category);
    if (group) group.items.push(service);
    else groups.push({ title: service.category, items: [service] });
  }

  const toggle = (id: string) => {
    setSlot(null);
    setServiceIds((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );
  };

  const loadDays = useCallback(
    (from: string, days: number): Promise<TeamResult<{ days: SalonDayView[] }>> =>
      fetchSalonDays({ serviceIds, staffId, from, days }),
    [serviceIds, staffId],
  );

  const reset = () => {
    setClient(null);
    setCreating(false);
    setForName("");
    setQuery("");
    setFound(null);
    setServiceIds([]);
    setChoices([]);
    setStaffId("any");
    setSlot(null);
    setAuthorId(null);
    setError(null);
    setCreated(null);
  };

  const missing = !client
    ? "Choisir un client"
    : serviceIds.length === 0
      ? "Choisir une prestation"
      : !slot
        ? "Choisir un créneau"
        : !authorId
          ? "Qui réserve ?"
          : null;

  const confirm = () => {
    if (!client || !slot || !authorId || serviceIds.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await createSalonAppointment({
        customerId: client.id,
        serviceIds,
        staffId,
        startsAt: slot.iso,
        authorId,
        ...(forName.trim() ? { forName: forName.trim() } : {}),
      });
      if (!result.ok) {
        setError(teamMessage(result.error));
        if (result.error === "slot_unavailable") {
          setSlot(null);
          setReloadKey((k) => k + 1);
        }
        return;
      }
      setCreated({
        id: result.appointmentId,
        date: dateOf(result.startsAtIso),
        author: team.find((m) => m.id === authorId)?.firstName ?? "",
      });
    });
  };

  const tooMany = !!client && client.upcoming >= maxUpcoming;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <section
        aria-label="Client"
        className="flex shrink-0 flex-col gap-4 border-b border-line-subtle px-6 py-7 lg:w-[380px] lg:overflow-y-auto lg:border-b-0 lg:border-r"
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-[0.3em] text-stone">
            Nouveau rendez-vous
          </span>
          <h1 className="text-[26px] font-light leading-tight">Pour quel client ?</h1>
        </div>

        {client ? (
          <div className="flex flex-col gap-2.5 bg-graphite p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex flex-col items-start gap-1.5">
                <span className="text-[20px] font-light">{client.name}</span>
                {client.hasAccount ? null : <NoAccountChip />}
              </span>
              {!created ? (
                <button
                  type="button"
                  onClick={() => {
                    setClient(null);
                    setSlot(null);
                  }}
                  className="min-h-10 text-[13px] text-ivory-soft underline underline-offset-4"
                >
                  Changer
                </button>
              ) : null}
            </div>
            <span className="text-[14px] tabular-nums text-ivory-soft">{client.phone}</span>
            <span className="text-[13px] text-stone">
              {client.lastVisitLabel ? `Dernier RDV : ${client.lastVisitLabel}` : "Aucun RDV passé"}{" "}
              · {client.upcoming === 0 ? "Aucun RDV à venir" : `${client.upcoming} RDV à venir`}
            </span>
            {client.blocked ? (
              <p role="status" className="border border-brick p-3 text-[13px] leading-normal">
                Bloqué en ligne : le client ne peut plus réserver seul, mais le salon peut le faire.
              </p>
            ) : null}
            {tooMany ? (
              <p role="status" className="border border-brick p-3 text-[13px] leading-normal">
                Ce client a déjà {client.upcoming} rendez-vous à venir : c’est le maximum.
              </p>
            ) : null}
            {client.hasEmail ? null : (
              <p className="text-[13px] leading-normal text-stone">
                Pas d’email sur la fiche : le client ne recevra ni confirmation ni rappel.
              </p>
            )}
            {!created ? (
              <div className="pt-1.5">
                <Field id="for-name" label="Pour qui ?" optional hint="Le prénom d’un proche.">
                  <input
                    id="for-name"
                    type="text"
                    maxLength={40}
                    autoComplete="off"
                    value={forName}
                    onChange={(event) => setForName(event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : creating ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-[18px] font-light">Nouvelle fiche, sans compte</h2>
            <CustomerForm
              idPrefix="new-client"
              initial={prefill(query)}
              submitLabel="Enregistrer la fiche"
              onSubmit={(fields, samePhoneConfirmed) =>
                createSalonCustomerAction({ fields, samePhoneConfirmed })
              }
              onDone={(id, fields) => {
                setCreating(false);
                setClient({
                  id,
                  name: `${fields.firstName.trim()} ${fields.lastName.trim()}`,
                  phone: fields.phone.trim(),
                  lastVisitLabel: null,
                  upcoming: 0,
                  blocked: false,
                  hasAccount: false,
                  hasEmail: fields.email.trim() !== "",
                });
              }}
              onPick={(existing) => router.push(`/equipe/reserver?client=${existing.id}`)}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="client-search" className="text-body-sm text-ivory-soft">
                Nom, prénom ou téléphone
              </label>
              <input
                id="client-search"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un client"
                className="h-14 w-full min-w-0 border border-ivory bg-ink px-4 text-[16px] text-ivory placeholder:text-stone-dark"
              />
            </div>
            {hits.length > 0 ? (
              <ul className="flex flex-col border-t border-line" aria-label="Clients trouvés">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setClient({
                          id: hit.id,
                          name: hit.name,
                          phone: hit.maskedPhone,
                          lastVisitLabel: hit.lastVisitLabel,
                          upcoming: hit.upcoming,
                          blocked: false,
                          hasAccount: hit.hasAccount,
                          hasEmail: hit.hasEmail,
                        })
                      }
                      className="flex min-h-16 w-full items-center gap-3.5 border-b border-line text-left"
                    >
                      <span className="flex flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-2 text-[16px]">
                          {hit.name}
                          {hit.hasAccount ? null : <NoAccountChip />}
                        </span>
                        <span className="text-[13px] tabular-nums text-stone">
                          {hit.maskedPhone}
                          {hit.lastVisitLabel ? ` · Dernier RDV : ${hit.lastVisitLabel}` : ""}
                        </span>
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#b8935a"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            ) : searched ? (
              <p role="status" className="text-[14px] leading-normal text-stone">
                Aucun client ne correspond.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-[52px] items-center justify-center gap-2.5 border border-line-strong px-5 text-[11px] uppercase tracking-[0.2em] transition-colors duration-200 hover:bg-graphite-light"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nouvelle fiche sans compte
            </button>
          </>
        )}
      </section>

      <main className="flex min-w-0 flex-1 flex-col lg:overflow-y-auto">
        <div className="flex flex-col gap-4 px-7 pt-7">
          <section
            aria-label="Prestations"
            className={`flex flex-col gap-3 border p-5 ${serviceIds.length > 0 ? "border-line" : "border-ivory"}`}
          >
            <div className="flex items-center gap-3.5">
              <span className="flex h-7 w-7 items-center justify-center border border-ivory text-[13px]">
                1
              </span>
              <h2 className={stepTitle}>Prestations</h2>
              {picked.length > 0 ? (
                <span className="ml-auto text-[14px] text-ivory-soft">
                  {formatDuration(totalMinutes)} · {formatPrice(totalCents)}
                </span>
              ) : null}
            </div>
            {category ? (
              <p className="text-[13px] leading-normal text-stone">
                Un rendez-vous ne mélange pas les prestations des coiffeurs et des apprentis : les
                autres sont grisées.
              </p>
            ) : null}
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col">
                <h3 className="pb-1 pt-2 text-label uppercase tracking-[0.3em] text-stone">
                  {group.title}
                </h3>
                <ul>
                  {group.items.map((item) => {
                    const on = serviceIds.includes(item.id);
                    const blocked = !!category && item.performedBy !== category;
                    return (
                      <li
                        key={item.id}
                        className={`flex min-h-16 items-center gap-3 border-t border-line-subtle ${blocked ? "opacity-40" : ""}`}
                      >
                        <div className="flex flex-1 flex-col gap-0.5">
                          <span className="text-[15px]">{item.name}</span>
                          <span className="text-[13px] text-stone">
                            {formatDuration(item.durationMin)} · {formatPrice(item.priceCents)}
                            {item.bookableOnline ? "" : " · sur appel"}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`${on ? "Retirer" : "Choisir"} ${item.name}`}
                          disabled={blocked}
                          onClick={() => toggle(item.id)}
                          className={`${smallButton} ${
                            on
                              ? "bg-ivory font-medium text-ink"
                              : "border border-line-strong text-ivory hover:bg-graphite-light disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          }`}
                        >
                          {on ? "Choisie" : "Choisir"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          {serviceIds.length > 0 ? (
            <section aria-label="Coiffeur" className="flex flex-col gap-3 border border-line p-5">
              <div className="flex items-center gap-3.5">
                <span className="flex h-7 w-7 items-center justify-center border border-ivory text-[13px]">
                  2
                </span>
                <h2 className={stepTitle}>Coiffeur</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[{ id: "any", firstName: "Sans préférence" }, ...choices].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={staffId === c.id}
                    onClick={() => {
                      setStaffId(c.id);
                      setSlot(null);
                    }}
                    className={`h-12 border text-[15px] transition-colors duration-200 ${
                      staffId === c.id
                        ? "border-ivory bg-ivory text-ink"
                        : "border-line-strong hover:bg-graphite-light"
                    }`}
                  >
                    {c.firstName}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {serviceIds.length > 0 ? (
            <section
              aria-label="Date et heure"
              className="flex flex-col gap-3.5 border border-line p-5"
            >
              <div className="flex items-center gap-3.5">
                <span className="flex h-7 w-7 items-center justify-center border border-ivory text-[13px]">
                  3
                </span>
                <h2 className={stepTitle}>Date et heure</h2>
              </div>
              <SlotPicker
                load={loadDays}
                today={today}
                startDate={initialDate}
                value={slot?.iso ?? null}
                onPick={setSlot}
                reloadKey={`${serviceIds.join(",")}:${staffId}:${reloadKey}`}
              />
            </section>
          ) : null}
        </div>

        <div className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-line bg-ink px-7 pb-6 pt-4.5">
          {error ? (
            <p role="alert" className="border border-brick p-3 text-[14px] leading-normal">
              {error}
            </p>
          ) : null}
          {created ? (
            <div className="flex flex-wrap items-center gap-4">
              <p role="status" className="flex flex-1 items-center gap-3 text-[15px]">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9bb58c"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                Rendez-vous créé par {created.author} ·{" "}
                {client?.hasEmail
                  ? "le client reçoit l’email de confirmation."
                  : "pas d’email sur la fiche, aucune confirmation n’est envoyée."}
              </p>
              <Link
                href={`/equipe?jour=${created.date}&rdv=${created.id}`}
                className="flex h-[52px] items-center border border-line-strong px-5 text-[11px] uppercase tracking-[0.2em]"
              >
                Voir le planning
              </Link>
              <button
                type="button"
                onClick={reset}
                className="flex h-[52px] items-center border border-line-strong px-5 text-[11px] uppercase tracking-[0.2em]"
              >
                Nouveau RDV
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[300px] flex-1">
                <AuthorPicker
                  team={team}
                  value={authorId}
                  onChange={setAuthorId}
                  label="Qui réserve ?"
                  columns={4}
                />
              </div>
              <button
                type="button"
                disabled={!!missing || pending}
                onClick={confirm}
                className="h-14 bg-ivory px-6 text-[12px] font-medium uppercase tracking-[0.22em] text-ink disabled:bg-disabled disabled:text-stone-dark"
              >
                {missing ??
                  (pending
                    ? "Réservation…"
                    : `Confirmer · ${slot!.dayLabel.slice(0, 3)}. ${slot!.time}`)}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
