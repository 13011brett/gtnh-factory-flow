import { useFactoryStore } from "@/store/factory-store";
import { newStickyNote, requestNoteEdit } from "./note-model";

/** The board menu's "Add a sticky note": one undoable step, and the new note starts being written on. */
export function addStickyNoteAt(at: { x: number; y: number }): void {
  const store = useFactoryStore.getState();
  store.addAnnotation(newStickyNote(at));
  const added = useFactoryStore.getState().project.annotations?.at(-1);
  if (added) requestNoteEdit(added.id);
}
