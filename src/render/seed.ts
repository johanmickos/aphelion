/**
 * The render seed: a small generator the sky and the dust are laid out from,
 * and it is **deliberately not the simulation's**.
 *
 * It was [`starfield.ts`](./starfield.ts)'s private nine lines until the dust
 * arrived wanting exactly the same thing (M3.3). It is here rather than
 * duplicated because a second generator would be a second thing capable of
 * disagreeing about what "a render seed" means, and here rather than in the
 * simulation because of what the next paragraph says.
 *
 * `test/render/boundary.test.ts` proves the renderer imports nothing from
 * `src/sim/`, which is [ADR-0006](../../docs/adr/0006-three-layers-sim-presentation-renderer.md)'s
 * wall and worth more than the nine lines this saves. **The sky must never be
 * able to draw from the run's own stream** — that would make a decoration
 * capable of changing the game — and a generator it cannot reach is the
 * strongest possible statement of that. It is the prototype's own framing of its
 * starfield seed: *"does not affect the simulation; reproduces the starfield."*
 * A run's determinism is untouched, because the sky is not in the run.
 *
 * Mulberry32, the same algorithm the prototype seeds its own sky with.
 */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
