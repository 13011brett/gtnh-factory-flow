"use client";

/**
 * Where the recipe search's machine chips keep their selection: the browser, as JSON, absent for "everything
 * selected". `RecipeBrowser` reads it on mount and writes it on every toggle; anything else that changes it (the
 * tour, borrowing the default for its own session and putting the player's back after) goes through
 * `writeMapSelectionText`, which tells the open search to read it again.
 */

export const MAP_SELECTION_STORAGE_KEY = "gtnh-factory-flow.machine-map-selection.v1";
export const MAP_SELECTION_CHANGED_EVENT = "gtnh-factory-flow:machine-map-selection";

/** The stored selection as it is kept, or null for the default (everything). */
export function readMapSelectionText(): string | null {
  try {
    return window.localStorage.getItem(MAP_SELECTION_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Puts a stored selection back (null: everything selected) and has the recipe search take it up. */
export function writeMapSelectionText(text: string | null): void {
  try {
    if (text === null) window.localStorage.removeItem(MAP_SELECTION_STORAGE_KEY);
    else window.localStorage.setItem(MAP_SELECTION_STORAGE_KEY, text);
  } catch {
    // Storage may be blocked; the search still takes the change for this session.
  }
  window.dispatchEvent(new Event(MAP_SELECTION_CHANGED_EVENT));
}
