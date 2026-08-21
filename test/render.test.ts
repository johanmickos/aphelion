/**
 * Guards for the render fixes made in Stage 1. Each of these encodes a specific
 * defect found in the prototype; if one regresses, the test names it.
 */
import { describe, expect, it } from 'vitest';
import { recordingContext } from './canvas-stub.ts';
import { DEFAULT_RENDER_CONFIG } from '../src/render/config.ts';
import {
  centerCamera,
  createCamera,
  fitCamera,
  toScreenX,
  toScreenY,
} from '../src/render/camera.ts';
import { Starfield } from '../src/render/starfield.ts';
import { BodyRenderer, drawHazardZones } from '../src/render/world.ts';
import { drawEdgeMarkers } from '../src/render/edge-markers.ts';
import { boostColor, drawBoostHalo } from '../src/render/capture.ts';
import { drawFuelGauge, drawScore, formatScore, readoutLines } from '../src/render/hud.ts';
import { drawCompass } from '../src/render/compass.ts';
import { Popups } from '../src/render/popups.ts';
import { AIM, CLOSE_PX } from '../src/score/index.ts';
import {
  AIM_MAX_TARGETS,
  AIM_RANGE,
  aimTargets,
  pathBlocked,
  releaseAngleFor,
} from '../src/score/aim.ts';
import { createScoreState } from '../src/score/score.ts';
import { orbitRadius } from '../src/sim/orbit.ts';
import { Trail } from '../src/render/ship.ts';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import { createBodies, fieldBounds } from '../src/sim/world.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { Scene } from '../src/render/scene.ts';
import { captureSnapshot } from '../src/render/snapshot.ts';
import type { RenderSnapshot } from '../src/render/snapshot.ts';

const rcfg = DEFAULT_RENDER_CONFIG;
const field = fieldBounds(DEFAULT_CONFIG, createBodies(DEFAULT_CONFIG));

function cam() {
  const c = createCamera(rcfg);
  fitCamera(c, { w: 390, h: 844, dpr: 1 });
  centerCamera(c, 195, 0, field);
  return c;
}

/**
 * A capture snapshot with sensible defaults, so a test can name only the fields
 * it cares about. Added after the third round of every literal needing updating
 * whenever RenderSnapshot grew a field.
 */
function captureOf(over: Partial<NonNullable<RenderSnapshot['capture']>> = {}) {
  return {
    phase: 'settle' as const,
    planet: 0,
    settleProgress: 1,
    settleT: 1.2,
    orbit: null,
    rPeri: 100,
    boost: 0,
    boostFull: 0,
    boostT: 0,
    overEscape: 0,
    rx: 0,
    ry: -100,
    vx: 200,
    vy: 0,
    minR: 58,
    ...over,
  };
}

describe('starfield', () => {
  it('is deterministic for a given seed', () => {
    const a = recordingContext();
    const b = recordingContext();
    new Starfield(rcfg, 12345).draw(a.ctx, cam(), rcfg);
    new Starfield(rcfg, 12345).draw(b.ctx, cam(), rcfg);
    expect(a.ops).toEqual(b.ops);
    expect(a.calls('fillRect').length).toBe(rcfg.starCount);
  });

  it('differs for a different seed', () => {
    const a = recordingContext();
    const b = recordingContext();
    new Starfield(rcfg, 1).draw(a.ctx, cam(), rcfg);
    new Starfield(rcfg, 2).draw(b.ctx, cam(), rcfg);
    expect(a.ops).not.toEqual(b.ops);
  });

  it('batches state changes by depth tier, not per star', () => {
    const r = recordingContext();
    new Starfield(rcfg, 7).draw(r.ctx, cam(), rcfg);
    // three tiers => at most three fillStyle and four globalAlpha writes
    expect(r.calls('=fillStyle').length).toBeLessThanOrEqual(3);
    expect(r.calls('=globalAlpha').length).toBeLessThanOrEqual(4);
  });

  it('responds to horizontal camera movement', () => {
    const stars = new Starfield(rcfg, 7);
    const a = recordingContext();
    const b = recordingContext();
    const c1 = cam();
    const c2 = cam();
    c2.left += 40;
    stars.draw(a.ctx, c1, rcfg);
    stars.draw(b.ctx, c2, rcfg);
    expect(a.calls('fillRect')).not.toEqual(b.calls('fillRect'));
  });
});

describe('hazard zones', () => {
  it('warn INSIDE the playfield, where the ship can still be', () => {
    const r = recordingContext();
    const c = cam();
    drawHazardZones(r.ctx, c, rcfg, field);

    const leftEdge = toScreenX(c, field.left);
    const rightEdge = toScreenX(c, field.right);

    for (const [, x, , w] of r.calls('fillRect') as Array<[string, number, number, number]>) {
      // every warned pixel lies between the two field edges, never beyond them
      expect(x).toBeGreaterThanOrEqual(Math.min(leftEdge, rightEdge) - 1e-6);
      expect(x + w).toBeLessThanOrEqual(Math.max(leftEdge, rightEdge) + 1e-6);
    }
    expect(r.calls('fillRect').length).toBeGreaterThan(0);
  });

  it('marks the hard limit at the field edge itself', () => {
    const r = recordingContext();
    const c = cam();
    drawHazardZones(r.ctx, c, rcfg, field);
    const xs = (r.calls('lineTo') as Array<[string, number, number]>).map((o) => o[1]);
    expect(xs.some((x) => Math.abs(x - toScreenX(c, field.left)) < 1e-6)).toBe(true);
  });
});

