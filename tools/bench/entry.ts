/**
 * The gate's desktop bench: the repo's own simulation, with the open questions
 * on sliders.
 *
 * Everything below the controls is the real thing — `src/sim/`, `src/state/`
 * and `src/render/` exactly as they are on `main`, bundled for the browser. The
 * constants listed in [`patches.ts`](./patches.ts) have been made settable and
 * nothing else has been touched, so what this page answers is a question about
 * the game rather than about a model of it.
 *
 * ## Three cards, and the middle one is a layer boundary
 *
 * **Physics** changes what a run *is*, so moving one starts the run again:
 * otherwise the recipe underneath would describe a run nobody flew. **The
 * picture** and **light** change only what is drawn, and presentation state is a
 * convergent recurrence ([ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)),
 * so they land live on the swing already in the air. The split is ADR-0006's
 * wall as something the author can feel with a mouse.
 */
import { bindPress, suppressBrowserGestures } from './app/input.ts';
import { createPress, isPressed } from './src/input/press.ts';
import { createClock, ticksDue } from './src/sim/clock.ts';
import { fixtureCraft, fixtureField } from './src/sim/fixture-field.ts';
import type { Recipe } from './src/sim/recipe.ts';
import { FIXTURE_FIELD, createRecorder, recipeOf, recordPress } from './src/sim/recipe.ts';
import { createInitialState, stepSim } from './src/sim/step.ts';
import type { SimState } from './src/sim/types.ts';
import * as units from './src/sim/units.ts';
import { SECONDS_PER_TICK } from './src/sim/units.ts';
import * as cameraKnobs from './src/state/camera.ts';
import * as curve from './src/state/decay.ts';
import * as blow from './src/state/punch.ts';
import * as word from './src/state/callout.ts';
import * as lamp from './src/state/body.ts';
import * as arcs from './src/sim/compass.ts';
import * as instrument from './src/state/compass.ts';
import * as mark from './src/state/sighting.ts';
import * as view from './src/render/index.ts';
import * as rung from './src/state/rung.ts';
import * as sky from './src/render/starfield.ts';
import * as motes from './src/render/dust.ts';
import * as weather from './src/state/anomaly.ts';
import * as strata from './src/render/rungs.ts';
import * as fit from './src/render/letterbox.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './src/state/design.ts';
import { SCALE } from './src/sim/units.ts';
import { createPresentation, derive } from './src/state/derive.ts';
import type { PresentationState } from './src/state/types.ts';
import { attachCanvas, sizeToDisplay } from './src/render/canvas.ts';
import { draw } from './src/render/index.ts';
import { interpolate } from './src/render/interpolate.ts';
import { buildDispatch } from './tools/dispatch.ts';
import {
  bucketAt,
  bucketCount,
  createMeter,
  frameBegan,
  frameEnded,
  timingOf,
} from './tools/meter.ts';
import type { DispatchTiming } from './tools/meter.ts';
import { envelopeBand, frameCost, walkRun } from './tools/trail.ts';

const SEED = 1;

interface Knob {
  readonly id: string;
  readonly label: string;
  readonly what: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The value on `main`, and what "at defaults" means. */
  readonly base: number;
  readonly apply: (value: number) => void;
  /** Physics knobs change what a run *is*, so the run starts again. */
  readonly restarts: boolean;
  /** Which card it sits under. Only the first of the three restarts a run. */
  readonly group: 'physics' | 'light' | 'bodies' | 'compass' | 'release' | 'field';
  readonly places: number;
}

