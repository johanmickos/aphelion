/**
 * Where the hand starts, and what the marks on it do.
 *
 * *"I want this line to end at the planet surface, not extend from the center of
 * the planet"* (author, 2026-08-29) — the part of the radius inside the body was
 * drawing a line through the thing it measures from.
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