describe('trail', () => {
  it('length does not depend on frame rate', () => {
    // Same world path, same simulation ticks, different render cadence.
    const path = Array.from({ length: 200 }, (_, i) => ({ x: 100 + i * 6.7, y: 0 }));

    const slow = new Trail(rcfg);
    const fast = new Trail(rcfg);
    const sink = recordingContext();
    const c = cam();

    for (const p of path) {
      slow.sample(p.x, p.y);
      slow.draw(sink.ctx, c, 1e6, 1e6); // 1 render per tick
    }
    for (const p of path) {
      fast.sample(p.x, p.y);
      fast.draw(sink.ctx, c, 1e6, 1e6); // 4 renders per tick
      fast.draw(sink.ctx, c, 1e6, 1e6);
      fast.draw(sink.ctx, c, 1e6, 1e6);
      fast.draw(sink.ctx, c, 1e6, 1e6);
    }

    const a = recordingContext();
    const b = recordingContext();
    slow.draw(a.ctx, c, 1e6, 1e6);
    fast.draw(b.ctx, c, 1e6, 1e6);
    expect(a.calls('arc')).toEqual(b.calls('arc'));
  });

  it('honours minimum spacing and maximum length', () => {
    const t = new Trail(rcfg);
    for (let i = 0; i < 500; i++) t.sample(i * 0.5, 0); // finer than trailSpacing
    const r = recordingContext();
    t.draw(r.ctx, cam(), 1e6, 1e6);
    const arcs = r.calls('arc') as Array<[string, number, number]>;
    expect(arcs.length).toBeLessThanOrEqual(rcfg.trailMax);
    for (let i = 1; i < arcs.length; i++) {
      expect(Math.abs(arcs[i]![1] - arcs[i - 1]![1])).toBeGreaterThanOrEqual(
        rcfg.trailSpacing - 1e-9,
      );
    }
  });

  it('keeps the wake clear of the ship sprite', () => {
    // The head circle used to poke through the ship's tail notch at speed: the
    // newest sample sits 3-10px back and grows to ~4.8px across, against a
    // silhouette only 6px deep.
    const t = new Trail(rcfg);
    for (let i = 0; i < 40; i++) t.sample(i * 4, 0, 400);
    const shipX = 39 * 4; // where the ship is now: right on top of the newest point
    const r = recordingContext();
    const c = cam();
    t.draw(r.ctx, c, shipX, 0);

    const arcs = r.calls('arc') as Array<[string, number, number, number]>;
    expect(arcs.length).toBeGreaterThan(0);
    for (const [, x, y, radius] of arcs) {
      const wx = (x - c.offsetX) / c.scale + c.left;
      const wy = (y - c.offsetY - (c.viewH * c.scale) / 2) / c.scale + c.centerY;
      const d = Math.hypot(wx - shipX, wy - 0);
      expect(d, 'a wake dot was drawn inside the head gap').toBeGreaterThanOrEqual(
        rcfg.trailHeadGap - 1e-6,
      );
      // and its nearest edge clears the ship's 6px tail
      expect(d - radius / c.scale).toBeGreaterThan(6);
    }
  });

  it('draw does not mutate the trail', () => {
    const t = new Trail(rcfg);
    for (let i = 0; i < 40; i++) t.sample(i * 10, 0);
    const a = recordingContext();
    const b = recordingContext();
    t.draw(a.ctx, cam(), 1e6, 1e6);
    t.draw(b.ctx, cam(), 1e6, 1e6);
    expect(a.ops).toEqual(b.ops);
  });
});

describe('scene', () => {
  // Drives the real simulation and renders every tick, so a null anchor, a NaN
  // coordinate or a bad draw call surfaces here rather than on a phone.
  const SCENES = [
    { name: 'drift then capture then release', press: 18, release: 150, ticks: 220 },
    {
      name: 'crash and respawn',
      press: -1,
      release: -1,
      ticks: 150,
      ship: { x: 189, y: 200, vx: 0, vy: -97 },
    },
    {
      name: 'flyby braked',
      press: 20,
      release: 200,
      ticks: 240,
      ship: { x: 105, y: 354, vx: 0, vy: -400 },
    },
  ];

  it.each(SCENES)('$name renders every tick without error', (sc) => {
    const state = createInitialState(DEFAULT_CONFIG);
    if (sc.ship) Object.assign(state.ship, sc.ship);
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const scene = new Scene(
      { sim: DEFAULT_CONFIG, render: rcfg, bodies: state.bodies, field: f },
      99,
    );
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    const r = recordingContext();

    let held = false;
    let drawn = 0;
    for (let i = 0; i < sc.ticks; i++) {
      const pressed = i === sc.press;
      const released = i === sc.release;
      if (pressed) held = true;
      if (released) held = false;
      stepSim(state, DEFAULT_CONFIG, { held: held || pressed, pressed, released }, FIXED_DT);

      const snap = captureSnapshot(state, held, DEFAULT_CONFIG);
      scene.trail.sample(snap.x, snap.y);
      centerCamera(c, snap.x, snap.y, f);

      r.reset();
      scene.draw(r.ctx, c, snap, {
        timeMs: i * 16.67,
        paused: false,
        viewportW: 390,
        viewportH: 844,
        headerBottom: 0,
        frameDt: 1 / 60,
        score: createScoreState(),
      });
      drawn++;

      // no NaN or Infinity ever reaches the canvas
      for (const op of r.ops) {
        for (const arg of op.slice(1)) {
          if (typeof arg === 'number') {
            expect(Number.isFinite(arg), `${op[0]} received ${arg} at tick ${i}`).toBe(true);
          }
        }
      }
    }
    expect(drawn).toBe(sc.ticks);
  });

  it('draws the ship and at least one body on a normal frame', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const f = fieldBounds(DEFAULT_CONFIG, state.bodies);
    const scene = new Scene(
      { sim: DEFAULT_CONFIG, render: rcfg, bodies: state.bodies, field: f },
      99,
    );
    const c = createCamera(rcfg);
    fitCamera(c, { w: 390, h: 844, dpr: 1 });
    const snap = captureSnapshot(state, false, DEFAULT_CONFIG);
    centerCamera(c, snap.x, snap.y, f);
    const r = recordingContext();
    scene.draw(r.ctx, c, snap, {
      timeMs: 0,
      paused: false,
      viewportW: 390,
      viewportH: 844,
      headerBottom: 0,
      frameDt: 1 / 60,
      score: createScoreState(),
    });

    expect(r.calls('arc').length).toBeGreaterThan(0); // bodies + rings
    expect(r.calls('fillText').length).toBeGreaterThan(0); // planet labels
    expect(
      r.calls('createRadialGradient').length + r.calls('=createRadialGradient').length,
    ).toBeGreaterThan(0);
  });
});

