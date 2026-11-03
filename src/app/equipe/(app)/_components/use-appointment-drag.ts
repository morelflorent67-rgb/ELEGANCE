"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  dropProblem,
  LONG_PRESS_MS,
  MOUSE_SLOP_PX,
  sameSpot,
  snapMinute,
  TOUCH_SLOP_PX,
  type DragColumn,
  type DropProblem,
} from "@/lib/drag-move";

// Glisser-déposer d'un RDV dans le planning (D-110, R-95), sans bibliothèque : événements de pointeur.
// Au toucher, un appui long (250 ms) lance le glisser ; un doigt qui bouge avant fait défiler le planning comme
// d'habitude. À la souris, quelques pixels suffisent. Le bloc s'aligne sur la grille des créneaux et le dépôt ne
// déplace rien tout seul : il ouvre la confirmation (le serveur décide).

const EDGE_PX = 56;
const SCROLL_PX = 12;

export interface DragState {
  id: string;
  duration: number;
  origin: { staffId: string; startMinute: number };
  /** Où le bloc tomberait (aligné sur la grille), ou null hors des colonnes. */
  target: { staffId: string; startMinute: number } | null;
  problem: DropProblem | null;
}

export interface DragOptions {
  columns: DragColumn[];
  ranges: { from: number; to: number }[];
  gridStart: number;
  gridEnd: number;
  step: number;
  /** Minute actuelle si le jour affiché est aujourd'hui : on ne dépose pas dans le passé. */
  nowMinute: number | null;
  pxPerMinute: number;
  /** Décalage du haut de la grille (px) : les blocs sont posés 8 px plus bas que l'heure. */
  topOffset: number;
  scrollRef: RefObject<HTMLElement | null>;
  /** Dépôt sur un endroit libre et différent : ouvre la confirmation. Un dépôt sur un endroit refusé ne fait rien. */
  onDrop: (move: { id: string; staffId: string; startMinute: number }) => void;
}

interface Pending {
  id: string;
  duration: number;
  origin: { staffId: string; startMinute: number };
  pointerId: number;
  kind: string;
  startX: number;
  startY: number;
  /** Minutes entre le haut du bloc et le point saisi. */
  grabMinutes: number;
  element: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Le contrôleur vit hors de React (créé une fois) : ses écouteurs de fenêtre se posent et s'enlèvent sans dépendances. */
function createController(
  getOptions: () => DragOptions,
  setDrag: (state: DragState | null) => void,
) {
  const columnEls = new Map<string, HTMLElement>();
  let pending: Pending | null = null;
  let active: DragState | null = null;
  let last = { x: 0, y: 0 };
  let scrollTimer: ReturnType<typeof setInterval> | null = null;
  let suppressClick = false;

  const aim = (x: number, y: number) => {
    if (!active || !pending) return;
    const o = getOptions();
    let found: { staffId: string; rect: DOMRect } | null = null;
    for (const [staffId, element] of columnEls) {
      const rect = element.getBoundingClientRect();
      if (x >= rect.left && x < rect.right) {
        found = { staffId, rect };
        break;
      }
    }
    let next: DragState;
    if (!found) {
      next = { ...active, target: null, problem: null };
    } else {
      const raw = o.gridStart + (y - found.rect.top - o.topOffset) / o.pxPerMinute - pending.grabMinutes;
      const startMinute = snapMinute(raw, o.step, { min: o.gridStart, max: o.gridEnd }, active.duration);
      const target = { staffId: found.staffId, startMinute };
      next = {
        ...active,
        target,
        problem: dropProblem({
          columns: o.columns,
          ranges: o.ranges,
          target,
          duration: active.duration,
          movingId: active.id,
          nowMinute: o.nowMinute,
        }),
      };
    }
    if (
      next.target?.staffId === active.target?.staffId &&
      next.target?.startMinute === active.target?.startMinute &&
      next.problem === active.problem
    ) {
      return;
    }
    active = next;
    setDrag(next);
  };

  const flagClick = () => {
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 400);
  };

  const stop = () => {
    if (pending?.timer) clearTimeout(pending.timer);
    if (scrollTimer) clearInterval(scrollTimer);
    scrollTimer = null;
    pending = null;
    active = null;
    setDrag(null);
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  };

