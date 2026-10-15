"use client";

import { create } from "zustand";

/**
 * What the task board's header (in the board toolbar) and the board itself
 * share: the task whose panel is open, and a count of New task presses. Per
 * tab, never saved.
 */
interface TaskBoardUi {
  selectedId?: string;
  /** Moves when New task is pressed; the board adds a task on each change. */
  newTaskTick: number;
}

export const useTaskBoardUi = create<TaskBoardUi>(() => ({ newTaskTick: 0 }));

export function selectTask(id: string | undefined): void {
  useTaskBoardUi.setState({ selectedId: id });
}

export function requestNewTask(): void {
  useTaskBoardUi.setState((state) => ({ newTaskTick: state.newTaskTick + 1 }));
}
