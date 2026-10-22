"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Eyebrow, Problem, cta, ghost, quiet } from "@/components/client/ui";
import { SALON } from "@/lib/salon";
import { acceptOfferAction, declineOfferAction, leaveWaitlistAction } from "../actions";

export interface OfferViewData {
  id: string;
  entryId: string;
  state: "pending" | "accepted" | "declined" | "expired" | "lost";
  /** « Samedi 24 octobre » */
  day: string;
  /** « 15:30 – 16:00 » */
  time: string;
  services: string;
  staff: string;
  price: string;
  expiresAt: string;
  /** « 15:07 » */
  until: string;
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * La place gardée (maquettes « Lot12-Attente » : offre, perdue, limite). Le compte à rebours est une indication : le
 * serveur décide, à chaque action, si la place est encore gardée.
 */
export function OfferView({
  offer,
  maxUpcoming,
  nowIso,
}: {
  offer: OfferViewData;
  maxUpcoming: number;
  nowIso: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [screen, setScreen] = useState<"offer" | "gone" | "declined" | "left" | "limit">(
    offer.state === "pending" ? "offer" : offer.state === "declined" ? "declined" : "gone",
  );
  const [problem, setProblem] = useState<string | null>(null);
  // Temps restant : calculé avec l'horloge du serveur au premier affichage, puis décompté ici.
  const start = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(Date.parse(offer.expiresAt) - Date.parse(nowIso));

  useEffect(() => {
    start.current = Date.now();
    const base = Date.parse(offer.expiresAt) - Date.parse(nowIso);
    const timer = setInterval(() => {
      setRemaining(base - (Date.now() - (start.current ?? Date.now())));
    }, 1000);
    return () => clearInterval(timer);
  }, [offer.expiresAt, nowIso]);

  const over = screen === "offer" && remaining <= 0;
  const active = screen === "offer" || screen === "limit";

  const take = () => {
    setProblem(null);
    startTransition(async () => {
      const result = await acceptOfferAction(offer.id);
      if (result.ok) {
        router.push(`/reservation/confirmation?rdv=${result.appointmentId}`);
        return;
      }
      switch (result.error) {
        case "slot_unavailable":
        case "offer_expired":
        case "offer_closed":
        case "too_soon":
          setScreen("gone");
          return;
        case "too_many_upcoming":
          setScreen("limit");
          return;
        case "customer_blocked":
          setProblem("La réservation en ligne est indisponible. Appelez le salon.");
          return;
        case "rate_limited":
          setProblem("Trop d'essais. Réessayez dans quelques minutes.");
          return;
        default:
          setProblem("Impossible de prendre cette place pour le moment. Réessayez.");
      }
    });
  };

  const pass = () => {
    setProblem(null);
    startTransition(async () => {
      const result = await declineOfferAction(offer.id);
      if (result.ok) setScreen("declined");
      else setProblem("Impossible d'enregistrer votre réponse. Réessayez.");
    });
  };

  const leave = () => {
    setProblem(null);
    startTransition(async () => {
      const result = await leaveWaitlistAction(offer.entryId);
      if (result.ok) setScreen("left");
      else setProblem("Impossible de vous retirer de la liste. Réessayez.");
    });
  };

  if (screen === "gone" || over) {
    return (
      <Shell>
        <Eyebrow>Liste d&rsquo;attente</Eyebrow>
        <h1 className="font-display text-[40px] leading-[1.06]">Cette place n&rsquo;est plus disponible.</h1>
        <p className="text-[14px] leading-[1.6] text-stone">
          Elle a été prise par quelqu&rsquo;un d&rsquo;autre, ou le délai de {offer.until} est
          passé. Vous restez sur la liste : la prochaine place qui vous convient vous sera proposée.
        </p>
        <div className="mt-auto flex flex-col gap-2.5">
          <Link href="/reservation" className={cta}>
            Voir les autres horaires
          </Link>
          <button type="button" onClick={leave} disabled={pending} className={ghost}>
            Quitter la liste d&rsquo;attente
          </button>
          {problem ? <Problem title={problem} /> : null}
        </div>
      </Shell>
    );
  }

  if (screen === "declined" || screen === "left") {
    return (
      <Shell>
        <Eyebrow>Liste d&rsquo;attente</Eyebrow>
        <h1 className="font-display text-[40px] leading-[1.06]">
          {screen === "left" ? "Vous avez quitté la liste." : "C'est noté."}
        </h1>
        <p className="text-[14px] leading-[1.6] text-stone">
          {screen === "left"
            ? "Nous ne vous préviendrons plus pour ces jours-là."
            : "La place est proposée à la personne suivante. Vous restez sur la liste pour les prochaines."}
        </p>
        <div className="mt-auto flex flex-col gap-2.5">
          <Link href="/compte/rendez-vous" className={cta}>
            Mes rendez-vous
          </Link>
          <Link href="/" className={quiet}>
            Retour à l&rsquo;accueil
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Eyebrow>Liste d&rsquo;attente</Eyebrow>
      <h1 className="font-display text-[44px] leading-[1.05]">Une place s&rsquo;est libérée.</h1>

      <div className="relative flex flex-col gap-1.5 border border-[rgb(184_147_90_/_0.45)] bg-[rgb(184_147_90_/_0.06)] px-6 py-[22px]">
        <span aria-hidden="true" className="absolute -inset-px right-auto w-0.5 bg-gold" />
        <span className="font-display text-[30px] leading-[1.1]">{offer.day}</span>
        <span className="text-[20px] tabular-nums">{offer.time}</span>
        <span className="text-[15px] text-ivory-soft">{offer.services}</span>
        <span className="text-[13px] text-stone">
          avec {offer.staff} · {offer.price}
        </span>
      </div>

      <p role="timer" aria-live="off" className="flex items-baseline gap-3 text-[14px] text-ivory-soft">
        <span className="font-display text-[34px] leading-none tabular-nums text-gold">
          {clock(remaining)}
        </span>
        Gardée pour vous jusqu&rsquo;à {offer.until}. Passé ce délai, elle est proposée à la
        personne suivante.
      </p>

      {screen === "limit" ? (
        <Problem title={`Vous avez déjà ${maxUpcoming} rendez-vous à venir`}>
          Annulez-en un dans{" "}
          <Link href="/compte/rendez-vous" className="underline underline-offset-[3px]">
            Mes rendez-vous
          </Link>
          , puis revenez ici avant la fin du compte à rebours.
        </Problem>
      ) : null}
      {problem ? <Problem title={problem} /> : null}

      <div className="mt-auto flex flex-col gap-2.5">
        <button type="button" onClick={take} disabled={pending || !active} className={cta}>
          {pending ? "Un instant…" : "Prendre cette place"}
        </button>
        <button type="button" onClick={pass} disabled={pending} className={ghost}>
          Pas cette fois, je reste sur la liste
        </button>
        <button type="button" onClick={leave} disabled={pending} className={`${quiet} justify-center`}>
          Quitter la liste d&rsquo;attente
        </button>
        <a href={SALON.phoneHref} className={`${quiet} justify-center`}>
          Appeler le salon
        </a>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col gap-6 px-6 pb-9 pt-[34px]">{children}</main>;
}
