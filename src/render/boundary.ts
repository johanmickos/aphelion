/**
 * The boundary, painted — the gradient, the motes, the labels and the line.
 *
 * Where the bands are, how far the craft is from each line and how hot that
 * makes it are all [`boundary.ts`](../state/boundary.ts)'s, and its header argues
 * why. What is here is what a renderer genuinely owns: **where the motes are
 * laid out, how many stops a gradient gets, and where the ink goes.** The same
 * split [`rungs.ts`](./rungs.ts) makes one layer down.
 *
 * ## The layer it sits in
 *
 * Spec [05 · §2](../../docs/spec/05-field.md)'s stack runs SKY, DUST, STRATA,
 * BODIES, PLAYER and the boundary is in none of them, because spec 05 is about
 * the field and this is about its edge. It is drawn **after the rungs and before
 * the bodies**, which is Direction 07's own order — its live component lays down
 * rungs, then the gradient, then the band markers, then the line, then the motes
 * — and it is inside the world transform, at world speed, for the reason the
 * rungs are: spec 07 §2 requires it *"drawn in world space, never on the screen
 * edges, so the edge reads as geography rather than as a vignette."*
 *
 * ## ⚠ On a phone almost none of it is on screen, and that is measured
 *
 * Spec [00 · §7](../../docs/spec/00-tokens.md) rules that **the width is the
 * contract** — 1170 design units across, always — and the corridor is 1.9× that.
 * Measured against the fixture field, off the centreline: the picture's edge is
 * at 585, the outer band starts at 452, the fire band at 842 and the line at
 * 1112. So a phone shows **35% of the outer band, none of the fire band, and the
 * line sits 174 m outside the picture** — on every tick of every run, because
 * the camera does not pan sideways.
 *
 * **Nothing here is moved to compensate**, and that is the point: every
 * candidate fix — widening the bands, panning the camera, narrowing the
 * corridor, drawing at the screen edge — spends something that belongs to
 * another spec or to a parked session, and §2 refuses the last one in the same
 * sentence it states the geometry. What a phone does get is the outer band's
 * inner edge and the first third of its gradient, which reads as *there is more
 * out there*. Whether that is the whole answer is the author's, and
 * `docs/plan/m3-the-field.md` carries the table.
 *
 * A desktop window wide enough shows all of it, which is why the bench has never
 * shown this: at 1440 × 900 the whole corridor is on screen.
 */
import { BOARD_PIXEL, DESIGN_HEIGHT, DESIGN_WIDTH } from '../state/design.ts';
import { FIRE_BAND, HEAT_CAP, OUTER_BAND } from '../state/boundary.ts';
import type { BoundarySideView, CameraView } from '../state/types.ts';
import { DUST_FIELD } from './dust.ts';
import type { Seen } from './letterbox.ts';
import { AURORA, ION, dim } from './palette.ts';
import { rng } from './seed.ts';

/**
 * How many motes hang in the outer band, per picture and per side — **32, and it
 * is Direction 07's own density rather than its count.**
 *
 * Its live component scatters **22** motes over a band 96 board pixels wide and
 * 550 tall, which is 4.17e-4 motes per board pixel² — 6.6× the density of the
 * dust in Direction 05, which is the *denser than the field* the design asks
 * for. Carried at [`BOARD_PIXEL`](../state/design.ts) (a density is per area, so
 * it divides by the square) that is 4.63e-5 per design unit².
 *
 * The board spreads that uniformly across both bands and varies only brightness
 * and size with depth. **Spec 07 §2 asks for density too** — *"sparse"* in the
 * outer band against *"dense and bright"* in the fire band, and its acceptance
 * says outright that *"mote density is a pure function of band."* So the board's
 * one density is split in two, keeping the board's total over the same area:
 * with the fire band at twice the outer's density, `390ρ + 270 × 2ρ` over a
 * picture recovers the board's 77 motes, and ρ puts **32 in the outer band and
 * 45 in the fire band**.
 *
 * The count is per **side**, because there are two lines and both are drawn.
 */
export const OUTER_MOTES = 32;