const KNOBS: Knob[] = [
  {
    id: 'mass',
    label: 'Mass-to-radius exponent',
    what: 'how steeply a body’s pull follows its size. Spec 04 §1 already rules that mass IS size; what spec 01 §13.2 left to the gate is only how steeply. 0 is the prototype — every body pulls alike whatever it looks like — and 2 gives the largest body 2.7× the reach of the smallest, so the field stops being uniform and the big ones become the decisions',
    min: 0,
    max: 3,
    step: 0.25,
    base: units.MASS_EXPONENT,
    apply: units.set_MASS_EXPONENT,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'payback',
    label: 'Dive payback',
    what: 'how much of what falling gave the craft an unfinished swing gives back. 0 is the behaviour before 2026-08-30, where a release taken in the dive was the best-paid move in the game — +548 design units/s at the median over the author’s own 129 swings, 7.7× a fully flown one. 1 makes a tap exactly speed-neutral and was flown as “too slow and anemic”',
    min: 0,
    max: 1,
    step: 0.05,
    base: units.DIVE_PAYBACK,
    apply: units.set_DIVE_PAYBACK,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'ecc',
    label: 'Eccentricity cap',
    what: 'the roundest shape the freeze will hand out, and it binds on all but the slowest dives — real play measured p25 0.58, p50 0.60, p75 0.60, so almost every capture leaves on exactly this. Spec 01 §13.5 deferred it to the gate. Higher is a longer oval and a bigger difference between a good dive and a poor one',
    min: 0,
    max: 0.95,
    step: 0.05,
    base: units.ECCENTRICITY_CAP,
    apply: units.set_ECCENTRICITY_CAP,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'grazeratio',
    label: 'Graze threshold',
    what: 'how head-on a contact with a body you are NOT holding has to be before it kills rather than grazes — spec 01 §10’s near-parallel graze, as a number the spec does not state. 0 kills nothing and 1 kills every touch, so this is where the line between âclipped itâ and âflew into itâ sits',
    min: 0,
    max: 1,
    step: 0.02,
    base: units.GRAZE_RATIO,
    apply: units.set_GRAZE_RATIO,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'grazerest',
    label: 'Graze bounce',
    what: 'how much of its speed a graze gives back, on the near-parallel touch that spec 01 §10 lets the craft survive. The spec is SILENT on it and the value is the prototype’s, which is why it is here: it costs up to 17° of heading at the lethal threshold, and 0 lets the hull slide along instead of being turned by it',
    min: 0,
    max: 1,
    step: 0.05,
    base: units.GRAZE_RESTITUTION,
    apply: units.set_GRAZE_RESTITUTION,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'climb',
    label: 'Climb bias',
    what: 'how much a press prefers a body up the climb to one below it. Weighted by how far, and saturating, so there is no line at the craft’s own altitude to fall off. At 0 the lead decides alone; swept over 200 pilot runs, downward grabs fall 15.3% at 0 to 9.5% at 0.8',
    min: 0,
    max: 1,
    step: 0.05,
    base: units.CLIMB_BIAS,
    apply: units.set_CLIMB_BIAS,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'rim',
    label: 'Rim, at rest',
    what: 'how brightly a body out of reach is drawn — spec 04 §3 answers it at 40%. Brightness is the only ordinal channel (spec 00 §3) and this moves the alpha `dim()` already sanctions',
    min: 0.1,
    max: 1,
    step: 0.05,
    base: view.RIM_AT_REST,
    apply: view.set_RIM_AT_REST,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'tidewidth',
    label: 'Tide weight',
    what: 'how heavy the bright limb is, in design units. Spec 04 §1 holds it constant whatever the body\u2019s radius, so a small body reads as a bright ring and a giant as a thin horizon',
    min: 3,
    max: 36,
    step: 1.5,
    base: view.TIDE_WIDTH,
    apply: view.set_TIDE_WIDTH,
    restarts: false,
    group: 'bodies',
    places: 1,
  },
  {
    id: 'tidefloor',
    label: 'Tide, at its faintest',
    what: 'spec 04 §2 rules a heavier body\u2019s tide is brighter and states neither end. This is the floor; the rest of the range is the body\u2019s own mass',
    min: 0,
    max: 1,
    step: 0.05,
    base: view.TIDE_FLOOR,
    apply: view.set_TIDE_FLOOR,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'tidearc',
    label: 'Tide reach',
    what: 'radians either side, for a body of unbounded mass. The median body gets half of it, which is spec 04 §2\u2019s ±0.3 rad — the law between them is an opening position',
    min: 0.1,
    max: 3,
    step: 0.05,
    base: lamp.TIDE_HALF_WIDTH_MAX,
    apply: lamp.set_TIDE_HALF_WIDTH_MAX,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'emitat',
    label: 'Bloom threshold',
    what: 'how hard a body must be gripping the craft before it glows at all. Spec 04 §3 gives a body AHEAD “E0–E1” and this is where in that range it sits; at 0 every body in the field blooms at once, which is what flying it rejected',
    min: 0,
    max: 1,
    step: 0.02,
    base: lamp.EMIT_AT,
    apply: lamp.set_EMIT_AT,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'gripspan',
    label: 'Halo reach',
    what: 'design units the wide faint proximity glow reaches past the floor. It grows with grip rather than with state, so a field of distant bodies is a constellation of rims rather than sixty haloes',
    min: 0,
    max: 1500,
    step: 30,
    base: view.GRIP_SPAN,
    apply: view.set_GRIP_SPAN,
    restarts: false,
    group: 'bodies',
    places: 0,
  },
  {
    id: 'gripalpha',
    label: 'Halo strength',
    what: 'how strong the proximity halo above is at the floor, where a body’s grip is total. Asked for on 2026-08-29 as âa wide faint glow, tastefully soâ, which is a judgement with no number under it — this is the number, and the reach above is the other half of it',
    min: 0,
    max: 0.6,
    step: 0.02,
    base: view.GRIP_STRENGTH,
    apply: view.set_GRIP_STRENGTH,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'bodybloom',
    label: 'Planet bloom',
    what: 'how much of the energy table’s strength a planet’s own bloom takes. The craft keeps its own, because it is the brightest thing on screen always — this is only the glow on the rim, which read as too much when a body is grabbed',
    min: 0,
    max: 1,
    step: 0.05,
    base: view.BODY_BLOOM,
    apply: view.set_BODY_BLOOM,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'sightrange',
    label: 'Sighting range',
    what: 'design units past which a body is not marked at all. Spec 03 §6 records “reach is not yet a number” and defers it to spec 17; this is the prototype’s, carried',
    min: 1000,
    max: 12000,
    step: 200,
    base: mark.SIGHTING_RANGE,
    apply: mark.set_SIGHTING_RANGE,
    restarts: false,
    group: 'bodies',
    places: 0,
  },
  {
    id: 'e1alpha',
    label: 'E1 · how strong',
    what: 'spec 00 §3 says 35%; flown, all the glow was too much (2026-08-29). The radius is untouched — what moved is the alpha, which spec 00 §1 makes the renderer’s own',
    min: 0,
    max: 1,
    step: 0.02,
    base: view.E1_STRENGTH,
    apply: view.set_E1_STRENGTH,
    restarts: false,
    group: 'light',
    places: 2,
  },
  {
    id: 'e2alpha',
    label: 'E2 · how strong',
    what: 'the same for the craft and a held body — spec 00 §3 says 60% and this ships at 30%, the other half of âall glow is too muchâ (2026-08-29). The RADIUS is untouched and is not on this bench: spec 00 §3 states it and nobody has questioned it. What moved is an alpha, which spec 00 §1 makes the renderer’s to choose',
    min: 0,
    max: 1,
    step: 0.02,
    base: view.E2_STRENGTH,
    apply: view.set_E2_STRENGTH,
    restarts: false,
    group: 'light',
    places: 2,
  },

  {
    id: 'settlereturn',
    label: 'Settle · speed kept',
    what: 'how much of the dive’s own speed the settle leaves the orbit with, above the circular speed at its floor. ZERO IS TODAY’S GAME: the settle erases the dive entirely, so every settled swing leaves at the same speed whatever brought it in — measured, exit correlates with approach at −0.93 and arriving fast pays ×0.88. At 0.30 a fast arrival breaks even, the slowest swings get 25% faster and the median does not move. It cannot compound: the freeze’s escape clamp binds on every dive, so this lifts the setpoint rather than paying a share of what you brought',
    min: 0,
    max: 0.8,
    step: 0.05,
    base: units.SETTLE_RETURN,
    apply: units.set_SETTLE_RETURN,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'transient',
    label: 'Release kick · strength',
    what: 'how much faster a release leaves than it will be travelling a moment later, as a fraction. Spec 01 §8 measured the prototype at 0.8 (×1.8) and 0.45 is what was flown — “all of the velocity kicks are a bit too intense”. It runs along the exit tangent, so it never bends the ray: the route is identical and only the timing moves. Zero removes it',
    min: 0,
    max: 1.5,
    step: 0.05,
    base: units.TRANSIENT_SHARE,
    apply: units.set_TRANSIENT_SHARE,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'punchfloor',
    label: 'Punch · floor',
    what: 'how much of spec 02 §4’s stretch a release of NO quality still earns. At 1 quality reaches nothing and the stretch is exactly what spec 02 §4 wrote; at 0 a release that never armed does not mark itself at all',
    min: 0,
    max: 1,
    step: 0.05,
    base: blow.PUNCH_FLOOR,
    apply: blow.set_PUNCH_FLOOR,
    restarts: false,
    group: 'release',
    places: 2,
  },
  {
    id: 'ringgap',
    label: 'Rings · minimum separation',
    what: 'design units two neighbouring rings are held apart whatever their windows do. Measured over 12 280 pairs, half sat under 5 units apart on screen while their bodies were a median of 32 units apart in the world — the radii are proportional to distance at one unit per 12.9, which is finer than a stroke. Zero is the old behaviour',
    min: 0,
    max: 120,
    step: 2,
    base: instrument.RING_MIN_GAP,
    apply: instrument.set_RING_MIN_GAP,
    restarts: false,
    group: 'compass',
    places: 0,
  },
  {
    id: 'flownfloor',
    label: 'Flown arc · floor',
    what: 'how much light the arc keeps where the boost is worth nothing. Not zero: the arc is still the orbit the craft has ridden, and one that went out would take the trail with it',
    min: 0,
    max: 1,
    step: 0.02,
    base: view.FLOWN_FLOOR,
    apply: view.set_FLOWN_FLOOR,
    restarts: false,
    group: 'release',
    places: 2,
  },
  {
    id: 'linger',
    label: 'Callout · linger',
    what: 'ticks the word holds at full before it decays. THE ONE TWO SPECS DISAGREE ABOUT: spec 06 §4 says 1.2s (72) and spec 02 §2’s old end column implies about 0.4s. 72 is what is built',
    min: 0,
    max: 180,
    step: 2,
    base: word.LINGER_TICKS,
    apply: word.set_LINGER_TICKS,
    restarts: false,
    group: 'release',
    places: 0,
  },
  {
    id: 'overshoot',
    label: 'Overshoot',
    what: 'how far through the return the value passes rest — 0.37 rebounds a tenth of the way past it, which is spec 02 §4’s own 0.95 against a 1.5 stretch. At 1 there is no overshoot at all',
    min: 0.05,
    max: 1,
    step: 0.01,
    base: curve.OVERSHOOT_FROM,
    apply: curve.set_OVERSHOOT_FROM,
    restarts: false,
    group: 'light',
    places: 2,
  },
  {
    id: 'ringinner',
    label: 'Ring clearance',
    what: 'design units between the orbit the craft is on and the innermost ring. The instrument clears the path rather than sitting on it, so the two are never read as one line',
    min: 12,
    max: 300,
    step: 6,
    base: instrument.RING_INNER,
    apply: instrument.set_RING_INNER,
    restarts: false,
    group: 'compass',
    places: 0,
  },
  {
    id: 'aimrange',
    label: 'Aim range',
    what: 'how far a body may be and still be worth aiming at. Spec 00 §6 says “one ring per reachable body” and never says what reachable is; this is the prototype’s answer — about two body-spacings, because past that the coast is long and featureless',
    min: 600,
    max: 6000,
    step: 100,
    base: arcs.AIM_RANGE,
    apply: arcs.set_AIM_RANGE,
    restarts: false,
    group: 'compass',
    places: 0,
  },
  {
    id: 'windowweight',
    label: 'Window weight',
    what: 'how heavy a compass window is, in design units. The first thing the eye finds on the instrument and the thing that says which body a release goes to, so it competes directly with the hand crossing it — spec 00 §6 states no weight for either',
    min: 1.5,
    max: 30,
    step: 1.5,
    base: view.WINDOW_WIDTH,
    apply: view.set_WINDOW_WIDTH,
    restarts: false,
    group: 'compass',
    places: 1,
  },
  {
    id: 'dot',
    label: 'The dot',
    what: 'how big the dot at a window’s centre is, in design units. It is the only mark in the game the hand has to land on exactly, and it goes CORE white the tick it is matched — so it is a target size, and a target that is hard to see is a different game from one that is hard to hit',
    min: 1.5,
    max: 30,
    step: 1.5,
    base: view.DOT_RADIUS,
    apply: view.set_DOT_RADIUS,
    restarts: false,
    group: 'compass',
    places: 1,
  },
  {
    id: 'handrest',
    label: 'Hand, at rest',
    what: 'how bright the hand is before any aim has closed. It ran 0.35 to full CORE white and read as a bright bar across the middle of the instrument, competing with the windows it is aimed at; the author asked for less at both ends',
    min: 0,
    max: 1,
    step: 0.01,
    base: view.HAND_AT_REST,
    apply: view.set_HAND_AT_REST,
    restarts: false,
    group: 'compass',
    places: 2,
  },
  {
    id: 'windowrest',
    label: 'Window, at rest',
    what: 'how vibrant an arc is before any aim has closed. It heats in place from here to full as the hand comes in, and thickens on the same ramp — the one surface in the game that does not take the energy table’s alpha, because it is the instrument rather than the world',
    min: 0.05,
    max: 1,
    step: 0.05,
    base: view.WINDOW_AT_REST,
    apply: view.set_WINDOW_AT_REST,
    restarts: false,
    group: 'compass',
    places: 2,
  },
  {
    id: 'tidegrowth',
    label: 'Tide growth · A/B',
    what: 'the A/B. At 0 the tide’s width is mass alone — spec 04 §2 as written, and what shipped yesterday. At 1 it is mass × grip, which is the prototype’s reading: it bubbles in as a bead and stretches along the limb as you close. Nothing is deleted at either end',
    min: 0,
    max: 1,
    step: 0.05,
    base: lamp.TIDE_GROWTH,
    apply: lamp.set_TIDE_GROWTH,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'tidelift',
    label: 'Tide brightness · near',
    what: 'how far closing the distance lifts a tide’s brightness toward full. At 0 it is mass alone — brightness flat from the moment it bubbles in, which is what shipped. Up from there the far end stays exactly where it is and the near end arrives brighter, and the heavier body is still the brighter one at any given distance',
    min: 0,
    max: 1,
    step: 0.05,
    base: lamp.TIDE_LIFT,
    apply: lamp.set_TIDE_LIFT,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'handaim',
    label: 'Hand · fully aimed',
    what: 'the other end of the same line: how bright it gets when a window is perfectly aimed. Spec 00 §6 asks the hand to brighten as aim closes and states neither end, so both are opening positions',
    min: 0,
    max: 1,
    step: 0.01,
    base: view.HAND_AT_AIM,
    apply: view.set_HAND_AT_AIM,
    restarts: false,
    group: 'compass',
    places: 2,
  },
  {
    id: 'crossingrest',
    label: 'Crossing dots · at rest',
    what: 'how bright the white dots where the hand cuts each ring are before the aim closes. They ramp from here to full CORE the way a window does, rather than stepping between two energies as they used to',
    min: 0,
    max: 1,
    step: 0.01,
    base: view.CROSSING_AT_REST,
    apply: view.set_CROSSING_AT_REST,
    restarts: false,
    group: 'compass',
    places: 2,
  },
  {
    id: 'enterfrom',
    label: 'Instrument entrance',
    what: 'spec 00 §5’s ENTER, applied to the compass: how small it starts before popping to full with one overshoot when the rings arrive at the freeze. At 1 there is no pop. It scales the instrument and never the orbit path',
    min: 0.6,
    max: 1,
    step: 0.01,
    base: instrument.ENTER_FROM,
    apply: instrument.set_ENTER_FROM,
    restarts: false,
    group: 'compass',
    places: 2,
  },
  {
    id: 'exitby',
    label: 'Click out',
    what: 'how far in the instrument collapses as it leaves. It leaves on the curve it arrives on, reversed — so it swells about a tenth of this away from rest first, then comes back through and shuts. At 0 it just fades',
    min: 0,
    max: 1,
    step: 0.05,
    base: instrument.EXIT_BY,
    apply: instrument.set_EXIT_BY,
    restarts: false,
    group: 'compass',
    places: 2,
  },
  {
    id: 'rungspacing',
    label: 'Rung spacing',
    what: 'spec 05 §3 deferred this on 2026-08-27 until there was a swing to measure it against. 25m was the first value it ever had and flew as “too close together, it feels chaotic at speed”; 50m shows what Direction 05’s own frame draws',
    min: 75,
    max: 450,
    step: 15,
    base: rung.RUNG_SPACING,
    apply: rung.set_RUNG_SPACING,
    restarts: false,
    group: 'field',
    places: 0,
  },
  {
    id: 'bowgain',
    label: 'Gravity bow · strength',
    what: '**switched off on main** (author, 2026-08-30: “remove the gravity wake effect for now, for both planet and ship”). Put it to 24 — the board’s own default — to bring it back. Scaled per body by mass, so this moves the whole field at once and MASS_EXPONENT decides the spread',
    min: 0,
    max: 44,
    step: 2,
    base: rung.BOW_GAIN,
    apply: rung.set_BOW_GAIN,
    restarts: false,
    group: 'field',
    places: 0,
  },
  {
    id: 'bowcap',
    label: 'Gravity bow · ceiling',
    what: 'spec 05 says 30px in three places, and at 30 the clamp bites at the rim of any body above radius 44 — so the biggest body in the field bent less than the median one. 45 is the smallest value that clears the field’s own range',
    min: 30,
    max: 90,
    step: 3,
    base: rung.BOW_CAP,
    apply: rung.set_BOW_CAP,
    restarts: false,
    group: 'field',
    places: 0,
  },
  {
    id: 'bowfalloff',
    label: 'Gravity bow · reach',
    what: 'how wide a patch of field a body bends. The board’s 150 board pixels sits against rungs 46 apart; this sits against rungs 50 apart',
    min: 150,
    max: 900,
    step: 30,
    base: rung.BOW_FALLOFF,
    apply: rung.set_BOW_FALLOFF,
    restarts: false,
    group: 'field',
    places: 0,
  },
  {
    id: 'wakeamp',
    label: 'Wake · how far it parts',
    what: '**switched off on main**, alongside the bow. Put it to 120 (40 board pixels) to bring it back; the reach beside it is already at its restored 85. At zero the craft leaves no mark on the field at all',
    min: 0,
    max: 150,
    step: 3,
    base: rung.WAKE_AMPLITUDE,
    apply: rung.set_WAKE_AMPLITUDE,
    restarts: false,
    group: 'field',
    places: 0,
  },
  {
    id: 'wakefalloff',
    label: 'Wake · how much it parts',
    what: 'how far the craft’s parting of the rungs reaches, in design units — the width of the pocket rather than its depth. Against 50 m rungs, 144 reaches one rung either side and 300 reaches three. It moves with the amplitude above: raising one alone makes a taller spike in the same place, where what the design asks for is a patch of field displaced',
    min: 30,
    max: 450,
    step: 15,
    base: rung.WAKE_FALLOFF,
    apply: rung.set_WAKE_FALLOFF,
    restarts: false,
    group: 'field',
    places: 0,
  },
  {
    id: 'rungstep',
    label: 'Rung resolution',
    what: 'how far apart the points a rung is drawn from are. Direction 05 spends 11.6 points across a body; this spends 11 at the default. It is the first number to move if the frame budget ever fails',
    min: 6,
    max: 90,
    step: 3,
    base: strata.RUNG_STEP,
    apply: strata.set_RUNG_STEP,
    restarts: false,
    group: 'field',
    places: 0,
  },
  {
    id: 'stars',
    label: 'Sky · how loud',
    what: 'the author’s answer, 2026-08-30, to the question starfield.ts said to ask once the rungs landed: “I still want it there, but only as background noise.” 1 is the sky as it was before the rungs',
    min: 0,
    max: 1,
    step: 0.05,
    base: sky.STAR_STRENGTH,
    apply: sky.set_STAR_STRENGTH,
    restarts: false,
    group: 'field',
    places: 2,
  },
  {
    id: 'duststrength',
    label: 'Dust · how loud',
    what: 'spec 05 §2 states α .1–.3 and this multiplies it. Dust is a THIRD system saying speed, beside the rungs (a crossing rate) and the sky (a parallax ratio) — it says it as a streak length. 1 is the spec’s own alphas; the sky needed this same knob within a day of landing',
    min: 0,
    max: 2,
    step: 0.05,
    base: motes.DUST_STRENGTH,
    apply: motes.set_DUST_STRENGTH,
    restarts: false,
    group: 'field',
    places: 2,
  },
  {
    id: 'dustexposure',
    label: 'Dust · streak length',
    what: 'how long the shutter is open, in ticks. **Flown and refused at 5.4** — the board’s own 90 ms, which was authored against a climb this game passes at its median: “I don’t like the star streaks at speed. With the rungs they look like bricks.” At 1 the streak is exactly one frame’s motion blur and reaches a fifth of a rung gap at the fastest tick anyone has flown. 0 is a pure stipple',
    min: 0,
    max: 6,
    step: 0.25,
    base: motes.DUST_EXPOSURE,
    apply: motes.set_DUST_EXPOSURE,
    restarts: false,
    group: 'field',
    places: 2,
  },
  {
    id: 'dustwidth',
    label: 'Dust \u00b7 how big',
    what: 'how wide a mote is, in design units, and with a round cap it is also the diameter of one at rest. 3 is Direction 05\u2019s own 1px line converted \u2014 and on the phone that is ONE CSS PIXEL, which is the bottom of the range the starfield was refused at (\u201ctiny specks with little to no variation\u201d). Counting ink, this layer currently lays down a fifth of what the sky does, and spec 05 \u00a72 puts it in FRONT of the sky. Try this before the alpha: the alpha is a number the design states in three places',
    min: 1.5,
    max: 15,
    step: 0.75,
    base: motes.DUST_WIDTH,
    apply: motes.set_DUST_WIDTH,
    restarts: false,
    group: 'field',
    places: 2,
  },
  {
    id: 'dustdensity',
    label: 'Dust · how many',
    what: 'motes in a picture. 21 is Direction 05’s own density corrected for the frame it was drawn in — its live component scatters 16 over a frame 0.77 the area of this one. It is capped at twice this however long the chain runs, because sparse is the first word the spec uses about dust',
    min: 0,
    max: 42,
    step: 1,
    base: motes.DUST_PER_SCREEN,
    apply: motes.set_DUST_PER_SCREEN,
    restarts: false,
    group: 'field',
    places: 0,
  },
  {
    id: 'anomalyat',
    label: 'Anomaly · where it sits',
    what: 'a fraction of the span between the lowest body and the highest. 0.5625 is the prototype’s own rule for a single anomaly — evenly spread with the bottom eighth skipped — and puts it at 4 140 m, which 3 of the author’s 13 replayable runs reach. **Drag it to 0 to fly straight into one**: that is what the prototype’s dev shell does with its own anomalyAtSpawn flag, and spec 17’s generator is what replaces this',
    min: 0,
    max: 1,
    step: 0.0125,
    base: weather.ANOMALY_AT,
    apply: weather.set_ANOMALY_AT,
    restarts: false,
    group: 'field',
    places: 4,
  },
  {
    id: 'anomalyspan',
    label: 'Anomaly · how much field',
    what: 'in design units. 2 400 is 800 m, which is the prototype’s own shelter carried across as a magnitude — three bodies, and just under one picture, so you cannot see both edges at once',
    min: 300,
    max: 9000,
    step: 150,
    base: weather.ANOMALY_SPAN,
    apply: weather.set_ANOMALY_SPAN,
    restarts: false,
    group: 'field',
    places: 0,
  },
  {
    id: 'skylead',
    label: 'Sky · how far ahead it warms',
    what: 'in design units, spent on a squared ramp capped at spec 05 §2’s 6%. 2 532 is one picture: derived rather than ruled, from a floor (the tint must be visible before the anomaly’s foot can appear at the top of the frame) and a ceiling (a sky that is always warming is not warming)',
    min: 0,
    max: 10_000,
    step: 100,
    base: weather.SKY_LEAD,
    apply: weather.set_SKY_LEAD,
    restarts: false,
    group: 'field',
    places: 0,
  },
];

