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
import { receive } from '../tools/vite-plugin-diag.ts';
import { FIXTURE_FIELD_VERSION } from '../src/sim/fixture-field.ts';
import { RECIPE_VERSION } from '../src/sim/recipe.ts';

const recipe = {
  version: RECIPE_VERSION,
  field: { generator: 'fixture', version: FIXTURE_FIELD_VERSION },
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
