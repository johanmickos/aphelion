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
  settable('src/state/camera.ts', 'DEADZONE', 'an opening position; only the gate can judge it'),
  settable('src/state/camera.ts', 'FOLLOW_RATE', 'moved at the M1 gate, 8 → 3'),
  settable('src/state/camera.ts', 'LOCK_TICKS', 'the prototype’s third of a second, carried'),
  settable('src/state/camera.ts', 'RELEASE_RATE', 'what decays after a release'),

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
  settable('src/state/deformation.ts', 'DEFORM_TICKS', 'spec 02 §4’s 180ms, dated from T0'),

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

  {
    // Brightness is the only ordinal channel (spec 00 §3) and the rim's strength
    // is the renderer's own choice rather than a ruling — the disc's fill is
    // spec 00 §1's and is not touched.
    file: 'src/render/index.ts',
    find: 'const RIM_AT_REST = 0.35;',
    replace: 'export let RIM_AT_REST = 0.35;',
    append: '\nexport function set_RIM_AT_REST(value: number): void {\n  RIM_AT_REST = value;\n}\n',
    why: 'how legible a body at rest is, which the author asked to be able to move',
  },
  {
    file: 'src/render/index.ts',
    find: 'context.lineWidth = 3;',
    replace: 'context.lineWidth = RIM_WIDTH;',
    append:
      '\nexport let RIM_WIDTH = 3;\nexport function set_RIM_WIDTH(value: number): void {\n  RIM_WIDTH = value;\n}\n',
    why: 'the other half of the same legibility question',
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
