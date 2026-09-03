/**
 * The **scatter field**: the demo's ladder, placed sideways from a seed.
 *
 * A second generator beside [`fixture-field.ts`](./fixture-field.ts), and the
 * reason there are two rather than a second version of one is the whole point of
 * the file.
 *
 * ## Why it is a new generator and not a new fixture version
 *
 * The author, 2026-09-01: *"Can we change the planet generation in our demo to
 * have a bit more left/right stretch? Not fully to the boundary, but I want to
 * have more options for traveling near it."* — and then, asked what it would
 * cost: *"Can't we switch to a deterministic generator instead, based on some
 * seed? Would that help?"*
 *
 * **It helps, and the help is in the generator's name rather than in the seed.**
 * A recipe names the field it was flown in as a `{ generator, version }` pair and
 * [`fieldFor`](./recipe.ts) resolves the generator first. Editing the fixture's
 * placements bumps `FIXTURE_FIELD_VERSION` and **refuses every recipe flown in
 * it** — which is the 18 dispatches that still replay at `SIM_VERSION` 9, the
 * parked camera session's *"evidence and nothing else"*
 * (`docs/plan/m2-the-instrument.md`), and what `CLOSING_CONSTANT` was derived
 * from. Putting the new placements behind a **new generator** leaves `fixture`
 * frozen, so those recipes go on resolving to the field they were actually flown
 * in.
 *
 * That is why the ladder below is a **copy** of the fixture's altitudes and radii
 * rather than an import of them. Sharing the table would couple a frozen replay
 * target to a field that is meant to keep changing: one edit and the corpus is
 * gone anyway, through the back door. The duplication is the guarantee.
 *
 * ## What it is not
 *
 * **It is not spec [17](../../docs/spec/17-daily-field.md)'s generator**, and it
 * takes only the one rule from it the author asked for. Spec 17 §4's difficulty
 * curve — gaps 110 → 190 m, radii 55 → 32 m and the corridor narrowing 480 → 300
 * m over altitude — is deliberately not here: the corridor is what spec 07's
 * bands, the camera's own pan bound and the rungs are all measured against, and
 * moving it is a milestone rather than a placement change. The altitudes, the
 * radii, the corridor and the spawn are the fixture's, unchanged.
 *
 * **Its seed is baked into its version rather than carried in the recipe.** Spec
 * 17 §2 gives a day its own seed and that belongs to the day; a
 * `FieldIdentity` has no room for one, and adding it would change the recipe
 * format for a demo field. So `{ scatter, 1 }` names exactly one field, and
 * moving [`SEED`](#seed) bumps the version like any other change to what this
 * builds — which `test/sim/scatter-field.test.ts` holds with a fingerprint, the
 * same way the fixture's own version is held.
 */
import type { Field } from './types.ts';
import type { Body } from './body.ts';
import { createBody } from './body.ts';
import { createCraft } from './craft.ts';
import type { Craft } from './craft.ts';
import { magnitude } from './math.ts';
import { nextFraction, seedRng } from './rng.ts';
import { SCALE } from './units.ts';

/**
 * The version of this generator, part of the identity a recipe names.
 *
 * **Bump it whenever anything below changes what this function builds** — the
 * ladder, the seed, the spread, the corridor or the spawn.
 * `test/sim/scatter-field.test.ts` holds this number against a fingerprint of
 * the field it produces and fails until the two agree again.
 */
export const SCATTER_FIELD_VERSION = 1;

/**
 * The seed the lateral placement is drawn from.
 *
 * One arbitrary constant, and it is arbitrary on purpose: what the author asked
 * for is a *rule* rather than twenty-four typed numbers, so the only thing this
 * value has to be is fixed. It is part of the version — see the header.
 *
 * It is the **simulation's** stream ([`rng.ts`](./rng.ts)) rather than the render
 * seed, because a field is something the simulation has to agree about across
 * two machines; ADR-0014's portability rules apply to it and not to a decoration.
 */
const SEED = 0x5ca77e;

/** Where the corridor's centreline stands — the fixture's, unchanged. */
const CENTRELINE = 195;

/** How far either side the corridor reaches — the fixture's, unchanged. */
const CORRIDOR_HALF_WIDTH = (390 * 1.9) / 2;

/** How far below the craft's spawn the field's foot sits — the fixture's. */
const FOOT_BELOW_SPAWN = 844 + 400;

