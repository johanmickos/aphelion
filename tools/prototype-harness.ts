/**
 * Drives the immutable prototype (index.html) headlessly at a fixed timestep.
 *
 * index.html is reference material and is never modified. Its script is read,
 * evaluated inside a `node:vm` context with a minimal DOM/canvas stub, and a
 * small wrapper appended in-memory exposes the internals. The clock is injected,
 * so nothing in the prototype can observe wall time.
 *
 * The viewport is pinned to the design resolution (390x844) so `layoutWorld`
 * produces exactly the coordinates the port freezes into `src/sim/world.ts`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import type { TrajectorySample } from '../src/sim/serialize.ts';
import { DESIGN_H, DESIGN_W } from '../src/sim/world.ts';

const PROTOTYPE = fileURLToPath(new URL('../index.html', import.meta.url));

interface PrototypeInternals {
  CONFIG: Record<string, number>;
  cap: Record<string, unknown> & { active: boolean; phase: string; fuel: number };
  ship: { x: number; y: number; vx: number; vy: number; alive: boolean };
  crash: { active: boolean };
  planets: Array<{ x: number; y: number; R: number; name: string }>;
  update(dt: number): void;
  resetShip(): void;
  layoutWorld(): void;
  resize(): void;
  press(): void;
  release(): void;
}

const noop = (): void => {};

/** Math with a deterministic, engine-independent `hypot`. See PORT_NOTES 16. */
const patchedMath: Math = Object.create(Math, {
  hypot: {
    value: function hypot(...args: number[]): number {
      if (args.length === 2) return Math.sqrt(args[0]! * args[0]! + args[1]! * args[1]!);
      return Math.hypot(...args);
    },
  },
}) as Math;

function makeContext(): { sandbox: Record<string, unknown>; setNow: (ms: number) => void } {
  let now = 0;
  const ctxStub = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => {
      if (k === 'canvas') return { width: 0, height: 0 };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop: noop });
      return t[k as string] ?? noop;
    },
    set: () => true,
  });
  const makeEl = (): unknown =>
    new Proxy(
      {
        style: {},
        classList: { add: noop, remove: noop, toggle: noop },
        addEventListener: noop,
        getContext: () => ctxStub,
        closest: () => null,
        value: 0,
        textContent: '',
        innerHTML: '',
      } as Record<string, unknown>,
      {
        get: (t, k) => (k in t ? t[k as string] : noop),
        set: (t, k, v) => {
          t[k as string] = v;
          return true;
        },
      },
    );

  const sandbox: Record<string, unknown> = {
    document: { getElementById: makeEl, addEventListener: noop, createElement: makeEl },
    window: {
      innerWidth: DESIGN_W,
      innerHeight: DESIGN_H,
      devicePixelRatio: 3,
      addEventListener: noop,
      onpointerdown: null,
    },
    performance: { now: () => now },
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    navigator: { clipboard: { writeText: async (): Promise<void> => {} } },
    // `Math.hypot` is not correctly rounded and engines disagree on 36% of
    // inputs, so the simulation uses sqrt(x*x+y*y) instead — see PORT_NOTES 16.
    // The same substitution is applied to the prototype here, so the equality
    // gate compares like with like and still holds at exactly zero. Everything
    // else about Math is untouched.
    Math: patchedMath,
    JSON,
    console,
  };
  sandbox.globalThis = sandbox;
  return { sandbox, setNow: (ms) => (now = ms) };
}

/** Boot the prototype headlessly and return handles to its internals. */
export function bootPrototype(): { p: PrototypeInternals; setNow: (ms: number) => void } {
  const html = readFileSync(PROTOTYPE, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const src = blocks[blocks.length - 1]?.[1];
  if (!src) throw new Error('no <script> block found in index.html');

  const { sandbox, setNow } = makeContext();
  vm.createContext(sandbox);

  // The wrapper mirrors onDown/onUp exactly, minus their DOM guards.
  vm.runInContext(
    src +
      `
;globalThis.__APHELION__ = {
  CONFIG, cap, ship, crash, planets,
  update, resetShip, layoutWorld, resize,
  press(){ held = true; if (!cap.active) beginCapture(); },
  release(){ if (!held && !cap.active) return; releaseHeld(); },
};`,
    sandbox,
  );

  const p = (sandbox as { __APHELION__: PrototypeInternals }).__APHELION__;
  p.resize();
  p.layoutWorld();
  p.resetShip();
  return { p, setNow };
}

/** One scripted run: an optional seeded ship state, and which ticks press/release. */
export interface Scenario {
  name: string;
  /** Overrides the spawn, so a scenario can seed a specific grab geometry. */
  ship?: { x: number; y: number; vx: number; vy: number };
  /** Negative means never. */
  pressTick: number;
  /** Negative means never. */
  releaseTick: number;
  ticks: number;
}

/** Run a scenario against the prototype and return its trajectory. */
export function runPrototype(scenario: Scenario, dt: number): TrajectorySample[] {
  const { p, setNow } = bootPrototype();
  if (scenario.ship) Object.assign(p.ship, scenario.ship);
  const out: TrajectorySample[] = [];
  for (let i = 0; i < scenario.ticks; i++) {
    setNow((i + 1) * dt * 1000);
    if (i === scenario.pressTick) p.press();
    if (i === scenario.releaseTick) p.release();
    p.update(dt);
    out.push(samplePrototype(p, i + 1));
  }
  return out;
}

function samplePrototype(p: PrototypeInternals, tick: number): TrajectorySample {
  const cap = p.cap as unknown as {
    active: boolean;
    phase: string;
    fuel: number;
    rx: number;
    ry: number;
    vx: number;
    vy: number;
    planet: { x: number; y: number };
  };
  if (cap.active) {
    return {
      tick,
      x: cap.planet.x + cap.rx,
      y: cap.planet.y + cap.ry,
      vx: cap.vx,
      vy: cap.vy,
      fuel: cap.fuel,
      phase: cap.phase,
      r: patchedMath.hypot(cap.rx, cap.ry),
    };
  }
  return {
    tick,
    x: p.ship.x,
    y: p.ship.y,
    vx: p.ship.vx,
    vy: p.ship.vy,
    fuel: cap.fuel,
    phase: p.crash.active ? 'crash' : 'drift',
    r: null,
  };
}