/**
 * Viewports to fit the design space into — spec 00 §7's open question needs a
 * *shape*, and the bench's own canvas is exactly design-shaped, which is the one
 * shape where both readings agree.
 *
 * The **width is held constant** across all of them, because that is what a phone
 * does: the screen is 393 points wide whatever happens, and the browser's chrome
 * eats the height.
 */
const VIEWPORTS: ReadonlyArray<{ id: string; label: string; w: number; h: number }> = [
  { id: 'browser', label: 'phone, in a browser — 393 × 651', w: 393, h: 651 },
  { id: 'screen', label: 'phone, whole screen — 393 × 852', w: 393, h: 852 },
  {
    id: 'design',
    label: 'the design space itself — 1170 × 2532',
    w: DESIGN_WIDTH,
    h: DESIGN_HEIGHT,
  },
  { id: 'squat', label: 'a squat window — 393 × 500', w: 393, h: 500 },
];

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = byId<HTMLDivElement>('stage');
const context = attachCanvas(stage);
const press = createPress();
bindPress(press, stage);
suppressBrowserGestures(stage);

let sim: SimState;
let current: PresentationState;
let previous: PresentationState;
let recorder = createRecorder(FIXTURE_FIELD, SEED);
let flagged: number[] = [];
const clock = createClock();
let observed = performance.now();

