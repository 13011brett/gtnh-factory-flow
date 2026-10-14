"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Callout } from "./Callout";
import * as input from "./input";
import {
  attachTourLayer,
  leaveTour,
  startTour,
  tourBack,
  tourHurry,
  tourJump,
  tourNext,
  tourStatus,
  useTourNote,
} from "./tour-controller";
import { useTour } from "./tour-store";
import "./tour.css";

/**
 * Mount once (FactoryPlannerApp or the board): the layer the tour's cursor draws into, the shield that keeps the
 * player's clicks off the board while a step plays (a click anywhere hurries it), the note, and the keys:
 * right arrow, Space or Enter is next, left arrow back, Esc leaves. Only the player's own keys count
 * (the tour's synthetic ones are not trusted events), and none is taken while the player types in a box.
 */
export function TourHost() {
  const tour = useTour();
  const note = useTourNote();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const active = tour.phase !== "idle";

  useEffect(() => {
    attachTourLayer(layerRef.current ?? undefined);
    // A handle for walking the tour by hand in development.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __tour?: object }).__tour = {
        start: startTour,
        jump: tourJump,
        next: tourNext,
        back: tourBack,
        leave: leaveTour,
        status: tourStatus,
        input,
      };
    }
    return () => attachTourLayer(undefined);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.isTrusted) return;
      const target = event.target;
      const typing =
        target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void leaveTour();
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "ArrowRight" || event.key === " " || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        tourNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        tourBack();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={layerRef} className="tour-layer" data-tour="layer" data-active={active ? "" : undefined}>
      {tour.phase === "playing" ? (
        <div className="tour-shield" data-tour="shield" onPointerDown={tourHurry} onClick={tourHurry} />
      ) : null}
      {active && note && tour.phase === "waiting" ? (
        <Callout
          note={note}
          last={tour.index + 1 >= tour.total}
          done={tour.noteReady}
          canBack={tour.index > 0}
          onNext={tourNext}
          onBack={tourBack}
          onLeave={() => void leaveTour()}
        />
      ) : null}
    </div>,
    document.body,
  );
}
