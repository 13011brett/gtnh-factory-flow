import type { MinimapCorner } from "./minimap-settings";

/** Space kept between the search field and the map. */
const GAP = 10;
/** NEI's field at the page's zoom, until it is on the page to measure. */
const FIELD_GUESS = 360;

/**
 * How far NEI's search field (centred in a dock across the whole window) has to be pushed in from the window's right
 * and left edges to keep clear of a map in a bottom corner: the dock gets that much padding on one side, which moves
 * the field's centre half as far. Zero while the centred field already clears the map. Pure, for the tests.
 */
export function dockPadding(input: {
  windowWidth: number;
  fieldWidth: number;
  map: { left: number; right: number };
  corner: MinimapCorner;
}): { left: number; right: number } {
  const { windowWidth: w, fieldWidth: f, map, corner } = input;
  if (corner === "bottom-right") {
    const clear = w - map.left + GAP;
    return { left: 0, right: Math.max(0, Math.ceil(2 * clear - w + f)) };
  }
  if (corner === "bottom-left") {
    const clear = map.right + GAP;
    return { left: Math.max(0, Math.ceil(2 * clear - w + f)), right: 0 };
  }
  return { left: 0, right: 0 };
}

/**
 * Keeps the dock clear of the map: sets `--nei-dock-pad-left`/`-right` on the page root (the dock is a body portal
 * that comes and goes with the items column, so it reads them from there) whenever the window or the board resizes.
 * Returns the stop function, which takes them off again.
 */
export function clearDockOfMinimap(host: HTMLElement, map: () => HTMLElement | null, corner: MinimapCorner): () => void {
  const root = document.documentElement;
  let raf = 0;
  const place = () => {
    raf = 0;
    const el = map();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const field = document.querySelector<HTMLElement>("[data-nei-search-dock] .nei-search");
    const pad = dockPadding({
      windowWidth: window.innerWidth,
      fieldWidth: field?.getBoundingClientRect().width || FIELD_GUESS,
      map: { left: r.left, right: r.right },
      corner,
    });
    root.style.setProperty("--nei-dock-pad-left", `${pad.left}px`);
    root.style.setProperty("--nei-dock-pad-right", `${pad.right}px`);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(place);
  };
  schedule();
  // The field arrives with the item index, after the board: measure again once it is there.
  const late = window.setTimeout(schedule, 1500);
  window.addEventListener("resize", schedule);
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
  observer?.observe(host);
  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.clearTimeout(late);
    window.removeEventListener("resize", schedule);
    observer?.disconnect();
    root.style.removeProperty("--nei-dock-pad-left");
    root.style.removeProperty("--nei-dock-pad-right");
  };
}