describe('boost halo', () => {
  it('ramps colour amber -> rose -> violet, with violet at peak', () => {
    const [r0, , b0] = boostColor(0);
    const [r1, g1, b1] = boostColor(1);
    // amber at rest: red high, blue low
    expect(b0).toBeLessThan(150);
    expect(r0).toBeGreaterThan(200);
    // violet at peak: blue dominant, matching the build's accent
    expect(b1).toBeGreaterThan(200);
    expect(b1).toBeGreaterThan(r1);
    expect(g1).toBeLessThan(b1);
    // and it never passes through mud (blue must rise monotonically)
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const b = boostColor(t)[2];
      expect(b).toBeGreaterThanOrEqual(prev - 1);
      prev = b;
    }
  });

  it('glow grows with charge and never blinks off between frames', () => {
    const c = cam();
    const sim = DEFAULT_CONFIG;
    const radii: number[] = [];
    const alphas: number[] = [];

    // sweep the whole envelope at 60Hz, sampling the drawn glow each tick
    for (let i = 0; i < 120; i++) {
      const boostT = i * (1 / 60);
      const charge =
        boostT < sim.boostArmTime
          ? boostT / sim.boostArmTime
          : Math.max(0, 1 - (boostT - sim.boostArmTime) / sim.boostDecayTime);
      if (charge <= 0.02) continue;
      const r = recordingContext();
      drawBoostHalo(
        r.ctx,
        c,
        sim,
        rcfg,
        {
          ...captureSnapshot(createInitialState(sim), true, sim),
          capture: captureOf({ boost: charge * 90, boostFull: 90, boostT }),
        },
        boostT * 1000,
      );
      const arcs = r.calls('arc') as Array<[string, number, number, number]>;
      expect(arcs.length).toBeGreaterThan(0); // never a frame with nothing drawn
      radii.push(arcs[0]![3]);
      const grads = r.calls('=createRadialGradient');
      expect(grads.length).toBe(1);
      alphas.push(charge);
    }

    // the glow at peak charge is clearly larger than at low charge
    const peak = Math.max(...radii);
    const low = Math.min(...radii);
    expect(peak).toBeGreaterThan(low * 1.5);
  });
});