/**
 * What a frame costs, on this machine, in this browser.
 *
 * **The bench had no meter until 2026-09-01 and that was the wrong way round.**
 * `app/main.ts` has carried one since the performance session, so the *game*
 * page can say what a frame cost and the page with every open question on a
 * slider could not — and the author flew the bench, reported *"noticeable lag
 * when playing"*, and sent a dispatch that had no way to say so. A slider whose
 * cost is invisible is a slider that gets ruled on by feel alone.
 *
 * It is the same meter and the same shape on the wire, deliberately: a second
 * timing format would be a second thing to teach `tools/trail.ts` to read, and
 * the whole argument for one dispatch shape is that both ends import it.
 *
 * Unlike the shell's, this one is **not** behind `import.meta.env.DEV` — the
 * bench is a development tool in its entirety and there is no production build
 * of it to keep the module out of.
 */
let meter = createMeter();

/** Counted here rather than read out of the simulation, exactly as the trail is. */
let sinceGrab = 0;
let sinceFreeze: number | null = null;
let heldBefore: number | null = null;

function start(): void {
  sim = createInitialState(fixtureField(), fixtureCraft(), SEED);
  current = createPresentation(sim);
  previous = current;
  recorder = createRecorder(FIXTURE_FIELD, SEED);
  flagged = [];
  sinceGrab = 0;
  sinceFreeze = null;
  heldBefore = null;
  clock.unspentSeconds = 0;
  // A fresh meter with the run, for the reason `app/main.ts` gives: every frame
  // of the previous run measured a different game, and a distribution that
  // spanned a knob change is a distribution about nothing.
  meter = createMeter();
  redrawTrail();
}

