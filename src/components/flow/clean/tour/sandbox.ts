"use client";

import { createNewProject } from "@/examples";
import type { FactoryProject } from "@/lib/model/types";
import { leaveLibrary } from "@/lib/library/library-tab";
import { leaveWelcomeTab } from "@/lib/welcome/welcome-tab";
import { useDesignStore } from "@/store/design-store";
import { useFactoryStore } from "@/store/factory-store";
import { getMinimap, setMinimap, snapshotMinimap, type MinimapSettings } from "../minimap/minimap-settings";
import { readSeeThrough, setSeeThrough } from "../seethrough/see-through";

/**
 * The tour's own plan, kept apart from the player's: the player's design is saved first and put aside, the tour
 * plays on a design of its own called "Tour plan", and what it borrows (the minimap's and the see-through
 * settings, the items column's search) is copied first and put back. Leaving from any step keeps the player where
 * they are: if the tour put anything on the plan in front of them it stays, joining their plans as "Tour plan";
 * if not, it is removed and their own design comes back.
 */

export const TOUR_PLAN_NAME = "Tour plan";

interface Saved {
  priorDesignId?: string;
  tourDesignId?: string;
  minimap: MinimapSettings;
  seeThrough: number;
  recipeSearch: string;
}

let saved: Saved | undefined;

export function sandboxActive(): boolean {
  return saved !== undefined;
}

/** A fresh plan for the tour: the new-design project in the merged mode, named for the tour. */
export function tourProject(): FactoryProject {
  return { ...structuredClone(createNewProject()), name: TOUR_PLAN_NAME, planMode: true };
}

export async function enterSandbox(): Promise<void> {
  if (saved) return;
  const designs = useDesignStore.getState();
  const factory = useFactoryStore.getState();
  const prior = designs.activeDesignId;
  saved = {
    priorDesignId: prior,
    minimap: snapshotMinimap(),
    seeThrough: readSeeThrough(),
    recipeSearch: factory.recipeSearch,
  };
  // The player's work is saved before the plan is put aside.
  if (prior) await designs.saveActiveProject(prior, factory.project);
  leaveWelcomeTab();
  leaveLibrary();
  await designs.importProjectAsDesign(tourProject(), TOUR_PLAN_NAME);
  saved.tourDesignId = useDesignStore.getState().activeDesignId;
  // The tour shows its own board: the map on, the paper solid.
  setMinimap({ show: true });
}

/** The settings the tour borrows, put back to what the tour started them at (a step replayed by Back or a jump). */
export function resetBorrowedSettings(): void {
  if (!saved) return;
  setMinimap({ ...saved.minimap, show: true });
  setSeeThrough(saved.seeThrough);
}

/** Puts the tour's plan back to what a step started from (Back). */
export function restoreProject(project: FactoryProject): void {
  const factory = useFactoryStore.getState();
  factory.clearResourceBrowser();
  factory.setRecipeSearch("");
  factory.markHydratedProject(structuredClone(project));
  factory.frameBoardNodes();
}

/** Whether the tour has put anything on its plan. */
export function tourPlanTouched(): boolean {
  const p = useFactoryStore.getState().project;
  return p.nodes.length > 0 || (p.storages?.length ?? 0) > 0 || (p.annotations?.length ?? 0) > 0;
}

export async function leaveSandbox(): Promise<void> {
  const s = saved;
  if (!s) return;
  saved = undefined;
  leaveLibrary();
  const designs = useDesignStore.getState();
  const factory = useFactoryStore.getState();
  factory.clearResourceBrowser();
  factory.setRecipeSearch(s.recipeSearch);
  setMinimap(s.minimap);
  setSeeThrough(s.seeThrough);
  const onTourPlan = s.tourDesignId !== undefined && designs.activeDesignId === s.tourDesignId;
  if (onTourPlan && tourPlanTouched()) {
    // The plan in front of them joins theirs as "Tour plan": saved as it is, and the screen stays.
    await designs.saveActiveProject(s.tourDesignId, factory.project);
    return;
  }
  const prior = s.priorDesignId;
  if (prior && designs.designs.some((d) => d.id === prior)) await designs.switchToDesign(prior);
  if (s.tourDesignId) await designs.removeDesign(s.tourDesignId);
}

export function currentMinimap(): MinimapSettings {
  return getMinimap();
}