  const begin = () => {
    const p = pending;
    if (!p || active) return;
    active = { id: p.id, duration: p.duration, origin: p.origin, target: p.origin, problem: null };
    setDrag(active);
    document.body.style.userSelect = "none";
    try {
      p.element.setPointerCapture(p.pointerId);
    } catch {
      // Le pointeur a déjà disparu : le glisser s'arrêtera au prochain événement.
    }
    navigator.vibrate?.(15);
    scrollTimer = setInterval(() => {
      const container = getOptions().scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const dy = last.y < rect.top + EDGE_PX ? -SCROLL_PX : last.y > rect.bottom - EDGE_PX ? SCROLL_PX : 0;
      const dx = last.x < rect.left + EDGE_PX ? -SCROLL_PX : last.x > rect.right - EDGE_PX ? SCROLL_PX : 0;
      if (dx || dy) {
        container.scrollBy(dx, dy);
        aim(last.x, last.y);
      }
    }, 16);
  };

  function onMove(event: PointerEvent) {
    const p = pending;
    if (!p || event.pointerId !== p.pointerId) return;
    last = { x: event.clientX, y: event.clientY };
    if (!active) {
      const moved = Math.hypot(event.clientX - p.startX, event.clientY - p.startY);
      if (p.kind === "mouse") {
        if (moved > MOUSE_SLOP_PX) begin();
      } else if (moved > TOUCH_SLOP_PX) {
        stop(); // le doigt défile : ce n'est pas un glisser
        return;
      }
      if (!active) return;
    }
    aim(event.clientX, event.clientY);
  }

  function onUp(event: PointerEvent) {
    const p = pending;
    if (!p || event.pointerId !== p.pointerId) return;
    const state = active;
    if (state) {
      flagClick();
      if (state.target && !state.problem && !sameSpot(state.origin, state.target)) {
        getOptions().onDrop({
          id: state.id,
          staffId: state.target.staffId,
          startMinute: state.target.startMinute,
        });
      }
    }
    stop();
  }

  function onCancel(event: PointerEvent) {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (active) flagClick();
    stop();
  }

  return {
    columnRef: (staffId: string) => (element: HTMLElement | null) => {
      if (element) columnEls.set(staffId, element);
      else columnEls.delete(staffId);
    },
    blockProps: (appt: { id: string; staffId: string; startMinute: number; endMinute: number }) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (pending) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const element = event.currentTarget;
        const kind = event.pointerType;
        pending = {
          id: appt.id,
          duration: appt.endMinute - appt.startMinute,
          origin: { staffId: appt.staffId, startMinute: appt.startMinute },
          pointerId: event.pointerId,
          kind,
          startX: event.clientX,
          startY: event.clientY,
          grabMinutes: (event.clientY - element.getBoundingClientRect().top) / getOptions().pxPerMinute,
          element,
          timer: kind === "mouse" ? null : setTimeout(begin, LONG_PRESS_MS),
        };
        last = { x: event.clientX, y: event.clientY };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
      },
      onContextMenu: (event: ReactMouseEvent) => {
        if (pending) event.preventDefault();
      },
    }),
    /** Vrai une fois, juste après un glisser : le clic qui suit le lâcher ne doit pas ouvrir la fiche. */
    consumeClick: () => {
      if (!suppressClick) return false;
      suppressClick = false;
      return true;
    },
    /** Pendant le glisser, la page ne défile plus. */
    blocksScroll: () => active !== null,
    dispose: stop,
  };
}

export function useAppointmentDrag(options: DragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });
  // Le contrôleur ne lit les options qu'au moment d'un geste, jamais pendant l'affichage.
  // eslint-disable-next-line react-hooks/refs
  const [controller] = useState(() => createController(() => opts.current, setDrag));

  // Un écouteur permanent : Safari tactile ignore un écouteur ajouté après le début du geste.
  useEffect(() => {
    const block = (event: TouchEvent) => {
      if (controller.blocksScroll() && event.cancelable) event.preventDefault();
    };
    window.addEventListener("touchmove", block, { passive: false });
    return () => {
      window.removeEventListener("touchmove", block);
      controller.dispose();
    };
  }, [controller]);

  return {
    drag,
    columnRef: controller.columnRef,
    blockProps: controller.blockProps,
    consumeClick: controller.consumeClick,
  };
}
