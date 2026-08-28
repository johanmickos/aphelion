/**
 * A field to fly in, by hand, until there is a generator.
 *
 * **This is a fixture and it says so.** Spec
 * [17 · §3](../../docs/spec/17-daily-field.md) rules that a day is *"generated
 * once, as data, and gameplay reads only the data"*, so a hand-made table
 * satisfies exactly the contract a generated day will, and the generator that
 * replaces it is [M3](../../docs/plan/m3-the-field.md)'s. Nothing here is a
 * ruling about what a day looks like: spec 17 §4 owns that curve already, in
 * metres it has not reconciled with this repo's design units, and reconciling
 * them is not this step's to do.
 *
 * ## What it carries, and from where
 *
 * The geometry is the prototype's own field at the tuning spec
 * [01](../../docs/spec/01-swing.md)'s 474 seconds of recorded play were flown
 * in — read out of it, stated below in the units it was measured in, and
 * converted here at [`SCALE`](./units.ts) exactly as every other length in this
 * simulation is (ADR-0013: carry the behaviour, re-derive the mechanism; the
 * generator that produced it does not cross). Four facts about that field are
 * load-bearing, and they are why the table looks like this:
 *
 * - **Every body fits inside the design space's width**, so the whole corridor
 *   is on screen at once and the camera never has to pan sideways
 *   ([`derive.ts`](../state/derive.ts) draws that conclusion and
 *   `test/sim/fixture-field.test.ts` holds this file to it).
 * - **The gaps are about 280 units**, jittered — half a grab range. Close enough
 *   that the next body is already on offer, far enough that reaching it is a
 *   decision, and never the same twice, because a metronomic field lets a rhythm
 *   be learned instead of a distance.
 * - **Radii run 34 – 56.** A field of identically-sized bodies would make spec
 *   01 §13.2's mass-to-radius exponent unflyable, and that exponent is the
 *   author's at the M1 gate: at `MASS_EXPONENT = 0` every body here pulls alike
 *   and reaches alike, and at 2 the largest reaches 2.7× as far as the smallest.
 *   **The spread is what makes the question askable in the hand.**
 * - **Some altitudes hold two bodies.** Somewhere to release *to* rather than
 *   along is the difference between a climb and a line that is merely followed,
 *   and the prototype's field forks about two altitudes in five.
 *
 * The opening is the prototype's authored one, kept exactly: a body of radius 46
 * at the foot of the field, with the craft 84 units to its left and 354 below
 * it, coasting straight up at its baseline drift speed. That first approach is
 * tuned, and starting anywhere else would put the first thing the author feels
 * at the gate outside everything spec 01 measured.
 */
import type { Body } from './body.ts';
import { createBody } from './body.ts';
import type { Craft } from './craft.ts';
import { createCraft } from './craft.ts';
import type { Field } from './types.ts';
import { SCALE } from './units.ts';

/**
 * Where the corridor's centreline stands, from the left of the field.
 *
 * Half the prototype's 390-unit framing, which is half this repo's design space
 * once converted — the same place, said in the units this file is written in.
 * The simulation may not import the design space (it reaches nothing outside
 * itself, by `pnpm portable`), so the two are held in agreement by a test
 * instead: the camera in [`derive.ts`](../state/derive.ts) sits on this line and
 * would frame a field built off it.
 */
const CENTRELINE = 195;

/**
 * How far either side of the centreline the corridor reaches, in prototype
 * units.
 *
 * **The prototype's own, and it is a tuned number rather than an incidental
 * one.** Its field is `1.9 ×` the width it is drawn in — 390 — and its tuning
 * log records both halves of the move from 1.2: *"the corridor felt
 * constrictive, and a wider field gives more room to find a planet to curve away
 * from before reaching a boundary"*, and then 1.90 specifically so that a run
 * does not open on the boundary's own gradient. Spec
 * [01 · §10](../../docs/spec/01-swing.md)'s 24 recorded endings — 83% of them
 * out of bounds — were all flown at this width, and its tolerance that
 * out-of-bounds stays the plurality is written on that number.
 *
 * **It is also the narrowest that this field can be flown in.** Three of the
 * bodies below sit 150 units off the centreline, so a *settled circle* at one of
 * their floors reaches 202 — and an oval at the eccentricity cap reaches 400.
 * A corridor at the design space's own edges (half-width 195) would kill a craft
 * on the far side of a legitimate orbit around a body the field itself placed,
 * which is exactly the defect §10 records the fell-behind line having had.
 *
 * **Expires with M3's corridor.** Spec [17 · §4](../../docs/spec/17-daily-field.md)
 * narrows the half-width with altitude, in metres this repo has not reconciled
 * with design units, and M3 re-measures the curve. Until then the corridor is
 * one number and it is this one.
 */