function recipe(): Recipe {
  return recipeOf(recorder);
}

const fmt = (value: number, places = 0): string => value.toFixed(places);

function redrawTrail(): void {
  const trail = walkRun(recipe(), flagged);
  const rows = trail.swings
    .map((swing, index) => {
      const froze = swing.frozenAt === null ? '—' : `+${swing.frozenAt - swing.pressedAt}`;
      const cells = [
        String(index + 1),
        String(swing.pressedAt),
        `#${swing.address}`,
        fmt(swing.grabRadius),
        fmt(swing.approachSpeed),
        froze,
        fmt(swing.periapsis),
        fmt(swing.depth, 2),
        swing.releasedAt === null ? 'held' : String(swing.releasedAt),
        swing.sinceFreeze === null ? '—' : `+${swing.sinceFreeze}`,
        swing.envelope ?? '—',
        swing.exitSpeed === null ? '—' : fmt(swing.exitSpeed),
      ];
      const band = swing.envelope === null ? '' : ` class="e-${swing.envelope}"`;
      return `<tr${band}>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    .reverse()
    .join('');
  byId('swings').innerHTML =
    rows || '<tr><td colspan="12" class="empty">no swings yet — press to be caught</td></tr>';

  byId('summary').textContent =
    `${trail.ticks} ticks · ${fmt(trail.ticks / 60, 1)}s · ${trail.swings.length} swings · ` +
    `${trail.refused} refused · climbed ${fmt(trail.climbed)}`;

  byId('flags').innerHTML =
    trail.moments
      .map((moment) => {
        const where =
          moment.phase === 'coasting'
            ? 'coasting'
            : moment.phase === 'diving'
              ? `diving at #${moment.address}, ${moment.sinceGrab} ticks in`
              : `orbiting #${moment.address}, +${moment.sinceFreeze} since the freeze (${moment.envelope})`;
        return `<li><b>tick ${moment.tick}</b> · ${where} · ${fmt(moment.speed)}/s</li>`;
      })
      .join('') || '<li class="empty">nothing flagged</li>';

  byId<HTMLTextAreaElement>('dispatch').value = JSON.stringify(
    buildDispatch({
      at: new Date().toISOString(),
      recipe: recipe(),
      observed: { ticks: flagged, note: noteFor() },
      device: {
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        css: { w: window.innerWidth, h: window.innerHeight },
      },
      timing: timingOf(meter),
    }),
  );
}

