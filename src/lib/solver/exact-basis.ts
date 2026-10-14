/**
 * Exact primal values from a HiGHS basis.
 *
 * The HiGHS WASM wrapper hands back column values printed to six significant digits, which is a 1e-6 relative error:
 * too coarse for a solver whose answers are compared at 1e-6 and whose conservation check allows 1e-6. It does hand
 * back each column's and row's basis status, though. A basis fixes the vertex: with every non-basic column at zero,
 * the tight rows and the basic columns form a square system whose solution is the vertex to full double precision.
 * This solves it, sparsely: singletons are peeled off (a network-shaped basis is nearly triangular), and a small dense
 * core, if any, is eliminated with partial pivoting.
 */

export interface BasisRow {
  coefficients: Map<number, number>;
  rhs: number;
}

/**
 * Solves `sum_c a_rc x_c = rhs_r` over the given tight rows and basic columns (non-basic columns are zero and absent).
 * Returns the values by column, or null when the system is not square, is singular, or has a clearly negative value
 * (the statuses did not describe a vertex, so the caller should keep HiGHS' own numbers).
 */
export function solveBasis(rows: readonly BasisRow[], basicColumns: readonly number[]): Map<number, number> | null {
  const nR = rows.length;
  if (nR !== basicColumns.length) return null;
  if (nR === 0) return new Map();
  const isBasic = new Set(basicColumns);

  // active entries per row, and the rows each column sits in
  const entries: Map<number, number>[] = rows.map((row) => {
    const m = new Map<number, number>();
    for (const [c, v] of row.coefficients) if (v !== 0 && isBasic.has(c)) m.set(c, v);
    return m;
  });
  const rhs = rows.map((r) => r.rhs);
  const colRows = new Map<number, Set<number>>();
  for (const c of basicColumns) colRows.set(c, new Set());
  entries.forEach((m, r) => {
    for (const c of m.keys()) colRows.get(c)!.add(r);
  });

  const x = new Map<number, number>();
  const rowAlive = new Array<boolean>(nR).fill(true);
  const colAlive = new Map<number, boolean>();
  for (const c of basicColumns) colAlive.set(c, true);
  const deferred: Array<{ row: number; col: number }> = [];
  const rowStack: number[] = [];
  const colStack: number[] = [];
  entries.forEach((m, r) => {
    if (m.size === 1) rowStack.push(r);
  });
  for (const c of basicColumns) if (colRows.get(c)!.size === 1) colStack.push(c);
  let remaining = nR;


  while (remaining > 0) {
    const r = rowStack.pop();
    if (r !== undefined) {
      if (!rowAlive[r] || entries[r]!.size !== 1) continue;
      const [c, v] = entries[r]!.entries().next().value as [number, number];
      const value = rhs[r]! / v;
      x.set(c, value);
      colAlive.set(c, false);
      rowAlive[r] = false;
      remaining--;
      for (const r2 of colRows.get(c)!) {
        if (r2 === r || !rowAlive[r2]) continue;
        rhs[r2]! -= entries[r2]!.get(c)! * value;
        entries[r2]!.delete(c);
        if (entries[r2]!.size === 1) rowStack.push(r2);
      }
      continue;
    }
    const c = colStack.pop();
    if (c !== undefined) {
      if (!colAlive.get(c)) continue;
      const set = colRows.get(c)!;
      if (set.size !== 1) continue;
      const row = set.values().next().value as number;
      if (!rowAlive[row]) continue;
      deferred.push({ row, col: c });
      colAlive.set(c, false);
      remaining--;
      // the row is spent on this column; the others lose a row each
      rowAlive[row] = false;
      for (const c2 of entries[row]!.keys()) {
        if (c2 === c) continue;
        const s2 = colRows.get(c2)!;
        s2.delete(row);
        if (colAlive.get(c2) && s2.size === 1) colStack.push(c2);
      }
      continue;
    }
    break;
  }

  if (remaining > 0) {
    // dense core over what is left
    const coreRows: number[] = [];
    for (let r = 0; r < nR; r++) if (rowAlive[r]) coreRows.push(r);
    const coreCols: number[] = basicColumns.filter((c) => colAlive.get(c));
    if (coreRows.length !== coreCols.length) return null;
    const n = coreRows.length;
    const colIndex = new Map(coreCols.map((c, i) => [c, i] as const));
    const a: Float64Array[] = coreRows.map((r) => {
      const row = new Float64Array(n + 1);
      for (const [c, v] of entries[r]!) {
        const j = colIndex.get(c);
        if (j !== undefined) row[j] = v;
      }
      row[n] = rhs[r]!;
      return row;
    });
    for (let col = 0; col < n; col++) {
      let pivot = col;
      let best = Math.abs(a[col]![col]!);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(a[r]![col]!);
        if (v > best) {
          best = v;
          pivot = r;
        }
      }
      if (!(best > 1e-12)) return null;
      if (pivot !== col) [a[pivot], a[col]] = [a[col]!, a[pivot]!];
      const prow = a[col]!;
      for (let r = col + 1; r < n; r++) {
        const row = a[r]!;
        const factor = row[col]! / prow[col]!;
        if (factor === 0) continue;
        for (let k = col; k <= n; k++) row[k]! -= factor * prow[k]!;
      }
    }
    const sol = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = a[i]![n]!;
      for (let k = i + 1; k < n; k++) s -= a[i]![k]! * sol[k]!;
      sol[i] = s / a[i]![i]!;
    }
    coreCols.forEach((c, i) => x.set(c, sol[i]!));
  }

  // deferred columns: solve their (original) row for them, last deferred first
  for (let i = deferred.length - 1; i >= 0; i--) {
    const { row, col } = deferred[i]!;
    let s = rows[row]!.rhs;
    let pivot = 0;
    for (const [c, v] of rows[row]!.coefficients) {
      if (v === 0 || !isBasic.has(c)) continue;
      if (c === col) pivot = v;
      else s -= v * (x.get(c) ?? 0);
    }
    if (pivot === 0) return null;
    x.set(col, s / pivot);
  }

  // a vertex has no clearly negative basic value
  let scale = 1;
  for (const v of x.values()) scale = Math.max(scale, Math.abs(v));
  for (const [c, v] of x) {
    if (!Number.isFinite(v)) return null;
    if (v < -1e-9 * scale) return null;
    if (v < 0) x.set(c, 0);
  }
  return x;
}
