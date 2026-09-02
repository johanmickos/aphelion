/**
 * The envelope that carries a recipe plus what the author observed —
 * `CONTEXT.md`'s **dispatch** — and the endpoint that decides whether to keep
 * one.
 *
 * Both are tested rather than trusted for the same reason `parseDiagReport` is:
 * the dev server binds every interface on the LAN so a phone can reach it, and
 * these are the things standing between "something POSTed" and "a file was
 * written". The recipe inside is the sharp part and has its own suite
 * (`test/sim/recipe.test.ts`); what is here is the envelope, and the rule that
 * the endpoint tells the two kinds apart without either learning the other's
 * latitude.
 */
import { describe, expect, it } from 'vitest';
import {
  DISPATCH_KIND,
  MAX_FLAGGED_TICKS,
  MAX_NOTE_LENGTH,
  buildDispatch,
  parseDispatch,
} from '../tools/dispatch.ts';
import { MAX_WORST_FRAMES, TIMING_BUCKETS } from '../tools/meter.ts';
import { MAX_CATCH_UP_TICKS } from '../src/sim/units.ts';
import { receive, sourceStamp } from '../tools/vite-plugin-diag.ts';
import { FIXTURE_FIELD_VERSION } from '../src/sim/fixture-field.ts';
import { RECIPE_VERSION } from '../src/sim/recipe.ts';
import { SIM_VERSION } from '../src/sim/version.ts';

const recipe = {
  version: RECIPE_VERSION,
  field: { generator: 'fixture', version: FIXTURE_FIELD_VERSION },
  sim: SIM_VERSION,
  seed: 1,
  ticks: 600,
  log: [12, 90, 240, 401],
};

const dispatch = {
  kind: DISPATCH_KIND,
  at: '2026-08-28T09:14:02.113Z',
  recipe,
  observed: { ticks: [240], note: 'the grab feels late off the second body' },
  device: { ua: 'a phone', dpr: 3, css: { w: 393, h: 651 } },
};

const stats = { p50: 1, p95: 2, p99: 3, max: 4 };
const timingReport = {
  kind: 'renderer-spike',
  at: '2026-08-27T12:00:00.000Z',
  device: {
    ua: 'test',
    dpr: 3,
    css: { w: 390, h: 844 },
    backing: { w: 1170, h: 2532 },
    webgl2: true,
  },
  scene: { rungs: 120 },
  runs: [
    {
      id: 'a',
      label: '(a) Canvas2D',
      ok: true,
      note: '',
      frames: 600,
      cpu: stats,
      interval: stats,
      dropped: 0,
      drift: { early: 3, late: 3 },
    },
  ],
};

