"use client";

import { useSyncExternalStore } from "react";

/**
 * Which face of the open plan is up: the board, or its task board. Per tab
 * and per visit, never saved: a plan opens on the view it was made for
 * (`primaryView`, set by the task board controller when a design lands), and
 * switching is just looking.
 */
export type PlanFace = "plan" | "tasks";

let face: PlanFace = "plan";
const listeners = new Set<() => void>();

export function setPlanFace(next: PlanFace): void {
  if (next === face) {
    return;
  }
  face = next;
  listeners.forEach((listener) => listener());
}

export function readPlanFace(): PlanFace {
  return face;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlanFace(): PlanFace {
  return useSyncExternalStore(
    subscribe,
    () => face,
    () => "plan",
  );
}
