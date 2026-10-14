import { beforeAll, describe, expect, it } from "vitest";

import { solveBasis, type BasisRow } from "./exact-basis";
import { initLpEngine, solveLpAuto } from "./lp-engine";

const row = (terms: Array<[number, number]>, rhs: number): BasisRow => ({ coefficients: new Map(terms), rhs });

describe("solveBasis", () => {
  it("peels row singletons (a triangular basis)", () => {
    const x = solveBasis([row([[0, 2]], 1), row([[0, 1], [1, 4]], 3), row([[1, 1], [2, 5]], 10)], [0, 1, 2])!;
    expect(x.get(0)).toBeCloseTo(0.5, 15);
    expect(x.get(1)).toBeCloseTo(0.625, 15);
    expect(x.get(2)).toBeCloseTo((10 - 0.625) / 5, 15);
  });

  it("solves a dense core that no singleton opens", () => {
    // 2a + b = 5, a + 3b = 10  ->  a = 1, b = 3
    const x = solveBasis([row([[0, 2], [1, 1]], 5), row([[0, 1], [1, 3]], 10)], [0, 1])!;
    expect(x.get(0)).toBeCloseTo(1, 14);
    expect(x.get(1)).toBeCloseTo(3, 14);
  });

  it("defers a column that sits in one row only", () => {
    // col 2 only in row 0: x2 = (4 - x0 - x1) / 2 after the 2x2 core on rows 1, 2
    const x = solveBasis(
      [row([[0, 1], [1, 1], [2, 2]], 4), row([[0, 2], [1, 1]], 3), row([[0, 1], [1, 3]], 4)],
      [0, 1, 2],
    )!;
    expect(x.get(0)).toBeCloseTo(1, 14);
    expect(x.get(1)).toBeCloseTo(1, 14);
    expect(x.get(2)).toBeCloseTo(1, 14);
  });

  it("refuses a system that is not square, is singular, or has a negative value", () => {
    expect(solveBasis([row([[0, 1]], 1)], [0, 1])).toBeNull();
    expect(solveBasis([row([[0, 1], [1, 2]], 3), row([[0, 2], [1, 4]], 6)], [0, 1])).toBeNull();
    expect(solveBasis([row([[0, 1]], -1)], [0])).toBeNull();
  });

  it("agrees with a brute-force solve on random sparse bases", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let trial = 0; trial < 50; trial++) {
      const n = 3 + Math.floor(rnd() * 8);
      const truth = Array.from({ length: n }, () => 1 + rnd() * 5);
      const rows: BasisRow[] = [];
      for (let r = 0; r < n; r++) {
        const terms = new Map<number, number>([[r, 1 + rnd()]]);
        for (let k = 0; k < 2; k++) if (rnd() < 0.5) terms.set(Math.floor(rnd() * n), rnd() * 2 - 0.5);
        let rhs = 0;
        for (const [c, v] of terms) rhs += v * truth[c]!;
        rows.push({ coefficients: terms, rhs });
      }
      const x = solveBasis(rows, [...Array(n).keys()]);
      if (x === null) continue; // a singular draw
      truth.forEach((t, c) => expect(x.get(c)).toBeCloseTo(t, 9));
    }
  });
});

describe("exactPrimal on the HiGHS engine", () => {
  beforeAll(async () => {
    await initLpEngine();
  });

  it("returns the vertex to double precision where HiGHS prints six digits", () => {
    // min x0  st  3 x0 + 7 x1 = 1 ; x0 + x1 + x2 <= 5  ->  x1 = 1/7
    const lp = {
      maximize: [-1, 0, 0],
      equalities: [{ coefficients: new Map([[0, 3], [1, 7]]), rhs: 1 }],
      upperBounds: [{ coefficients: new Map([[0, 1], [1, 1], [2, 1]]), rhs: 5 }],
    };
    const plain = solveLpAuto(lp);
    const exact = solveLpAuto(lp, { exactPrimal: true });
    expect(plain.status).toBe("optimal");
    expect(Math.abs(plain.x[1]! - 1 / 7)).toBeGreaterThan(1e-9); // six digits only
    expect(exact.x[1]).toBeCloseTo(1 / 7, 15);
    expect(exact.x[0]).toBe(0);
  });
});