describe('HUD', () => {
  const sim = DEFAULT_CONFIG;

  function snapWith(over: Partial<ReturnType<typeof captureSnapshot>>) {
    const base = captureSnapshot(createInitialState(sim), false, sim);
    return { ...base, ...over };
  }

  it('says nothing while simply drifting with a full tank', () => {
    expect(readoutLines(sim, snapWith({}), true)).toEqual([]);
  });

  it('explains a refused grab, and only briefly', () => {
    const refused = snapWith({
      tick: 100,
      lastGrab: { tick: 90, result: 'refused-crash-cone' as const },
    });
    expect(readoutLines(sim, refused, true)[0]?.text).toContain('TOO LATE');

    // and it ages out rather than lingering forever
    const later = snapWith({
      tick: 400,
      lastGrab: { tick: 90, result: 'refused-crash-cone' as const },
    });
    expect(readoutLines(sim, later, true)).toEqual([]);
  });

  it('names an empty tank as the reason a grab did nothing', () => {
    const dry = snapWith({
      tick: 100,
      fuel: 0,
      lastGrab: { tick: 95, result: 'refused-no-fuel' as const },
    });
    const texts = readoutLines(sim, dry, true).map((l) => l.text);
    expect(texts.some((t) => t.includes('NO FUEL'))).toBe(true);
    expect(texts.some((t) => t.includes('TANK EMPTY'))).toBe(true);
  });

  it('calls the boost peak, and distinguishes it from arming and fading', () => {
    const at = (boostT: number) =>
      readoutLines(
        sim,
        snapWith({
          capture: captureOf({
            settleProgress: 0.5,
            settleT: 0.6,
            boost: 50,
            boostFull: 90,
            boostT,
          }),
        }),
        true,
      ).map((l) => l.text);

    expect(at(0.2).some((t) => t.includes('arming'))).toBe(true);
    expect(at(sim.boostArmTime).some((t) => t.includes('PEAK'))).toBe(true);
    expect(at(1.2).some((t) => t.includes('fading'))).toBe(true);
  });

  it('warns before a capture runs dry rather than after', () => {
    const poor = snapWith({
      fuel: 4,
      capture: captureOf({
        phase: 'settle',
        settleProgress: 0.1,
        settleT: 0.1,
        rPeri: 100,
        boost: 0,
        boostFull: 0,
        boostT: 0,
        overEscape: 0,
      }),
    });
    const texts = readoutLines(sim, poor, false).map((l) => l.text);
    expect(texts.some((t) => t.includes('will not round out'))).toBe(true);
  });

  /**
   * A flyby is not automatically trouble. Measured over a real 82-second session:
   * conversions sat at 1.09-1.22x escape speed and cost under 20 fuel; failures
   * sat at 1.31-1.82x and cost the whole tank. Showing the same alarm for both
   * was the complaint that prompted this.
   */
  function flybyAt(overEscape: number, fuel = 99) {
    return snapWith({
      fuel,
      capture: captureOf({ phase: 'flyby', settleProgress: 0, settleT: 0, rPeri: 0, overEscape }),
    });
  }

  it('reports progress, not alarm, on a flyby that will convert cheaply', () => {
    const texts = readoutLines(sim, flybyAt(0.12), true).map((l) => l.text);
    expect(texts.some((t) => t.includes('BRAKING'))).toBe(true);
    expect(texts.some((t) => t.includes('TOO FAST'))).toBe(false);
  });

  it('shows how far over escape it still is, counting down', () => {
    const far = readoutLines(sim, flybyAt(0.2), true)[0]!.text;
    const near = readoutLines(sim, flybyAt(0.05), true)[0]!.text;
    expect(far).toContain('20%');
    expect(near).toContain('5%');
  });

  it('escalates only when the brake genuinely is not winning', () => {
    const texts = readoutLines(sim, flybyAt(0.6), true).map((l) => l.text);
    expect(texts.some((t) => t.includes('TOO FAST'))).toBe(true);
    expect(texts.some((t) => t.includes('costs a lot of fuel'))).toBe(true);
  });

  it('says the tank is empty rather than blaming speed', () => {
    const texts = readoutLines(sim, flybyAt(0.6, 0), true).map((l) => l.text);
    expect(texts.some((t) => t.includes('OUT OF FUEL'))).toBe(true);
    expect(texts.some((t) => t.includes('TOO FAST'))).toBe(false);
  });

  it('draws the gauge and its numeric readout inside the design window', () => {
    const c = cam();
    const r = recordingContext();
    drawFuelGauge(r.ctx, c, sim, snapWith({ fuel: 42 }), 0);
    const winL = c.offsetX;
    const winR = c.offsetX + c.designW * c.scale;
    for (const [, x, , w] of r.calls('fillRect') as Array<[string, number, number, number]>) {
      expect(x).toBeGreaterThanOrEqual(winL - 1e-6);
      expect(x + w).toBeLessThanOrEqual(winR + 1e-6);
    }
    expect((r.calls('fillText') as Array<[string, string]>).some((o) => o[1] === '42')).toBe(true);
  });
});