/** Where the craft stands at the first tick — the fixture's. */
const SPAWN_BELOW_FIRST_BODY = 354.48;

/**
 * How far off the centreline a body may sit, in prototype units — **195, and it
 * is measured rather than chosen.**
 *
 * ## What the author asked for
 *
 * *"A bit more left/right stretch. Not fully to the boundary, but I want to have
 * more options for traveling near it."* The fixture places its bodies at
 * `|dx| ≤ 150`; this is a 30% increase, and it puts the outermost body's centre
 * just inside spec [07](../../docs/spec/07-boundary.md)'s outer band, which
 * starts 150.5 units off the centreline. So orbiting one **pays ×2**, which is
 * the *option* the author is asking for rather than a longer walk to the same
 * places.
 *
 * ## What decides the ceiling, and it is not the spec's own rule
 *
 * Spec 17 §4 would allow `|lateral| ≤ corridorHalfWidth − radius − 60 m`, which
 * at this corridor is **255 for the largest body and 277 for the smallest** — far
 * past this. What binds first is whether a swing around a body out there is
 * *flyable*, and that is a measurement: over 800 corpus swings, the furthest the
 * craft reaches sideways from the body's centre **after the freeze** is
 *
 * | | p50 | p90 | p95 | p99 |
 * |---|---|---|---|---|
 * | reach from the body's centre | 88 | 196 | 225 | 298 |
 * | so a body may sit at | 282 | 175 | 146 | 72 |
 *
 * against a corridor of 370.5. **The fixture's own 150 is almost exactly the
 * p95-safe value**, which is a stronger endorsement of it than anything written
 * down about it. At 195 about **one swing in ten** around an outermost body
 * carries the craft out of the corridor, which is a real cost and is the reason
 * the author was given the number rather than the increase.
 *
 * **It stops here rather than at spec 17's own limit because the escape hatch is
 * not built.** Spec 07 §5's **save** is what makes a boundary excursion
 * recoverable, it is priced by fuel, and fuel is M4's. Going to 225 — spec 17
 * §5's ceiling — before there is any way back is making the field harsher than
 * the design intends. That is the number to revisit once the save exists.
 */
const SPREAD_CAP = 195;

/**
 * The closest to the centreline a body may sit — the fixture's own minimum.
 *
 * Carried so the scatter keeps the fixture's *character* rather than only its
 * outer edge: its `|dx|` runs 6 to 150 and is close to uniform across it, so
 * this draw is that distribution with the far end moved out. A floor of zero
 * would let a body sit on the centreline, and spec 17 §4's *"consecutive bodies
 * alternate side"* stops meaning anything for a body that is on neither.
 */
const SPREAD_FLOOR = 6;

/**
 * How much room spec 17 §4 asks to be left between a body and the boundary, in
 * metres — its `|lateral| ≤ corridorHalfWidth − radius − 60 m`.
 *
 * ⚠ **Spec 17 contradicts itself here and the wider reading is taken**, because
 * neither reading binds at this spread. §4's formula clears **60 m** and its
 * prose immediately claims that *"no body is ever inside a boundary band"* —
 * which its own number cannot deliver, since the outer band is 220 m deep. §5's
 * invariant 2 asks for a different figure again, `|lateral| + radius ≤
 * corridorHalfWidth − 90 m`. It is recorded in `docs/plan/m3-the-field.md` for
 * the author rather than resolved here: [`SPREAD_CAP`](#spread_cap) is 195 and
 * both readings allow more than that, so nothing in this file depends on which
 * one is right.
 */
const BAND_CLEARANCE = 60;

/**
 * How much clear space spec 17 §5 asks for between two bodies' rims, in
 * prototype units — its invariant 3, *"no two bodies overlap, and no two are
 * within 40 m of each other's rims."*
 *
 * **It is the invariant that actually bites here**, and it caught a real defect
 * on the first draw: a **fork** is two bodies at one altitude, so the only thing
 * keeping them apart is their lateral placement, and the first seed put the pair
 * at 1 100 m at −48 and +29 with radii 50 and 35 — rims **8 units past each
 * other**. Hand-typed placements never had the problem because a person can see
 * it; a draw cannot, so the check has to exist for the draw to be safe.
 */
const RIM_GAP = 40;

