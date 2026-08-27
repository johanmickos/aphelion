/**
 * The simulation's state as bytes, so that two runs can be compared rather than
 * described.
 *
 * ADR-0004 makes determinism the contract, and spec
 * [01 · §12a](../../docs/spec/01-swing.md) states its tolerance as *"a recipe
 * replayed twice on the same engine produces **byte-identical** state at every
 * tick."* A test that walks two states field by field can only check the fields
 * it thought to check, and quietly stops covering whatever is added next. This
 * produces the whole thing, so a new field that is not written here fails the
 * layout check in `test/sim/snapshot.test.ts` rather than escaping the
 * comparison.
 *
 * Bytes and not a hash: when two runs disagree, the first differing offset says
 * *what* disagreed, and a digest says only that something did.
 *
 * Two details are deliberate. `DataView` writes big-endian by default, so the
 * bytes do not depend on the machine. And a float64 written whole distinguishes
 * `-0` from `0` and one `NaN` from another — both of which a `===` comparison
 * would call equal, and both of which are real divergences.
 */
import type { SimState } from './types.ts';

/**
 * Bumped whenever the layout below changes.
 *
 * A snapshot outlives the session that produced it — spec 17 versions its
 * generator for the same reason — so a stored one has to be able to say it was
 * written by a different game.
 */
export const SNAPSHOT_VERSION = 1;

const HEADER_BYTES = 4 + 4 + 4 + 4 + 4 * 8 + 4 * 4;
const BODY_BYTES = 4 * 8 + 1;

/** The type ordinals, fixed by position. Appending is safe; reordering is not. */
const BODY_TYPES = ['STANDARD'] as const;

export function snapshot(state: SimState): Uint8Array {
  const bodies = state.field.bodies;
  const bytes = new Uint8Array(HEADER_BYTES + bodies.length * BODY_BYTES);
  const view = new DataView(bytes.buffer);
  let at = 0;

  const u32 = (value: number): void => {
    view.setUint32(at, value >>> 0);
    at += 4;
  };
  const f64 = (value: number): void => {
    view.setFloat64(at, value);
    at += 8;
  };

  u32(SNAPSHOT_VERSION);
  u32(state.tick);
  // `null` has no float64 and no natural integer; -1 is not a valid index, so it
  // cannot collide with a real one.
  view.setInt32(at, state.heldBody === null ? -1 : state.heldBody);
  at += 4;
  u32(bodies.length);

  f64(state.craft.x);
  f64(state.craft.y);
  f64(state.craft.vx);
  f64(state.craft.vy);

  u32(state.rng[0]);
  u32(state.rng[1]);
  u32(state.rng[2]);
  u32(state.rng[3]);

  for (const body of bodies) {
    f64(body.x);
    f64(body.y);
    f64(body.radius);
    f64(body.mass);
    view.setUint8(at, BODY_TYPES.indexOf(body.type));
    at += 1;
  }

  return bytes;
}

/** The first byte at which two snapshots differ, or `-1` if they are identical. */
export function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const shortest = Math.min(a.length, b.length);
  for (let i = 0; i < shortest; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : shortest;
}
