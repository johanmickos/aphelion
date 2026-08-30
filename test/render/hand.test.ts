/**
 * Where the compass's two straight lines start.
 *
 * *"I want this line to end at the planet surface, not extend from the center of
 * the planet"* (author, 2026-08-29), and the same again for the filament one
 * state earlier: *"the tether/grab line when not orbiting should also stop at
 * the planet surface."* Neither had anything to say inside the body — both were
 * drawing through the thing they measure from.
 */
import { describe, expect, it } from 'vitest';
import { fixtureCraft, fixtureField } from '../../src/sim/fixture-field.ts';
import { createInitialState, stepSim } from '../../src/sim/step.ts';
import type { SimState } from '../../src/sim/types.ts';
import { NO_INPUT } from '../../src/sim/types.ts';
import { createPresentation, derive } from '../../src/state/derive.ts';
import type { PresentationState } from '../../src/state/types.ts';
import { draw } from '../../src/render/index.ts';

const PRESS = { pressed: true };

/** A context that writes down the polylines it is asked for. */
function recorder(): {
  context: CanvasRenderingContext2D;
  lines: { x: number; y: number }[][];
} {
  const lines: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  const context = {
    canvas: { width: 1170, height: 2532 },
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '' as string | CanvasGradient,
    globalCompositeOperation: 'source-over',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    clip: () => {},
    setLineDash: () => {},
    beginPath: () => {
      current = [];
      lines.push(current);
    },
    closePath: () => {},
    moveTo: (x: number, y: number) => current.push({ x, y }),
    lineTo: (x: number, y: number) => current.push({ x, y }),
    rect: () => {},
    fillRect: () => {},
    fill: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 0 }),
    arc: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    stroke: () => {},
  } as unknown as CanvasRenderingContext2D;
  return { context, lines };
}

/** A presentation with the instrument up — rings, hand and all. */
function orbiting(): PresentationState {
  const sim: SimState = createInitialState(fixtureField(), fixtureCraft(), 1);
  let view = createPresentation(sim);
  for (let tick = 0; tick < 400 && view.compass?.hand == null; tick++) {
    stepSim(sim, tick >= 20 ? PRESS : NO_INPUT);
    view = derive(view, sim);
  }
  for (let tick = 0; tick < 40; tick++) {
    stepSim(sim, PRESS);
    view = derive(view, sim);
  }
  return view;
}

describe('the hand starts at the body’s surface', () => {
  const view = orbiting();
  const compass = view.compass!;

  it('has a rim to start at', () => {
    expect(compass.hand).not.toBeNull();
    expect(compass.rim).toBeGreaterThan(0);
  });

  it('draws no part of itself inside the body', () => {
    const { context, lines } = recorder();
    draw(view, context);

    // The hand is the one two-point line that runs along the hand's own bearing.
    const cos = Math.cos(compass.hand!);
    const sin = Math.sin(compass.hand!);
    const along = (p: { x: number; y: number }): number =>
      (p.x - compass.x) * cos + (p.y - compass.y) * sin;
    const across = (p: { x: number; y: number }): number =>
      Math.abs((p.x - compass.x) * -sin + (p.y - compass.y) * cos);

    const hand = lines.find(
      (line) => line.length === 2 && line.every((p) => across(p) < 1e-6) && along(line[1]!) > 0,
    );
    expect(hand).toBeDefined();

    // It begins exactly on the rim and ends past the outermost ring.
    expect(along(hand![0]!)).toBeCloseTo(compass.rim, 9);
    expect(along(hand![1]!)).toBeCloseTo(compass.reach * compass.scale, 9);
    expect(compass.reach).toBeGreaterThan(compass.rim);
  });
});

describe('the filament starts there too', () => {
  /** A presentation mid-dive: a filament, and no instrument yet. */
  const diving = (): PresentationState => {
    const sim: SimState = createInitialState(fixtureField(), fixtureCraft(), 1);
    let view = createPresentation(sim);
    for (let tick = 0; tick < 400; tick++) {
      stepSim(sim, tick >= 20 ? PRESS : NO_INPUT);
      view = derive(view, sim);
      if (view.compass !== null && view.compass.filament > 0 && view.compass.hand === null) break;
    }
    return view;
  };

  it('runs from the rim to the craft, and not from the centre', () => {
    const view = diving();
    const compass = view.compass!;
    expect(compass.hand).toBeNull();
    expect(compass.filament).toBeGreaterThan(0);

    const { context, lines } = recorder();
    draw(view, context);

    // The filament is the only two-point line that ends on the craft.
    const filament = lines.find(
      (line) =>
        line.length === 2 &&
        Math.hypot(line[1]!.x - compass.craftX, line[1]!.y - compass.craftY) < 1e-6,
    );
    expect(filament).toBeDefined();

    const from = filament![0]!;
    // It begins on the rim...
    expect(Math.hypot(from.x - compass.x, from.y - compass.y)).toBeCloseTo(compass.rim, 9);
    // ...and on the line to the craft, so nothing about its bearing moved.
    const cross =
      (from.x - compass.x) * (compass.craftY - compass.y) -
      (from.y - compass.y) * (compass.craftX - compass.x);
    expect(cross).toBeCloseTo(0, 6);
    expect(compass.rim).toBeGreaterThan(0);
  });
});