describe('parseDispatch', () => {
  it('accepts a well-formed one', () => {
    const parsed = parseDispatch(structuredClone(dispatch));
    expect(parsed.recipe.seed).toBe(1);
    expect(parsed.observed.ticks).toEqual([240]);
    expect(parsed.device?.css.w).toBe(393);
  });

  /**
   * A dispatch with no device was not flown by a person — the headless pilot
   * writes recipes too, and the one `pnpm replay` ships with is one of them. The
   * absence is the meaning, so it has to survive rather than be defaulted away.
   */
  it('accepts one that was not flown on a device', () => {
    const { device: _device, ...headless } = structuredClone(dispatch);
    expect(parseDispatch(headless).device).toBeUndefined();
  });

  it.each([
    ['something that is not an object', 'a dispatch'],
    ['a kind it does not know', { ...dispatch, kind: 'renderer-spike' }],
    ['a kind that is missing', { ...dispatch, kind: undefined }],
    ['a recipe that is not one', { ...dispatch, recipe: { ...recipe, log: [12, 9] } }],
    ['no recipe at all', { ...dispatch, recipe: undefined }],
    ['nothing observed', { ...dispatch, observed: undefined }],
    ['a note that is not a string', { ...dispatch, observed: { ticks: [], note: 7 } }],
    [
      'a note nobody could have typed',
      { ...dispatch, observed: { ticks: [], note: 'x'.repeat(MAX_NOTE_LENGTH + 1) } },
    ],
    [
      'more flagged ticks than a thumb can produce',
      {
        ...dispatch,
        observed: { ticks: Array.from({ length: MAX_FLAGGED_TICKS + 1 }, () => 1), note: '' },
      },
    ],
    ['a flagged tick the run never reached', { ...dispatch, observed: { ticks: [601], note: '' } }],
    ['a flagged tick that is not a tick', { ...dispatch, observed: { ticks: [1.5], note: '' } }],
    ['a device with no size', { ...dispatch, device: { ua: 'a phone', dpr: 3 } }],
    [
      'a user agent longer than any',
      { ...dispatch, device: { ...dispatch.device, ua: 'x'.repeat(401) } },
    ],
  ])('refuses %s', (_what, raw) => {
    expect(() => parseDispatch(raw)).toThrow();
  });

  /**
   * What comes back shares nothing with what went in, which is what lets the
   * endpoint write *this* to disk rather than the bytes it was handed.
   */
  it('rebuilds rather than blessing what it was handed', () => {
    const parsed = parseDispatch({ ...structuredClone(dispatch), somethingElse: 'ignored' });
    expect(Object.keys(parsed).sort()).toEqual(['at', 'device', 'kind', 'observed', 'recipe']);
  });
});

/**
 * A timing block that is internally consistent — three frames, counted the same
 * way by every part of it. Each test below breaks exactly one thing about it.
 */
const bucketsWith = (at: Record<number, number>): number[] =>
  Array.from({ length: TIMING_BUCKETS }, (_, i) => at[i] ?? 0);

const timing = {
  frames: 3,
  cpu: { buckets: bucketsWith({ 4: 2, 30: 1 }), total: 39.2, max: 30.4 },
  interval: { buckets: bucketsWith({ 16: 2, 33: 1 }), total: 66.1, max: 33.4 },
  byTicks: [
    { frames: 0, cpu: 0 },
    { frames: 2, cpu: 8.8 },
    { frames: 1, cpu: 30.4 },
    { frames: 0, cpu: 0 },
  ],
  worst: [{ tick: 240, cpu: 30.4, interval: 33.4, ticks: 2 }],
  timeline: [
    { tick: 120, frames: 2, cpu: 8.8, interval: 32.8, jumps: 0, worst: 16.7 },
    { tick: 240, frames: 1, cpu: 30.4, interval: 33.3, jumps: 1, worst: 33.3 },
  ],
};

const withTiming = (change: Record<string, unknown> = {}): unknown => ({
  ...dispatch,
  timing: { ...timing, ...change },
});

/**
 * The timing block arrived by **extending** this validator, which is the rule
 * `vite-plugin-diag.ts` states: the endpoint writes files on a LAN interface, so
 * a second shape is a second surface and it is held to the same line as the
 * first. Two of these are invariants rather than range checks — a meter cannot
 * produce a block whose parts disagree about how many frames there were, so one
 * that does was not produced by a meter.
 */