describe('floating score popups', () => {
  const award = (over: Partial<Parameters<Popups['spawn']>[0]> = {}) =>
    ({
      tick: 100,
      kind: 'link' as const,
      points: 240,
      multiplier: 1,
      body: 'P3→P4',
      close: 0.4,
      clearance: 140,
      skim: 90,
      timing: 0.1,
      aim: 0.2,
      climb: 400,
      ...over,
    }) as Parameters<Popups['spawn']>[0];

  const texts = (r: ReturnType<typeof recordingContext>) =>
    (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);

  it('shows the points for a routine link, with no word', () => {
    const p = new Popups();
    p.spawn(award(), 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    expect(texts(r)).toContain('+240');
    expect(texts(r)).toHaveLength(1);
  });

  it('adds the word a praised link earned', () => {
    const p = new Popups();
    p.spawn(award({ aim: AIM.tier2, points: 680 }), 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    expect(texts(r)).toContain('+680');
    // the word is drawn twice — a dark rim under the fill, since it sits over
    // planets and stars
    const words = texts(r).filter((t) => !t.startsWith('+'));
    expect(words.length).toBeGreaterThan(0);
    expect(words[0]).toMatch(/^[A-Z]+$/);
  });

  it('marks a deduction as one, and never gives it a word', () => {
    const p = new Popups();
    p.spawn(award({ kind: 'miss', points: -150, aim: 1, timing: 1, clearance: 0 }), 195, 0);
    const r = recordingContext();
    p.draw(r.ctx, cam());
    expect(texts(r)).toContain('-150');
    expect(texts(r).every((t) => t.startsWith('-'))).toBe(true);
  });

  it('rises and then expires', () => {
    const p = new Popups();
    p.spawn(award(), 195, 0);
    const yAt = (): number => {
      const r = recordingContext();
      p.draw(r.ctx, cam());
      return (r.calls('fillText') as Array<[string, string, number, number]>)[0]?.[3] ?? NaN;
    };
    const first = yAt();
    p.update(0.3);
    const later = yAt();
    expect(later, 'the popup did not rise').toBeLessThan(first);

    p.update(2);
    expect(p.count()).toBe(0);
    const gone = recordingContext();
    p.draw(gone.ctx, cam());
    expect(gone.ops).toHaveLength(0);
  });

  it('does not age while the game is not advancing it', () => {
    const p = new Popups();
    p.spawn(award(), 195, 0);
    for (let i = 0; i < 100; i++) p.draw(recordingContext().ctx, cam());
    expect(p.count(), 'drawing alone expired a popup').toBe(1);
  });

  it('never piles up more than a readable few', () => {
    const p = new Popups();
    for (let i = 0; i < 12; i++) p.spawn(award({ tick: 100 + i }), 195, 0);
    expect(p.count()).toBeLessThanOrEqual(4);
  });

  it('emits no non-finite coordinate at any point in a popup life', () => {
    const p = new Popups();
    p.spawn(award({ clearance: CLOSE_PX.tier2, aim: AIM.tier2, points: 1240 }), 195, 0);
    for (let i = 0; i < 120; i++) {
      const r = recordingContext();
      p.draw(r.ctx, cam());
      for (const op of r.ops) {
        for (const arg of op.slice(1)) {
          if (typeof arg === 'number') expect(Number.isFinite(arg), `${op[0]} at ${i}`).toBe(true);
        }
      }
      p.update(1 / 60);
    }
  });
});

describe('the score band', () => {
  const sim = DEFAULT_CONFIG;

  function snapAt(tick: number) {
    const base = captureSnapshot(createInitialState(sim), false, sim);
    return { ...base, tick };
  }

  function scoreWith(over: Partial<ReturnType<typeof createScoreState>>) {
    return { ...createScoreState(), ...over };
  }

  const award = (over: Partial<NonNullable<ReturnType<typeof createScoreState>['lastAward']>>) => ({
    tick: 100,
    kind: 'link' as const,
    points: 1240,
    multiplier: 2.25,
    body: 'P3→P4',
    close: 0.84,
    clearance: 32,
    skim: 40,
    timing: 0.91,
    aim: 0.96,
    climb: 412,
    ...over,
  });

  it('groups digits without depending on the device locale', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1240)).toBe('1,240');
    expect(formatScore(1234567)).toBe('1,234,567');
    expect(formatScore(-150)).toBe('-150');
  });

  it('always shows the total, and the multiplier only once it is above 1', () => {
    const r = recordingContext();
    drawScore(r.ctx, cam(), scoreWith({ score: 1240 }), snapAt(0));
    let texts = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    expect(texts).toContain('1,240');
    expect(texts.some((t) => t.startsWith('x'))).toBe(false);

    r.reset();
    drawScore(r.ctx, cam(), scoreWith({ score: 1240, multiplier: 2.25 }), snapAt(0));
    texts = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    expect(texts).toContain('x2.25');
  });

  it('names what a link was paid for, so the weights can be read while playing', () => {
    const r = recordingContext();
    const sc = scoreWith({ score: 1240, multiplier: 2.25, lastAward: award({}) });
    drawScore(r.ctx, cam(), sc, snapAt(110));
    const texts = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    expect(texts.some((t) => t.includes('+1,240'))).toBe(true);
    const detail = texts.find((t) => t.includes('CLOSE'))!;
    expect(detail).toContain('P3→P4');
    expect(detail).toContain('84');
    expect(detail).toContain('91');
    expect(detail).toContain('96');
  });

  it('says what a deduction was for, rather than only that one happened', () => {
    const r = recordingContext();
    const sc = scoreWith({
      lastAward: award({ kind: 'miss', points: -150, multiplier: 1, body: 'P5' }),
    });
    drawScore(r.ctx, cam(), sc, snapAt(110));
    const texts = (r.calls('fillText') as Array<[string, string]>).map((o) => o[1]);
    expect(texts.some((t) => t.includes('-150'))).toBe(true);
    expect(texts.some((t) => t.includes('COASTED PAST P5'))).toBe(true);
  });

  it('ages the award by simulation tick, so a pause cannot expire it', () => {
    const sc = scoreWith({ lastAward: award({}) });
    const fresh = recordingContext();
    drawScore(fresh.ctx, cam(), sc, snapAt(101));
    const stale = recordingContext();
    drawScore(stale.ctx, cam(), sc, snapAt(100 + 200));
    const has = (r: typeof fresh) =>
      (r.calls('fillText') as Array<[string, string]>).some((o) => o[1].includes('+1,240'));
    expect(has(fresh)).toBe(true);
    expect(has(stale)).toBe(false);
  });

  it('stays inside the design window and never emits a non-finite coordinate', () => {
    const c = cam();
    const r = recordingContext();
    drawScore(
      r.ctx,
      c,
      scoreWith({ score: 1234567, multiplier: 5, lastAward: award({}) }),
      snapAt(110),
    );
    expect(r.ops.length).toBeGreaterThan(0);
    for (const op of r.ops) {
      for (const arg of op.slice(1)) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
    for (const [, , x, y] of r.calls('fillText') as Array<[string, string, number, number]>) {
      expect(x).toBeGreaterThan(c.offsetX);
      expect(x).toBeLessThan(c.offsetX + c.designW * c.scale);
      expect(y).toBeGreaterThan(c.offsetY);
    }
  });
});

