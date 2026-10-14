/** The canonical tie-break's per-index weight in [1, 2): SplitMix64 of the index (spec-solver 3.4.4). */
const MASK = (1n << 64n) - 1n;
const cache: number[] = [];

export function tieWeight(i: number): number {
  const cached = cache[i];
  if (cached !== undefined) return cached;
  let z = (BigInt(i + 1) * 0x9e3779b97f4a7c15n) & MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  z ^= z >> 31n;
  const w = 1 + Number(z >> 11n) * 2 ** -53;
  cache[i] = w;
  return w;
}