/** How many hang in the fire band — twice the density over less width. */
export const FIRE_MOTES = 45;

/**
 * The most either band may hold, however the count is moved — **twice its own
 * base**, which is [`DUST_CEILING`](./dust.ts)'s factor and its shape.
 *
 * The field is laid out to this once at construction and the count draws a
 * **prefix** of it, so moving the count adds and removes motes rather than
 * moving the ones already there. That is dust's own argument and it is what
 * makes the number safe to move at all: re-laying the field out at a new count
 * would teleport every mote in the picture on the frame the slider was dragged,
 * and a knob that teleports what it is measuring cannot be judged by eye.
 *
 * It costs its objects once and nothing per frame — the draw walks the prefix.
 */
const MOTE_CEILING = 2;

/**
 * How many depth steps a band's brightness and size are quantised into.
 *
 * The board ramps both continuously with depth, and a continuous ramp is a
 * `globalAlpha` change **per mote**. [`dust.ts`](./dust.ts) makes the argument
 * this borrows: a per-mote alpha is a state change per mote, so the five dust
 * brightnesses are five batched strokes rather than forty, and the sky quantises
 * its own into three for the same reason.
 *
 * **Three per band**, so the two bands together carry six steps across the
 * boundary — which is more than the two the spec's table names and few enough to
 * batch. At three, a step is 43 m deep and the alpha moves by 0.10 across it,
 * which is under the difference between two adjacent dust bands.
 */
const MOTE_STEPS = 3;

/**
 * What a mote is worth at each end of each band — spec 07 §2's table, and it is
 * the board's own continuous ramp discretised at the same two points.
 *
 * The board runs `α = 0.25 + 0.6 × depth` and `r = 1.6 + 1.4 × depth` across the
 * whole boundary, and switches its bloom on at `depth > 0.55`. Spec 07 §2 states
 * that as two rows — outer α 0.25–0.55 and r 1.6–2.4 with no bloom, fire α
 * 0.55–0.85 and r 2.4–3.0 with a 5px bloom — and the two agree: **the spec's
 * band boundary is the board's depth 0.55**, which is 43 board pixels from the
 * line against a fire band that starts at 46. The table is the ramp, cut where
 * the bloom switches on.
 */
const OUTER_ALPHA = [0.25, 0.55] as const;
const FIRE_ALPHA = [0.55, 0.85] as const;
const OUTER_RADIUS = [1.6 * BOARD_PIXEL, 2.4 * BOARD_PIXEL] as const;
const FIRE_RADIUS = [2.4 * BOARD_PIXEL, 3.0 * BOARD_PIXEL] as const;

/** Spec 07 §2's **5px bloom** on a fire-band mote, and nothing on an outer one. */
const FIRE_BLOOM = 5 * BOARD_PIXEL;

/**
 * How dim a mote is drawn at zero heat, as a fraction of its own alpha —
 * **0.55, and it is an opening position** (`docs/spec/README.md`).
 *
 * Spec 07 §2's label row says the label *"rises with `heat` exactly as the
 * gradient and the motes do"*, which says the motes rise with heat and states no
 * floor. The gradient rises from **nothing**, so the same reading applied
 * literally puts the motes out whenever the edge is calm — and the mote is the
 * *price tag*. A band that stops advertising what it pays at the one moment the
 * player is deciding whether to come in is the opposite of the board's own brief
 * (*"the edge should be somewhere you aim at, not away from"*), and Direction
 * 07's own motes do not scale with heat at all.
 *
 * So the two readings are split: the motes rise with heat, **from a floor**,
 * which is [`decay.ts`](../state/decay.ts)'s grammar and the same shape the
 * compass's filament already uses. At 0.55 a resting band is a little over half
 * lit and a committed dive brightens it 1.8×, so the band answers a dive in the
 * same channel the gradient does without ever going out.
 *
 * It is on the bench, because which of the two readings is right is a judgement
 * about a moving picture, and it is the number that decides it.
 */
export const MOTE_AT_REST = 0.55;

