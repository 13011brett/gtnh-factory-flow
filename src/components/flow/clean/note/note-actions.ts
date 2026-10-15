import { useFactoryStore } from "@/store/factory-store";
import { newStickyNote, requestNoteEdit } from "./note-model";

/** The board menu's "Add a sticky note": one undoable step, and the new note starts being written on. */
export function addStickyNoteAt(at: { x: number; y: number }): void {
  const store = useFactoryStore.getState();
  store.addAnnotation(newStickyNote(at));
  const added = useFactoryStore.getState().project.annotations?.at(-1);
  if (added) requestNoteEdit(added.id);
}

/** The board menu's "Add a box": 240 by 160, azure, the default solid border and tint, selected afterwards by the caller. */
export function addBoxAt(at: { x: number; y: number }): void {
  useFactoryStore.getState().addAnnotation({
    kind: "box",
    colorTag: "azure",
    position: { x: at.x, y: at.y },
    size: { width: 240, height: 160 },
  });
}

/** The board menu's "Add an arrow": 160 long, level, pointing right, azure, head at the end. */
export function addArrowAt(at: { x: number; y: number }): void {
  useFactoryStore.getState().addAnnotation({
    kind: "arrow",
    colorTag: "azure",
    position: { x: at.x, y: at.y },
    size: { width: 160, height: 0 },
    arrowDirection: "down-right",
  });
}
