"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { teamMessage } from "../../_lib/messages";
import { searchCustomersAction, type CustomerHitView } from "../../actions";
import { LOCK_URL } from "./manager-leave-guard";

/** « Verrouiller » : l'espace gérant se referme tout de suite, sans attendre les 5 minutes (D-53). */
export function LockButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await fetch(LOCK_URL, { method: "POST" });
          router.refresh();
        })
      }
      className="flex h-12 items-center border border-line-strong px-5 text-[11px] uppercase tracking-[0.2em] hover:bg-graphite-light"
    >
      Verrouiller
    </button>
  );
}

/** Recherche d'un client pour ouvrir ses fonctions gérant (bloquer, supprimer). */
export function CustomerFinder() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CustomerHitView[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchCustomersAction(text);
      if (cancelled) return;
      if (result.ok) {
        setHits(result.hits);
        setMessage(result.hits.length === 0 ? "Aucun client ne correspond." : null);
      } else {
        setMessage(teamMessage(result.error));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const shown = query.trim().length < 2 ? [] : hits;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="manager-search" className="text-body-sm text-ivory-soft">
        Chercher un client
      </label>
      <input
        id="manager-search"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Nom, prénom ou téléphone"
        className="h-14 w-full min-w-0 border border-line-strong bg-ink px-4 text-[16px] text-ivory placeholder:text-stone-dark"
      />
      {message && query.trim().length >= 2 ? (
        <p role="status" className="text-[14px] text-stone">
          {message}
        </p>
      ) : null}
      {shown.length > 0 ? (
        <ul aria-label="Clients trouvés" className="border-t border-line-subtle">
          {shown.map((hit) => (
            <li key={hit.id}>
              <Link
                href={`/equipe/gerant/clients/${hit.id}`}
                className="flex min-h-16 flex-col justify-center gap-0.5 border-b border-line-subtle"
              >
                <span className="text-[16px]">{hit.name}</span>
                <span className="text-[13px] tabular-nums text-stone">{hit.maskedPhone}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
