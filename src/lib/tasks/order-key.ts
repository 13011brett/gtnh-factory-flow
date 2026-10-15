/**
 * Fractional order keys: a task's place in its column (and a checklist line's
 * in its task) is a string that sorts where it belongs, and a move writes one
 * new key between its two new neighbours. Nothing else is rewritten, so two
 * people moving two different cards never touch the same field.
 *
 * A key is a base-62 fraction (digits 0-9, A-Z, a-z, which sort in that order
 * as plain strings). Any two keys have one between them; a key never ends in
 * the lowest digit, so there is always room before it too.
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;

function digit(char: string | undefined): number {
  if (char === undefined) {
    return 0;
  }
  const at = DIGITS.indexOf(char);
  if (at >= 0) {
    return at;
  }
  // Not one of ours (another client's key): place it by its character code.
  return char < "0" ? 0 : BASE - 1;
}

/** A fraction strictly between `low` and `high` (absent: the top end). */
function midpoint(low: string, high: string | undefined): string {
  let prefix = "";
  for (let at = 0; ; at += 1) {
    const lowDigit = digit(low[at]);
    const highDigit = high === undefined || at >= high.length ? BASE : digit(high[at]);
    if (lowDigit === highDigit) {
      prefix += DIGITS[lowDigit];
      continue;
    }
    const middle = Math.floor((lowDigit + highDigit) / 2);
    if (middle > lowDigit) {
      return prefix + DIGITS[middle];
    }
    // Adjacent digits: keep the low one and go above the rest of `low`.
    return prefix + DIGITS[lowDigit] + midpoint(low.slice(at + 1), undefined);
  }
}

/**
 * A key that sorts after `before` and before `after`; either may be absent
 * (the start or the end of the list). Keys that are out of order or equal
 * give a key after `before`.
 */
export function orderBetween(before?: string, after?: string): string {
  const low = before ?? "";
  if (after !== undefined && after > low) {
    return midpoint(low, after);
  }
  return midpoint(low, undefined);
}

/** Sorted by order key, then id, so every client shows the same order. */
export function byOrder<T extends { order: string; id: string }>(things: readonly T[]): T[] {
  return [...things].sort((left, right) =>
    left.order < right.order
      ? -1
      : left.order > right.order
        ? 1
        : left.id < right.id
          ? -1
          : left.id > right.id
            ? 1
            : 0,
  );
}
