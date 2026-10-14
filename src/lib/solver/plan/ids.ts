import type { Id, PortRef } from "./types";

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function longs(id: Id): [bigint, bigint] {
  const h = id.replace(/-/g, "");
  return [BigInt.asIntN(64, BigInt(`0x${h.slice(0, 16)}`)), BigInt.asIntN(64, BigInt(`0x${h.slice(16)}`))];
}

/**
 * Java `UUID.compareTo`: most significant long, then least, each SIGNED, so a
 * UUID starting with hex 8..f sorts BEFORE one starting with 0..7. The goldens'
 * choice keys and option order depend on it (spec-solver 4.2, 7.10); a plain
 * string sort breaks them. Ids that are not UUIDs (the website's own) sort
 * after every UUID, by UTF-16 code units: any total order is valid for them,
 * but answers keyed on such ids will not match the goldens' order.
 */
export function compareIds(a: Id, b: Id): number {
  const aUuid = UUID.test(a);
  const bUuid = UUID.test(b);
  if (aUuid && bUuid) {
    const la = longs(a);
    const lb = longs(b);
    if (la[0] !== lb[0]) return la[0] < lb[0] ? -1 : 1;
    if (la[1] !== lb[1]) return la[1] < lb[1] ? -1 : 1;
    return 0;
  }
  if (aUuid !== bUuid) return aUuid ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** By node (`compareIds`), then input false before true, then port ascending. */
export function comparePortRef(a: PortRef, b: PortRef): number {
  return compareIds(a.node, b.node) || Number(a.input) - Number(b.input) || a.port - b.port;
}
