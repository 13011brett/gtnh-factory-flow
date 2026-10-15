"use client";

import { buildMachineList } from "@/lib/model/machine-list";
import type { PlanTaskLink } from "@/lib/model/types";
import { useDesignStore } from "@/store/design-store";
import { useFactoryStore } from "@/store/factory-store";
import { myAccountId, useLiveSession } from "@/store/live-session";
import { activateDesign } from "./open-link";
import { addTask, addTaskItem, boardCardLabel, cardLine, titleForCards } from "./task-board";
import { selectTask } from "./task-board-ui";
import { planLinkId } from "./task-links";

/** A card of the open plan as a task shows it. */
export interface TaskCard {
  nodeId: string;
  name: string;
  tier?: string;
  /** How many machines the solve builds for it, rounded up (0 before the plan has solved). */
  count: number;
}

/** The task boards on this device, for the Make a task menu: the open design leaves out (it is not a board). */
export function taskBoardDesigns(): Array<{ id: string; name: string }> {
  const { designs } = useDesignStore.getState();
  return designs
    .filter((design) => design.taskBoard)
    .map((design) => ({ id: design.id, name: design.name }));
}

/** The machine cards selected on the board. */
export function selectedTaskCards(): TaskCard[] {
  const { project, selectedBoardIds } = useFactoryStore.getState();
  const first = selectedBoardIds.find((id) => project.nodes.some((node) => node.id === id));
  return first ? cardsForTask(first) : [];
}

/**
 * The cards a right click on `nodeId` means: the whole selection when the card is part of it, else the card alone.
 * Only machine cards (drawers, notes and groups are not built).
 */
export function cardsForTask(nodeId: string): TaskCard[] {
  const { project, lastResult, selectedBoardIds } = useFactoryStore.getState();
  const cardIds = new Set(project.nodes.map((node) => node.id));
  const chosen = selectedBoardIds.includes(nodeId) ? selectedBoardIds.filter((id) => cardIds.has(id)) : [nodeId];
  const entries = new Map(buildMachineList(project, lastResult).map((entry) => [entry.nodeId, entry]));
  const cards: TaskCard[] = [];
  for (const id of chosen) {
    if (!cardIds.has(id)) {
      continue;
    }
    const entry = entries.get(id);
    cards.push({
      nodeId: id,
      name: entry?.label ?? boardCardLabel(project, id) ?? "Machine",
      ...(entry?.tier ? { tier: entry.tier } : {}),
      count: entry ? Math.ceil(entry.count - 1e-9) : 0,
    });
  }
  return cards;
}

/**
 * "Make a task": a task in To do on a task board (the board of `boardDesignId`, or a new one), titled from the
 * cards' machines, with a checklist line for each card saying how many to build, linked to all of them. The board
 * opens with the task selected.
 */
export async function makeTaskFromCards(
  cards: readonly TaskCard[],
  boardDesignId: string | undefined,
): Promise<void> {
  if (cards.length === 0) {
    return;
  }
  const designStore = useDesignStore.getState();
  const from = designStore.designs.find((design) => design.id === designStore.activeDesignId);
  const plan = from ? planLinkId(from, myAccountId()) : "";
  const links: PlanTaskLink[] = cards.map((card) => ({ plan, node: card.nodeId }));
  if (boardDesignId) {
    const board = designStore.designs.find((design) => design.id === boardDesignId);
    if (!board) {
      return;
    }
    await activateDesign(board);
  } else {
    await designStore.addTaskBoard();
  }
  const me = useLiveSession.getState().me;
  const author = me ? { id: me.id, username: me.username } : { id: "local", username: "You" };
  let made: string | undefined;
  useFactoryStore.getState().editTasks((project) => {
    const added = addTask(project, { title: titleForCards(cards.map((card) => card.name)), links, author });
    made = added.id;
    let next = added.project;
    cards.forEach((card, at) => {
      next = addTaskItem(next, added.id, cardLine(card), links[at]);
    });
    return next;
  });
  selectTask(made);
}