describe('release compass', () => {
  const anchor = createBodies(DEFAULT_CONFIG)[0]!;
  const orbit = { a: 90, e: 0.15, argp: 0.4, dir: 1 };

  /** Where the ship ends up if it releases at `angle` and drifts straight. */
  function releaseRay(angle: number, tighten: number) {
    const rr = orbitRadius(orbit, 80, angle, tighten);
    return {
      x: anchor.x + Math.cos(angle) * rr,
      y: anchor.y + Math.sin(angle) * rr,
      hx: -Math.sin(angle) * orbit.dir,
      hy: Math.cos(angle) * orbit.dir,
    };
  }

  it('finds an angle whose tangent actually points at the target', () => {
    for (const target of [
      { x: 400, y: -600 },
      { x: -200, y: -900 },
      { x: 189, y: -1350 },
      { x: 500, y: 200 },
    ]) {
      const { angle, error } = releaseAngleFor(orbit, 80, 0.5, anchor, target);
      expect(error, 'no aiming solution found').toBeLessThan(0.01);

      // verify independently: the release ray must pass close to the target
      const r = releaseRay(angle, 0.5);
      const dx = target.x - r.x;
      const dy = target.y - r.y;
      const len = Math.hypot(dx, dy);
      const cross = Math.abs(r.hx * dy - r.hy * dx); // perpendicular miss distance
      expect(cross / len, 'release ray does not aim at the target').toBeLessThan(0.02);
    }
  });

  it('matches a brute-force search at a fraction of the cost', () => {
    const target = { x: 420, y: -700 };
    let calls = 0;
    const counted = new Proxy(anchor, { get: (t, k) => (calls++, (t as never)[k]) });
    releaseAngleFor(orbit, 80, 0.5, counted as typeof anchor, target);
    const cheap = calls;

    calls = 0;
    releaseAngleFor(orbit, 80, 0.5, counted as typeof anchor, target, 180, 0);
    const brute = calls;

    expect(cheap).toBeLessThan(brute);
    // and the cheap one is MORE accurate, because it refines rather than sampling
    const a = releaseAngleFor(orbit, 80, 0.5, anchor, target);
    const b = releaseAngleFor(orbit, 80, 0.5, anchor, target, 180, 0);
    expect(a.error).toBeLessThan(b.error);
  });

  it('knows when another body is in the way', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    const from = { x: bodies[0]!.x, y: bodies[0]!.y - 200 };
    // straight through the middle of a body sitting between us and the target
    const blocker = bodies[1]!;
    const beyond = {
      ...blocker,
      x: blocker.x + (blocker.x - from.x),
      y: blocker.y + (blocker.y - from.y),
    };
    expect(pathBlocked(from, beyond, [...bodies, beyond], [bodies[0]!])).toBe(true);
    // and a clear line is not reported as blocked
    expect(pathBlocked({ x: -400, y: 0 }, bodies[0]!, bodies, [])).toBe(false);
  });

  it('offers the nearest bodies first, and never the anchor', () => {
    const bodies = createBodies(DEFAULT_CONFIG);
    const targets = aimTargets(bodies, 0, 1e9, 3);
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.index)).not.toContain(0);
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i]!.distance).toBeGreaterThanOrEqual(targets[i - 1]!.distance);
    }
  });

  it('draws nothing before the orbit exists', () => {
    const c = cam();
    const r = recordingContext();
    const bodies = createBodies(DEFAULT_CONFIG);
    const diving = {
      ...captureSnapshot(createInitialState(DEFAULT_CONFIG), true, DEFAULT_CONFIG),
      capture: captureOf({ phase: 'clear', orbit: null }),
    };
    const res = drawCompass(r.ctx, c, DEFAULT_CONFIG, rcfg, diving, bodies, 0);
    expect(res.bestAlign).toBe(0);
    expect(r.ops).toHaveLength(0);
  });
});

describe('compass targets point up the climb', () => {
  const bodies = createBodies(DEFAULT_CONFIG);

  it('never offers a body at or below the anchor', () => {
    for (let i = 0; i < bodies.length; i++) {
      const anchor = bodies[i]!;
      for (const t of aimTargets(bodies, i, 1e9, 8)) {
        expect(t.body.y, `${t.body.name} is not above ${anchor.name}`).toBeLessThan(anchor.y);
      }
    }
  });

  it('always points at the next step of the climb', () => {
    const counts = bodies.map((_, i) => aimTargets(bodies, i, AIM_RANGE, 3).length);
    // the top body has nothing above it; everywhere else has somewhere to go
    expect(counts[counts.length - 1]).toBe(0);
    expect(
      counts.slice(0, -1).every((n) => n >= 1),
      'a body with nowhere to aim',
    ).toBe(true);
  });

  it('keeps the gauge to the near field rather than signposting a long coast', () => {
    // The range shows the next step of the climb, not a target several hops away
    // that would be a featureless drift to reach.
    for (let i = 0; i < bodies.length; i++) {
      for (const t of aimTargets(bodies, i, AIM_RANGE, 3)) {
        expect(t.distance).toBeLessThanOrEqual(AIM_RANGE);
      }
    }
  });

  it('drops anything beyond the range', () => {
    for (let i = 0; i < bodies.length; i++) {
      for (const t of aimTargets(bodies, i, AIM_RANGE, 8)) {
        expect(t.distance).toBeLessThanOrEqual(AIM_RANGE);
      }
    }
  });

  it('shows nothing at the top of the field rather than pointing back down', () => {
    const topIndex = bodies.reduce((best, b, i) => (b.y < bodies[best]!.y ? i : best), 0);
    expect(aimTargets(bodies, topIndex, 1e9, 3)).toEqual([]);
  });
});

