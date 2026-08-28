/**
 * The diagnostics contract: a report must reproduce the session it describes,
 * exactly. If it does not, every conclusion drawn from a replay is worthless, so
 * this is the most load-bearing test in the app layer.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RECORDER_OPTIONS, RunRecorder } from '../src/app/recorder.ts';
import {
  buildReport,
  configDelta,
  configFromReport,
  parseReport,
  serializeReport,
  summarize,
} from '../src/app/report.ts';
import { DEFAULT_CONFIG, FIXED_DT, PROTOTYPE_CONFIG } from '../src/sim/config.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { createBodies } from '../src/sim/world.ts';
import { fingerprintHex } from '../src/sim/serialize.ts';
import { awardAgreement, recordedAwards, replayReport } from '../tools/replay-core.ts';
import { createScoreState, scoreTick } from '../src/score/index.ts';
import type { Input, SimConfig } from '../src/sim/index.ts';

/** Plays a session, recording it the way the app does. */
function play(cfg: SimConfig, ticks: number, edges: Map<number, 0 | 1>, markAt: number[] = []) {
  const recorder = new RunRecorder();
  const state = createInitialState(cfg);
  let held = false;
  for (let tick = 0; tick < ticks; tick++) {
    const e = edges.get(tick);
    const pressed = e === 1;
    const released = e === 0;
    if (pressed) held = true;
    if (released) held = false;
    recorder.recordInput(state.tick, pressed, released);
    const input: Input = { held: held || pressed, pressed, released };
    stepSim(state, cfg, input, FIXED_DT);
    recorder.recordTick(state);
    if (markAt.includes(state.tick)) recorder.mark(state.tick, 'felt wrong');
  }
  return { recorder, state };
}

/** Re-runs a report the way tools/replay.ts does. */
function replay(text: string) {
  const report = parseReport(text);
  const cfg = configFromReport(report);
  const edges = new Map(report.input);
  const state = createInitialState(cfg);
  const seen = new Map<number, string>();
  let held = false;
  for (let tick = 0; tick < report.ticks; tick++) {
    const e = edges.get(tick);
    const pressed = e === 1;
    const released = e === 0;
    if (pressed) held = true;
    if (released) held = false;
    stepSim(state, cfg, { held: held || pressed, pressed, released }, report.dt);
    seen.set(state.tick, fingerprintHex(state));
  }
  return { report, state, seen };
}

const DEVICE = { w: 390, h: 844, dpr: 3, ua: 'test' };

const SESSIONS: Array<{ name: string; ticks: number; edges: Array<[number, 0 | 1]> }> = [
  { name: 'idle drift', ticks: 200, edges: [] },
  {
    name: 'single capture',
    ticks: 300,
    edges: [
      [18, 1],
      [150, 0],
    ],
  },
  {
    name: 'several grabs',
    ticks: 700,
    edges: [
      [18, 1],
      [120, 0],
      [200, 1],
      [280, 0],
      [360, 1],
      [520, 0],
    ],
  },
  { name: 'held to the end', ticks: 500, edges: [[30, 1]] },
  {
    name: 'run past a crash and respawn',
    ticks: 900,
    edges: [
      [18, 1],
      [60, 0],
    ],
  },
];

