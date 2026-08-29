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
 * [01 · §2](../../docs/spec/01-swing.md)). So a release is not a trajectory to
 * integrate — it is a **straight ray**, and where it goes is a line-and-circle
 * problem.
 *
 * **The nose points along the exit tangent for the whole orbit** (`CONTEXT.md`).
 * So the release angle *is* the aim: the craft's position on the orbit fixes the
 * direction it leaves in, with nothing else to steer by. That is why the compass
 * can be drawn on the orbit path — the path and the aim are the same coordinate,
 * which is spec [01 · §11](../../docs/spec/01-swing.md)'s tension in one
 * sentence: the **envelope** is a shape in time and the **window** is a shape in
 * angle, and hitting both means shaping the dive so they arrive together.
 *
 * ## The set of rings is fixed for the whole swing, and that is the point
 *
 * M2.3 worked out which body each release angle would *arrive at* and made a
 * window of each run of equal answers. Flown, windows blinked in and out as the
 * orbit rounded and the answers shifted under them — *"sometimes the compass
 * windows appear and then disappear. This is unacceptable. Once they're on the
 * compass they should stay"* (author, 2026-08-29).
 *
 * So the targets are chosen from the **field** rather than from the geometry:
 * the bodies above the one being held, within [`AIM_RANGE`](#), nearest first.
 * Nothing in that changes while a body is held, so nothing can blink. It is the
 * prototype's `aimTargets`, including the rule that gives it its shape —
 * **upward only**, because *"offering the planet you just came from as an equal
 * option invites you to bounce between two bodies forever, which is a local
 * maximum neither the compass nor the score should signpost."*
 *
 * ## The dot is exact and the window is not
 *
 * The **dot** is the release whose exit tangent points straight at the body, and
 * it is solved rather than sampled: the signed heading error crosses zero there,
 * so a coarse sweep brackets the crossing and bisection lands on it. That is the
 * one number the author asked to be exactly right — *"a planet dot at the orbit
 * location where, if I release, I'll have a perfect tangent to the planet."*
 *
 * The **window** around it is deliberately generous: *"the windows can be a bit
 * more hand-wavy, they don't need mathematical/physics-based precision"* and
 * *"most of the windows should be a bit wider to give me a better opportunity to
 * score well."* It is still earned from the geometry — the arc over which a
 * release still arrives near the body — and [`WINDOW_REACH`](#) is how generous
 * *near* is.
 *
 * ## A blocked window is dimmed and never removed
 *
 * A release that runs into another body on the way is worth knowing about, and
 * the prototype says why: *"a marker that points at a planet you cannot actually
 * reach is worse than no marker, and paying points for aiming at one would be
 * worse still."* It is reported rather than dropped, because dropping it is the
 * blinking the author rejected — the picture dims it instead.
 */
import type { Body } from './body.ts';
import { floorRadius } from './body.ts';
import { magnitude } from './math.ts';
import { pathRadiusAt } from './orbit.ts';
import { angleOf, cos, sin } from './trig.ts';
import type { SimState } from './types.ts';
import { SCALE } from './units.ts';

/**
 * One arc of the compass (`CONTEXT.md`: **window**) — the releases that reach one
 * body, and the one that reaches it exactly.
 *
 * Angles are **absolute position angles about the held body**, which is the
 * coordinate the whole instrument is drawn in: the craft's own angle is the
 * hand, a window is an arc, and the gap between them is the grade.
 */
export interface Window {
  /** Which body it reaches, as an index into the field. */
  readonly body: number;
  /** The release whose exit tangent points straight at it — the **dot**. */
  readonly dot: number;
  /**
   * Half the arc's width, in radians. Spec 06's zones are fractions of the whole.
   *
   * **This is the width the player is graded on, because it is the width they are
   * shown**, floor and all: the prototype's rule is that *"the player must never
   * be scored against something they cannot see. One sweep produces the rings
   * that get drawn AND the alignment that gets paid, so the two cannot drift
   * apart."*
   */
  readonly halfWidth: number;
  /** How far the body is from the one being held — what its ring's radius says. */
  readonly away: number;
  /**
   * Whether the straight run from the dot hits another body first.
   *
   * Reported rather than removed: a window that vanishes is the blinking this
   * instrument was rebuilt to stop, and a release into a wall is worth saying.
   */
  readonly blocked: boolean;
}

/**
 * How far a body may be from the one being held and still get a ring — the
 * prototype's `AIM_RANGE`, converted.
 *
 * Spec 00 §6 says *"one ring per **reachable** body"* and does not say what
 * reachable is. The prototype does, with its reason: *"about two body-spacings:
 * the next step of the climb and the one after, no further. Anything beyond that
 * is a long, featureless coast, and signposting it invites the player to aim past
 * the interesting part of the field."*
 */
export const AIM_RANGE = 800 * SCALE;

/**
 * How many bodies get a ring — spec 00 §6's *"one ring per reachable body"*,
 * with **reachable** measured rather than guessed.
 *
 * Over 120 pilot runs and 342 releases that reached another body, the body the
 * craft actually grabs next is among the four nearest to the one it just left
 * **100%** of the time — 99.7% at three, 92.7% at two. Four is where the cohort
 * runs out, and it is close to what Direction 01's board draws.
 */
export const RINGS = 4;

/**
 * How near a release has to pass to count as inside the window, in multiples of
 * the body's **floor**.
 *
 * The floor is the one guarantee a grab makes, so a release inside one floor
 * arrives at a *dive* rather than merely in reach — which is what made the arc a
 * quality band instead of a reachability band. **Two of them**, because flown at
 * one the arcs were right in kind and mean in size: *"most of the windows should
 * be a bit wider to give me a better opportunity to score well"*, and *"they
 * don't need mathematical/physics-based precision"* (author, 2026-08-29).
 *
 * An opening position, and on the bench.
 */
export const WINDOW_REACH = 2;

/**
 * The narrowest arc the compass will draw, as a half-width.
 *
 * **Ruled from flying it** (author, 2026-08-29): *"for very distant planets, I
 * think we still need to show a window, which makes me think we need a minimum
 * width."* An arc the geometry earns nothing of still opens to this, and the
 * grading opens with it. At this width spec 06 §2's 1.5° floor under PERFECT is
 * still what binds, so the top word does not get easier for being far away.
 */
export const MIN_HALF_WIDTH = (7.5 * Math.PI) / 180;

/** Coarse samples the dot's bracket is found in, and halvings it is landed with. */
const SWEEP = 24;
const BISECTIONS = 14;

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
 * The bodies worth aiming at from the one being held, nearest first.
 *
 * **Upward, within reach, and capped** — and a pure function of the field and the
 * anchor, so it cannot change while a body is held. That is what stops a window
 * blinking: the ring set is decided by where the bodies are, never by where the
 * craft happens to be on its orbit.
 */
export function aimTargets(state: SimState): number[] {
  const held = state.heldBody;
  if (held === null) return [];
  const anchor = state.field.bodies[held]!;

  const near: Array<{ index: number; away: number }> = [];
  for (let i = 0; i < state.field.bodies.length; i++) {
    if (i === held) continue;
    const body = state.field.bodies[i]!;
    if (body.y >= anchor.y) continue;
    const away = magnitude(body.x - anchor.x, body.y - anchor.y);
    if (away <= AIM_RANGE) near.push({ index: i, away });
  }
  near.sort((a, b) => a.away - b.away);
  return near.slice(0, RINGS).map((target) => target.index);
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
  const anchor = state.field.bodies[held]!;

  return aimTargets(state).map((index) => {
    const target = state.field.bodies[index]!;
    const dot = releaseAngleFor(state, anchor, target);
    const earned = band(state, anchor, target, dot, floorRadius(target) * WINDOW_REACH);
    return {
      body: index,
      dot,
      halfWidth: Math.max(earned, MIN_HALF_WIDTH),
      away: magnitude(target.x - anchor.x, target.y - anchor.y),
      blocked: blockedFrom(state, anchor, target, dot),
    };
  });
}

/**
 * The release whose exit tangent points **straight at** the target.
 *
 * The signed heading error crosses zero there, so a coarse sweep brackets a
 * crossing and bisection lands on it — the prototype's method, and it resolves to
 * a thousandth of a degree for a fraction of what sampling the whole circle for a
 * minimum costs. A sign change that jumps by more than π is the wrap rather than
 * a root, and is skipped.
 */
export function releaseAngleFor(state: SimState, anchor: Body, target: Body): number {
  const err = (angle: number): number => headingError(state, anchor, target, angle);

  let best = 0;
  let smallest = Infinity;
  let previousAngle = 0;
  let previous = err(0);

  for (let k = 1; k <= SWEEP; k++) {
    const angle = (k / SWEEP) * TWO_PI;
    const here = err(angle);
    if (Math.abs(here) < smallest) {
      smallest = Math.abs(here);
      best = angle;
    }
    if (previous * here < 0 && Math.abs(previous - here) < Math.PI) {
      let lo = previousAngle;
      let hi = angle;
      let low = previous;
      for (let i = 0; i < BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        const at = err(mid);
        if (low * at <= 0) hi = mid;
        else {
          lo = mid;
          low = at;
        }
      }
      const root = (lo + hi) / 2;
      const there = Math.abs(err(root));
      if (there < smallest) {
        smallest = there;
        best = root;
      }
    }
    previousAngle = angle;
    previous = here;
  }
  return best;
}

/**
 * How far the exit tangent at `angle` points away from the target, signed.
 *
 * Zero is a perfect aim. The sign is what makes the root findable: a minimum of
 * the *unsigned* miss has to be hunted, and a zero crossing can be bracketed.
 */
function headingError(state: SimState, anchor: Body, target: Body, angle: number): number {
  const at = releasePoint(state, anchor, angle);
  return wrap(angleOf(at.dx, at.dy) - angleOf(target.x - at.x, target.y - at.y));
}

/** Where the craft would be and which way it would leave, releasing at `angle`. */
function releasePoint(
  state: SimState,
  anchor: Body,
  angle: number,
): { x: number; y: number; dx: number; dy: number } {
  const orbit = state.orbit!;
  const radius = pathRadiusAt(orbit, angle);
  return {
    x: anchor.x + radius * cos(angle),
    y: anchor.y + radius * sin(angle),
    dx: -sin(angle) * orbit.direction,
    dy: cos(angle) * orbit.direction,
  };
}

/**
 * How far either side of the dot a release still passes within `tolerance`.
 *
 * Walked out from the dot, which is where the miss is smallest by construction:
 * it rises away from it in both directions, so the first crossing on each side is
 * the edge. Bounded at a quarter turn, because an arc wider than that is a body
 * every release reaches and is not being aimed at.
 */
function band(state: SimState, anchor: Body, target: Body, dot: number, tolerance: number): number {
  if (missFrom(state, anchor, target, dot) > tolerance) return 0;
  let lo = 0;
  let hi = Math.PI / 2;
  for (let i = 0; i < BISECTIONS; i++) {
    const mid = (lo + hi) / 2;
    const out =
      missFrom(state, anchor, target, dot + mid) > tolerance ||
      missFrom(state, anchor, target, dot - mid) > tolerance;
    if (out) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * How close to `target` a release at `angle` would pass, in design units.
 *
 * The ray is the exit tangent, and the craft's speed does not enter: a straight
 * line is the same line however fast it is flown. A body **behind** the release
 * is a miss of the whole distance rather than a near one — a release does not go
 * backwards.
 */
function missFrom(state: SimState, anchor: Body, target: Body, angle: number): number {
  const at = releasePoint(state, anchor, angle);
  const wx = target.x - at.x;
  const wy = target.y - at.y;
  return wx * at.dx + wy * at.dy <= 0 ? magnitude(wx, wy) : Math.abs(wx * at.dy - wy * at.dx);
}

/**
 * Whether the straight run from the dot to the target hits something else first.
 *
 * The held body is exempt: the craft leaves along its own tangent, which grazes
 * it by construction and is the one contact spec 01 §10 promises will never kill.
 */
function blockedFrom(state: SimState, anchor: Body, target: Body, dot: number): boolean {
  const at = releasePoint(state, anchor, dot);
  const dx = target.x - at.x;
  const dy = target.y - at.y;
  const length = magnitude(dx, dy);
  if (length < 1) return false;
  const ux = dx / length;
  const uy = dy / length;

  for (const body of state.field.bodies) {
    if (body === target || body === anchor) continue;
    const px = body.x - at.x;
    const py = body.y - at.y;
    const along = px * ux + py * uy;
    if (along <= 0 || along >= length) continue;
    if (Math.abs(px * uy - py * ux) < body.radius) return true;
  }
  return false;
}

/** An angle folded onto (−π, π]. */
function wrap(angle: number): number {
  let d = angle % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
}
