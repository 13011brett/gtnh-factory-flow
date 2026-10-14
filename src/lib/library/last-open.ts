/**
 * When each plan was last open on this device, for the library's "last open 6m ago" and its most-recent-first order
 * (the mod's `Plan.lastOpen`). Kept in this browser only: it is never part of a plan and never synced, so it adds no
 * sync work. A plan with no stamp reads as last edited.
 */
const KEY = "gtnh-factory-flow.last-open.v1";

let cache: Record<string, number> | undefined;

function read(): Record<string, number> {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    cache = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
    );
  } catch {
    cache = {};
  }
  return cache;
}

/** Marks a plan as open now. */
export function stampOpened(designId: string, now: number = Date.now()): void {
  const stamps = read();
  stamps[designId] = now;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stamps));
  } catch {
    // The stamp lasts for the page.
  }
}

/** When the plan was last open here (ms), else when it was last edited. */
export function lastOpenOf(designId: string, updatedAt: string): number {
  const stamp = read()[designId];
  const edited = Date.parse(updatedAt);
  return Math.max(Number.isFinite(stamp) ? stamp : 0, Number.isFinite(edited) ? edited : 0);
}

/** "just now", "6m ago", "3h ago", "2d ago": the mod's words. */
export function agoText(then: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function resetLastOpenForTests(): void {
  cache = undefined;
}
