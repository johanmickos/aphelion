/**
 * Where a release would send the craft — the geometry under `CONTEXT.md`'s
 * **compass**.
 *
 * `VISION.md` calls the compass's ancestor the best piece of UI in the game:
 * diegetic, positioned exactly where the eye already is, teaching the timing
 * window without a word of text. What makes that possible is that the compass is
 * **not a hint**. It is a fact the world can be asked for, and this file is where
 * it is asked.
 *
 * ## Why the question has a closed answer
 *
 * Two of this game's rules make it tractable, and neither was chosen for that.
 *
 * **A coasting craft feels nothing, from anything, at any distance** (spec
 * [01 · §2](../../docs/spec/01-swing.md)). So a release is not the start of a
 * trajectory to integrate — it is a **straight ray**, until something catches it
 * or the field ends. Where a release goes is a line-and-circle problem.
 *
 * **The nose points along the exit tangent for the whole orbit** (`CONTEXT.md`).
 * So the release angle *is* the aim: the craft's position on the orbit fixes the
 * direction it leaves in, with nothing else to steer by. That is why the compass
 * can be drawn on the orbit path — the path and the aim are the same coordinate,
 * which is spec [01 · §11](../../docs/spec/01-swing.md)'s tension in one
 * sentence: the **envelope** is a shape in time and the **window** is a shape in
 * angle, and hitting both means shaping the dive so they arrive together.
 *
 * ## A window is where you actually end up
 *
 * Every release angle is answered with **one** body — the first whose grab range
 * the ray enters — and a window is the arc of angles answered with the same one.
 * So the windows partition the orbit rather than overlapping it, a body behind
 * another body has no window at all, and the arc drawn for a body is a promise
 * the press will keep, because the range it is measured against is
 * [`grab.ts`](./grab.ts)'s own and not a second opinion about it.
 *
 * The width is therefore **earned by the geometry** rather than assigned: a body
 * far away, or small, or hiding behind a nearer one, gets a narrow window or
 * none, and spec [00 · §6](../../docs/spec/00-tokens.md)'s rule that *"the arc's
 * width is the posted odds"* follows from that rather than being imposed on it.
 * Spec [06 · §2](../../docs/spec/06-awards.md)'s zones scale with the window, so
 * difficulty prices its own words.
 *
 * ## How far the ray is traced, and why that number is not invented
 *
 * An unbounded ray reaches almost everything: the median body is on offer from
 * 1 680 design units away, so a line drawn up a corridor eventually passes near
 * every body in it. Flown that way the instrument drew **23 rings**, which is
 * not a compass.
 *
 * Spec 00 §6 says *"one ring per **reachable** body"* and does not say what
 * reachable is — the same hole spec [03 · §6](../../docs/spec/03-hud.md) records
 * for sightings, and spec [17](../../docs/spec/17-daily-field.md)'s to fill. So
 * rather than choose a distance, the ray is traced **exactly as far as the craft
 * could survive**: it stops where spec 01 §10's own endings stop it — outside the
 * corridor, past its foot, or below the **fell-behind line**. A window past that
 * point would be a promise the field itself breaks, and the bound is made of
 * numbers the simulation already had.
 *
 * A ray that climbs is never bounded by the fell-behind line, because the line
 * trails the high-water mark and a climbing craft keeps raising it. That is
 * correct rather than a gap: such a release really does arrive somewhere, and
 * *first-body-wins* is what keeps the answer local.
 */
import type { Body } from './body.ts';
import { floorRadius } from './body.ts';
import { grabRange } from './grab.ts';
import { magnitude } from './math.ts';
import { pathRadiusAt } from './orbit.ts';
import { fellBehindLine } from './run.ts';
import { angleOf, cos, sin } from './trig.ts';
import type { SimState } from './types.ts';
import { CORRIDOR_GRACE, SCALE } from './units.ts';

/**
 * One arc of the compass (`CONTEXT.md`: **window**) — every release that arrives
 * at one body.
 *
 * Angles are **absolute position angles about the held body**, which is the
 * coordinate the whole instrument is drawn in: the craft's own angle is the
 * hand, a window is an arc, and the gap between them is the grade.
 */