/**
 * The gradient's two lit stops — the board's `heat × 0.22` and `heat × 0.6`.
 *
 * The board places the first at 0.6 of a span that starts 40 board pixels
 * outside the outer band, which lands **54 board pixels from the line against a
 * fire band that starts at 46**. So it is at the fire band's own edge to within
 * eight pixels, and it is stated here as the band edge rather than as a fraction
 * of a span: the stops then mean something (*the boundary brightens once, at the
 * price step*) instead of being a number that has to be re-derived if a band
 * moves.
 */
const WASH_AT_FIRE = 0.22;
const WASH_AT_LINE = 0.6;

/**
 * The band edges, drawn as dashed lines — spec 07 §2 states all four numbers and
 * the board draws them: 1px, dash 4/6, α 0.25 at `line − 220 m` and 0.40 at
 * `line − 90 m`.
 *
 * **They do not scale with `heat`**, which the spec says outright, and it is
 * what makes the bands read as three named regions rather than one smooth ramp —
 * the ruling in spec 07's own header requires that, because it is what a price
 * step needs to be legible at all.
 */
const EDGE_WIDTH = 1 * BOARD_PIXEL;
const EDGE_DASH = [4 * BOARD_PIXEL, 6 * BOARD_PIXEL];
const EDGE_AT_OUTER = 0.25;
const EDGE_AT_FIRE = 0.4;

/**
 * The line itself — spec 07 §3's **2.5px stroke whose α and bloom also rise with
 * `heat`**, and the board's `0.6 + heat × 0.4`.
 *
 * **Its bloom is the gradient's own shoulder rather than a second glow.** The
 * board reaches for `shadowBlur` here; this does not, for two reasons that point
 * the same way. The wash above already peaks at `heat × 0.6` *at the line* and
 * already rises with heat, so a shadow would be a second system saying one thing
 * — and a canvas shadow is a cost `pnpm profile`'s census cannot see, which is
 * exactly the hole `blended` was added to close when `fillRect` area was
 * invisible. A gradient it can count.
 */
const LINE_WIDTH = 2.5 * BOARD_PIXEL;
const LINE_AT_REST = 0.6;
const LINE_AT_HEAT = 0.4;

/**
 * ## ⚠ The `×2` and `×3` labels are gone (author, 2026-09-01)
 *
 * They were built, because spec 07's header carries a ruling of 2026-08-27 that
 * put them back: the board's second law said *"reward is shown, never spoken"*
 * and refused Direction 03's in-world band label, and the author overturned that
 * refusal. Flown, they overturned it again the other way:
 *
 * > *"I don't want the 2x 3x text in the hot zone. Let the user discover that
 * > themselves."*
 *
 * So **the board's original second law stands after all** — the glimmer is the
 * signpost and there is no caption. What is left saying what a band pays is what
 * spec 07 §1 always had: motes *"denser and brighter deeper in"*, which is a
 * thing the player reads by going there.
 *
 * Nothing in this file draws text now, and `test/render/bands.test.ts` asserts
 * that outright rather than asserting the text says a price — which is the
 * stronger form of §7's *"no arrows, no RISK ZONE, nothing that says turn"*, and
 * the one that cannot drift.
 */

/** One mote, in its band's own coordinates. It has no velocity, by construction. */
interface Mote {
  /**
   * How deep into its band it sits, 0 at the band's field-facing edge and 1 at
   * its line-facing one — so *deeper* is always *toward the line*, on both sides,
   * and the ramps below are written once.
   */
  readonly depth: number;
  /** Down the tile, 0 to `DUST_FIELD`. */
  readonly y: number;
}

export type Motes = readonly Mote[];

/** The two bands' worth of motes, laid out once. */
export interface BoundaryMotes {
  readonly outer: Motes;
  readonly fire: Motes;
}