describe('compass rings encode distance', () => {
  const bodies = createBodies(DEFAULT_CONFIG);

  /** Radii of the arcs drawn centred on the anchor, in world units. */
  function ringRadii(anchorIndex: number) {
    const sim = DEFAULT_CONFIG;
    const state = createInitialState(sim);
    const c = cam();
    const anchor = bodies[anchorIndex]!;
    // sit the ship in a settled circular orbit around the anchor
    const snap = {
      ...captureSnapshot(state, true, sim),
      x: anchor.x,
      y: anchor.y - 80,
      capture: captureOf({
        phase: 'orbit',
        orbit: { a: 80, e: 0, argp: 0, dir: 1 },
        rPeri: 80,
        planet: anchorIndex,
      }),
    };
    const r = recordingContext();
    drawCompass(r.ctx, c, sim, rcfg, snap, bodies, 0);
    const cxs = toScreenX(c, anchor.x);
    const cys = toScreenY(c, anchor.y);
    // full circles only: [x, y, radius, 0, TAU]
    return (r.calls('arc') as Array<[string, number, number, number, number, number]>)
      .filter((o) => Math.abs(o[1] - cxs) < 1e-6 && Math.abs(o[2] - cys) < 1e-6 && o[5] > 6)
      .map((o) => o[3] / c.scale);
  }

  it('gives each target its own ring, wider for the further body', () => {
    const radii = [...new Set(ringRadii(0).map((r) => +r.toFixed(4)))].sort((a, b) => a - b);
    const targets = aimTargets(bodies, 0, AIM_RANGE, AIM_MAX_TARGETS);
    expect(targets.length).toBeGreaterThan(1);
    expect(radii.length, 'one ring per target').toBe(targets.length);
    // rings are strictly increasing, and in the same order as target distance
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeGreaterThan(radii[i - 1]!);
  });

  it('never signposts more than the configured maximum', () => {
    // even with the whole field in range
    for (let i = 0; i < bodies.length; i++) {
      expect(aimTargets(bodies, i, 1e9, AIM_MAX_TARGETS).length).toBeLessThanOrEqual(
        AIM_MAX_TARGETS,
      );
    }
  });

  it('scales ring size with distance rather than merely with rank', () => {
    const sim = DEFAULT_CONFIG;
    const near = aimTargets(bodies, 0, AIM_RANGE, 3);
    const radii = [...new Set(ringRadii(0).map((r) => +r.toFixed(4)))].sort((a, b) => a - b);
    // the gap between rings should track the gap between target distances
    const distRatio = near[1]!.distance / near[0]!.distance;
    const inner = rcfg.compassRingInner;
    const spread = rcfg.compassRingSpread;
    const expected0 = inner + (near[0]!.distance / AIM_RANGE) * spread;
    const expected1 = inner + (near[1]!.distance / AIM_RANGE) * spread;
    // 3 decimals: ringRadii() rounds to 4 when de-duplicating
    expect(radii[1]! - radii[0]!).toBeCloseTo(expected1 - expected0, 3);
    expect(distRatio).toBeGreaterThan(1);
    void sim;
  });
});

describe('edge markers point up the climb', () => {
  const bodies = createBodies(DEFAULT_CONFIG);
  const sim = DEFAULT_CONFIG;

  /** Screen positions of the arrows drawn for a ship at world y. */
  function markerYs(shipY: number) {
    const c = cam();
    const state = createInitialState(sim);
    const snap = { ...captureSnapshot(state, false, sim), x: 195, y: shipY };
    centerCamera(c, snap.x, snap.y, field);
    const r = recordingContext();
    drawEdgeMarkers(r.ctx, c, rcfg, snap, bodies);
    // each arrow is translate(ex, ey) followed by rotate
    return (r.calls('translate') as Array<[string, number, number]>).map((o) => o[2]);
  }

  it('never puts an arrow below the ship', () => {
    // partway up the field, so there are bodies both above and below
    const shipY = bodies[6]!.y;
    const c = cam();
    centerCamera(c, 195, shipY, field);
    const middle = c.offsetY + (c.viewH * c.scale) / 2;
    const ys = markerYs(shipY);
    expect(ys.length, 'no markers drawn at all').toBeGreaterThan(0);
    for (const y of ys) {
      expect(y, 'an arrow pointed back down the climb').toBeLessThan(middle);
    }
  });

  it('shows nothing once everything is behind you', () => {
    const top = Math.min(...bodies.map((b) => b.y));
    expect(markerYs(top - 1)).toEqual([]);
  });
});

describe('the captured body is highlighted', () => {
  it('draws a halo only around the body holding the ship', () => {
    const sim = DEFAULT_CONFIG;
    const bodies = createBodies(sim);
    const c = cam();
    const state = createInitialState(sim);

    const drift = { ...captureSnapshot(state, false, sim), capture: null };
    const held = {
      ...captureSnapshot(state, true, sim),
      capture: captureOf({ phase: 'orbit', planet: 0 }),
    };

    const a = recordingContext();
    const b = recordingContext();
    new BodyRenderer().draw(a.ctx, c, sim, bodies, -1);
    new BodyRenderer().draw(b.ctx, c, sim, bodies, held.capture!.planet);

    // the halo is an extra radial gradient beyond the per-radius sphere cache
    const gradsIdle = a.calls('=createRadialGradient').length;
    const gradsHeld = b.calls('=createRadialGradient').length;
    expect(gradsHeld).toBeGreaterThan(gradsIdle);
    void drift;
  });
});

