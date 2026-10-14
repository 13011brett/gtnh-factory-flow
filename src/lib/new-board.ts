import type { FactoryProject } from "@/lib/model/types";

/**
 * The "New board" device setting: whether designs created from now on start in
 * plan mode. It is only the default for NEW designs. A design's mode is the
 * project's (`planMode`), so a shared plan solves the same on every machine;
 * this flag never flips an existing project. A browser preference, never part
 * of a plan.
 */
export const NEW_BOARD_KEY = "gtnh-factory-flow.new-board.v1";

let newBoard = readNewBoard();
const listeners = new Set<() => void>();

function readNewBoard(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(NEW_BOARD_KEY) === "on";
  } catch {
    return false;
  }
}

export function getNewBoard(): boolean {
  return newBoard;
}

export function setNewBoard(on: boolean): void {
  newBoard = on;
  try {
    localStorage.setItem(NEW_BOARD_KEY, on ? "on" : "off");
  } catch {
    // A private window that refuses storage still gets the session's setting.
  }
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeNewBoard(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A brand-new design's project, in plan mode when the setting is on. Both flags, as plan mode always carries solve mode. */
export function withNewBoardDefault(project: FactoryProject): FactoryProject {
  return newBoard ? { ...project, planMode: true, solveMode: true } : project;
}
