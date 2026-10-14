"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useDialogA11y } from "@/lib/hooks/use-dialog-a11y";
import { MachineShoppingList } from "./MachineShoppingList";
import { useFactoryStore } from "@/store/factory-store";

/**
 * The machine shopping list, kept as a sheet of its own now that the board
 * has no inspector: the plan's machines by name and tier with their power.
 * Opened from the settings sheet and the compact menu; owned by AppHeader.
 */
export function MachineListDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { onClose, escape: false });
  const hasMachines = useFactoryStore((state) => state.project.nodes.length > 0);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-neutral-950/75 p-4 backdrop-blur-sm compact:bg-neutral-950/92 compact:[backdrop-filter:none]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Machine list"
        className="flex max-h-[calc(88*var(--ui-vh))] w-full max-w-md flex-col overflow-hidden border-2 border-[var(--mc-15)] bg-[var(--mc-49)] text-[var(--mc-ink)] shadow-[inset_2px_2px_0_var(--mc-85),inset_-2px_-2px_0_var(--mc-25),4px_4px_0_rgba(0,0,0,0.45)] compact:max-h-[calc(92*var(--ui-vh))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b-2 border-[var(--mc-15)] px-4 py-2.5">
          <h2 className="text-sm font-bold">Machine list</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center border-2 border-[var(--mc-15)] bg-[var(--mc-49)] font-mono text-white shadow-[inset_2px_2px_0_var(--mc-85),inset_-2px_-2px_0_var(--mc-25)] hover:brightness-110"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {hasMachines ? (
            <MachineShoppingList />
          ) : (
            <p className="px-4 py-6 text-sm text-[var(--mc-ink-muted)]">No machines on the board yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