/**
 * What the knobs say, so a run flown off the defaults cannot be read as one that
 * was not — and so `pnpm replay` cannot silently fly it at the repo's values.
 */
function offDefaults(): string[] {
  const off = KNOBS.filter((knob) => value(knob) !== knob.base).map(
    (knob) => `${knob.label} ${fmt(value(knob), knob.places)} (was ${fmt(knob.base, knob.places)})`,
  );
  if (!cameraKnobs.LOCK_ON) off.push('camera lock OFF');
  if (fit.FIT_WHOLE) off.push('fitted whole rather than to the width');
  return off;
}

function noteFor(): string {
  const off = offDefaults();
  const typed = byId<HTMLInputElement>('note').value.trim();
  if (off.length === 0) return typed;
  return `${typed ? typed + ' — ' : ''}FLOWN OFF DEFAULTS: ${off.join('; ')}`;
}

function value(knob: Knob): number {
  return Number(byId<HTMLInputElement>(`k-${knob.id}`).value);
}

/** Shape the stage to the chosen viewport, holding its width still. */
function shapeStage(): void {
  const chosen =
    VIEWPORTS.find((v) => v.id === byId<HTMLSelectElement>('viewport').value) ?? VIEWPORTS[0]!;
  stage.style.aspectRatio = `${chosen.w} / ${chosen.h}`;
  // The same ratio as a number, for the sticky layout: CSS can derive a width
  // from `aspect-ratio` but not a height, and the stage has to be told how tall
  // it is allowed to grow before it outruns the column it sits in. See the
  // `@media (min-width: 901px)` block in `page.html`.
  stage.style.setProperty('--stage-ratio', String(chosen.w / chosen.h));
}