describe('parseDispatch · the timing block', () => {
  it('accepts a dispatch that carries none, because four already do not', () => {
    expect(parseDispatch(dispatch).timing).toBeUndefined();
  });

  it('accepts a well-formed one and rebuilds it', () => {
    const parsed = parseDispatch(withTiming());
    expect(parsed.timing?.frames).toBe(3);
    expect(parsed.timing?.cpu.buckets).toHaveLength(TIMING_BUCKETS);
    expect(parsed.timing?.worst[0]?.tick).toBe(240);
  });

  it('refuses a histogram of the wrong length, which is what bounds the bytes', () => {
    expect(() => parseDispatch(withTiming({ cpu: { ...timing.cpu, buckets: [1, 2, 3] } }))).toThrow(
      /buckets/,
    );
  });

  it('refuses a block whose distributions disagree about how many frames there were', () => {
    expect(() => parseDispatch(withTiming({ frames: 4 }))).toThrow(/frames but holds/);
  });

  it('refuses tick groups that do not add up to the frames counted', () => {
    expect(() =>
      parseDispatch(
        withTiming({
          byTicks: [
            { frames: 0, cpu: 0 },
            { frames: 1, cpu: 4.4 },
            { frames: 1, cpu: 30.4 },
            { frames: 0, cpu: 0 },
          ],
        }),
      ),
    ).toThrow(/tick groups hold 2 frames, not 3/);
  });

  it('refuses a frame named at a tick the run never reached', () => {
    expect(() => parseDispatch(withTiming({ worst: [{ ...timing.worst[0], tick: 900 }] }))).toThrow(
      /outside a run of 600/,
    );
  });

  it('refuses a frame claiming more ticks than the clamp allows', () => {
    expect(() =>
      parseDispatch(withTiming({ worst: [{ ...timing.worst[0], ticks: MAX_CATCH_UP_TICKS + 1 }] })),
    ).toThrow(/the clamp is/);
  });

  it('refuses more named frames than the cap', () => {
    const many = Array.from({ length: MAX_WORST_FRAMES + 1 }, () => timing.worst[0]);
    expect(() => parseDispatch(withTiming({ worst: many }))).toThrow(/more than/);
  });

  it('accepts timing with no timeline, because the first two dispatches had none', () => {
    const { timeline: _dropped, ...older } = timing;
    const parsed = parseDispatch({ ...dispatch, timing: older });
    expect(parsed.timing?.timeline).toEqual([]);
    expect(parsed.timing?.frames).toBe(3);
  });

  it('refuses a timeline that does not add up to the frames counted', () => {
    expect(() => parseDispatch(withTiming({ timeline: [timing.timeline[0]] }))).toThrow(
      /timeline holds 2 frames, not 3/,
    );
  });

  it('refuses a segment holding more jumps than it holds frames', () => {
    expect(() =>
      parseDispatch(
        withTiming({
          timeline: [timing.timeline[0], { ...timing.timeline[1], jumps: 4 }],
        }),
      ),
    ).toThrow(/cannot hold 4 jumps/);
  });

  it('refuses a segment at a tick the run never reached', () => {
    expect(() =>
      parseDispatch(
        withTiming({ timeline: [timing.timeline[0], { ...timing.timeline[1], tick: 900 }] }),
      ),
    ).toThrow(/outside a run of 600/);
  });

  it('refuses a negative duration, which no monotonic clock produces', () => {
    expect(() => parseDispatch(withTiming({ cpu: { ...timing.cpu, total: -1 } }))).toThrow(
      /negative/,
    );
  });
});

describe('buildDispatch', () => {
  it('trims what the author wrote to what may be sent', () => {
    const built = buildDispatch({
      at: dispatch.at,
      recipe,
      observed: {
        ticks: Array.from({ length: MAX_FLAGGED_TICKS + 10 }, () => 5),
        note: 'x'.repeat(MAX_NOTE_LENGTH + 10),
      },
    });
    expect(built.observed.ticks).toHaveLength(MAX_FLAGGED_TICKS);
    expect(built.observed.note).toHaveLength(MAX_NOTE_LENGTH);
    expect(() => parseDispatch(JSON.parse(JSON.stringify(built)))).not.toThrow();
  });
});

