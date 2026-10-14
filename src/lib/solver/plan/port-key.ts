import type { PortKey } from "./types";

/**
 * `nodeId|i or o|canonicalHandle`. The node id may not contain `|`
 * (ids are uuids or `card#rN`); the handle may, so parsing splits twice.
 */
export function makePortKey(nodeId: string, side: "i" | "o", canonicalHandle: string): PortKey {
  return `${nodeId}|${side}|${canonicalHandle}`;
}

export function parsePortKey(
  key: PortKey,
): { nodeId: string; side: "i" | "o"; handle: string } | undefined {
  const first = key.indexOf("|");
  if (first <= 0) {
    return undefined;
  }
  const second = key.indexOf("|", first + 1);
  if (second < 0) {
    return undefined;
  }
  const side = key.slice(first + 1, second);
  if (side !== "i" && side !== "o") {
    return undefined;
  }
  return { nodeId: key.slice(0, first), side, handle: key.slice(second + 1) };
}

/**
 * Joins the PortKeys of a leftover's bearers into the key `spareShares` is
 * stored under. A PortKey holds `|`, `:` and anything a node id may hold, so
 * none of those can join them; U+001F (unit separator) cannot occur in a node
 * id or in an encoded handle (`encodeURIComponent` never yields a control
 * character), so the key splits back exactly. Bearers are sorted (UTF-16
 * order) so the same set always gives the same key.
 */
export const LEFTOVER_KEY_SEPARATOR = "\u001f";

export function makeLeftoverKey(portKeys: readonly PortKey[]): string {
  return [...portKeys].sort().join(LEFTOVER_KEY_SEPARATOR);
}

export function splitLeftoverKey(key: string): PortKey[] {
  return key.split(LEFTOVER_KEY_SEPARATOR);
}