/**
 * What this fit costs, in the two numbers that decide spec 00 §7.
 *
 * Both are pure geometry of the fit and independent of how large the bench
 * happens to draw it: how much of the width the composition occupies, and how
 * much world height the device gets to show.
 */
function sayFit(): void {
  const canvas = context.canvas;
  if (!canvas.width || !canvas.height) return;
  const { scale } = fit.letterbox(canvas.width, canvas.height);
  const across = ((DESIGN_WIDTH * scale) / canvas.width) * 100;
  const worldHigh = canvas.height / scale;
  const cut = Math.max(0, (DESIGN_HEIGHT - worldHigh) / 2);
  byId('fit-cost').innerHTML =
    `the composition fills <b>${across.toFixed(0)}%</b> of the width · ` +
    `you see <b>${(worldHigh / SCALE).toFixed(0)}</b> prototype units of height` +
    (cut > 0.5
      ? ` · <b class="cut">${cut.toFixed(0)} design units are cut off the top and the bottom</b>`
      : '');
}

/**
 * What the meter has to say, short enough to sit in the HUD.
 *
 * **p99 and the worst frame, never a mean**, which is
 * `docs/plan/m3-the-field.md`'s standing rule for this: a rendering-induced
 * hitch is exactly the thing an average of frames that mostly return early
 * hides. The mean is here too, but as the *fitted* one — what a frame costs
 * before any tick runs — because that is the number a budget is made of and it
 * is a different question from *did anything stall*.
 *
 * The clock is clamped to a whole millisecond in some browsers, so p99 and the
 * worst are integers and say so by being printed as integers. The fit recovers
 * fractions from the noise, which is [`meter.ts`](../meter.ts)'s own argument.
 */
function cost(): string {
  const timing = timingOf(meter);
  if (timing === null || bucketCount(timing.cpu) < 60) return '';
  const fit = frameCost(timing);
  const drawn = fit === null ? '' : ` · ${fit.perFrame.toFixed(2)}ms a frame`;
  return (
    ` · cpu p99 ${bucketAt(timing.cpu, 0.99)}ms, worst ${timing.cpu.max}ms` +
    drawn +
    // `byTicks` is indexed *by* how many ticks the frame ran, so a jump is any
    // frame at index two or above: it advanced the simulation further than it
    // displayed. A jump and a slowdown are different bugs with different fixes.
    jumps(timing.byTicks)
  );
}

/** Frames that ran two or more ticks, said only when there are any. */
function jumps(byTicks: DispatchTiming['byTicks']): string {
  let count = 0;
  for (let ran = 2; ran < byTicks.length; ran++) count += byTicks[ran]?.frames ?? 0;
  return count === 0 ? '' : ` · ${count} jumps`;
}

function hud(): void {
  const held = sim.heldBody;
  const phase = held === null ? 'coasting' : sim.orbit !== null ? 'orbiting' : 'diving';
  const band = sinceFreeze === null ? '' : ` · ${envelopeBand(sinceFreeze)}`;
  byId('hud').textContent =
    `tick ${current.tick} · ${fmt(current.craft.speed)}/s · ${phase}` +
    (held === null ? '' : ` #${held + 1} · +${sinceGrab} in`) +
    (sinceFreeze === null ? '' : ` · +${sinceFreeze} since freeze${band}`) +
    cost();

  const ending = byId('ending');
  ending.textContent = sim.ending === null ? '' : sim.ending.replace(/_/g, ' ');
  ending.className =
    sim.ending === null ? 'ending' : `ending over${sim.ending === 'CLEARED' ? ' cleared' : ''}`;
}

