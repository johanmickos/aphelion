/**
 * Seeded PRNG.
 *
 * Lives in the simulation because the world layout uses it and the world must be
 * identical for every player and every replay — `Math.random` is banned in
 * src/sim for exactly that reason. The renderer uses it too, for the starfield,
 * so a reported frame can be reproduced.
 *
 * mulberry32: small, fast, good enough for scattering planets and dots.
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