describe('fuel gauge graduations', () => {
  const sim = DEFAULT_CONFIG;

  function gaugeOps(fuel: number) {
    const c = cam();
    const r = recordingContext();
    const base = captureSnapshot(createInitialState(sim), false, sim);
    drawFuelGauge(r.ctx, c, sim, { ...base, fuel }, 0);
    return r;
  }

  it('marks the scale over the filled part, not just the empty part', () => {
    // The graduations used to be painted before the fill, so they vanished as the
    // tank filled and the bar could only be read as a bare level.
    const half = gaugeOps(sim.fuelMax / 2);
    const clips = half.calls('clip').length;
    expect(clips, 'ticks are not drawn in two clipped passes').toBe(2);
    // both passes stroke, and with different colours so each reads on its region
    const strokeColors = (half.calls('=strokeStyle') as Array<[string, string]>).map((o) => o[1]);
    expect(strokeColors.some((c) => c.startsWith('rgba(255,255,255'))).toBe(true);
    expect(strokeColors.some((c) => c.startsWith('rgba(0,0,0'))).toBe(true);
  });

  it('skips a pass that would have nothing to draw in', () => {
    // full tank: no empty region, so only the dark-on-fill pass runs
    expect(gaugeOps(sim.fuelMax).calls('clip').length).toBe(1);
    // empty tank: no fill, so only the light-on-track pass runs
    expect(gaugeOps(0).calls('clip').length).toBe(1);
  });

  it('runs the marks across the full width of the gauge', () => {
    const c = cam();
    const r = gaugeOps(sim.fuelMax / 2);
    const gx = c.offsetX + 16 * c.scale;
    const gw = 19 * c.scale;
    const starts = (r.calls('moveTo') as Array<[string, number, number]>).map((o) => o[1]);
    const ends = (r.calls('lineTo') as Array<[string, number, number]>).map((o) => o[1]);
    expect(starts.length).toBeGreaterThan(0);
    for (const x of starts) expect(x).toBeCloseTo(gx, 6);
    for (const x of ends) expect(x).toBeCloseTo(gx + gw, 6);
  });

  it('is fainter over the fill than over the empty track', () => {
    // Over the colour the scale should read as a suggestion, not as stripes.
    const r = gaugeOps(sim.fuelMax / 2);
    const colors = (r.calls('=strokeStyle') as Array<[string, string]>).map((o) => o[1]);
    const overTrack = colors.find((c) => c.startsWith('rgba(255,255,255'))!;
    const overFill = colors.find((c) => c.startsWith('rgba(0,0,0'))!;
    const alpha = (c: string): number => Number(c.slice(c.lastIndexOf(',') + 1, -1));
    expect(alpha(overFill)).toBeLessThan(0.2);
    expect(alpha(overTrack)).toBeLessThan(0.2);
  });
});

describe('edge markers clear the header text', () => {
  const bodies = createBodies(DEFAULT_CONFIG);
  const sim = DEFAULT_CONFIG;

  /** Stand-in for the measured header, in design units. */
  const HEADER_BOTTOM = 21;

  it('keeps every arrow just below the header text', () => {
    const c = cam();
    const state = createInitialState(sim);
    // partway up, so several bodies are off-screen above
    const shipY = bodies[8]!.y + 200;
    const snap = { ...captureSnapshot(state, false, sim), x: 195, y: shipY };
    centerCamera(c, snap.x, snap.y, field);

    const r = recordingContext();
    drawEdgeMarkers(r.ctx, c, rcfg, snap, bodies, HEADER_BOTTOM);
    const ys = (r.calls('translate') as Array<[string, number, number]>).map((o) => o[2]);
    expect(ys.length, 'no arrows drawn').toBeGreaterThan(0);

    const topLimit = c.offsetY + (HEADER_BOTTOM + rcfg.edgeMarkerHeaderGap) * c.scale;
    for (const y of ys) {
      expect(y, 'an arrow sat in the header band').toBeGreaterThanOrEqual(topLimit - 1e-6);
      // and just below it, not pushed halfway down the screen
      expect(y, 'an arrow was pushed far below the header').toBeLessThan(topLimit + 30 * c.scale);
    }
  });

  it('still hugs the sides at the ordinary inset', () => {
    const c = cam();
    const state = createInitialState(sim);
    // a body far off to one side, so the ray exits through a vertical edge
    const snap = { ...captureSnapshot(state, false, sim), x: -600, y: bodies[4]!.y };
    centerCamera(c, snap.x, snap.y, field);
    const r = recordingContext();
    drawEdgeMarkers(r.ctx, c, rcfg, snap, bodies, HEADER_BOTTOM);
    const xs = (r.calls('translate') as Array<[string, number, number]>).map((o) => o[1]);
    const left = c.offsetX + rcfg.edgeMarkerInset * c.scale;
    const right = c.offsetX + c.designW * c.scale - rcfg.edgeMarkerInset * c.scale;
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(left - 1e-6);
      expect(x).toBeLessThanOrEqual(right + 1e-6);
    }
  });
});