describe('the endpoint', () => {
  it('tells the two kinds apart, and names the file after neither of them', () => {
    expect(receive(JSON.stringify(dispatch)).suffix).toBe('run-dispatch');
    expect(receive(JSON.stringify(timingReport)).suffix).toBe('renderer-spike');
  });

  /**
   * The filename is generated from a literal in the plugin, so a caller cannot
   * choose a path and cannot choose part of one either — including by sending a
   * field that looks like the one the name is built from.
   */
  it('will not take any part of a filename from the request', () => {
    const accepted = receive(
      JSON.stringify({ ...dispatch, suffix: '../../evil', kind: DISPATCH_KIND }),
    );
    expect(accepted.suffix).toBe('run-dispatch');
  });

  /** A dispatch reaches the disk as what the validator built, never as what arrived. */
  it('writes back what it validated, not what it was sent', () => {
    const accepted = receive(JSON.stringify({ ...dispatch, somethingElse: 'ignored' }));
    expect(accepted.body).not.toMatch(/somethingElse/);
    expect(JSON.parse(accepted.body).recipe.seed).toBe(1);
  });

  /** The timing report is untouched by any of this: extended, not loosened. */
  it('still holds a timing report to its own shape', () => {
    expect(() => receive(JSON.stringify({ ...timingReport, runs: [] }))).toThrow();
    expect(() => receive('{')).toThrow();
    expect(() => receive(JSON.stringify({ kind: 'something-else' }))).toThrow();
  });

  it('reads a dispatch back as a trail', () => {
    const lines = receive(JSON.stringify(dispatch)).describe().join('\n');
    expect(lines).toMatch(/fixture field v1/);
    expect(lines).toMatch(/the grab feels late/);
    expect(lines).toMatch(/tick 240/);
  });
});

/**
 * ⚠ **Which build a measurement is about**, which `at` could not say and was
 * documented as saying.
 *
 * AGENTS.md §3 asks every measurement for its cohort. On 2026-09-02 the question
 * *"was this run flown before or after the deadline scan was spread?"* had to be
 * answered by comparing a file's modification time against the commit log —
 * guesswork about the thing a cost measurement rests on. `SIM_VERSION` cannot
 * stand in: it moves only when a **tick** moves, and performance work
 * deliberately leaves the swing alone.
 */
describe('the build stamp', () => {
  /**
   * **The server stamps it, so it is a fact rather than a claim.** A sender's own
   * account of what it was built from is the one thing a build stamp must not be,
   * and the endpoint already refuses to take any part of a filename from a
   * request for the same reason.
   */
  it('is put on by the endpoint and never taken from the request', () => {
    const stamped = JSON.parse(receive(JSON.stringify(dispatch), 'abc123def456').body);
    expect(stamped.build).toBe('abc123def456');

    const lied = JSON.parse(
      receive(JSON.stringify({ ...dispatch, build: 'ffffffffffff' }), 'abc123def456').body,
    );
    expect(lied.build).toBe('abc123def456');
  });

  /** And a dispatch that arrived before the field existed is still evidence. */
  it('is optional, because the whole corpus predates it', () => {
    const plain = JSON.parse(receive(JSON.stringify(dispatch)).body);
    expect(plain.build).toBeUndefined();
    expect(parseDispatch(structuredClone(dispatch)).build).toBeUndefined();
  });

  /** Validated into the shape this file writes, like everything else here. */
  it('is refused when it is not what the stamp function produces', () => {
    for (const bad of ['not-hex', 'ABCDEF012345', 'a'.repeat(13), 42, null]) {
      expect(() => parseDispatch({ ...structuredClone(dispatch), build: bad })).toThrow();
    }
  });

  /**
   * **It has to move when `src/` moves and not otherwise**, which is the whole
   * contract. Asserted against the real tree rather than a fixture: a stamp that
   * hashed nothing would be stable too, so stability alone proves nothing — what
   * is checked here is that it is stable *and* the shape the validator accepts.
   */
  it('is a short hex digest of the source, and is stable while the source is', () => {
    const stamp = sourceStamp();
    expect(stamp).toMatch(/^[0-9a-f]{12}$/);
    expect(sourceStamp()).toBe(stamp);
    expect(parseDispatch({ ...structuredClone(dispatch), build: stamp }).build).toBe(stamp);
  });
});
