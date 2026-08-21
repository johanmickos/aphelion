/**
 * The tunable parameters, and why these ten.
 *
 * Chosen from a sensitivity sweep — each parameter perturbed 25% across six
 * scenarios — rather than from taste. Anything that only ever produced a
 * redesign (GM, softening, substeps, cruise speed) is excluded, as is anything
 * measurably inert.
 *
 * The boost group looks low-impact by a positional metric and is here anyway:
 * its effect is on timing and reward, which a position measurement cannot see,
 * and it is the entire skill mechanic.
 */
import type { SimConfig } from '../sim/config.ts';

export interface Knob {
  key: keyof SimConfig;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
  /** What moving it actually does. */
  hint: string;
  /** Decimal places to show. */
  dp: number;
}

export const KNOBS: readonly Knob[] = [
  {
    group: 'CAPTURE',
    key: 'phaseRate',
    label: 'SWEEP',
    min: 0.5,
    max: 2.5,
    step: 0.05,
    dp: 2,
    hint: 'how fast the settled ship travels its orbit · 1 = the physically real speed',
  },
  {
    group: 'CAPTURE',
    key: 'tightenFrac',
    label: 'ROUNDNESS',
    min: 0,
    max: 1,
    step: 0.02,
    dp: 2,
    hint: '1 rounds the oval into a circle · lower keeps a permanent oval',
  },
  {
    group: 'CAPTURE',
    key: 'settleDur',
    label: 'SETTLE',
    min: 0.3,
    max: 3,
    step: 0.1,
    dp: 1,
    hint: 'seconds spent easing from the dive into the settled orbit',
  },
  {
    group: 'CAPTURE',
    key: 'minOrbitGap',
    label: 'CLEARANCE',
    min: 6,
    max: 30,
    step: 1,
    dp: 0,
    hint: 'closest the ship may orbit above a surface · low looks tight, too low looks stuck',
  },
  {
    group: 'BOOST',
    key: 'boostArmTime',
    label: 'ARM',
    min: 0.1,
    max: 1.5,
    step: 0.05,
    dp: 2,
    hint: 'seconds of holding before the boost peaks · this is where the skill window sits',
  },
  {
    group: 'BOOST',
    key: 'boostDecayTime',
    label: 'DECAY',
    min: 0.3,
    max: 4,
    step: 0.1,
    dp: 1,
    hint: 'seconds for the peak to fade · longer is more forgiving',
  },
  {
    group: 'BOOST',
    key: 'boostMax',
    label: 'REWARD',
    min: 0,
    max: 250,
    step: 5,
    dp: 0,
    hint: 'speed a perfect release adds',
  },
  {
    group: 'FLYBY',
    key: 'flybyBrake',
    label: 'BRAKE',
    min: 80,
    max: 700,
    step: 10,
    dp: 0,
    hint: 'how hard holding sheds speed on a too-fast grab',
  },
  {
    group: 'FLYBY',
    key: 'flybyFuelPerSec',
    label: 'BRAKE COST',
    min: 0,
    max: 120,
    step: 2,
    dp: 0,
    hint: 'fuel per second while braking · the only place fuel really binds',
  },
  {
    group: 'WORLD',
    key: 'bodySpacing',
    label: 'SPACING',
    min: 200,
    max: 900,
    step: 10,
    dp: 0,
    hint: 'gap between planets · under ~370 the next one is visible while you orbit',
  },
];

/** Keys the panel can change, for validating a restored set. */
export const TUNABLE = new Set<string>(KNOBS.map((k) => k.key as string));