function frame(now: number): void {
  // `now` is the display's own timestamp for this frame, so it is what a frame
  // *period* is measured between; the cost is measured from the clock as it is
  // right now, which is later. Keeping the two apart keeps the browser's
  // scheduling delay out of a number that is supposed to be ours — `app/main.ts`
  // says the same thing at more length.
  frameBegan(meter, now, performance.now());

  const elapsedSeconds = (now - observed) / 1000;
  observed = now;

  let released = false;
  let ran = 0;
  const ticks = ticksDue(clock, elapsedSeconds);
  for (let i = 0; i < ticks; i++) {
    previous = current;
    const pressed = isPressed(press);
    if (sim.ending === null) {
      recordPress(recorder, sim.tick, pressed);
      // Ticks that *happened*, not ticks the clock bought: `stepSim` does
      // nothing once there is an ending, so counting those would tell the meter
      // a tick is cheaper than it is and stamp them all with the tick the run
      // stopped on.
      ran += 1;
    }
    const wasEnding = sim.ending;
    stepSim(sim, { pressed });
    current = derive(previous, sim);

    // Counted here, exactly as the trail counts them: the freeze's own clock is
    // never read off the orbit (ADR-0013).
    const held = sim.heldBody;
    if (held === null) {
      if (heldBefore !== null) released = true;
      sinceGrab = 0;
      sinceFreeze = null;
    } else if (heldBefore === null) {
      sinceGrab = 0;
      sinceFreeze = sim.orbit === null ? null : 0;
    } else {
      sinceGrab += 1;
      if (sim.orbit !== null) sinceFreeze = sinceFreeze === null ? 0 : sinceFreeze + 1;
    }
    heldBefore = held;
    if (wasEnding === null && sim.ending !== null) released = true;
  }

  sizeToDisplay(context);
  draw(interpolate(previous, current, clock.unspentSeconds / SECONDS_PER_TICK), context);
  hud();
  sayFit();
  if (released) redrawTrail();
  // **Last, and after the trail.** What the author is trying to find out on this
  // page is what the *game* costs at a given set of knobs, and the trail rebuild
  // is the bench's own overhead — but it lands inside the frame either way, so
  // measuring after it is the honest reading: this is what the page actually
  // delivered, which is what the eye judged.
  frameEnded(meter, performance.now(), current.tick, ran);
  requestAnimationFrame(frame);
}

// ---- the controls -------------------------------------------------------

function renderKnobs(): void {
  const markup = (knobs: Knob[]): string =>
    knobs
      .map(
        (knob) => `
      <label class="knob" for="k-${knob.id}">
        <span class="knob-head"><span class="knob-name">${knob.label}</span>
        <output id="v-${knob.id}"></output></span>
        <input type="range" id="k-${knob.id}" min="${knob.min}" max="${knob.max}"
               step="${knob.step}" value="${knob.base}" />
        <span class="knob-what">${knob.what}</span>
      </label>`,
      )
      .join('');

  // Grouped by what a change costs, which is ADR-0006's layer boundary made
  // visible: a physics constant changes what a run *is*, so the run starts
  // again and the recipe still describes it; everything below it changes only
  // the picture, and presentation state converges (ADR-0015), so it lands live
  // on the swing already in the air.
  for (const group of ['physics', 'light', 'bodies', 'compass', 'release', 'field'] as const) {
    byId(`knobs-${group}`).innerHTML = markup(KNOBS.filter((knob) => knob.group === group));
  }

  for (const knob of KNOBS) {
    const input = byId<HTMLInputElement>(`k-${knob.id}`);
    input.addEventListener('input', () => {
      knob.apply(value(knob));
      showKnob(knob);
      if (knob.restarts) start();
      else redrawTrail();
      showDefaults();
    });
    showKnob(knob);
  }
}

function showKnob(knob: Knob): void {
  const at = value(knob);
  const out = byId(`v-${knob.id}`);
  out.textContent = fmt(at, knob.places);
  out.className = at === knob.base ? '' : 'moved';
}

function showDefaults(): void {
  const off = offDefaults().length;
  const line = byId('defaults-state');
  line.textContent =
    off === 0
      ? 'every constant is where main has it'
      : `${off} ${off === 1 ? 'constant is' : 'constants are'} off default — the dispatch says so, and pnpm replay will fly this at main's values instead`;
  line.className = off === 0 ? 'state' : 'state moved';
}

renderKnobs();
byId<HTMLSelectElement>('viewport').innerHTML = VIEWPORTS.map(
  (v) => `<option value="${v.id}">${v.label}</option>`,
).join('');
shapeStage();
start();

byId('reset').addEventListener('click', (event) => {
  start();
  (event.currentTarget as HTMLElement).blur();
});
byId('flag').addEventListener('click', (event) => {
  flagged.push(sim.tick);
  redrawTrail();
  (event.currentTarget as HTMLElement).blur();
});
byId('defaults').addEventListener('click', (event) => {
  for (const knob of KNOBS) {
    byId<HTMLInputElement>(`k-${knob.id}`).value = String(knob.base);
    knob.apply(knob.base);
    showKnob(knob);
  }
  byId<HTMLInputElement>('lock').checked = true;
  cameraKnobs.set_LOCK_ON(true);
  byId<HTMLInputElement>('fitwidth').checked = false;
  fit.set_FIT_WHOLE(false);
  showDefaults();
  start();
  (event.currentTarget as HTMLElement).blur();
});
byId<HTMLSelectElement>('viewport').addEventListener('change', () => shapeStage());
byId<HTMLInputElement>('fitwidth').addEventListener('change', (event) => {
  fit.set_FIT_WHOLE((event.currentTarget as HTMLInputElement).checked);
  showDefaults();
  // So the dispatch says which reading the run was flown under: the fit changes
  // nothing about the run and everything about what the author could see of it.
  redrawTrail();
});
// **Spec 05 §3's open question**, and the reason it is a checkbox rather than a
// slider: the two readings are not two ends of a range, they are two answers.
byId<HTMLInputElement>('lock').addEventListener('change', (event) => {
  cameraKnobs.set_LOCK_ON((event.currentTarget as HTMLInputElement).checked);
  showDefaults();
  redrawTrail();
});
byId<HTMLInputElement>('note').addEventListener('input', () => redrawTrail());
byId('copy').addEventListener('click', (event) => {
  const box = byId<HTMLTextAreaElement>('dispatch');
  box.select();
  void navigator.clipboard?.writeText(box.value).catch(() => undefined);
  const button = event.currentTarget as HTMLElement;
  button.textContent = 'COPIED';
  setTimeout(() => (button.textContent = 'COPY'), 1200);
  button.blur();
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyR' && !(event.target instanceof HTMLInputElement)) start();
});

showDefaults();
requestAnimationFrame(frame);