export interface Window {
  /** Which body it reaches, as an index into the field. */
  readonly body: number;
  /** The release that reaches it best — the **dot**, and a perfect release. */
  readonly dot: number;
  /**
   * Half the arc's width, in radians. Spec 06's zones are fractions of the whole.
   *
   * **This is the width the player is graded on, because it is the width they are
   * shown.** Where the quality band is narrower than [`MIN_HALF_WIDTH`](#) the
   * arc opens to that floor and the grading opens with it: the prototype's rule
   * is that *"the player must never be scored against something they cannot see.
   * One sweep produces the rings that get drawn AND the alignment that gets paid,
   * so the two cannot drift apart."*
   */
  readonly halfWidth: number;
  /** How close to the body's centre the best release passes, in design units. */
  readonly closest: number;
  /** How far the body is from the one being held — what its ring's radius says. */
  readonly away: number;
}

/**
 * How finely the orbit is swept looking for windows.
 *
 * **A resolution and therefore a limit, stated rather than assumed.** The sweep
 * is what *finds* an arc; the bisection below is what measures its edges, to a
 * precision the sweep does not bound. So the cost of 120 is that an arc narrower
 * than three degrees can be missed — and spec 06 §2 puts a floor of 1.5° under
 * the PERFECT zone alone, so an arc that thin is one no player could hit and no
 * instrument should promise.
 */
const SWEEP = 120;

/**
 * How far a body may be from the one being held and still get a ring — the
 * prototype's `AIM_RANGE`, converted.
 *
 * Spec 00 §6 says *"one ring per **reachable** body"* and does not say what
 * reachable is. The prototype does, with its reason: *"about two body-spacings:
 * the next step of the climb and the one after, no further. Anything beyond that
 * is a long, featureless coast, and signposting it invites the player to aim past
 * the interesting part of the field."* That is behaviour rather than a number's
 * authority, which is what ADR-0013 says to carry.
 *
 * It works with [`RINGS`](#) rather than instead of it: the range says what is
 * worth aiming at, the count says how many can be read at once.
 */
export const AIM_RANGE = 800 * SCALE;

/**
 * The narrowest arc the compass will draw, as a half-width.
 *
 * **Ruled from flying it** (author, 2026-08-29): *"for very distant planets, I
 * think we still need to show a window, which makes me think we need a minimum
 * width. It's more important that the player knows roughly where to aim with
 * little screen clutter than showing them exactly where they need to release,
 * because it's so randomly timed anyway."*
 *
 * So an arc the geometry earns nothing of still opens to this, and the grading
 * opens with it. Fifteen degrees whole, which is spec
 * [06 · §2](../../docs/spec/06-awards.md)'s own narrow worked example — and at
 * that width §2's 1.5° floor under PERFECT is still what binds, so the top word
 * does not get easier for being far away. An opening position, and on the bench.
 */
export const MIN_HALF_WIDTH = (7.5 * Math.PI) / 180;

/** How many halvings an edge is measured with — about 0.003° at this sweep. */
const BISECTIONS = 10;

/** How finely the dot is hunted inside an arc, once the arc is known. */
const DOT_SAMPLES = 24;
const DOT_REFINEMENTS = 12;

/**
 * How many bodies get a ring — spec 00 §6's *"one concentric ring per reachable
 * body"*, with **reachable** measured rather than guessed.
 *
 * §6 does not say what reachable means, which is the same hole spec
 * [03 · §6](../../docs/spec/03-hud.md) records for sightings and spec
 * [17](../../docs/spec/17-daily-field.md)'s to fill. Left open, the geometry
 * offers **ten to sixteen** rings at once on this field, which is not an
 * instrument.
 *
 * So it was measured. Over 120 pilot runs and **342 releases that reached
 * another body**, the body the craft actually grabs next is among the four
 * nearest to the one it just left **100%** of the time — 99.7% at three, 92.7%
 * at two, 68.1% at one. Four is where the cohort runs out, and it is close to
 * what Direction 01's board draws.
 *
 * **Nearest, and not best-aimed**, because the order has to be stable: a ring
 * stack sorted by how good the aim is would reshuffle its own radii every tick,
 * and the distance between two bodies never changes. The cohort is the headless
 * pilot's and is a stand-in until the author's own play replaces it (spec
 * [01 · §13.7](../../docs/spec/01-swing.md)).
 */
