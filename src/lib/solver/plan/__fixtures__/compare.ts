/**
 * The golden comparison (spec 6.2, Java `SolverCorpus.differences`): objects key by key (same key sets), arrays same
 * length and in order, numbers equal iff `p == q || |p - q| <= 1e-6 * max(1, |p|, |q|)`, everything else by value.
 */
export const TOLERANCE = 1e-6;

export function numbersEqual(p: number, q: number): boolean {
  if (p === q) return true;
  if (Number.isNaN(p) && Number.isNaN(q)) return true;
  return Math.abs(p - q) <= TOLERANCE * Math.max(1, Math.abs(p), Math.abs(q));
}

/** Every difference as a readable line (`path: expected X, got Y`); empty when the two agree. Stops after `limit`. */
export function differences(expected: unknown, actual: unknown, limit = 50): string[] {
  const out: string[] = [];
  walk(expected, actual, "$", out, limit);
  return out;
}

function walk(e: unknown, a: unknown, at: string, out: string[], limit: number): void {
  if (out.length >= limit) return;
  if (typeof e === "number" && typeof a === "number") {
    if (!numbersEqual(e, a)) out.push(`${at}: expected ${e}, got ${a}`);
    return;
  }
  if (Array.isArray(e) || Array.isArray(a)) {
    if (!Array.isArray(e) || !Array.isArray(a)) {
      out.push(`${at}: array vs non-array`);
      return;
    }
    if (e.length !== a.length) {
      out.push(`${at}: length expected ${e.length}, got ${a.length}`);
      return;
    }
    for (let i = 0; i < e.length; i++) walk(e[i], a[i], `${at}[${i}]`, out, limit);
    return;
  }
  if (e !== null && a !== null && typeof e === "object" && typeof a === "object") {
    const eo = e as Record<string, unknown>;
    const ao = a as Record<string, unknown>;
    const ek = Object.keys(eo).sort();
    const ak = Object.keys(ao).sort();
    const missing = ek.filter((k) => !(k in ao));
    const extra = ak.filter((k) => !(k in eo));
    if (missing.length || extra.length) {
      out.push(
        `${at}: keys differ (missing ${JSON.stringify(missing.slice(0, 5))}, extra ${JSON.stringify(extra.slice(0, 5))})`,
      );
      return;
    }
    for (const k of ek) walk(eo[k], ao[k], `${at}.${k}`, out, limit);
    return;
  }
  if (e !== a) out.push(`${at}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
}