/**
 * ## ⚠ It is not enough to keep an **orbit** clear, 2026-09-03
 *
 * The invariant above stops two bodies overlapping and nothing more, and nothing
 * in spec 17 asks this generator for anything else. But a grab puts the craft on
 * a **frozen orbit** around one of them, and that orbit reaches **p50 300 and p95
 * 708 design units** across the recorded corpus — against a floor here of 40
 * prototype units, which is **120**.
 *
 * Measured: **16% of the corpus's 241 frozen orbits are wider than the room to
 * their nearest neighbour**, and three crossed one. All three were on a **fork** —
 * two bodies at one altitude, which this ladder draws four of, at rim gaps of
 * 162, 223, 270 and 646. The prototype's authored eight has no forks at all and
 * its closest pair is **1 721** design units apart, so an orbit there cannot
 * reach the next body; that, and not a difference in physics, is why the
 * behaviour never appears in it.
 *
 * The consequence is spec [01 · §10](../../docs/spec/01-swing.md)'s ⚠ notice —
 * the craft passing through a body it is not holding — and this constant is the
 * recommended place to answer it. **Not changed here**: it needs the author,
 * because leaving room for an orbit means a sparser field, no forks, or a wider
 * corridor, and all three are decisions about what the game *is*.
 */

/**
 * The ladder this field hangs its bodies on — **the fixture's altitudes and
 * radii, copied rather than imported.**
 *
 * The header argues why a copy: the fixture is a frozen replay target and this is
 * a field that is meant to keep changing, and one shared table would let an edit
 * here delete the dispatch corpus through the back door.
 *
 * `up` is altitude and increases with the climb; `radius` is a radius. Two
 * entries at the same altitude are a **fork** — the same climb with two answers —
 * and [`fieldOf`](#fieldof) puts the two on opposite sides.
 *
 * What is **not** here is `dx`: that is the whole of what this generator does.
 */
const LADDER: ReadonlyArray<{ up: number; radius: number }> = [
  { up: 0, radius: 46 },
  { up: 270, radius: 37 },
  { up: 550, radius: 56 },
  { up: 820, radius: 41 },
  { up: 1100, radius: 50 },
  { up: 1100, radius: 35 },
  { up: 1370, radius: 53 },
  { up: 1650, radius: 34 },
  { up: 1910, radius: 48 },
  { up: 2200, radius: 39 },
  { up: 2200, radius: 55 },
  { up: 2480, radius: 43 },
  { up: 2760, radius: 51 },
  { up: 3020, radius: 36 },
  { up: 3300, radius: 46 },
  { up: 3300, radius: 40 },
  { up: 3580, radius: 54 },
  { up: 3850, radius: 38 },
  { up: 4130, radius: 47 },
  { up: 4400, radius: 35 },
  { up: 4400, radius: 52 },
  { up: 4680, radius: 44 },
  { up: 4960, radius: 56 },
  { up: 5230, radius: 42 },
];

/**
 * How far off the centreline this body sits, signed — spec 17 §4's rule.
 *
 * **Alternating sides, and a fork takes the side its partner did not.** The
 * fixture's own note is that *"sides otherwise alternate, so the route weaves
 * rather than drifting to one wall, and a fork leaves the weave where it found
 * it"*; here that is a rule instead of twenty-four signs typed by hand, which is
 * what makes it survive the ladder changing under it.
 *
 * The magnitude is drawn uniformly between the floor and whichever ceiling binds
 * first — this generator's measured [`SPREAD_CAP`](#spread_cap), or spec 17 §4's
 * clearance for a body of this size. The cap binds at every radius in this
 * ladder; the clearance is applied anyway, because a ladder with a larger body in
 * it should not silently stop obeying the spec.
 */
function lateralOf(radius: number, side: 1 | -1, draw: number, least: number): number {
  const clearance = CORRIDOR_HALF_WIDTH - radius - BAND_CLEARANCE;
  const most = Math.min(SPREAD_CAP, clearance);
  const from = Math.max(SPREAD_FLOOR, least);
  return side * (from + draw * (most - from));
}

/**
 * How far out the second body of a **fork** has to sit, given the first.
 *
 * A fork is two bodies at one altitude on opposite sides, so the only thing
 * holding them apart is their lateral placement: the gap between their rims is
 * `|dx₁| + |dx₂| − r₁ − r₂`. Requiring [`RIM_GAP`](#rim_gap) of it is a floor on
 * the second draw, and it is applied **at the draw** rather than by rejecting the
 * field afterwards.
 *
 * **That distinction turned out to matter to the picture.** Rejecting a whole
 * field for a fork conflict throws away all twenty-four placements, so the seeds
 * that survive are the ones where *everything* happened to land wide — measured,
 * that pushed the mean `|dx|` from 97 to 119 and put nine bodies in the outer
 * band instead of six. The bias was real and it was an artefact of the mechanism
 * rather than anything anybody chose. Constraining the one draw that is actually
 * constrained leaves the other twenty-two uniform.
 */
