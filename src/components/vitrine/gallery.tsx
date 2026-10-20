"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Photo } from "@/lib/photos";
import { ChevronLeft, ChevronRight, CloseIcon } from "./icons";

// Mobile : une grande photo, deux côte à côte, une grande, deux côte à côte (maquette). Ordinateur : trois colonnes.
const WIDE = { item: "col-span-2 lg:col-span-1", box: "h-[260px] lg:h-[300px]" };
const HALF = { item: "", box: "h-[200px] lg:h-[300px]" };
const LAYOUT = [WIDE, HALF, HALF, WIDE, HALF, HALF];

/**
 * Galerie de la page Le salon : chaque photo s'agrandit en plein écran (`<dialog>` natif : focus gardé, Échap,
 * focus rendu à la photo). Flèches du clavier et boutons pour passer d'une photo à l'autre.
 */
export function Gallery({ photos }: { photos: Photo[] }) {
  const [current, setCurrent] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpened = useRef(0);
  const count = photos.length;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (current !== null && !el.open) el.showModal();
    if (current === null && el.open) el.close();
  }, [current]);

  const step = (delta: number) =>
    setCurrent((i) => (i === null ? i : (i + delta + count) % count));
  const photo = current === null ? null : photos[current];

  return (
    <>
      <ul aria-label="Galerie photos" className="grid grid-cols-2 gap-3.5 px-6 lg:grid-cols-3 lg:gap-5">
        {photos.map((p, index) => (
          <li key={p.src} className={`flex flex-col gap-3 ${LAYOUT[index % LAYOUT.length].item}`} data-reveal>
            <button
              type="button"
              ref={(el) => {
                triggers.current[index] = el;
              }}
              onClick={() => {
                lastOpened.current = index;
                setCurrent(index);
              }}
              aria-label={`Agrandir : ${p.alt}`}
              className={`relative block w-full overflow-hidden ${LAYOUT[index % LAYOUT.length].box}`}
            >
              <Image
                src={p.src}
                alt=""
                fill
                sizes="(min-width: 1024px) 380px, 100vw"
                className="object-cover"
                priority={index === 0}
              />
              {index === 0 ? (
                <span className="led-line is-visible absolute inset-x-0 top-0 opacity-80" aria-hidden="true" />
              ) : null}
            </button>
            <span className="text-label uppercase tracking-[0.28em] text-stone">{p.caption}</span>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        aria-label={photo ? photo.alt : "Photo agrandie"}
        onClose={() => {
          setCurrent(null);
          // Safari ne rend pas toujours le focus au bouton qui a ouvert la visionneuse : on le fait.
          triggers.current[lastOpened.current]?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") step(-1);
          if (event.key === "ArrowRight") step(1);
        }}
        className="m-0 h-dvh max-h-none w-dvw max-w-none bg-ink p-0 text-ivory backdrop:bg-ink"
      >
        {photo ? (
          <div className="flex h-full flex-col">
            <div className="flex h-16 shrink-0 items-center justify-between px-2.5 pl-6">
              <span className="text-body-sm tabular-nums text-stone">
                {current! + 1} / {count}
              </span>
              <button
                type="button"
                onClick={() => setCurrent(null)}
                aria-label="Fermer"
                className="flex h-11 w-11 items-center justify-center"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 animate-fade-in" key={photo.src}>
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-6 pt-4">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Photo précédente"
                className="flex h-12 w-12 items-center justify-center border border-line-strong"
              >
                <ChevronLeft />
              </button>
              <span className="text-center text-label uppercase tracking-[0.28em] text-stone">
                {photo.caption}
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Photo suivante"
                className="flex h-12 w-12 items-center justify-center border border-line-strong"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
