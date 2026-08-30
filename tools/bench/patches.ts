/**
 * The constants the bench makes settable, and nothing else it touches.
 *
 * `pnpm bench` builds a browser copy of the game from `src/` and rewrites a
 * handful of `export const`s into `export let`s with a setter beside them, so
 * the author can move them on a slider and fly the result. ESM live bindings do
 * the rest: a module that imported the constant sees the new value.
 *
 * **They are not settable in `src/` itself, deliberately.**
 * [AGENTS.md](../../AGENTS.md) §6 asks a new knob for an argument about why the
 * decision cannot be made once, inside, and *"so it can be flown on a bench"* is
 * not that argument — it is an argument for a bench. The prototype's
 * seventy-eight-key config is the thing this rewrite exists to not become.
 *
 * ## Every patch is an assertion
 *
 * Each `find` below must appear in the real source **exactly once**, and
 * `test/bench.test.ts` holds that on every run of `pnpm check`. So a constant
 * that is renamed, moved or reworded fails the suite with the patch that no
 * longer applies, rather than silently producing a bench whose sliders are wired
 * to nothing — which is the failure that matters, because a bench that lies is
 * worse than no bench.
 */

export interface Patch {
  /** Path under the repo root. */
  readonly file: string;
  /** Text that must appear exactly once in the real source. */
  readonly find: string;
  readonly replace: string;
  /** Appended to the file after the replacement, if any. */
  readonly append?: string;
  /** Why this one exists, for the reader of a failing test. */
  readonly why: string;
}

/** `export const X = …` becomes a settable binding with a setter beside it. */
function settable(file: string, name: string, why: string): Patch {
  return {
    file,
    find: `export const ${name} =`,
    replace: `export let ${name} =`,
    append: `\nexport function set_${name}(value: number): void {\n  ${name} = value;\n}\n`,
    why,
  };
}

