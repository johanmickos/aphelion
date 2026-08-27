/**
 * What a body looks like, and the state it is in.
 *
 * SPLIT OUT OF `world.ts`, WHICH WAS TWO FILES AND SAID SO. Its header read
 * "World layer: hazard zones and bodies", and the body renderer sat below four
 * hundred lines about hazard bands, the backtrack floor, the finish line, the
 * speed carpet and the motes — none of which a body has anything to do with.
 * `bodies.ts` promises that adding a type costs "a row here plus a case in the
 * renderer's draw switch". Direction 04 adds four types, so the switch had to
 * become findable before they arrive rather than after.
 *
 * DIRECTION 04: A PLANET IS A LAMP, NOT A ROCK. What was here was a cached radial
 * gradient lit from the upper left — simulation vocabulary, and shading implies a
 * light source somewhere in depth that this world does not have. The replacement
 * is flat anatomy that emits its own identity: a near-void disc, concentric
 * strata, a rim in the body's identity hue, a core that is the type slot, and the
 * tide.
 *
 * THREE OF THE BOARD'S CLAIMS DID NOT SURVIVE MEASUREMENT, and each departure is
 * recorded at the code that makes it: see `TIDE_ONLY_ON_THE_OFFER`, `pull()` and
 * `SPENT_RECOVER`. The board is the intent; the corpus decided the details.
 *
 * THE GRADIENT CACHE WENT WITH THE GRADIENT. `BodyRenderer` used to hold a
 * `Map<radius, CanvasGradient>` and invalidate it whenever `cam.scale` moved,
 * which existed solely to make one expensive radial fill affordable. Flat anatomy
 * has no gradient, so the cache and its invalidation dance are both gone — the
 * renderer's only remaining state is the two things that genuinely persist
 * between frames, and both are below.
 */
import type { Body } from '../sim/types.ts';
import type { SimConfig } from '../sim/config.ts';
import { BODY_TYPES } from '../sim/bodies.ts';
import type { BodyTypeId } from '../sim/bodies.ts';
import { gAccel } from '../sim/orbit.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY, visibleWorldY } from './camera.ts';
import type { Frame } from './frame.ts';
import { DUSK, VOID, withAlpha } from './palette.ts';
import { mix } from './theme.ts';
import type { EmissionTier, RGB, Theme } from './theme.ts';

/**
 * What colour a body wears, wherever it is drawn.
 *
 * ONE DEFINITION, AND IT MOVED HERE TO BECOME ONE. This was `markerHue`, private
 * to `edge-markers.ts`, which was fine while an edge dot was the only thing that
 * needed it. Direction 04's whole legend-free premise is that a planet "is the
 * same colour its compass ring wears, so target and window never need a legend" —
 * which is a claim that two copies of this expression cannot keep. `finishLineY`
 * and `runInBand` are in `AGENTS.md` for exactly this failure, and both of those
 * agreed right up until they did not.
 *
 * A strange body wears AURORA instead: violet is outside the identity band by
 * decree, and means the rules are different there.
 *
 * Indexed by POSITION IN THE FIELD, which is what makes neighbours differ: the
 * band steps at least 80 degrees between consecutive entries, so two bodies a
 * player meets one after another can never be confused for each other.
 */
export function bodyHue(theme: Theme, b: Body, index: number): RGB {
  return BODY_TYPES[b.type as BodyTypeId]?.strange ? theme.aurora : theme.identity(index);
}

// ------------------------------------------------------------------- anatomy

/**
 * Rim and tide are constant in DESIGN px whatever the body's radius, which is
 * Direction 04's scale rule and the reason it is stated: small bodies then read
 * as bright rings and giants as thin luminous horizons, so size reads as size and
 * nothing else has to encode it. World units are design units — the camera scales
 * a 390-wide window — so a design px is `cam.scale` screen px.
 */
const RIM_W = 2.5;
const TIDE_W = 4;

/**
 * Concentric internal rings, as fractions of the radius, with the board's alphas.
 *
 * Structure without texture: the refused alternative was craters and noise, which
 * at speed reads as dirt rather than as anatomy. Two rings is what survives being
 * 34px across on a phone; a third measured as a smudge.
 */
const STRATA: readonly { r: number; a: number }[] = Object.freeze([
  { r: 0.68, a: 0.22 },
  { r: 0.42, a: 0.14 },
]);

/** The core dot, as a fraction of the radius. Body types replace it with a glyph. */
const CORE_R = 0.17;

