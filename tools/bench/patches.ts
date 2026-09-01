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
 * ## What earns a slider, and what loses one
 *
 * **Cut from 74 to 50 on 2026-09-01**, at the author's request — *"there are a
 * LOT of knobs right now, some are stale"* — against one rule, which the rung
 * label's own ruling established the day before: **a knob whose question has
 * been answered comes off the bench**, because it invites the answer to be
 * re-litigated by whoever finds it next.
 *
 * A constant earns a slider if moving it can still change a decision:
 *
 *   - it is a question `docs/spec/README.md` lists as **open**, or the spec
 *     states no number and none has been ruled;
 *   - the author is **still moving it** — a taste that has moved twice is a
 *     taste the next flight may move again, which is a different thing from a
 *     question that has been closed once;
 *   - it switches a built thing **off**, where zero is a real off and the
 *     feature is parked rather than settled (the bow, the wake, the lock).
 *
 * It loses one when the author has ruled it on a dated flight with a measurement
 * behind it, when the design states the number outright and nobody has ever
 * questioned it, or when the system it belongs to is **parked** — the camera's
 * three went for that reason and the plan's camera note is where they come back
 * from.
 *
 * **And a patch with no slider is worse than no patch**: six constants were
 * settable here that nothing in `entry.ts` ever drove, which the test below
 * could not see because it only asks whether the text still matches. They are
 * gone, and the pair is now exactly balanced — every patch has a slider and
 * every slider has a patch.
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
  settable('src/sim/units.ts', 'CLIMB_BIAS', 'how much a press prefers a body up the climb'),
  settable(
    'src/sim/units.ts',
    'SETTLE_RETURN',
    'how much of the dive the settle leaves the orbit with — 0 is the governor',
  ),
  settable(
    'src/sim/units.ts',
    'DIVE_PAYBACK',
    'how much of the fall an unfinished swing gives back — 0 is the behaviour before 2026-08-30',
  ),
  settable(
    'src/sim/units.ts',
    'TRANSIENT_SHARE',
    'spec 01 §8 measured ×1.8; 0.45 is what was flown',
  ),
  settable(
    'src/state/decay.ts',
    'OVERSHOOT_FROM',
    'the rebound shape everything that homes shares',
  ),

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

  // The callout. `LINGER_TICKS` is the one number in this milestone two specs
  // disagree about — spec 02 §2 ends the word at T+510ms and spec 06 §4's own
  // pop, linger and decay sum to 1 720ms — so it is on a slider until the author
  // says which reading is the game's.
  settable(
    'src/state/callout.ts',
    'LINGER_TICKS',
    'spec 06 §4 says 1.2s and spec 02 §2 implies 0.4s',
  ),
  {
    file: 'src/render/index.ts',
    find: 'const FLOWN_FLOOR = 0.22;',
    replace: 'export let FLOWN_FLOOR = 0.22;',
    append: '\nexport function set_FLOWN_FLOOR(value: number): void {\n  FLOWN_FLOOR = value;\n}\n',
    why: 'how faint the flown arc goes where the boost is worth nothing',
  },

  {
    // **The one camera control the bench keeps**, and the three that were beside
    // it are gone: the camera is parked at the author's request
    // (`docs/plan/m2-the-instrument.md`), so its numbers are not the bench's to
    // move. This is not a number — it turns a mechanism off, which is how the
    // parked question gets *demonstrated* rather than tuned, and the lock has no
    // off switch of its own.
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
    why: 'the lock has no off switch of its own, and the camera is parked',
  },

  // Spec 04's body language. The rim's weight stopped being one number when
  // §3 gave it four — one per state — so the knob the author asked for is now
  // the one §3 puts a number on, its strength at rest.
  settable(
    'src/state/body.ts',
    'TIDE_HALF_WIDTH_MAX',
    'spec 04 §2 states ±0.3 rad at the median and not the law',
  ),
  {
    // Brightness is the only ordinal channel (spec 00 §3) and the rim's strength
    // is the renderer's own choice rather than a ruling — the disc's fill is
    // spec 00 §1's and is not touched.
    file: 'src/render/index.ts',
    find: 'const RIM_AT_REST = 0.34;',
    replace: 'export let RIM_AT_REST = 0.34;',
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
  settable('src/state/compass.ts', 'RING_INNER', 'how far the instrument clears the orbit'),
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
  settable('src/state/compass.ts', 'ENTER_FROM', 'spec 00 §5’s ENTER: how small it starts'),
  settable(
    'src/state/compass.ts',
    'EXIT_BY',
    'how far in the instrument draws as it leaves — the mirror of ENTER_FROM',
  ),
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
    find: 'export const E1_STRENGTH = 0.18;',
    replace: 'export let E1_STRENGTH = 0.18;',
    append: '\nexport function set_E1_STRENGTH(value: number): void {\n  E1_STRENGTH = value;\n}\n',
    why: 'spec 00 §3 says 35%; flown, all of it was too much',
  },
  {
    file: 'src/render/index.ts',
    find: 'export const E2_STRENGTH = 0.3;',
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
    // Spec 00 §7's ruling: the width is the contract and the height flexes. It is
    // **built** as of 2026-08-30 and this toggle now goes the other way — back to
    // the whole rectangle fitted — so the reading that was replaced stays flyable
    // beside the one that replaced it.
    file: 'src/render/letterbox.ts',
    find: '  const scale = Math.min(fromWidth, showsTheBand);',
    replace: `  const scale = FIT_WHOLE
    ? Math.min(fromWidth, height / DESIGN_HEIGHT)
    : Math.min(fromWidth, showsTheBand);`,
    append:
      '\nexport let FIT_WHOLE = false;\nexport function set_FIT_WHOLE(value: boolean): void {\n  FIT_WHOLE = value;\n}\n',
    why: 'the fit spec 00 §7 replaced, kept flyable beside the one that replaced it',
  },

  // Spec 05's field. Everything here is either a number the spec deferred, a
  // number the author moved on the first flight, or the open question itself —
  // which is exactly what §7 says a bench is for.
  settable(
    'src/state/rung.ts',
    'RUNG_SPACING',
    'spec 05 §3 deferred it; 25 m flew as “chaotic at speed” and it is 50 now',
  ),
  settable(
    'src/state/rung.ts',
    'BOW_GAIN',
    'the board’s gravityBend, whose own slider runs 0 – 44',
  ),
  settable(
    'src/state/rung.ts',
    'BOW_CAP',
    'spec 05 says 30px; 30 broke its own monotonic acceptance',
  ),
  // The author flew the sideways camera and asked for it lazier on the first
  // flight, which is a taste that has moved once and may move again — the bench's
  // own rule for what earns a slider. 328 is the prototype's own margin.
  settable(
    'src/state/camera.ts',
    'SIDEWAYS_BAND',
    'how far the craft drifts sideways before the view follows \u2014 the prototype\u2019s 0.28\u00d7W',
  ),
  settable('src/state/rung.ts', 'BOW_FALLOFF', 'how wide a patch of field a body bends'),
  settable('src/state/rung.ts', 'WAKE_AMPLITUDE', 'the board’s wake, whose own slider runs 0 – 34'),
  settable('src/state/rung.ts', 'WAKE_FALLOFF', 'how much of the field the craft parts as it goes'),
  {
    file: 'src/render/rungs.ts',
    find: 'const RUNG_STEP = 8 * BOARD_PIXEL;',
    replace: 'export let RUNG_STEP = 8 * BOARD_PIXEL;',
    append: '\nexport function set_RUNG_STEP(value: number): void {\n  RUNG_STEP = value;\n}\n',
    why: 'how finely a bow is drawn, and the first number to move if the budget fails',
  },
  // Spec 05 §4 and §5's sky, dust and anomaly. Two of these are open questions
  // the spec names — where an anomaly sits is spec 17's and does not exist yet,
  // and how far ahead the sky reads it is derived rather than ruled — and the
  // third is the loudness of a layer that has never been flown.
  settable(
    'src/state/anomaly.ts',
    'ANOMALY_AT',
    'where the anomaly sits, as a fraction of the field — spec 17’s, and 0 drags it to the foot',
  ),
  settable(
    'src/state/anomaly.ts',
    'ANOMALY_SPAN',
    'how much field an anomaly covers — the prototype’s shelter, 800 m',
  ),
  settable(
    'src/state/anomaly.ts',
    'SKY_LEAD',
    'how far ahead the sky warms — derived from the picture, not ruled',
  ),
  // Flown and refused on the first build: the board's 90 ms was authored
  // against a climb this game passes at its own median, and against the rungs
  // the streaks read as brickwork. Zero is a pure stipple.
  settable(
    'src/render/dust.ts',
    'DUST_EXPOSURE',
    'how long the shutter is open — the board’s own 90 ms is 5.4, and it flew as bricks',
  ),
  // Added the day the sliders were cut, and it earns its place by a
  // measurement: a mote is one CSS pixel on the author's phone, which is the
  // size the starfield was already refused at once.
  settable(
    'src/render/dust.ts',
    'DUST_WIDTH',
    'a mote is one CSS pixel on the phone — the size the sky was refused at',
  ),
  settable(
    'src/render/dust.ts',
    'DUST_PER_SCREEN',
    'Direction 05’s own density was the opening position; the author ruled 40',
  ),
  // The sky needed exactly this knob within a day of landing, and for exactly
  // this reason. Dust is a third system saying *speed* and how loud it should
  // be against the rungs is a judgement about a moving picture.
  settable(
    'src/render/dust.ts',
    'DUST_STRENGTH',
    'how loud the dust is against the rungs — the sky’s own knob, one layer forward',
  ),

  // **Spec 07 §3 states the law and says only that `K` is "tuned on the phone"**,
  // so this is the one constant on the boundary the spec itself sends to a bench.
  // 640 m/s is derived from Direction 07's own ratio of `K` to its fastest dive,
  // and the acceptance criterion caps it independently at 807.
  // The author overruled spec 04 §1's flat `#100C20` disc for a held body on
  // 2026-09-01. 0.30 is derived against the anomaly's own cloud bed rather than
  // chosen, and how much of it a body wants is still a moving picture.
  settable(
    'src/render/index.ts',
    'HELD_FILL',
    'how much of its own light a held body\u2019s disc carries \u2014 0 is spec 04\u2019s flat black',
  ),
  settable(
    'src/state/boundary.ts',
    'CLOSING_CONSTANT',
    'spec 07 §3 says only “tuned on the phone” — the number the first law lives in',
  ),
  // Which of two readings of spec 07 §2 is right — the motes rise with heat from
  // nothing, or from a floor — is a judgement about a moving picture, and this is
  // the number that decides it.
  settable(
    'src/render/boundary.ts',
    'MOTE_AT_REST',
    'how lit a price tag is when the edge is calm — 0 is the spec read literally',
  ),
  settable(
    'src/render/boundary.ts',
    'OUTER_MOTES',
    'Direction 07’s own density, split so the fire band is the denser of the two',
  ),
  settable('src/render/boundary.ts', 'FIRE_MOTES', 'and the fire band’s half of it'),

  // The author's answer to the question `starfield.ts` said to ask once the
  // rungs landed: it keeps its place and comes down. How far down is taste, and
  // it came down twice — again on 2026-09-01, once dust arrived between the sky
  // and the rungs and all three were re-ranked in one sitting.
  settable(
    'src/render/starfield.ts',
    'STAR_STRENGTH',
    '“much less noticeable… only as background noise”, and halved again once dust arrived',
  ),

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