describe('report round trip', () => {
  it.each(SESSIONS)('$name: every checkpoint reproduces', (sess) => {
    const edges = new Map(sess.edges);
    const { recorder, state } = play(DEFAULT_CONFIG, sess.ticks, edges);
    const text = serializeReport(
      buildReport({
        recorder,
        config: DEFAULT_CONFIG,
        seed: 1,
        ticks: state.tick,
        note: '',
        device: DEVICE,
      }),
    );

    const { report, seen } = replay(text);
    expect(report.checks.length).toBeGreaterThan(0);
    for (const [tick, fp] of report.checks) {
      expect(seen.get(tick), `checkpoint at tick ${tick}`).toBe(fp);
    }
  });

  it('final state after replay is identical, not merely similar', () => {
    const edges = new Map<number, 0 | 1>([
      [18, 1],
      [120, 0],
      [200, 1],
      [340, 0],
    ]);
    const { recorder, state } = play(DEFAULT_CONFIG, 600, edges);
    const text = serializeReport(
      buildReport({
        recorder,
        config: DEFAULT_CONFIG,
        seed: 1,
        ticks: state.tick,
        note: '',
        device: DEVICE,
      }),
    );
    const { state: replayed } = replay(text);
    expect(fingerprintHex(replayed)).toBe(fingerprintHex(state));
    expect(replayed.ship).toEqual(state.ship);
    expect(replayed.fuel).toBe(state.fuel);
  });

  it('carries tuning changes, so a tuned session replays as tuned', () => {
    const tuned: SimConfig = { ...DEFAULT_CONFIG, minOrbitGap: 24, phaseRate: 1.6 };
    const edges = new Map<number, 0 | 1>([
      [18, 1],
      [200, 0],
    ]);
    const { recorder, state } = play(tuned, 400, edges);
    const text = serializeReport(
      buildReport({
        recorder,
        config: tuned,
        seed: 1,
        ticks: state.tick,
        note: '',
        device: DEVICE,
      }),
    );

    const report = parseReport(text);
    expect(report.config.minOrbitGap).toBe(24);
    expect(report.config.phaseRate).toBe(1.6);
    // and the delta against current defaults names exactly those two keys
    expect(
      configDelta(report.config, DEFAULT_CONFIG)
        .map((d) => d.key)
        .sort(),
    ).toEqual(['minOrbitGap', 'phaseRate']);

    const { seen } = replay(text);
    for (const [tick, fp] of report.checks) expect(seen.get(tick)).toBe(fp);

    // and the same inputs under default config would NOT match — proving the
    // diff is doing real work rather than being decorative
    const defaultRun = play(DEFAULT_CONFIG, 400, edges);
    expect(fingerprintHex(defaultRun.state)).not.toBe(fingerprintHex(state));
  });

  it('preserves flagged moments', () => {
    const edges = new Map<number, 0 | 1>([
      [18, 1],
      [150, 0],
    ]);
    const { recorder, state } = play(DEFAULT_CONFIG, 300, edges, [77, 201]);
    const report = parseReport(
      serializeReport(
        buildReport({
          recorder,
          config: DEFAULT_CONFIG,
          seed: 1,
          ticks: state.tick,
          note: 'n',
          device: DEVICE,
        }),
      ),
    );
    expect(report.marks.map(([t]) => t)).toEqual([77, 201]);
    expect(report.note).toBe('n');
  });

  it('stays small enough to paste out of a phone', () => {
    // ten minutes of dense play
    const edges = new Map<number, 0 | 1>();
    for (let t = 30; t < 36000; t += 90) {
      edges.set(t, 1);
      edges.set(t + 45, 0);
    }
    const { recorder, state } = play(DEFAULT_CONFIG, 36000, edges);
    const text = serializeReport(
      buildReport({
        recorder,
        config: DEFAULT_CONFIG,
        seed: 1,
        ticks: state.tick,
        note: '',
        device: DEVICE,
      }),
    );
    const kb = text.length / 1024;
    expect(kb, `report was ${kb.toFixed(1)} KB`).toBeLessThan(40);
    expect(summarize(parseReport(text)).seconds).toBeCloseTo(600, 0);
  });

  it('replays correctly even after DEFAULT_CONFIG has moved on', () => {
    // The bug this guards: reports used to store a *diff* against the client's
    // own DEFAULT_CONFIG. A session recorded while the default was X read as
    // "no differences", so replaying it after the default became Y silently used
    // Y and diverged — and the tool blamed the simulation for it.
    const sessionCfg: SimConfig = { ...DEFAULT_CONFIG, minOrbitGap: 10 };
    const edges = new Map<number, 0 | 1>([
      [18, 1],
      [200, 0],
    ]);
    const { recorder, state } = play(sessionCfg, 400, edges);
    const text = serializeReport(
      buildReport({
        recorder,
        config: sessionCfg,
        seed: 1,
        ticks: state.tick,
        note: '',
        device: DEVICE,
      }),
    );

    const report = parseReport(text);
    // the session's own value survives, whatever the current default is
    expect(configFromReport(report).minOrbitGap).toBe(10);
    expect(DEFAULT_CONFIG.minOrbitGap).not.toBe(10); // the default has since moved

    const { seen } = replay(text);
    for (const [tick, fp] of report.checks) expect(seen.get(tick)).toBe(fp);
  });

  it('fills a key added since the report from the prototype, not the defaults', () => {
    // A report recorded before a flag existed has no opinion about it, and the
    // two wrong ways to resolve that both fail quietly: the current default
    // replays an old session under new behaviour and calls it faithful, and
    // `undefined` turns every arithmetic use of the key into NaN. The prototype
    // value is what the code did before the flag, by construction of the split.
    const { config, ...rest } = buildReport({
      recorder: new RunRecorder(),
      config: DEFAULT_CONFIG,
      seed: 1,
      ticks: 0,
      note: '',
      device: DEVICE,
    });
    const older = { ...rest, config: { ...config } } as typeof rest & { config: SimConfig };
    delete (older.config as unknown as Record<string, unknown>).crashConeSeverityFloor;

    const resolved = configFromReport(older);
    expect(resolved.crashConeSeverityFloor).toBe(PROTOTYPE_CONFIG.crashConeSeverityFloor);
    expect(resolved.crashConeSeverityFloor).not.toBe(DEFAULT_CONFIG.crashConeSeverityFloor);
    // and everything the report DID carry is still its own
    expect(resolved.bodySpacing).toBe(DEFAULT_CONFIG.bodySpacing);
  });

  it('replays a report from before NEW MAP on the field it was played on', () => {
    // Every report already on disk was played on the one fixed field, and the
    // seed that built it is PROTOTYPE_CONFIG's — so the fill rule above is not
    // merely safe here, it is exactly right. Getting this wrong would silently
    // re-run 34 recorded sessions in a world they were never flown in, and the
    // divergence would look like a physics bug.
    const { config, ...rest } = buildReport({
      recorder: new RunRecorder(),
      config: DEFAULT_CONFIG,
      seed: 1,
      ticks: 0,
      note: '',
      device: DEVICE,
    });
    const older = { ...rest, config: { ...config } } as typeof rest & { config: SimConfig };
    delete (older.config as unknown as Record<string, unknown>).worldSeed;

    expect(createBodies(configFromReport(older))).toEqual(createBodies(DEFAULT_CONFIG));
  });

  it('carries a randomised field, so a NEW MAP session replays in its own world', () => {
    // The whole reason the seed is a config key rather than a module constant.
    const report = buildReport({
      recorder: new RunRecorder(),
      config: { ...DEFAULT_CONFIG, worldSeed: 0x1234_5678 },
      seed: 1,
      ticks: 0,
      note: '',
      device: DEVICE,
    });
    const resolved = configFromReport(parseReport(serializeReport(report)));
    expect(resolved.worldSeed).toBe(0x1234_5678);
    expect(createBodies(resolved)).not.toEqual(createBodies(DEFAULT_CONFIG));
    expect(createBodies(resolved)).toEqual(
      createBodies({ ...DEFAULT_CONFIG, worldSeed: 0x1234_5678 }),
    );
  });

  it('carries raw values so a cross-engine replay can still be verified', () => {
    // Engines disagree on Math.hypot/atan2/sin/cos, so a fingerprint alone cannot
    // verify a report recorded on a phone. The raw position must travel with it.
    const edges = new Map<number, 0 | 1>([
      [18, 1],
      [200, 0],
    ]);
    const { recorder, state } = play(DEFAULT_CONFIG, 400, edges);
    const report = parseReport(
      serializeReport(
        buildReport({
          recorder,
          config: DEFAULT_CONFIG,
          seed: 1,
          ticks: state.tick,
          note: '',
          device: DEVICE,
        }),
      ),
    );
    for (const c of report.checks) {
      expect(c).toHaveLength(8);
      const [tick, fp, x, y, vx, vy, fuel, phase] = c;
      expect(typeof tick).toBe('number');
      expect(fp).toMatch(/^[0-9a-f]{8}$/);
      for (const n of [x, y, vx, vy, fuel]) expect(Number.isFinite(n)).toBe(true);
      expect(typeof phase).toBe('string');
    }
    // and a replay of it grades as exact, since this is the same engine
    const analysis = replayReport(report);
    expect(analysis.fidelity).toBe('exact');
    // Checkpoints store 2 decimal places, so the floor on maxDelta is the
    // rounding itself (~0.007px across both axes), not a real difference.
    expect(analysis.maxDelta).toBeLessThan(0.01);
  });

  it('grades a nudged replay as diverged rather than silently accepting it', () => {
    const edges = new Map<number, 0 | 1>([
      [18, 1],
      [200, 0],
    ]);
    const { recorder, state } = play(DEFAULT_CONFIG, 400, edges);
    const report = parseReport(
      serializeReport(
        buildReport({
          recorder,
          config: DEFAULT_CONFIG,
          seed: 1,
          ticks: state.tick,
          note: '',
          device: DEVICE,
        }),
      ),
    );
    // shift every recorded position far enough to exceed the drift bound
    report.checks = report.checks.map(([t, , x, y, vx, vy, f, p]) => [
      t,
      'deadbeef',
      x + 500,
      y,
      vx,
      vy,
      f,
      p,
    ]);
    expect(replayReport(report).fidelity).toBe('diverged');
  });

  it('names the last tick that was still bit-exact, so half a report is not wasted', () => {
    const edges = new Map<number, 0 | 1>([
      [40, 1],
      [200, 0],
    ]);
    const { recorder, state } = play(DEFAULT_CONFIG, 400, edges);
    const report = parseReport(
      serializeReport(
        buildReport({
          recorder,
          config: DEFAULT_CONFIG,
          seed: 1,
          ticks: state.tick,
          note: '',
          device: DEVICE,
        }),
      ),
    );
    // Break every checkpoint from the fourth on, leaving the first three intact:
    // the shape of a real divergence, which starts somewhere in the middle.
    const breakFrom = report.checks[3]![0];
    report.checks = report.checks.map(([t, fp, x, y, vx, vy, f, p]) =>
      t >= breakFrom ? [t, 'deadbeef', x + 500, y, vx, vy, f, p] : [t, fp, x, y, vx, vy, f, p],
    );
    const a = replayReport(report);
    expect(a.fidelity).toBe('diverged');
    expect(a.firstDivergedTick).toBe(breakFrom);
    expect(a.lastExactTick).toBe(report.checks[2]![0]);
    expect(a.firstDivergedPhase).toBe(report.checks[3]![7]);
  });

  it('does not call a run trustworthy again just because a later state re-matched', () => {
    // A respawn resets both sides to the same constants, so checkpoints can agree
    // again after the run has genuinely parted company. That is not evidence the
    // stretch in between was reproduced.
    const edges = new Map<number, 0 | 1>([
      [40, 1],
      [200, 0],
    ]);
    const { recorder, state } = play(DEFAULT_CONFIG, 400, edges);
    const report = parseReport(
      serializeReport(
        buildReport({
          recorder,
          config: DEFAULT_CONFIG,
          seed: 1,
          ticks: state.tick,
          note: '',
          device: DEVICE,
        }),
      ),
    );
    const broken = report.checks[2]![0];
    report.checks = report.checks.map(([t, fp, x, y, vx, vy, f, p]) =>
      t === broken ? [t, 'deadbeef', x + 500, y, vx, vy, f, p] : [t, fp, x, y, vx, vy, f, p],
    );
    const a = replayReport(report);
    // later checkpoints match again, but the trustworthy prefix still stops here
    expect(a.lastExactTick).toBe(report.checks[1]![0]);
    expect(a.firstDivergedTick).toBe(broken);
  });

  it('carries the page-load time, so a stale bundle is not invisible', () => {
    // simVersion and config describe the simulation and nothing else. Without
    // this, a session played before a HUD change and one played after it are the
    // same report.
    const { recorder, state } = play(DEFAULT_CONFIG, 120, new Map());
    const loadedAt = '2026-08-20T03:00:00.000Z';
    const report = parseReport(
      serializeReport(
        buildReport({
          recorder,
          config: DEFAULT_CONFIG,
          seed: 1,
          ticks: state.tick,
          note: '',
          device: DEVICE,
          loadedAt,
        }),
      ),
    );
    expect(report.loadedAt).toBe(loadedAt);
  });

  it('still reads a report written before the page-load field existed', () => {
    // Adding a field is not a reason to make every report already on disk
    // unreadable, which is why it is optional rather than a schema bump.
    const { recorder, state } = play(DEFAULT_CONFIG, 120, new Map());
    const report = buildReport({
      recorder,
      config: DEFAULT_CONFIG,
      seed: 1,
      ticks: state.tick,
      note: '',
      device: DEVICE,
    });
    expect(report.loadedAt).toBeUndefined();
    const round = parseReport(serializeReport(report));
    expect(round.loadedAt).toBeUndefined();
    expect(replayReport(round).fidelity).toBe('exact');
  });

  it('rejects a report from a future schema rather than misreading it', () => {
    expect(() => parseReport(JSON.stringify({ aphelion: 99 }))).toThrow(/schema/);
  });
});