/**
 * The body fill: a hair above the sky, never a colour.
 *
 * Direction 01's law is that every ground is VOID and true black belongs to the
 * anomaly's cloud gaps. Direction 04 states this fill as `#100C20`, which is a
 * ninth colour and therefore not available — `VOID` lifted 7% toward `DUSK` is
 * (17,14,30) against the board's (16,12,32), which is the same intent expressed
 * in tokens that a region can retune.
 *
 * A full-colour fill was refused on the board and the reason is load-bearing: the
 * craft is the brightest thing in the game, and a disc of identity hue under it
 * competes for that.
 */
const FILL = withAlpha(mix(VOID, DUSK, 0.07), 1);

/**
 * THE FEEL SETTINGS ARE IN `RenderConfig`, NOT HERE — `bodyRimRest`, `bodyEmitAt`,
 * `bodyTideLagRest`, `bodyTideLagFull` and `bodySpentRecover`, each with its
 * reasoning at its declaration.
 *
 * They moved because none of them has been flown. Every number in this file was
 * argued from the corpus or from the board, and the corpus can only say what the
 * picture must not CLAIM — it cannot say how fast a limb should swing. What is
 * left here is anatomy that a still frame can judge; what went is everything whose
 * answer only exists in motion, on the phone, behind a slider.
 */

// ---------------------------------------------------------------------- tide

/**
 * TIDE_ONLY_ON_THE_OFFER — the tide marks the body a press would take, and only
 * that one.
 *
 * The board asks for both "the tide appears on every planet in range" and "the
 * planet that would catch your press is the one already reaching for you — the
 * press is taught without a word". Those are one sentence only if at most one body
 * is ever in range. Measured over the 28 diagnostics reports that replay
 * faithfully, 40752 free-flight ticks:
 *
 *   ticks with >=1 body in grab range   14197
 *     exactly one in range               2975   21%
 *     two to seven in range             11222   79%
 *
 * So "every planet in range" lights two to seven tides while exactly one takes
 * the press, four times out of five. The teaching claim is the one worth keeping,
 * so the tide is the offer.
 *
 * AND IT IS THE SIMULATION'S OFFER, NOT A DISTANCE TEST. `snap.grabOffer` is
 * `grabTarget` asked once per frame; a nearest-in-range test disagrees with it on
 * 5.8% of capturing ticks, because targeting leads the ship, prefers upward inside
 * a charged window, and refuses a crash cone. Those refusals are the valuable
 * 1.1%: a tide that keeps reaching from a body the crash cone will not let you
 * take is actively lying at the moment it matters most.
 */
const TIDE_SPAN_REST = 0.5;
const TIDE_SPAN_FULL = 1.9;
const TIDE_ALPHA_REST = 0.35;

// --------------------------------------------------------------------- state

/**
 * One body's presentation state, computed fresh each frame.
 *
 * A VALUE RATHER THAN MORE PARAMETERS. `drawPlanet` took a single `held` boolean;
 * Direction 04 wants four states, a continuous pull and a decaying spent mark, and
 * the shape that does not survive is five more positional arguments. This is also
 * the half that can be tested without a canvas.
 */