export const RINGS = 4;

const TWO_PI = Math.PI * 2;

/**
 * Where the craft is round its orbit right now, as an angle about the body.
 *
 * The **hand**, in `CONTEXT.md`'s words: *"the moving indicator on the compass
 * showing where a release would land right now."*
 */
export function handOf(state: SimState): number | null {
  if (state.heldBody === null || state.orbit === null) return null;
  const body = state.field.bodies[state.heldBody]!;
  return angleOf(state.craft.x - body.x, state.craft.y - body.y);
}

/**
 * Every window on the orbit the craft is riding, nearest body first.
 *
 * Empty while coasting and while diving: the compass needs an orbit, and a
 * **sighting** is what a craft without one reads (spec 03 §6).
 */
export function windowsOn(state: SimState): Window[] {
  const held = state.heldBody;
  if (held === null || state.orbit === null) return [];
  const centre = state.field.bodies[held]!;
  // Everything worth arriving at, and then the handful that get a ring. Both
  // come off the same list so the instrument and the partition agree.
  const candidates = within(state, held);
  const near = candidates.slice(0, RINGS);

  // One pass round the orbit, asking each release the same question. Every
  // candidate answers — a nearer one hides a further one whether or not it has a
  // ring — and only the near ones are drawn.
  const answers: number[] = [];
  for (let i = 0; i < SWEEP; i++) {
    answers.push(arrivesAt(state, centre, (i / SWEEP) * TWO_PI, candidates));
  }

  // **One window per ring**, which is spec 00 §6's own shape: *"an arc on the
  // ring belonging to one reachable body"*, singular. A body can be arrived at
  // through more than one arc — round the far side of the orbit as well as the
  // near — and the one kept is the one carrying the best release, because that
  // is the one being aimed at. The others are true and are not drawn.
  const best = new Map<number, Window>();
  for (const arc of arcsIn(answers)) {
    if (!near.includes(arc.body)) continue;
    // `measured` rather than `window`: the glossary's word is the type's, and
    // the lower-case identifier is a DOM global that `pnpm portable` bans in
    // this directory — which is the rule working, not the rule getting in the way.
    const measured = measure(state, centre, arc.body, arc.from, arc.to, candidates);
    if (measured === null) continue;
    const standing = best.get(arc.body);
    if (standing === undefined || measured.closest < standing.closest) best.set(arc.body, measured);
  }
  const found = [...best.values()];

  // Radially in the order the field puts them, so the stack does not reshuffle
  // as the craft goes round.
  found.sort((a, b) => near.indexOf(a.body) - near.indexOf(b.body));
  return found;
}

/**
 * Every body worth arriving at from the one being held, nearest first.
 *
 * **[`AIM_RANGE`](#) bounds the partition and not just the drawing**, and that is
 * the difference between an instrument and a decoration. Bounding only the rings
 * left bodies far up the corridor still *winning* release angles they would never
 * be flown to — measured, that squeezed half of the drawn arcs below the minimum
 * width, because a body's window is only the angles where it beats everything
 * else. A destination past the range is not a destination.
 */
function within(state: SimState, held: number): number[] {
  const centre = state.field.bodies[held]!;
  const order: number[] = [];
  for (let i = 0; i < state.field.bodies.length; i++) {
    if (i === held) continue;
    if (away(centre, state.field.bodies[i]!) > AIM_RANGE) continue;
    order.push(i);
  }
  order.sort((a, b) => away(centre, state.field.bodies[a]!) - away(centre, state.field.bodies[b]!));
  return order.slice(0, RINGS);
}

function away(from: Body, to: Body): number {
  return magnitude(to.x - from.x, to.y - from.y);
}

/** One run of consecutive sweep samples that all arrive at the same body. */
interface Arc {
  readonly body: number;
  /** Angles, already unwrapped so `from <= to`. */
  readonly from: number;
  readonly to: number;
}

/**
 * The runs of equal answers in one sweep, joined round the wrap.
 *
 * A body answered by every sample is a body every release reaches — which is a
 * body nobody is aiming at, so it gets the whole circle and the caller decides
 * what that is worth.
 */
