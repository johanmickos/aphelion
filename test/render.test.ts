/**
 * Guards for the render fixes made in Stage 1. Each of these encodes a specific
 * defect found in the prototype; if one regresses, the test names it.
 */
import { describe, expect, it } from 'vitest';
import { recordingContext } from './canvas-stub.ts';
import { DEFAULT_RENDER_CONFIG } from '../src/render/config.ts';
import { createCamera, fitCamera, snapCamera, toScreenX } from '../src/render/camera.ts';
import { Starfield } from '../src/render/starfield.ts';
import { drawHazardZones } from '../src/render/world.ts';
import { boostColor, drawBoostHalo } from '../src/render/capture.ts';
import { drawFuelGauge, readoutLines } from '../src/render/hud.ts';
import { Trail } from '../src/render/ship.ts';
import { DEFAULT_CONFIG, FIXED_DT } from '../src/sim/config.ts';
import { createBodies, fieldBounds } from '../src/sim/world.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { Scene } from '../src/render/scene.ts';
import { captureSnapshot } from '../src/render/snapshot.ts';

const rcfg = DEFAULT_RENDER_CONFIG;
const field = fieldBounds(DEFAULT_CONFIG, createBodies());

function cam() {
  const c = createCamera(rcfg);
  fitCamera(c, { w: 390, h: 844, dpr: 1 });
  snapCamera(c, rcfg, 195, 0, field);
  return c;
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
      slow.draw(sink.ctx, c); // 1 render per tick
    }
    for (const p of path) {
      fast.sample(p.x, p.y);
      fast.draw(sink.ctx, c); // 4 renders per tick
      fast.draw(sink.ctx, c);
      fast.draw(sink.ctx, c);
      fast.draw(sink.ctx, c);
    }

    const a = recordingContext();
    const b = recordingContext();
    slow.draw(a.ctx, c);
    fast.draw(b.ctx, c);
    expect(a.calls('arc')).toEqual(b.calls('arc'));
  });

  it('honours minimum spacing and maximum length', () => {
    const t = new Trail(rcfg);
    for (let i = 0; i < 500; i++) t.sample(i * 0.5, 0); // finer than trailSpacing
    const r = recordingContext();
    t.draw(r.ctx, cam());
    const arcs = r.calls('arc') as Array<[string, number, number]>;
    expect(arcs.length).toBeLessThanOrEqual(rcfg.trailMax);
    for (let i = 1; i < arcs.length; i++) {
      expect(Math.abs(arcs[i]![1] - arcs[i - 1]![1])).toBeGreaterThanOrEqual(
        rcfg.trailSpacing - 1e-9,
      );
    }
  });

  it('draw does not mutate the trail', () => {
    const t = new Trail(rcfg);
    for (let i = 0; i < 40; i++) t.sample(i * 10, 0);
    const a = recordingContext();
    const b = recordingContext();
    t.draw(a.ctx, cam());
    t.draw(b.ctx, cam());
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
      snapCamera(c, rcfg, snap.x, snap.y, f);

      r.reset();
      scene.draw(r.ctx, c, snap, {
        timeMs: i * 16.67,
        paused: false,
        viewportW: 390,
        viewportH: 844,
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
    snapCamera(c, rcfg, snap.x, snap.y, f);
    const r = recordingContext();
    scene.draw(r.ctx, c, snap, { timeMs: 0, paused: false, viewportW: 390, viewportH: 844 });

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
          capture: {
            phase: 'settle',
            planet: 0,
            settleProgress: 1,
            settleT: 1.2,
            orbit: null,
            rPeri: 100,
            boost: charge * 90,
            boostFull: 90,
            boostT,
            overEscape: 0,
          },
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
          capture: {
            phase: 'settle',
            planet: 0,
            settleProgress: 0.5,
            settleT: 0.6,
            orbit: null,
            rPeri: 100,
            boost: 50,
            boostFull: 90,
            boostT,
            overEscape: 0,
          },
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
      capture: {
        phase: 'settle',
        planet: 0,
        settleProgress: 0.1,
        settleT: 0.1,
        orbit: null,
        rPeri: 100,
        boost: 0,
        boostFull: 0,
        boostT: 0,
        overEscape: 0,
      },
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
      capture: {
        phase: 'flyby',
        planet: 0,
        settleProgress: 0,
        settleT: 0,
        orbit: null,
        rPeri: 0,
        boost: 0,
        boostFull: 0,
        boostT: 0,
        overEscape,
      },
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
