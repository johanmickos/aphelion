/**
 * The only source of randomness in the game, and it is not random.
 *
 * A run is fully described by its configuration, its seed and its input log
 * (ADR-0004), so every draw the simulation makes has to come from the seed and
 * from nothing else. `pnpm portable` bans `Math.random` in this layer; this is
 * what it bans it in favour of.
 *
 * The algorithm is `sfc32` — four 32-bit words of state, all arithmetic through
 * `Math.imul`, `+`, shifts and `>>> 0`, every one of which ECMA-262 specifies
 * exactly. It is deliberately not exposed: spec
 * [17 · §2](../../docs/spec/17-daily-field.md) requires that the same date
 * produce a byte-identical field on every device *forever*, which makes the
 * generator's identity part of the day's identity. A caller that could choose
 * the algorithm could break that from outside.
 *
 * State is carried in a plain array rather than closed over, so it can be
 * snapshotted with the rest of the simulation ([`snapshot.ts`](./snapshot.ts))
 * and a replay can resume mid-run.
 */

/** Four 32-bit words. Opaque: read and written only by this file. */
export type RngState = [number, number, number, number];

/**
 * Spread a single seed across four words before drawing from it.
 *
 * `sfc32` seeded with three zeros and a counter correlates visibly for the first
 * few draws. `splitmix32` is the standard answer and costs nothing here: the
 * generator is seeded once per run.
 */
export function seedRng(seed: number): RngState {
  let s = seed >>> 0;
  const word = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
  const state: RngState = [word(), word(), word(), word()];
  // sfc32 discards its first draws; without this the first value tracks the
  // seed closely enough to see.
  for (let i = 0; i < 12; i++) nextUint32(state);
  return state;
}

/** The next raw word, advancing the state. */
function nextUint32(state: RngState): number {
  const a = state[0];
  const b = state[1];
  const c = state[2];
  const counter = state[3];

  const t = (a + b + counter) >>> 0;
  state[0] = b ^ (b >>> 9);
  state[1] = (c + (c << 3)) >>> 0;
  state[2] = ((c << 21) | (c >>> 11)) >>> 0;
  state[2] = (state[2] + t) >>> 0;
  state[3] = (counter + 1) >>> 0;
  return t;
}

/**
 * The next value in `[0, 1)`.
 *
 * Divided by 2³², which is exact in float64, so the mapping from the raw word to
 * the fraction adds no rounding of its own.
 */
export function nextFraction(state: RngState): number {
  return nextUint32(state) / 4294967296;
}

/**
 * The next integer in `[0, bound)`, without modulo bias.
 *
 * Rejection rather than `% bound`: with a bound that does not divide 2³² evenly,
 * modulo makes the low values very slightly likelier, and spec 17's generator
 * rejects and redraws whole days — so a biased draw would bias which days exist,
 * quietly and forever.
 */
export function nextBelow(state: RngState, bound: number): number {
  const limit = 4294967296 - (4294967296 % bound);
  let value = nextUint32(state);
  while (value >= limit) value = nextUint32(state);
  return value % bound;
}

/** A copy that can be advanced without disturbing the original. */
export function cloneRng(state: RngState): RngState {
  return [state[0], state[1], state[2], state[3]];
}