/**
 * A field of boundary motes, laid out from a **render** seed
 * ([`seed.ts`](./seed.ts)) — the same generator the sky and the dust use, and
 * deliberately not the simulation's, so a mote costs the run nothing.
 *
 * **In design units, never in device pixels**, which is the starfield's own
 * lesson: a field placed in viewport units teleports on a resize and changes
 * density with the screen.
 *
 * It repeats over [`DUST_FIELD`](./dust.ts), which is that layer's tile height
 * and is imported rather than restated because it is the same fact — *how tall
 * the world's mote field is before it comes round again* — and its argument
 * carries unchanged: eight pictures is 6 752 m, which clears the whole of the
 * fixture field's 6 828 m foot-to-top, so a mote a player has seen once does not
 * come back inside a run.
 */
export function boundaryMotes(seed: number): BoundaryMotes {
  const next = rng(seed);
  const lay = (count: number): Motes => {
    const motes: Mote[] = [];
    // Per picture, over the tile — the same shape `dust` is laid out in, so the
    // density is a density and not a count that changes meaning with the tile.
    for (let i = 0; i < count * MOTE_CEILING * (DUST_FIELD / DESIGN_HEIGHT); i++) {
      motes.push({ depth: next(), y: next() * DUST_FIELD });
    }
    return motes;
  };
  // The outer band first, so that changing the fire band's count cannot move a
  // mote in the outer one — the seed order is load-bearing for the same reason
  // `dust` records.
  const outer = lay(OUTER_MOTES);
  return { outer, fire: lay(FIRE_MOTES) };
}

/**
 * Draw the boundary, in **world space**, between the rungs and the bodies.
 *
 * The caller is expected to have translated into the world already — the same
 * state [`draw`](./index.ts) is in when it draws a rung — and `seen` is what
 * this device can show, in design coordinates.
 */
export function drawBoundary(
  context: CanvasRenderingContext2D,
  motes: BoundaryMotes,
  boundary: readonly BoundarySideView[],
  camera: CameraView,
  seen: Seen,
): void {
  if (boundary.length === 0) return;
  // `seen` is in design coordinates and this draws in world ones. The design
  // space is centred on the camera, so the two differ by exactly that offset —
  // the same conversion [`rungs.ts`](./rungs.ts) and [`dust.ts`](./dust.ts) open
  // with.
  const left = seen.left + camera.x - DESIGN_WIDTH / 2;
  const right = seen.right + camera.x - DESIGN_WIDTH / 2;
  const top = seen.top + camera.y - DESIGN_HEIGHT / 2;
  const bottom = seen.bottom + camera.y - DESIGN_HEIGHT / 2;

  for (const side of boundary) {
    // **Absent until the craft goes out to the wall** — the author's ruling of
    // 2026-09-01, and `CONTEXT.md`'s decay rule that *"a thing that is over is
    // absent"*. Nothing is drawn at all, so the cost of the layer goes with the
    // layer, which is the same shape the rungs' switched-off bow is in. It is the
    // first test rather than an alpha of zero for exactly that reason: on a phone
    // this is the state for the majority of every run.
    if (side.presence <= 0) continue;

    // The band the craft is not near is still drawn, and still at its own heat —
    // but a side whose whole boundary is off the picture is nothing to draw at
    // all. On a phone this is never true and on a wide window it is never true;
    // it is the narrow window in between that it exists for.
    const inner = side.line + OUTER_BAND * side.inward;
    if (side.inward === 1 ? inner < left : inner > right) continue;

    // **The token is the one thing a shelter changes** — spec 05 §5, ruled
    // 2026-09-01: the bands keep their geometry and their closing-speed law
    // inside one and are drawn in **AURORA instead of ION**, so the edge still
    // says how hard you are diving at it and says *strange* where it would say
    // *risk*. Nothing else below reads `sheltered`, which is the whole of what
    // *one channel changes* means.
    const token = side.sheltered ? AURORA : ION;

    wash(context, side, token, top, bottom, left, right);
    edges(context, side, token, top, bottom);
    stroke(context, side, token, top, bottom);
    scatter(context, motes, side, token, top, bottom, left, right);
  }
}

/**
 * The gradient — spec 07 §3's *"ION gradient from the outer band's inner edge to
 * the line"*, at this side's own heat.
 *
 * One linear gradient and one `fillRect` per side. It is the only thing in this
 * file that costs area, and the area is the band's: 660 design units by whatever
 * of the picture is on screen, which on a phone is a third of that again.
 */