const CORRIDOR_HALF_WIDTH = (390 * 1.9) / 2;

/**
 * How far below the craft's own spawn the field's foot sits, in prototype units.
 *
 * The prototype's, and the two numbers it is made of are visible in it: one
 * screen height (844) plus 400. **It is a backstop rather than a line anyone
 * meets** — the fell-behind line trails the high-water mark by 700 and the mark
 * opens at the spawn, so the fell-behind line is always the higher of the two and
 * always fires first. That is true of the prototype at this tuning too. It is
 * built because spec 01 §10's out-of-bounds ending is *"leaving the corridor
 * sideways ... **or** falling out of the bottom"*, and a field with no foot is a
 * field a run could fall through if the trailing line ever moved.
 */
const FOOT_BELOW_SPAWN = 844 + 400;

/** Where the craft stands at the first tick, in prototype units of altitude. */
const SPAWN_BELOW_FIRST_BODY = 354.48;

/**
 * The field, foot to top, in the prototype's units.
 *
 * `up` is altitude and increases with the climb; `dx` is signed from the
 * centreline; `radius` is a radius. Two entries at the same altitude are a
 * fork — the same climb with two answers. Sides otherwise alternate, so the
 * route weaves rather than drifting to one wall, and a fork leaves the weave
 * where it found it.
 */
const PLACEMENTS: ReadonlyArray<{ up: number; dx: number; radius: number }> = [
  { up: 0, dx: -6, radius: 46 },
  { up: 270, dx: 52, radius: 37 },
  { up: 550, dx: -36, radius: 56 },
  { up: 820, dx: 22, radius: 41 },
  { up: 1100, dx: -126, radius: 50 },
  { up: 1100, dx: 110, radius: 35 },
  { up: 1370, dx: -30, radius: 53 },
  { up: 1650, dx: 66, radius: 34 },
  { up: 1910, dx: -44, radius: 48 },
  { up: 2200, dx: -104, radius: 39 },
  { up: 2200, dx: 132, radius: 55 },
  { up: 2480, dx: 16, radius: 43 },
  { up: 2760, dx: -68, radius: 51 },
  { up: 3020, dx: 48, radius: 36 },
  { up: 3300, dx: 96, radius: 46 },
  { up: 3300, dx: -150, radius: 40 },
  { up: 3580, dx: -10, radius: 54 },
  { up: 3850, dx: 62, radius: 38 },
  { up: 4130, dx: -40, radius: 47 },
  { up: 4400, dx: -112, radius: 35 },
  { up: 4400, dx: 138, radius: 52 },
  { up: 4680, dx: 24, radius: 44 },
  { up: 4960, dx: -70, radius: 56 },
  { up: 5230, dx: 56, radius: 42 },
];

/**
 * The fixture field, foot to top.
 *
 * Built rather than stored, so every body's mass comes from
 * [`createBody`](./body.ts) and moves with the exponent the gate is deciding.
 * There is deliberately no way to hand a body a mass of its own (spec 04 §1:
 * mass **is** size).
 *
 * The one conversion this file performs besides `SCALE` is the sign of the
 * climb: altitude increases upward and the simulation's `y` increases downward.
 */
export function fixtureField(): Field {
  const bodies: Body[] = PLACEMENTS.map((at) =>
    createBody((CENTRELINE + at.dx) * SCALE, -at.up * SCALE, at.radius * SCALE),
  );
  return {
    bodies,
    corridor: {
      centreline: CENTRELINE * SCALE,
      halfWidth: CORRIDOR_HALF_WIDTH * SCALE,
      foot: (SPAWN_BELOW_FIRST_BODY + FOOT_BELOW_SPAWN) * SCALE,
    },
  };
}

/**
 * The craft at the start of a run, placed against the field's first body.
 *
 * The prototype's spawn: below and to the left of the opening body, coasting
 * straight up at its baseline drift speed and holding nothing. It begins inside
 * that body's grab range, so the field opens with a grab that is on offer rather
 * than one that has to be chased.
 */
export function fixtureCraft(): Craft {
  const first = PLACEMENTS[0]!;
  return createCraft(
    (CENTRELINE + first.dx - 84) * SCALE,
    SPAWN_BELOW_FIRST_BODY * SCALE,
    0,
    -97 * SCALE,
  );
}