export const PATCHES: readonly Patch[] = [
  settable('src/sim/units.ts', 'MASS_EXPONENT', 'spec 01 §13.2, deferred by the author'),
  settable('src/sim/units.ts', 'ECCENTRICITY_CAP', 'spec 01 §13.5, deferred by the author'),
  settable('src/sim/units.ts', 'GRAZE_RATIO', 'spec 01 §10 — how head-on a contact has to be'),
  settable('src/sim/units.ts', 'GRAZE_RESTITUTION', 'spec 01 §10 leaves it unstated'),
  settable('src/sim/units.ts', 'BOUNCE_RESTITUTION', 'moved at the M1 gate, 0.6 → 0.2'),
  settable('src/sim/units.ts', 'CLIMB_BIAS', 'how much a press prefers a body up the climb'),
  settable(
    'src/sim/units.ts',
    'SETTLE_RETURN',
    'how much of the dive the settle leaves the orbit with — 0 is the governor',
  ),
  settable(
    'src/sim/units.ts',
    'TRANSIENT_SHARE',
    'spec 01 §8 measured ×1.8; 0.45 is what was flown',
  ),
  settable(
    'src/sim/units.ts',
    'TRANSIENT_SECONDS',
    'spec 01 §8’s 1.3s, decaying linearly to nothing',
  ),
  settable('src/state/camera.ts', 'DEADZONE', 'an opening position; only the gate can judge it'),
  settable('src/state/camera.ts', 'FOLLOW_RATE', 'moved at the M1 gate, 8 → 3'),
  settable('src/state/camera.ts', 'LOCK_TICKS', 'the prototype’s third of a second, carried'),

  // Spec 00 §3's ordinal channel, read into design units. The radii are the
  // board's own numbers times three (ADR-0010) and the reading is the thing to
  // fly: a bloom the author cannot see moving is a bloom nobody can rule on.
  settable('src/state/energy.ts', 'E1_BLOOM', 'spec 00 §3 · body rims, labels, a window at rest'),
  settable('src/state/energy.ts', 'E2_BLOOM', 'spec 00 §3 · the craft, and a held body'),
  settable('src/state/energy.ts', 'E3_BLOOM', 'spec 00 §3 · the release and the grab'),
  settable('src/state/energy.ts', 'E3_TICKS', 'spec 00 §3’s 400ms, and the only one it states'),
  settable(
    'src/state/decay.ts',
    'OVERSHOOT_FROM',
    'the rebound shape everything that homes shares',
  ),
  settable('src/state/deformation.ts', 'STRETCH_ALONG', 'spec 02 §4, still to be flown'),
  settable('src/state/deformation.ts', 'STRETCH_ACROSS', 'the other half of the same stretch'),

  // Spec 02's release, rebased on ADR-0012 and then moved again: the camera's
  // share of the punch was flown and refused (2026-08-29), so quality is spent on
  // the craft's own stretch instead. `PUNCH_FLOOR` is the argument in one slider —
  // at 1 it is spec 02 §4 exactly as it was written, with quality reaching
  // nothing.
  settable(
    'src/state/punch.ts',
    'PUNCH_FLOOR',
    'what a release of no quality still earns of the stretch',
  ),
  settable('src/state/punch.ts', 'PUNCH_TICKS', 'spec 02 §4’s 180ms home, with one overshoot'),
  settable(
    'src/state/punch.ts',
    'PUNCH_STRETCH',
    'ADR-0012’s “half again as long” at full quality',
  ),

  // The callout. `LINGER_TICKS` is the one number in this milestone two specs
  // disagree about — spec 02 §2 ends the word at T+510ms and spec 06 §4's own
  // pop, linger and decay sum to 1 720ms — so it is on a slider until the author
  // says which reading is the game's.
  settable(
    'src/state/callout.ts',
    'LINGER_TICKS',
    'spec 06 §4 says 1.2s and spec 02 §2 implies 0.4s',
  ),
  settable(
    'src/state/callout.ts',
    'POP_RISE',
    'how far the word climbs over its life — the prototype’s 34, converted',
  ),
  {
    file: 'src/render/index.ts',
    find: 'const FLOWN_FLOOR = 0.22;',
    replace: 'export let FLOWN_FLOOR = 0.22;',
    append: '\nexport function set_FLOWN_FLOOR(value: number): void {\n  FLOWN_FLOOR = value;\n}\n',
    why: 'how faint the flown arc goes where the boost is worth nothing',
  },

  {
    // The lock is the one camera mechanism with no number that turns it off:
    // `LOCK_TICKS` of 0 makes it arrive instantly rather than not at all, and
    // what the author needs to judge is what it buys.
    file: 'src/state/camera.ts',
    find: `export function lockOf(sim: SimState): number {
  const orbit = sim.orbit;`,
    replace: `export let LOCK_ON = true;
export function set_LOCK_ON(value: boolean): void {
  LOCK_ON = value;
}

export function lockOf(sim: SimState): number {
  if (!LOCK_ON) return 0;
  const orbit = sim.orbit;`,
    why: 'the lock has no off switch of its own',
  },

  // Spec 04's body language. The rim's weight stopped being one number when
  // §3 gave it four — one per state — so the knob the author asked for is now
  // the one §3 puts a number on, its strength at rest.
  settable(
    'src/state/body.ts',
    'TIDE_HALF_WIDTH_MAX',
    'spec 04 §2 states ±0.3 rad at the median and not the law',
  ),
  settable(
    'src/state/body.ts',
    'TIDE_LAG_RATE_MAX',
    'spec 04 §2’s k ≈ 6/s, and the lag is the behaviour',
  ),
  settable(
    'src/state/sighting.ts',
    'SIGHTING_RADIUS',
    'Direction 03 draws a dot and states no size',
  ),
  {
    // Brightness is the only ordinal channel (spec 00 §3) and the rim's strength
    // is the renderer's own choice rather than a ruling — the disc's fill is
    // spec 00 §1's and is not touched.
    file: 'src/render/index.ts',
    find: 'const RIM_AT_REST = 0.4;',
    replace: 'export let RIM_AT_REST = 0.4;',
    append: '\nexport function set_RIM_AT_REST(value: number): void {\n  RIM_AT_REST = value;\n}\n',
    why: 'how legible a body at rest is, which the author asked to be able to move',
  },
  {
    file: 'src/render/index.ts',
    find: 'const TIDE_WIDTH = 4 * BOARD_PIXEL;',
    replace: 'export let TIDE_WIDTH = 4 * BOARD_PIXEL;',
    append: '\nexport function set_TIDE_WIDTH(value: number): void {\n  TIDE_WIDTH = value;\n}\n',
    why: 'the other half of the same legibility question, now that §1 owns the rim',
  },
  {
    file: 'src/render/index.ts',
    find: 'const TIDE_SWELL = 1;',
    replace: 'export let TIDE_SWELL = 1;',
    append: '\nexport function set_TIDE_SWELL(value: number): void {\n  TIDE_SWELL = value;\n}\n',
    why: 'how much thicker the tide draws as the craft closes — zero is the old behaviour',
  },
  {
    file: 'src/render/index.ts',
    find: 'const HAND_AT_AIM = 0.55;',
    replace: 'export let HAND_AT_AIM = 0.55;',
    append: '\nexport function set_HAND_AT_AIM(value: number): void {\n  HAND_AT_AIM = value;\n}\n',
    why: 'and the other end of the same line, now that both are stated',
  },
  {
    file: 'src/render/index.ts',
    find: 'const CROSSING_AT_REST = 0.3;',
    replace: 'export let CROSSING_AT_REST = 0.3;',
    append:
      '\nexport function set_CROSSING_AT_REST(value: number): void {\n  CROSSING_AT_REST = value;\n}\n',
    why: 'how bright the dots on the hand are before the aim closes',
  },
  {
    file: 'src/render/index.ts',
    find: 'const TIDE_FLOOR = 0.4;',
    replace: 'export let TIDE_FLOOR = 0.4;',
    append: '\nexport function set_TIDE_FLOOR(value: number): void {\n  TIDE_FLOOR = value;\n}\n',
    why: 'spec 04 §2 says brighter with mass and states neither end',
  },

  // Spec 00 §6's compass. Every one of these is a number the spec leaves to the
  // picture, except the ring count — which is measured, and worth flying to see
  // whether four reads as four.
  settable('src/sim/compass.ts', 'RINGS', 'measured at four over 342 conversions, not chosen'),
  settable('src/state/compass.ts', 'RING_INNER', 'how far the instrument clears the orbit'),
  settable('src/state/compass.ts', 'RING_SPREAD', 'how much of the stack the furthest body gets'),
  settable(
    'src/state/compass.ts',
    'RING_MIN_GAP',
    'how far apart two rings are held whatever their windows are doing',
  ),
  settable(
    'src/sim/compass.ts',
    'AIM_RANGE',
    'spec 00 §6 leaves “reachable” open; the prototype had a number',
  ),
  settable(
    'src/sim/compass.ts',
    'MIN_HALF_WIDTH',
    'the narrowest arc worth aiming at, ruled 2026-08-29',
  ),
  settable('src/state/body.ts', 'EMIT_AT', 'how much grip it takes before a body lights up at all'),
  settable(
    'src/state/body.ts',
    'TIDE_GROWTH',
    'the A/B: 0 is width from mass alone, 1 from proximity',
  ),
  settable(
    'src/state/body.ts',
    'TIDE_LIFT',
    'how far proximity lifts the tide’s brightness toward full',
  ),
  settable(
    'src/state/compass.ts',
    'FILAMENT_FLOOR',
    'how faint the tether goes once the craft is outside the body’s hold',
  ),
  settable(
    'src/state/compass.ts',
    'FILAMENT_SPAN',
    'how much of the reach the tether spends its whole fade across',
  ),
  settable(
    'src/state/compass.ts',
    'PATH_FADE_RATE',
    'how fast the oval fades in once it is possible',
  ),
  settable('src/state/body.ts', 'SPEND_TICKS', 'how long a body takes to go out after a release'),
  settable('src/state/compass.ts', 'ENTER_FROM', 'spec 00 §5’s ENTER: how small it starts'),
  settable('src/state/compass.ts', 'ENTER_TICKS', 'and how long it takes to come online'),
  settable(
    'src/state/compass.ts',
    'EXIT_BY',
    'how far in the instrument draws as it leaves — the mirror of ENTER_FROM',
  ),
  settable('src/state/compass.ts', 'EXIT_TICKS', 'and how long it takes to go'),
  {
    file: 'src/render/index.ts',
    find: 'const BODY_BLOOM = 0.35;',
    replace: 'export let BODY_BLOOM = 0.35;',
    append: '\nexport function set_BODY_BLOOM(value: number): void {\n  BODY_BLOOM = value;\n}\n',
    why: 'how much a planet glows, asked to be lessened a lot on 2026-08-29',
  },
  settable('src/state/sighting.ts', 'SIGHTING_RANGE', 'spec 03 §6’s “reach is not yet a number”'),
  {
    file: 'src/render/index.ts',
    find: 'const GRIP_SPAN = 200 * BOARD_PIXEL;',
    replace: 'export let GRIP_SPAN = 200 * BOARD_PIXEL;',
    append: '\nexport function set_GRIP_SPAN(value: number): void {\n  GRIP_SPAN = value;\n}\n',
    why: 'how wide the proximity halo reaches, asked for on 2026-08-29',
  },
  {
    file: 'src/render/index.ts',
    find: 'const GRIP_STRENGTH = 0.16;',
    replace: 'export let GRIP_STRENGTH = 0.16;',
    append:
      '\nexport function set_GRIP_STRENGTH(value: number): void {\n  GRIP_STRENGTH = value;\n}\n',
    why: 'and how faint it is, which is the other half of “tastefully so”',
  },
  {
    file: 'src/render/index.ts',
    find: 'const E1_STRENGTH = 0.18;',
    replace: 'export let E1_STRENGTH = 0.18;',
    append: '\nexport function set_E1_STRENGTH(value: number): void {\n  E1_STRENGTH = value;\n}\n',
    why: 'spec 00 §3 says 35%; flown, all of it was too much',
  },
  {
    file: 'src/render/index.ts',
    find: 'const E2_STRENGTH = 0.3;',
    replace: 'export let E2_STRENGTH = 0.3;',
    append: '\nexport function set_E2_STRENGTH(value: number): void {\n  E2_STRENGTH = value;\n}\n',
    why: 'the same for the craft and a held body — spec 00 §3 says 60%',
  },
  {
    file: 'src/render/index.ts',
    find: 'const WINDOW_AT_REST = 0.22;',
    replace: 'export let WINDOW_AT_REST = 0.22;',
    append:
      '\nexport function set_WINDOW_AT_REST(value: number): void {\n  WINDOW_AT_REST = value;\n}\n',
    why: 'how vibrant a window is before aim closes',
  },
  {
    file: 'src/render/index.ts',
    find: 'const WINDOW_WIDTH = 3 * BOARD_PIXEL;',
    replace: 'export let WINDOW_WIDTH = 3 * BOARD_PIXEL;',
    append:
      '\nexport function set_WINDOW_WIDTH(value: number): void {\n  WINDOW_WIDTH = value;\n}\n',
    why: 'how heavy an arc is, which is the first thing the eye finds',
  },
  {
    file: 'src/render/index.ts',
    find: 'const DOT_RADIUS = 3 * BOARD_PIXEL;',
    replace: 'export let DOT_RADIUS = 3 * BOARD_PIXEL;',
    append: '\nexport function set_DOT_RADIUS(value: number): void {\n  DOT_RADIUS = value;\n}\n',
    why: 'the perfect release, and the only mark the hand has to land on',
  },
  {
    file: 'src/render/index.ts',
    find: 'const HAND_AT_REST = 0.18;',
    replace: 'export let HAND_AT_REST = 0.18;',
    append:
      '\nexport function set_HAND_AT_REST(value: number): void {\n  HAND_AT_REST = value;\n}\n',
    why: 'spec 00 §6 brightens the hand as aim closes and states neither end',
  },

  {
    // Spec 00 §7's ruling: the width is the contract and the height flexes.
    // Built today as the whole rectangle fitted; M3.1 changes it. Both readings
    // are here so the one that is coming can be flown against the one that is.
    file: 'src/render/letterbox.ts',
    find: '  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);',
    replace: `  const scale = FIT_WIDTH
    ? width / DESIGN_WIDTH
    : Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);`,
    append:
      '\nexport let FIT_WIDTH = false;\nexport function set_FIT_WIDTH(value: boolean): void {\n  FIT_WIDTH = value;\n}\n',
    why: 'spec 00 §7 is ruled and M3.1 builds it; both readings are flyable meanwhile',
  },

  {
    // The trail reader is the same one `pnpm replay` prints, which is the point
    // — the bench must not grow a second opinion about where on the envelope a
    // release fell. It reaches `node:crypto` for one digest the bench never
    // shows.
    file: 'tools/trail.ts',
    find: "import { createHash } from 'node:crypto';\n",
    replace: '',
    why: 'the browser has no node:crypto, and the bench never prints the digest',
  },
  {
    file: 'tools/trail.ts',
    find: `export function fingerprint(state: SimState): string {
  return createHash('sha256').update(snapshot(state)).digest('hex').slice(0, 16);
}`,
    replace: `export function fingerprint(state: SimState): string {
  // Stubbed for the bench, which never prints it. The real one is pnpm replay's.
  return String(snapshot(state).length);
}`,
    why: 'the digest goes with the import above',
  },
];