function arcsIn(answers: readonly number[]): Arc[] {
  const step = TWO_PI / answers.length;
  const arcs: Arc[] = [];

  // Start where the answer changes, so a run that straddles zero is one run.
  let start = 0;
  while (start < answers.length && answers[start] === answers[answers.length - 1]) start++;
  if (start === answers.length) {
    const only = answers[0]!;
    return only < 0 ? [] : [{ body: only, from: 0, to: TWO_PI }];
  }

  let runFrom = start;
  for (let i = 1; i <= answers.length; i++) {
    const at = (start + i) % answers.length;
    const previous = (start + i - 1) % answers.length;
    if (answers[at] !== answers[previous]) {
      const body = answers[previous]!;
      if (body >= 0) arcs.push({ body, from: runFrom * step, to: (start + i) * step });
      runFrom = start + i;
    }
  }
  return arcs;
}

/**
 * One arc, with its edges bisected and its dot hunted.
 *
 * The edges are where the answer *changes*, which is the honest boundary: one
 * degree further round is a release that arrives somewhere else, and the window
 * is exactly the set that does not.
 */
function measure(
  state: SimState,
  centre: Body,
  body: number,
  from: number,
  to: number,
  candidates: readonly number[],
): Window | null {
  const step = TWO_PI / SWEEP;
  const start = edge(state, centre, body, from, -step, candidates);
  const end = edge(state, centre, body, to - step, step, candidates);

  const target = state.field.bodies[body]!;
  let dot = start;
  let closest = Infinity;
  const span = end - start;
  for (let i = 0; i <= DOT_SAMPLES; i++) {
    const at = start + (span * i) / DOT_SAMPLES;
    const miss = missFrom(state, centre, target, at);
    if (miss < closest) {
      closest = miss;
      dot = at;
    }
  }
  // Ternary search around the best sample: the miss falls and rises once across
  // an arc that arrives at one body, so the minimum is where the two meet.
  let lo = dot - span / DOT_SAMPLES;
  let hi = dot + span / DOT_SAMPLES;
  for (let i = 0; i < DOT_REFINEMENTS; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (missFrom(state, centre, target, a) < missFrom(state, centre, target, b)) hi = b;
    else lo = a;
  }
  dot = (lo + hi) / 2;
  closest = missFrom(state, centre, target, dot);

  const arcHalf = span / 2;
  if (arcHalf <= 0) return null;

  // **The window is the quality band, not the reachable one.** Measured over the
  // sixty seconds this repo ships, an arc drawn where the release merely lands
  // within grab range is p50 **360°** — true, and useless, because the median
  // body is on offer from 1 680 design units against a field spaced nearer 700.
  // Drawn where the release arrives within the body's **floor** instead it is
  // p10 18°, p50 24°, p90 40° — which is spec 06 §2's own worked scale (15° and
  // 40°) and the prototype's fixed 40° wedge agreeing from three directions.
  //
  // The floor is the right line because it is the one guarantee a grab makes: a
  // release inside this arc arrives at a *dive*, and one outside it arrives
  // merely in reach. *"I don't want to highlight grabbable for most planets, but
  // instead: if I release here I'll have a good chance of getting a high quality
  // capture"* (author, 2026-08-29).
  const quality = band(state, centre, target, dot, floorRadius(target), arcHalf);
  const halfWidth = Math.min(arcHalf, Math.max(quality, MIN_HALF_WIDTH));
  return { body, dot, halfWidth, closest, away: away(centre, target) };
}

/**
 * How far either side of the dot the release still passes within `tolerance`.
 *
 * Walked out from the dot rather than bracketed, because the dot is where the
 * miss is smallest by construction: it rises away from it in both directions, so
 * the first crossing on each side is the edge.
 */
