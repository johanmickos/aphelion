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
export const SNAPSHOT_VERSION = 7;

// The craft's four numbers, then the three the release's burst rides on.
const HEADER_BYTES = 4 + 4 + 4 + 4 + (4 + 3) * 8 + 4 * 4 + 1 + 1 + 8;
/** The corridor's centreline, half-width and foot. */
const CORRIDOR_BYTES = 3 * 8;
/** A presence byte, then a dive's seven numbers. */
const DIVE_BYTES = 1 + 7 * 8;
/** A presence byte, then the eight numbers of an orbit and its tick count. */
const ORBIT_BYTES = 1 + 8 * 8 + 4;
const BODY_BYTES = 4 * 8 + 1;

/** The type ordinals, fixed by position. Appending is safe; reordering is not. */
const BODY_TYPES = ['STANDARD'] as const;

/**
 * The ending ordinals, fixed by position, with **zero reserved for a run that is
 * still alive**.
 *
 * So the byte says both things at once — whether the run is over and how — which
 * is the same one-value rule `SimState` holds: two values that must agree are two
 * values that will eventually disagree.
 */
const ENDINGS = ['IMPACT', 'OUT_OF_BOUNDS', 'FELL_BEHIND', 'CLEARED'] as const;

export function snapshot(state: SimState): Uint8Array {
  const bodies = state.field.bodies;
  const bytes = new Uint8Array(
    HEADER_BYTES + CORRIDOR_BYTES + DIVE_BYTES + ORBIT_BYTES + bodies.length * BODY_BYTES,
  );
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
  const flag = (value: boolean): void => {
    view.setUint8(at, value ? 1 : 0);
    at += 1;
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
  // The release's burst is world state: it moves the craft, so two runs that
  // agree everywhere else and disagree here are two different runs.
  f64(state.craft.burst);
  f64(state.craft.burstLeft);
  f64(state.craft.burstSpan);

  u32(state.rng[0]);
  u32(state.rng[1]);
  u32(state.rng[2]);
  u32(state.rng[3]);
  flag(state.pressed);
  view.setUint8(at, state.ending === null ? 0 : ENDINGS.indexOf(state.ending) + 1);
  at += 1;
  f64(state.highWater);

  // The corridor, because two runs flown in fields with different sides are two
  // different runs even when the craft is in the same place — and a recipe is
  // the whole description of one (ADR-0004).
  f64(state.field.corridor.centreline);
  f64(state.field.corridor.halfWidth);
  f64(state.field.corridor.foot);

  // A fixed layout with a presence byte rather than a variable-length one: two
  // states that differ in whether a swing has frozen then differ in the first
  // byte of the same field, which is what makes `firstDifference` say something
  // useful about where two runs parted.
  const dive = state.dive;
  flag(dive !== null);
  f64(dive ? dive.grabRadius : 0);
  f64(dive ? dive.entrySpeed : 0);
  f64(dive ? dive.aim : 0);
  f64(dive ? dive.smallestRadius : 0);
  f64(dive ? dive.peakEnergy : 0);
  f64(dive ? dive.clearanceTicks : 0);
  f64(dive ? dive.knock : 0);

  const orbit = state.orbit;
  flag(orbit !== null);
  f64(orbit ? orbit.periapsis : 0);
  f64(orbit ? orbit.eccentricity : 0);
  f64(orbit ? orbit.momentum : 0);
  f64(orbit ? orbit.periapsisAngle : 0);
  f64(orbit ? orbit.direction : 0);
  f64(orbit ? orbit.depth : 0);
  f64(orbit ? orbit.aim : 0);
  f64(orbit ? orbit.phase : 0);
  u32(orbit ? orbit.ticksSinceFreeze : 0);

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