function wash(
  context: CanvasRenderingContext2D,
  side: BoundarySideView,
  token: string,
  top: number,
  bottom: number,
  left: number,
  right: number,
): void {
  const from = side.line + OUTER_BAND * side.inward;
  const gradient = context.createLinearGradient(from, 0, side.line, 0);
  gradient.addColorStop(0, dim(token, 0));
  // Where the price steps, which is where the board puts its own middle stop to
  // within eight board pixels — see [`WASH_AT_FIRE`](#wash_at_fire).
  gradient.addColorStop(
    (OUTER_BAND - FIRE_BAND) / OUTER_BAND,
    dim(token, side.heat * WASH_AT_FIRE * side.presence),
  );
  gradient.addColorStop(1, dim(token, side.heat * WASH_AT_LINE * side.presence));
  context.save();
  context.fillStyle = gradient;
  // **The ramp is pinned to the line and the paint is clipped to the picture**,
  // and the two are separate on purpose: a linear gradient's stops live in the
  // gradient's own space, so narrowing the rect moves no colour. What it saves is
  // real — on a phone only a fifth of the band is on screen, and painting the
  // whole 660 units of it cost **1.13 screens a frame** of blended area against
  // the 0.23 that is actually visible. Measured through `pnpm profile`'s census,
  // which is the counter that exists because `fillRect` area was once invisible
  // to it.
  const near = Math.max(left, Math.min(from, side.line));
  const far = Math.min(right, Math.max(from, side.line));
  if (far > near) context.fillRect(near, top, far - near, bottom - top);
  context.restore();
}

/**
 * The two band edges, dashed — spec 07 §2, and they do not move with `heat`.
 *
 * They are what makes the boundary read as three named regions rather than one
 * ramp, which the ruling that put the labels back requires: a price step nobody
 * can see is a price nobody can read.
 */
function edges(
  context: CanvasRenderingContext2D,
  side: BoundarySideView,
  token: string,
  top: number,
  bottom: number,
): void {
  context.save();
  context.lineWidth = EDGE_WIDTH;
  context.setLineDash(EDGE_DASH);
  for (const [depth, alpha] of [
    [OUTER_BAND, EDGE_AT_OUTER],
    [FIRE_BAND, EDGE_AT_FIRE],
  ] as const) {
    const x = side.line + depth * side.inward;
    context.strokeStyle = dim(token, alpha * side.presence);
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
  }
  context.setLineDash([]);
  context.restore();
}

/** The line — spec 07 §3's 2.5px stroke, brightening with `heat`. */
function stroke(
  context: CanvasRenderingContext2D,
  side: BoundarySideView,
  token: string,
  top: number,
  bottom: number,
): void {
  context.save();
  context.lineWidth = LINE_WIDTH;
  context.strokeStyle = dim(
    token,
    (LINE_AT_REST + LINE_AT_HEAT * (side.heat / HEAT_CAP)) * side.presence,
  );
  context.beginPath();
  context.moveTo(side.line, top);
  context.lineTo(side.line, bottom);
  context.stroke();
  context.restore();
}

/**
 * The motes, and the one label each band carries.
 *
 * Batched by depth step — one path per step, so a band costs three fills and not
 * thirty-two ([`MOTE_STEPS`](#mote_steps)). The fire band's bloom is a fourth
 * pass per step at a wider radius and a lower alpha rather than a canvas shadow,
 * for the reason [`LINE_WIDTH`](#line_width) gives: a shadow is a cost the census
 * cannot see, and this is the layer most likely to be drawn many times.
 */
