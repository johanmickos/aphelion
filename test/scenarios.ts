/**
 * The scenario matrix the equality gate runs.
 *
 * Scenarios deliberately stay inside the playfield: the out-of-bounds test is the
 * one behaviour the port changes on purpose (the prototype evaluated it in screen
 * space against a smoothed camera), so the gate does not cover it. See
 * docs/PORT_NOTES.md note 9.
 *
 * P1 sits at (189, 0) with R=46, so minR = 62.
 */
import type { Scenario } from '../tools/prototype-harness.ts';

export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'drift-only (no input)',
    pressTick: -1,
    releaseTick: -1,
    ticks: 90,
  },
  {
    name: 'slow glancing grab -> settle -> release',
    pressTick: 18,
    releaseTick: 150,
    ticks: 220,
  },
  {
    name: 'head-on dive (clearance engages)',
    ship: { x: 189, y: 400, vx: 0, vy: -97 },
    pressTick: 30,
    releaseTick: 200,
    ticks: 260,
  },
  {
    name: 'tangential grab',
    ship: { x: 60, y: 0, vx: 0, vy: -97 },
    pressTick: 5,
    releaseTick: 150,
    ticks: 200,
  },
  {
    name: 'fast unbound grab -> flyby, braked',
    ship: { x: 105, y: 354, vx: 0, vy: -400 },
    pressTick: 20,
    releaseTick: 200,
    ticks: 240,
  },
  {
    name: 'fast grab, released early (flyby sails past)',
    ship: { x: 105, y: 354, vx: 0, vy: -400 },
    pressTick: 20,
    releaseTick: 40,
    ticks: 160,
  },
  {
    name: 'sailed past (grabbed while outbound)',
    ship: { x: 189, y: -200, vx: 20, vy: -97 },
    pressTick: 4,
    releaseTick: 140,
    ticks: 200,
  },
  {
    name: 'crash into planet, pause, respawn',
    ship: { x: 189, y: 200, vx: 0, vy: -97 },
    pressTick: -1,
    releaseTick: -1,
    ticks: 150,
  },
  {
    name: 'tap-through at periapsis (boost barely armed)',
    pressTick: 18,
    releaseTick: 96,
    ticks: 200,
  },
  {
    name: 'long hold (circularizes fully into orbit)',
    pressTick: 18,
    releaseTick: 300,
    ticks: 340,
  },
];