export interface BodyView {
  hue: RGB;
  /** How hard this body is pulling the craft right now, 0..1. See `pull`. */
  pull: number;
  /** This body has the ship. */
  held: boolean;
  /** A press right now would take this body. */
  offered: boolean;
  /** 1 the instant it is released, decaying to 0 over `SPENT_RECOVER`. */
  spent: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * How hard this body is pulling the craft, normalised against the hardest it ever
 * could — which is the pull at its own minimum orbit.
 *
 * THE BOARD'S MASS CHANNEL DOES NOT EXIST IN THIS SIMULATION. Direction 04 asks
 * the tide to "scale with mass: a heavy body reaches for you with a longer,
 * brighter, tighter-tracking tide — gravity strength read at a glance". `GM` is a
 * single global (5,500,000) and a body's `R` sets only its collision surface and
 * its minimum-orbit ring, so at any given distance every body in the field pulls
 * identically — 60.9 at 300px, whatever it is. Worse, the claim inverts: a large
 * body holds you further out, so at its own minimum orbit
 *
 *   smallest R=34, minOrbit 46   g 2254.1
 *   largest  R=56, minOrbit 68   g 1111.6
 *
 * the SMALL one pulls 2.03x harder. "Mass is size" is not true here, and a cue
 * built on it would have been confidently backwards.
 *
 * What is true and live is the pull the craft is feeling from this body at this
 * instant, which is the thing the board actually wanted made visible. It also
 * pays for itself twice: the AHEAD -> IN REACH transition falls out of it as a
 * continuous ramp rather than needing a threshold, and a threshold here would have
 * been a cliff on the one cue meant to teach a press.
 *
 * Square-rooted because gravity is inverse-square and the raw ratio spans two
 * orders of magnitude across grab range; the root makes it inverse-linear, which
 * is what a limb segment can actually express.
 */
function pull(cfg: SimConfig, b: Body, shipX: number, shipY: number): number {
  const dx = shipX - b.x;
  const dy = shipY - b.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const most = gAccel(cfg, b.R + cfg.minOrbitGap);
  return clamp01(Math.sqrt(gAccel(cfg, dist) / most));
}

/** Shortest-arc follow, so a tide crossing the seam takes the short way round. */
function follow(cur: number, target: number, k: number, dt: number): number {
  const TAU = Math.PI * 2;
  const d = ((((target - cur) % TAU) + TAU * 1.5) % TAU) - Math.PI;
  return cur + d * Math.min(1, k * dt);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Put the emission ladder on the context, and take it off again.
 *
 * FIRST CONSUMER OF `Theme.emission`, WHICH WAS DEAD DATA. The ladder has been
 * defined since Direction 01 landed and nothing read it: `world.ts` picks
 * `shadowBlur` 9 and 20 by hand for the finish line, and those predate it. Direction
 * 04 states its states in ladder terms — AHEAD is E0-E1, IN REACH is E1, HELD is
 * E2 — so this is the first code with a genuine claim on it.
 *
 * It stays local rather than becoming a shared module: one function with one
 * consumer is not a seam yet. When the finish line comes onto the ladder it moves,
 * and that is the right time to decide where.
 */
function emit(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  tier: EmissionTier,
  c: RGB,
  s: number,
): void {
  const e = theme.emission[tier];
  if (e.blur === 0) return;
  ctx.shadowBlur = e.blur * s;
  ctx.shadowColor = withAlpha(c, e.alpha);
}

function clearEmit(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

// ------------------------------------------------------------------ renderer

/**
 * The bodies in the field, and the two things about them that persist between
 * frames.
 *
 * Both are presentation state with exactly one reader — this class — which is why
 * they are here rather than on the frame or in the `advance` layer. `advance`
 * exists because the popups, the fuel badge and the burn follower are moved in one
 * known place BEFORE layers above them read what they moved; nothing above the
 * bodies layer reads a tide angle. Putting them in `advance` would mean reaching
 * into this class's state from outside it, which is the coupling the split was for.
 */
export class BodyRenderer {
  /** Tide angle per body index, in world radians. Lags the true bearing. */
  private tide: number[] = [];
  /** Seconds of spent-mark left, per body index. */
  private spent: number[] = [];
  private prevAnchor = -1;
  private prevTick = -1;

  /**
   * Drop everything a previous run left behind.
   *
   * A new run gets a new field but not necessarily a new `BodyRenderer`, and body
   * counts repeat, so without this the spent marks of the last run would be
   * painted over the opening seconds of the next one. `snap.tick` running backwards
   * is the signal, and it is the honest one: it is the same reset the simulation
   * itself just performed.
   */
  private reset(n: number): void {
    this.tide = new Array<number>(n).fill(NaN);
    this.spent = new Array<number>(n).fill(0);
    this.prevAnchor = -1;
  }

  draw(f: Frame): void {
    const { ctx, cam, theme, bodies, snap, render: rc } = f;
    if (bodies.length !== this.tide.length || snap.tick < this.prevTick) this.reset(bodies.length);
    this.prevTick = snap.tick;

    const anchor = snap.capture ? snap.capture.planet : -1;
    // A body becomes spent the moment it stops holding the ship. A crash marks it
    // too, which is not quite the board's "its light moved into the chain" — but
    // the ship respawns far below and the mark has decayed long before the body is
    // in front of anyone again, so distinguishing the two would be untestable
    // bookkeeping for a case nobody can see.
    if (this.prevAnchor >= 0 && this.prevAnchor !== anchor) {
      this.spent[this.prevAnchor] = rc.bodySpentRecover;
    }
    this.prevAnchor = anchor;

    // Spent marks age for the WHOLE field, not just the visible part of it. They
    // are a fact about the run rather than about the picture, and a body that
    // scrolled off while dark must not come back still dark because nothing was
    // drawing it. The tide is the opposite and is aged below, with the drawing.
    if (!f.paused && f.frameDt > 0) {
      for (let i = 0; i < this.spent.length; i++) {
        if (this.spent[i]! > 0) this.spent[i] = Math.max(0, this.spent[i]! - f.frameDt);
      }
    }

    const view = visibleWorldY(cam);
    const pad = 120;

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]!;
      if (b.y + b.R < view.top - pad || b.y - b.R > view.bottom + pad) {
        // Forget the lag, so the tide is re-seeded to the true bearing on the
        // frame the body comes back rather than swinging into place in front of
        // the player. An off-screen tide has nobody to lag for.
        this.tide[i] = NaN;
        continue;
      }

      const p = pull(f.sim, b, snap.x, snap.y);
      const bearing = Math.atan2(snap.y - b.y, snap.x - b.x);
      const cur = this.tide[i]!;
      this.tide[i] = Number.isNaN(cur)
        ? bearing
        : f.paused
          ? cur
          : follow(cur, bearing, lerp(rc.bodyTideLagRest, rc.bodyTideLagFull, p), f.frameDt);

      const v: BodyView = {
        hue: bodyHue(theme, b, i),
        pull: p,
        held: i === anchor,
        offered: i === snap.grabOffer,
        // Clamped rather than divided blind: `bodySpentRecover` is a live slider,
        // so dragging it downward mid-run leaves marks on the field that were
        // seeded at the old, longer length.
        spent: rc.bodySpentRecover > 0 ? clamp01(this.spent[i]! / rc.bodySpentRecover) : 0,
      };

      switch (b.kind) {
        case 'planet':
          this.drawBody(f, b, v, this.tide[i]!);
          break;
        case 'anomaly':
          drawShelter(ctx, cam, b, v);
          this.drawBody(f, b, v, this.tide[i]!, f.timeMs);
          break;
      }
    }
  }

  /**
   * One anatomy, drawn from the outside in.
   *
   * Order is the whole of it: the minimum-orbit ring is world furniture and sits
   * under everything; the disc occludes what is behind it; strata, rim, tide and
   * core stack outward in brightness so the tide is the brightest thing on a body
   * that is offering itself, and never brighter than the craft.
   */
  private drawBody(
    f: Frame,
    b: Body,
    v: BodyView,
    tideAngle: number,
    /** Wall clock, anomalies only, for the breath. Nothing here feeds the sim. */
    timeMs = 0,
  ): void {
    const { ctx, cam, sim, theme, render: rc } = f;
    const x = toScreenX(cam, b.x);
    const y = toScreenY(cam, b.y);
    const s = cam.scale;
    const r = b.R * s;

    // The spent body goes to DUSK rather than dimming: structure at rest is what
    // DUSK is for, and it is a different STATEMENT from "far away", which is the
    // same hue at low alpha. A player must be able to tell a body they have used
    // from one they have not reached.
    const hue = v.spent > 0 ? mix(v.hue, DUSK, v.spent) : v.hue;

    // Minimum-orbit ring. Solid: it is a hard limit the simulation clamps to, not
    // a suggestion, and dashing made it read as advisory.
    ctx.beginPath();
    ctx.arc(x, y, (b.R + sim.minOrbitGap) * s, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(DUSK, v.held ? 0.5 : 0.24);
    ctx.lineWidth = Math.max(1, s) * (v.held ? 1.4 : 1);
    ctx.stroke();

    // The disc. Flat and near-void: this is what makes the anatomy read as a
    // cross-section that glows rather than as an object that is lit.
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = FILL;
    ctx.fill();

    // Strata. Faint at distance and firming up as the body starts to matter, on
    // the same continuous ramp everything else on the body uses.
    const structure = 0.45 + 0.55 * v.pull;
    ctx.lineWidth = Math.max(1, s);
    for (const st of STRATA) {
      ctx.beginPath();
      ctx.arc(x, y, r * st.r, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(hue, st.a * structure);
      ctx.stroke();
    }

    // The rim: the lamp, always on. RIM_REST at distance so a field ahead reads as
    // a constellation of dim coloured rings, full when the body is pulling hard.
    //
    // THE BLOOM IS NOT ALWAYS ON, AND THE BOARD SAYS SO — AHEAD is "E0-E1", not
    // E1. A body the craft is nowhere near draws its rim flat, which is both what
    // "present and identifiable, but quiet" means and the only version that is
    // affordable: a shadowed stroke is a Gaussian over the arc's bounding box, and
    // a dense field puts ten of them on screen at once.
    const tier: EmissionTier = v.held ? 'E2' : v.pull > rc.bodyEmitAt ? 'E1' : 'E0';
    emit(ctx, theme, tier, hue, s);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(hue, rc.bodyRimRest + (1 - rc.bodyRimRest) * v.pull);
    ctx.lineWidth = RIM_W * s;
    ctx.stroke();
    clearEmit(ctx);

    // The tide: gravity drawn on the thing that owns it. Only on the body a press
    // would take, or the one that already has the ship — see TIDE_ONLY_ON_THE_OFFER.
    if ((v.offered || v.held) && v.spent < 1) {
      const span = lerp(TIDE_SPAN_REST, TIDE_SPAN_FULL, v.pull);
      emit(ctx, theme, v.held ? 'E2' : 'E1', hue, s);
      ctx.beginPath();
      ctx.arc(x, y, r, tideAngle - span / 2, tideAngle + span / 2);
      ctx.strokeStyle = withAlpha(hue, lerp(TIDE_ALPHA_REST, 1, v.pull) * (1 - v.spent));
      ctx.lineWidth = TIDE_W * s;
      ctx.stroke();
      clearEmit(ctx);
    }

    // The core: the type slot. A standard body has one; Direction 04's binary has
    // two, the pulsar's beats, the black hole's is absent. It hollows when spent —
    // the lamp is out, and the outline is what is left of it.
    const breath = timeMs === 0 ? 1 : 0.85 + 0.15 * Math.sin(timeMs / 620);
    const cr = r * CORE_R;
    ctx.beginPath();
    ctx.arc(x, y, cr, 0, Math.PI * 2);
    if (v.spent > 0.5) {
      ctx.strokeStyle = withAlpha(hue, 0.5 * (1 - v.spent));
      ctx.lineWidth = Math.max(1, s);
      ctx.stroke();
    } else {
      ctx.fillStyle = withAlpha(hue, (0.3 + 0.6 * v.pull) * breath * (1 - v.spent * 2));
      ctx.fill();
    }

    // The address, below the rim rather than through the core.
    //
    // MOVED, NOT DECIDED. Direction 04 also retires the `P11` telemetry voice and
    // makes the number an altitude address shown only to break a hue tie — that is
    // a separate change that reaches the sheet and the results, and it has not been
    // made. What forced this much is the anatomy: the label used to sit dead centre,
    // which is now where the core is.
    ctx.fillStyle = withAlpha(DUSK, 0.65);
    ctx.font = `${9 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(b.name, x, y + r + 4 * s);
    ctx.textBaseline = 'alphabetic';
  }
}

/**
 * An anomaly's shelter, and the line where it ends.
 *
 * NOT PART OF THE ANATOMY, which is why it is a separate function drawn under it:
 * the bubble belongs to the FIELD, not to the body. It is drawn at all because it
 * is a BOUNDARY, and the same lesson applies that `drawHazardZones` records — a
 * limit the player cannot see is a limit they cannot play against. Its edge is
 * where the side barrier resumes and the run ends, so it gets a hard line exactly
 * like the red one does.
 *
 * The gradient runs the other way round from the hazard band, and deliberately:
 * there the danger is OUTSIDE a line you approach, so the warning builds toward
 * it. Here the safety is INSIDE, so the fill is densest at the anomaly and fades
 * to nothing at the rim — a pocket of shelter you are inside of, rather than a
 * wall you are heading for.
 */
function drawShelter(ctx: CanvasRenderingContext2D, cam: Camera, b: Body, v: BodyView): void {
  const x = toScreenX(cam, b.x);
  const y = toScreenY(cam, b.y);
  const s = cam.scale;
  const bubble = b.traits.shelter * s;
  if (bubble <= 0) return;

  const g = ctx.createRadialGradient(x, y, 0, x, y, bubble);
  g.addColorStop(0, withAlpha(v.hue, 0.2));
  g.addColorStop(0.55, withAlpha(v.hue, 0.09));
  g.addColorStop(1, withAlpha(v.hue, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, bubble, 0, Math.PI * 2);
  ctx.fill();

  ctx.setLineDash([6 * s, 6 * s]);
  ctx.strokeStyle = withAlpha(v.hue, 0.42);
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.beginPath();
  ctx.arc(x, y, bubble, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}