function band(
  state: SimState,
  centre: Body,
  target: Body,
  dot: number,
  tolerance: number,
  limit: number,
): number {
  if (missFrom(state, centre, target, dot) > tolerance) return 0;
  let lo = 0;
  let hi = limit;
  for (let i = 0; i < BISECTIONS; i++) {
    const mid = (lo + hi) / 2;
    const out =
      missFrom(state, centre, target, dot + mid) > tolerance ||
      missFrom(state, centre, target, dot - mid) > tolerance;
    if (out) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * Where the answer stops being `body`, walking one sweep step out from `from`.
 *
 * Bisected between the last angle that still arrives there and the first that
 * does not, so a window's width is measured rather than rounded to the sweep.
 */
function edge(
  state: SimState,
  centre: Body,
  body: number,
  from: number,
  step: number,
  candidates: readonly number[],
): number {
  let lo = from;
  let hi = from + step;
  for (let i = 0; i < BISECTIONS; i++) {
    const mid = (lo + hi) / 2;
    if (arrivesAt(state, centre, mid, candidates) === body) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Which body a release at `angle` arrives at, or −1 for none.
 *
 * The **first** body whose grab range the ray enters, traced no further than the
 * craft could survive. A body the ray is already inside the range of answers at
 * once, which is the same thing a press would say standing there.
 */
function arrivesAt(
  state: SimState,
  centre: Body,
  angle: number,
  candidates: readonly number[],
): number {
  const orbit = state.orbit!;
  const radius = pathRadiusAt(orbit, angle);
  const px = centre.x + radius * cos(angle);
  const py = centre.y + radius * sin(angle);
  const dx = -sin(angle) * orbit.direction;
  const dy = cos(angle) * orbit.direction;

  const limit = survives(state, px, py, dx, dy);
  let first = -1;
  let soonest = limit;
  for (const index of candidates) {
    const body = state.field.bodies[index]!;
    const at = closesOn(px, py, dx, dy, body);
    if (at !== null && at < soonest) {
      soonest = at;
      first = index;
    }
  }
  return first;
}

/**
 * How far along the ray the craft makes its closest approach to `body`, or
 * `null` if that approach is behind it or wider than the body's grab range.
 *
 * **Closest approach and not range entry**, and the difference is the whole
 * model. A craft on its orbit is routinely *already* inside a neighbour's grab
 * range — the median body is on offer from 1 680 design units and the field is
 * spaced closer than that — so a rule that answered *"whose range do I enter
 * first"* answers *that* body for every angle on the circle, and the instrument
 * draws one 360° window and says nothing. Asking where the ray gets **nearest**
 * instead makes flying away from a body you are standing beside a release that
 * does not arrive at it, which is what it is.
 */
function closesOn(px: number, py: number, dx: number, dy: number, body: Body): number | null {
  const wx = body.x - px;
  const wy = body.y - py;
  const along = wx * dx + wy * dy;
  if (along <= 0) return null;
  const perp = Math.abs(wx * dy - wy * dx);
  return perp <= grabRange(body) ? along : null;
}

/**
 * How far the craft could coast along this ray before spec 01 §10 ends the run.
 *
 * Three lines and no fourth: the corridor's sides, its foot, and the
 * **fell-behind line**. A ray that climbs never meets the third, because the
 * line trails the high-water mark and climbing raises it.
 */
function survives(state: SimState, px: number, py: number, dx: number, dy: number): number {
  const { centreline, halfWidth, foot } = state.field.corridor;
  let limit = Infinity;

  const side = halfWidth + CORRIDOR_GRACE;
  if (dx > 0) limit = Math.min(limit, (centreline + side - px) / dx);
  else if (dx < 0) limit = Math.min(limit, (centreline - side - px) / dx);

  if (dy > 0) {
    limit = Math.min(limit, (foot - py) / dy);
    limit = Math.min(limit, (fellBehindLine(state.highWater) - py) / dy);
  }
  return Math.max(limit, 0);
}

/**
 * How close to `target` a release at `angle` would pass, in design units.
 *
 * The ray is the exit tangent, which the orbit fixes: the craft's speed does not
 * enter, because a straight line is the same line however fast it is flown. A
 * body **behind** the release is a miss of the whole distance rather than a near
 * one — a release does not go backwards.
 */
function missFrom(state: SimState, centre: Body, target: Body, angle: number): number {
  const orbit = state.orbit!;
  const radius = pathRadiusAt(orbit, angle);
  const px = centre.x + radius * cos(angle);
  const py = centre.y + radius * sin(angle);
  const dx = -sin(angle) * orbit.direction;
  const dy = cos(angle) * orbit.direction;

  const wx = target.x - px;
  const wy = target.y - py;
  const along = wx * dx + wy * dy;
  if (along <= 0) return magnitude(wx, wy);
  return Math.abs(wx * dy - wy * dx);
}
