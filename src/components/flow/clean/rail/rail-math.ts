/**
 * Pure arithmetic of the overview rail: the rate box's shorthand, a spare's
 * shares (the mod's `SpareBar.nudged`, fiftieths while dragging), and the
 * wheel's step. No store, no DOM.
 */

/**
 * What a rate box accepts: `2.5k`, `1M`, `1/3`, `3,200`, `.5`. k, m, g are
 * thousand, million, billion in either case. A fraction is a plain division
 * of two such numbers (`1/3`, `10k/3`). Anything else is not a number: the
 * caller keeps what it had instead of guessing.
 */
export function parseRateInput(text: string): number | undefined {
  const cleaned = text.trim().toLowerCase().replace(/,/g, "").replace(/^−/, "-");
  if (cleaned === "") return undefined;
  const slash = cleaned.indexOf("/");
  if (slash >= 0) {
    const top = parsePlain(cleaned.slice(0, slash));
    const bottom = parsePlain(cleaned.slice(slash + 1));
    if (top === undefined || bottom === undefined || bottom === 0) return undefined;
    const value = top / bottom;
    return Number.isFinite(value) ? value : undefined;
  }
  return parsePlain(cleaned);
}

function parsePlain(text: string): number | undefined {
  const match = text.trim().match(/^([+-]?[0-9]*\.?[0-9]+)\s*([kmg]?)$/);
  if (!match) return undefined;
  const multiplier = match[2] === "k" ? 1e3 : match[2] === "m" ? 1e6 : match[2] === "g" ? 1e9 : 1;
  const value = Number.parseFloat(match[1]!) * multiplier;
  return Number.isFinite(value) ? value : undefined;
}

/** A share below this reads as none (the mod's `SpareBar.SHOWN`). */
export const SHARE_SHOWN = 0.004;

/**
 * `shares` with place `index` given `step` more of the leftover, the others
 * giving or taking it in proportion (the mod's `SpareBar.nudged`).
 */
export function nudged(shares: readonly number[], index: number, step: number): number[] {
  const out = [...shares];
  const target = Math.max(0, Math.min(1, out[index]! + step));
  const rest = 1 - out[index]!;
  const newRest = 1 - target;
  for (let j = 0; j < out.length; j += 1) {
    if (j === index) continue;
    out[j] = rest > 1e-9 ? (out[j]! * newRest) / rest : newRest / (out.length - 1);
  }
  out[index] = target;
  return out;
}

/** Every place an equal share. */
export function evenShares(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

/** All of it at place `index`. */
export function allAt(count: number, index: number): number[] {
  return Array.from({ length: count }, (_, i) => (i === index ? 1 : 0));
}

/** A bar press at `x` along a track of `width` starting at `left`: the share, in fiftieths. */
export function shareAtX(x: number, left: number, width: number): number {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(1, Math.round(((x - left) / width) * 50) / 50));
}

/** Whether two share lists are the same split. */
export function sameShares(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);
}

/** The wheel's step on a rate in display units: 1, Ctrl 10, Shift 100 (the mod's `stepPortRate`). */
export function wheelStep(ctrl: boolean, shift: boolean): number {
  return shift ? 100 : ctrl ? 10 : 1;
}

/** One wheel notch on a displayed rate: rounded to a whole, then stepped, never below zero. */
export function steppedRate(
  shown: number,
  direction: 1 | -1,
  ctrl: boolean,
  shift: boolean,
): number {
  return Math.max(0, Math.round(shown) + direction * wheelStep(ctrl, shift));
}
