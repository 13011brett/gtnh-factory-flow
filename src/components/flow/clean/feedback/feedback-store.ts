"use client";

import { useSyncExternalStore } from "react";

/** Whether the Feedback box is open. The top bar's red bug key calls `openFeedback`; `FeedbackHost` shows it. */
let isOpen = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function openFeedback(): void {
  isOpen = true;
  emit();
}

export function closeFeedback(): void {
  isOpen = false;
  emit();
}

export function useFeedbackOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => isOpen,
    () => false,
  );
}
