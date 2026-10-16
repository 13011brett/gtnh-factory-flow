import type { TipSpec } from "./tip-spec";

/**
 * The mod's words for the keys the website's board draws itself (`BoardScreen`, `PlanTabs`). The website's own
 * chrome carries only a short `title` or none at all; on a plan board the host reads the key's `aria-label` here
 * first, so the same key says the same thing as in the game. Pure data: the host adds the id.
 */
const BY_LABEL: Array<{ match: RegExp; title: string; sub?: string }> = [
  { match: /^Undo$/, title: "Undo (Ctrl+Z)" },
  { match: /^Redo$/, title: "Redo (Ctrl+Shift+Z or Ctrl+Y)" },
  { match: /^Rate unit\b/, title: "Rate unit: per tick, second, minute or hour" },
  { match: /^Power unit\b/, title: "Show power as EU/t, or as amps at each machine's tier" },
  { match: /^Fit the plan on the screen$/, title: "Zoom to fit the whole plan" },
  { match: /^Open Plans$/, title: "Plans: every plan you have, and the plans shared with you" },
  { match: /^Share this setup$/, title: "Share a copy of this plan: a link, a code or a file" },
  { match: /^Open settings$/, title: "Settings" },
];

/** The mod's tip for a key by its aria-label, or undefined to let its own title stand. */
export function modKeyTip(label: string | null | undefined): Omit<TipSpec, "id"> | undefined {
  if (!label) return undefined;
  const hit = BY_LABEL.find((entry) => entry.match.test(label));
  return hit ? { title: hit.title, sub: hit.sub } : undefined;
}

/** A plan tab (the mod's `PlanTabs.hoverLines`): its name, then how to close it and where the menu is. */
export function planTabTip(id: string, name: string): TipSpec {
  return {
    id,
    title: name,
    notes: [{ text: "Middle-click to close, right-click for more", tone: "muted" }],
  };
}

/** A tab's close key. */
export function closeTabTip(id: string): TipSpec {
  return { id, title: "Close tab (the plan is kept in My plans)" };
}

/** The tab strip's + key. */
export function newTabTip(id: string): TipSpec {
  return { id, title: "New plan, or open an existing one" };
}
