/**
 * Seeded PRNG for anything decorative that must be reproducible.
 *
 * The prototype seeded its starfield with Math.random(), so every load produced
 * a different sky and no two draw traces could ever be compared. Diagnostics
 * reports carry this seed, so a reported frame can be reproduced exactly.
 *
 * mulberry32: small, fast, good enough for scattering dots.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