function forkFloor(first: number, firstRadius: number, radius: number): number {
  return firstRadius + radius + RIM_GAP - Math.abs(first);
}

/**
 * The scatter field, foot to top.
 *
 * Built rather than stored, so every body's mass comes from
 * [`createBody`](./body.ts) and moves with the exponent (spec 04 §1: mass **is**
 * size). The one conversion besides `SCALE` is the sign of the climb: altitude
 * increases upward and the simulation's `y` increases downward.
 */
export function scatterField(): Field {
  // **Rejected and regenerated from the next value of the seed stream**, which is
  // spec 17 §5's own mechanism for a day that fails an invariant. The alternative
  // — nudging a body until it fits — makes the placement depend on the order the
  // conflicts were found and stops being a pure function of the seed.
  //
  // The bound is a guard against a ladder that cannot be placed at all rather
  // than a real limit: at this spread the first seed to satisfy the invariants is
  // found immediately, and a ladder that exhausts this has a geometry problem
  // that should stop the build rather than be flown.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const placed = placeFrom(SEED + attempt);
    if (placed !== null) return placed;
  }
  throw new Error('no seed places this ladder inside the corridor without bodies touching');
}

/** One attempt at the whole field, or `null` if it fails spec 17 §5's invariants. */
function placeFrom(seed: number): Field | null {
  const rng = seedRng(seed);
  const bodies: Body[] = [];
  let side: 1 | -1 = 1;
  const laid: number[] = [];
  for (let at = 0; at < LADDER.length; at++) {
    const rung = LADDER[at]!;
    const before = at > 0 ? LADDER[at - 1]! : null;
    // **Alternating, and a fork's two sides fall out of it.** Two bodies at one
    // altitude are consecutive in the ladder, so plain alternation already puts
    // them on opposite sides — which is what a fork has to be, and is what the
    // fixture's hand-typed signs do.
    side = -side as 1 | -1;
    // What a fork does need is room, and it needs it at the draw — see
    // [`forkFloor`](#forkfloor).
    const fork = before !== null && before.up === rung.up;
    const least = fork ? forkFloor(laid[at - 1]!, before.radius, rung.radius) : 0;
    const dx = lateralOf(rung.radius, side, nextFraction(rng), least);
    laid.push(dx);
    bodies.push(createBody((CENTRELINE + dx) * SCALE, -rung.up * SCALE, rung.radius * SCALE));
  }
  if (!apart(bodies)) return null;
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
 * Whether every pair of bodies clears every other by [`RIM_GAP`](#rim_gap) —
 * spec 17 §5's invariant 3.
 *
 * Every pair rather than only the forks, because the ladder is allowed to change
 * and *"the two at one altitude"* is the case that happens to bite today rather
 * than the rule. Twenty-four bodies is 276 comparisons, once, at construction.
 */
function apart(bodies: readonly Body[]): boolean {
  for (let a = 0; a < bodies.length; a++) {
    for (let b = a + 1; b < bodies.length; b++) {
      const one = bodies[a]!;
      const two = bodies[b]!;
      const dx = one.x - two.x;
      const dy = one.y - two.y;
      const gap = magnitude(dx, dy) - one.radius - two.radius;
      if (gap < RIM_GAP * SCALE) return false;
    }
  }
  return true;
}

/**
 * The craft at the start of a run — placed against this field's first body, the
 * same way the fixture places it.
 *
 * Below and to the left of the opening body, coasting straight up at its baseline
 * drift speed and holding nothing. It begins inside that body's grab range, so
 * the field opens with a grab that is on offer rather than one that has to be
 * chased — and because the first body's lateral is now drawn rather than typed,
 * the spawn is measured from wherever it landed rather than from a constant.
 */
export function scatterCraft(): Craft {
  const first = scatterField().bodies[0]!;
  return createCraft(first.x - 84 * SCALE, SPAWN_BELOW_FIRST_BODY * SCALE, 0, -97 * SCALE);
}