/**
 * Recorded awards, and the sampling rate that makes a diverged report readable.
 *
 * Both exist for the same reason: a replay is only the session while it is still
 * reproducing it, and on long chains it increasingly is not. What the report
 * carries in its own right is what survives that.
 */
describe('a report that survives its own replay diverging', () => {
  /** Plays a session the way the app does, scoring included. */
  function playScored(cfg: SimConfig, ticks: number, edges: Map<number, 0 | 1>) {
    const recorder = new RunRecorder();
    const state = createInitialState(cfg);
    const score = createScoreState();
    let held = false;
    for (let tick = 0; tick < ticks; tick++) {
      const e = edges.get(tick);
      const pressed = e === 1;
      const released = e === 0;
      if (pressed) held = true;
      if (released) held = false;
      recorder.recordInput(state.tick, pressed, released);
      stepSim(state, cfg, { held: held || pressed, pressed, released }, FIXED_DT);
      recorder.recordAwards(scoreTick(score, state, cfg, FIXED_DT).awards);
      recorder.recordTick(state);
    }
    return { recorder, state, score };
  }

  const CHAIN = new Map<number, 0 | 1>([
    [18, 1],
    [150, 0],
    [400, 1],
    [520, 0],
  ]);

  function report(ticks = 700) {
    const { recorder, state } = playScored(DEFAULT_CONFIG, ticks, CHAIN);
    return serializeReport(
      buildReport({
        recorder,
        config: DEFAULT_CONFIG,
        seed: 1,
        ticks: state.tick,
        note: '',
        device: DEVICE,
      }),
    );
  }

  it('carries every award the session paid, through a round trip', () => {
    const parsed = parseReport(report());
    const awards = recordedAwards(parsed);
    expect(awards).not.toBeNull();
    expect(awards!.length).toBeGreaterThan(0);
    // The same events the scorer produced, in the same order, with the points
    // the player was actually shown.
    const live = replayReport(parsed).awards;
    expect(awards!.map((w) => [w.tick, w.kind])).toEqual(live.map((w) => [w.tick, w.kind]));
    expect(awards!.map((w) => w.points)).toEqual(live.map((w) => Math.round(w.points)));
  });

  it('agrees with the recomputed awards while the replay is still faithful', () => {
    const parsed = parseReport(report());
    const agree = awardAgreement(recordedAwards(parsed)!, replayReport(parsed).awards);
    expect(agree.firstDisagreement).toBeNull();
    expect(agree.matched).toBe(recordedAwards(parsed)!.length);
  });

  it('names the award where a recomputed run parts company, not merely that it did', () => {
    // The point of comparing award lists at all: an award lands at every grab and
    // release, so it localises a divergence far better than a fixed interval can.
    //
    // Indexed off the END of the list rather than at a fixed 2, because how many
    // awards this fixture pays is not the property under test and F04 changed it:
    // the grab, hop, burn and rescue awards are gone, so a session that used to
    // record six events records two.
    const recorded = recordedAwards(parseReport(report()))!;
    expect(recorded.length, 'the fixture no longer pays enough to localise').toBeGreaterThan(1);
    const at = recorded.length - 1;
    const nudged = recorded.map((w, i) => (i < at ? w : { ...w, points: w.points + 1 }));
    const agree = awardAgreement(recorded, nudged);
    expect(agree.matched).toBe(at);
    expect(agree.firstDisagreement).toBe(recorded[at]!.tick);
  });

  it('still reads a report written before awards were recorded', () => {
    // Optional for the same reason `loadedAt` is. Every report already on disk
    // lacks this field and must stay readable.
    const parsed = parseReport(report());
    delete parsed.awards;
    expect(recordedAwards(parsed)).toBeNull();
    expect(() => replayReport(parsed)).not.toThrow();
  });

  it('samples often enough that a death cannot fall between two checkpoints', () => {
    // A death holds for `crashPause` before respawning. Sample more slowly than
    // that and a whole death and respawn can pass unrecorded — which is exactly
    // how a replay came to report three deaths a session never had, with the
    // checkpoints unable to contradict it.
    const crashPauseTicks = DEFAULT_CONFIG.crashPause / FIXED_DT;
    expect(DEFAULT_RECORDER_OPTIONS.checkpointEvery).toBeLessThan(crashPauseTicks);
  });
});
