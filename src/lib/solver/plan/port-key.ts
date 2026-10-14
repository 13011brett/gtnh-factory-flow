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
