/**
 * Text width as a pure function of (string, font): one canvas context for the
 * whole page and a cache, so a card never reads the DOM to size a word. Falls
 * back to a per-character estimate where there is no canvas (tests, server).
 */
let context: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

const FALLBACK_EM = 0.56;

function canvas(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context;
  try {
    context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  } catch {
    context = null;
  }
  return context;
}

/** The app's current face, read once per font change from the root's custom property. */
let appFamily: string | undefined;
export function resetMeasuredFont(): void {
  appFamily = undefined;
  cleanFamily = undefined;
  widths.clear();
}

function family(): string {
  if (appFamily) return appFamily;
  let value = "ui-sans-serif, system-ui, sans-serif";
  try {
    if (typeof document !== "undefined") {
      const computed = getComputedStyle(document.body).fontFamily;
      if (computed) value = computed;
    }
  } catch {
    // Keep the generic family.
  }
  appFamily = value;
  return value;
}

/** The clean card's own face: Monocraft (`--cc-font` in clean.css), whatever the app font is. */
let cleanFamily: string | undefined;
function cleanFace(): string {
  if (cleanFamily) return cleanFamily;
  let value = "monospace";
  try {
    if (typeof document !== "undefined") {
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--font-minecraft").trim();
      if (raw) value = `${raw}, monospace`;
    }
  } catch {
    // Keep the generic family.
  }
  cleanFamily = value;
  return value;
}

/** Width in CSS px of `text` at `size` px and `weight`, in the clean card's Monocraft. */
export function measureClean(text: string, size: number, weight = 400): number {
  const key = `c|${weight}|${size}|${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  const ctx = canvas();
  let width: number;
  if (ctx) {
    ctx.font = `${weight} ${size}px ${cleanFace()}`;
    width = ctx.measureText(text).width;
  } else {
    width = text.length * size * 0.667;
  }
  widths.set(key, width);
  return width;
}

/** Width in CSS px of `text` at `size` px and `weight`, in the app's font. */
export function measureText(text: string, size: number, weight = 500): number {
  const key = `${weight}|${size}|${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  const ctx = canvas();
  let width: number;
  if (ctx) {
    ctx.font = `${weight} ${size}px ${family()}`;
    width = ctx.measureText(text).width;
  } else {
    width = text.length * size * FALLBACK_EM;
  }
  widths.set(key, width);
  return width;
}