function scatter(
  context: CanvasRenderingContext2D,
  motes: BoundaryMotes,
  side: BoundarySideView,
  token: string,
  top: number,
  bottom: number,
  left: number,
  right: number,
): void {
  // Lit from a floor rather than from nothing — see [`MOTE_AT_REST`](#mote_at_rest).
  const lit = (MOTE_AT_REST + (1 - MOTE_AT_REST) * (side.heat / HEAT_CAP)) * side.presence;
  context.save();
  for (const band of [2, 3] as const) {
    const field = band === 3 ? motes.fire : motes.outer;
    // A prefix of the laid-out field — see [`MOTE_CEILING`](#mote_ceiling).
    const shown = Math.min(
      field.length,
      (band === 3 ? FIRE_MOTES : OUTER_MOTES) * (DUST_FIELD / DESIGN_HEIGHT),
    );
    const alphas = band === 3 ? FIRE_ALPHA : OUTER_ALPHA;
    const radii = band === 3 ? FIRE_RADIUS : OUTER_RADIUS;
    const from = band === 3 ? FIRE_BAND : OUTER_BAND;
    const to = band === 3 ? 0 : FIRE_BAND;

    for (let step = 0; step < MOTE_STEPS; step++) {
      // The step's own place in the band, taken at its middle so the three read
      // as samples of the board's ramp rather than as its two ends and a gap.
      const at = (step + 0.5) / MOTE_STEPS;
      const radius = radii[0] + (radii[1] - radii[0]) * at;
      context.globalAlpha = (alphas[0] + (alphas[1] - alphas[0]) * at) * lit;
      context.fillStyle = token;
      context.beginPath();
      let drew = false;
      for (let i = step; i < shown; i += MOTE_STEPS) {
        const mote = field[i]!;
        // The mote's own depth decides its step, so *brighter and bigger deeper
        // in* is literally true rather than an accident of the seed order. A
        // mote outside this step's slice is drawn by the pass that owns it.
        const slice = Math.min(MOTE_STEPS - 1, Math.floor(mote.depth * MOTE_STEPS));
        if (slice !== step) continue;
        const y = top + wrap(mote.y - top, DUST_FIELD);
        if (y > bottom) continue;
        // Depth 0 is the band's field-facing edge and 1 its line-facing one, so
        // this reads the same on both sides and no mote is ever placed past the
        // line — spec 07 §2's *"GONE: absent, even the reward stops promising."*
        const x = side.line + (from + (to - from) * mote.depth) * side.inward;
        // **Culled sideways as well as vertically**, which is not the ordinary
        // belt-and-braces it looks like: on a phone the line sits 176 m outside
        // the picture, so *every* fire-band mote and two thirds of the outer
        // band's are off it. Without this the target device pays for a hundred
        // arcs a frame that the clip then throws away — and it is the one device
        // whose budget matters (ADR-0010).
        if (x + radius < left || x - radius > right) continue;
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, TWO_PI);
        drew = true;
      }
      if (!drew) continue;
      context.fill();
      if (band !== 3) continue;
      // Spec 07 §2's 5px bloom, as a wider and dimmer second pass over the same
      // motes. One extra fill per step, never one per mote.
      context.globalAlpha *= BLOOM_STRENGTH;
      context.beginPath();
      for (let i = step; i < shown; i += MOTE_STEPS) {
        const mote = field[i]!;
        if (Math.min(MOTE_STEPS - 1, Math.floor(mote.depth * MOTE_STEPS)) !== step) continue;
        const y = top + wrap(mote.y - top, DUST_FIELD);
        if (y > bottom) continue;
        const x = side.line + (from + (to - from) * mote.depth) * side.inward;
        if (x + radius + FIRE_BLOOM < left || x - radius - FIRE_BLOOM > right) continue;
        context.moveTo(x + radius + FIRE_BLOOM, y);
        context.arc(x, y, radius + FIRE_BLOOM, 0, TWO_PI);
      }
      context.fill();
    }
  }
  context.restore();
}

/**
 * How much of its own alpha a fire mote's bloom pass is drawn at.
 *
 * A halo has to read as light spilling off the mote rather than as a second,
 * larger mote, and it covers `(r + 5px)² / r²` — about six times — the area. A
 * fifth is where the two products are comparable, which is what *spilling* looks
 * like.
 */
const BLOOM_STRENGTH = 0.2;

const TWO_PI = Math.PI * 2;

/** Positive remainder, so a field a long way up the world still wraps forwards. */
function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}
