/**
 * The tunable parameters, and why these eleven.
 *
 * Chosen from a sensitivity sweep — each parameter perturbed 25% across six
 * scenarios — rather than from taste. Anything that only ever produced a
 * redesign (GM, softening, substeps, cruise speed) is excluded, as is anything
 * measurably inert.
 *
 * The boost group looks low-impact by a positional metric and is here anyway:
 * its effect is on timing and reward, which a position measurement cannot see,
 * and it is the entire skill mechanic.
 *
 * THE SWEEP IS ONE OF TWO REASONS A KNOB IS HERE. The other is that a value was
 * reasoned rather than felt and the only instrument that can settle it is a phone
 * — which is what put the RELEASE group and `RENDER_KNOBS` on the panel. A number
 * argued from the corpus is not a number that has been judged: the corpus can say
 * what a cue must not claim, and it cannot say how hard a release should land or
 * how fast a limb should swing.
 */
import type { SimConfig } from '../sim/config.ts';
import type { RenderConfig } from '../render/config.ts';

interface KnobShape {
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

export interface Knob extends KnobShape {
  key: keyof SimConfig;
}

/**
 * A knob that cannot touch a trajectory.
 *
 * SEPARATE TABLE, AND THE SEPARATION IS THE POINT. A `SimConfig` knob is part of
 * `(config, seed, inputLog)`, so it is recorded in a diagnostics report, replayed
 * with the run, and pinned by `test/tune.test.ts` measuring how far it moves the
 * ship. A `RenderConfig` knob is none of those things — it changes the picture and
 * nothing else, which is exactly why it is safe to drag and why the ship-movement
 * promise cannot be the one it keeps. Its promise is that it changes what gets
 * drawn, and that is pinned separately.
 *
 * Folding the two into one table would mean a key that reads as tunable but is
 * absent from the replay's config compare, which is the shape `tools/replay-core.ts`
 * exists to keep honest.
 */
export interface RenderKnob extends KnobShape {
  key: keyof RenderConfig;
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
    group: 'BOOST',
    key: 'boostBurstDecay',
    label: 'FADE',
    min: 0.3,
    max: 2.5,
    step: 0.05,
    dp: 2,
    // Here because it is the release kick's fade as well as the boost burst's,
    // and the kick is the thing being judged. Direction 01's motion law asks for
    // roughly 420ms of transient; this holds 1.3s, and nobody has flown either.
    // The bottom of the range reaches the board's number.
    hint: 'seconds a transient burst takes to bleed off · short is a punch, long is a shove',
  },
  {
    group: 'RELEASE',
    key: 'releaseKick',
    label: 'PUNCH',
    min: 0,
    max: 160,
    step: 2,
    dp: 0,
    // UNFLOWN, and sized from diagnostics rather than from the hand: 54% of 366
    // recorded releases earned no kick at all, and only 31 of those flew badly.
    // 54 is what that measurement argued for; whether letting go LANDS at 54 is a
    // different question and this slider is the only instrument that can ask it.
    // 0 is the comparison — it is the game as it was before the kick existed.
    hint: 'speed every release lands, at full quality · pure transient, so it never changes what a run is worth',
  },
  {
    group: 'RELEASE',
    key: 'kickShape',
    label: 'PUNCH SHAPE',
    min: 0.25,
    max: 1.5,
    step: 0.05,
    dp: 2,
    hint: 'how quality becomes punch · 1 is linear, below 1 lifts a weak release, above 1 reserves the punch for a good one',
  },
  {
    group: 'RELEASE',
    key: 'kickHold',
    label: 'PUNCH HOLD',
    min: 0,
    max: 1.5,
    step: 0.05,
    dp: 2,
    // Quality already enters as size, so this is the second channel and the
    // gentler one on purpose. 0 makes every kick fade at the same rate, which is
    // the check for whether paying quality twice reads as anything.
    hint: 'how much longer a full-quality kick lasts, as a fraction of FADE · 0 pays quality once, in size only',
  },
  {
    group: 'FLYBY',
    key: 'outboundFlybyFrac',
    label: 'CATCH',
    min: 0,
    max: 1,
    step: 0.05,
    dp: 2,
    // In FLYBY rather than CAPTURE because what it moves is which grabs REACH the
    // brake: it is the door into this group, not a property of the dive. 1 is the
    // old rule (a bound grab is always a capture, however fast it is leaving), 0
    // is the prototype's (any outbound grab is a flyby).
    hint: 'grabs already flying away are braked above this share of escape speed · 1 never brakes them',
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
    group: 'FUEL',
    key: 'fuelRegen',
    label: 'REFUEL',
    min: 0,
    max: 40,
    step: 1,
    dp: 0,
    // Sits next to BRAKE COST because the two are one decision: how expensive a
    // brake is, and how long you wait to afford the next one. It reads as inert
    // in ordinary play — the tank only leaves full when a flyby brake drains it
    // — so what this really sets is how punishing that recovery is.
    hint: 'fuel per second recovered while drifting · 0 leaves a drained tank drained',
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

/**
 * Direction 04's body language, every value of which was reasoned and none of
 * which has been flown.
 *
 * WHY THESE FIVE AND NOT THE WHOLE ANATOMY. `body.ts` also fixes the rim width,
 * the two strata alphas, the core radius and the tide's span — and those stayed
 * consts, because a still frame can judge them. A proportion is either right or
 * wrong on a screenshot. What is here is everything whose answer only exists in
 * MOTION: how a limb swings, how long a mark lingers, and how a field ahead
 * resolves as you climb into it. A slider on the phone is the only instrument
 * that reaches those, which is the same argument the camera lock is on a toggle
 * for.
 */
export const RENDER_KNOBS: readonly RenderKnob[] = [
  {
    group: 'THE TIDE',
    key: 'bodyTideLagFull',
    label: 'LAG NEAR',
    min: 0.5,
    max: 30,
    step: 0.5,
    dp: 1,
    hint: 'how fast the tide tracks you when the body has real hold of you · low is liquid, high is snappy',
  },
  {
    group: 'THE TIDE',
    key: 'bodyTideLagRest',
    label: 'LAG FAR',
    min: 0.5,
    max: 30,
    step: 0.5,
    dp: 1,
    // The pair IS the claim: a body reaches lazily from far off and snaps to you
    // once it has you, so the tracking rate is itself a reading of the gravity.
    // Set them equal to hear what that claim is worth.
    hint: 'the same tracking rate out at the edge of reach · equal to LAG NEAR turns the ramp off',
  },
  {
    group: 'THE LAMP',
    key: 'bodyRimRest',
    label: 'RIM',
    min: 0,
    max: 1,
    step: 0.05,
    dp: 2,
    hint: 'how brightly a body you are nowhere near wears its own colour · this is what a field ahead reads as',
  },
  {
    group: 'THE LAMP',
    key: 'bodyEmitAt',
    label: 'BLOOM AT',
    min: 0,
    max: 1,
    step: 0.05,
    dp: 2,
    hint: 'the pull at which a rim starts to glow · low blooms half the field at once, 1 saves it for the body holding you',
  },
  {
    group: 'THE LAMP',
    key: 'bodySpentRecover',
    label: 'SPENT',
    min: 0,
    max: 10,
    step: 0.5,
    dp: 1,
    // 0 is the honest comparison and the reason the range opens there: it is the
    // field with no memory at all, which is what the mark has to beat.
    hint: 'seconds a body you just let go of stays dark · 0 removes the mark, long enough and it lies about a body you are flying back to',
  },
  {
    group: 'THE LAMP',
    key: 'bodyGripAlpha',
    label: 'GRIP',
    min: 0,
    max: 0.6,
    step: 0.02,
    dp: 2,
    // The one render knob that is answerable to a scoring rule rather than only
    // to taste: it draws the band the tightness multiplier is graded over, and
    // axiom 5 says a multiplier nothing announced is invisible math. 0 is
    // therefore a comparison and not a setting to leave it on.
    hint: 'how strongly a body shows the band its grip is graded over · 0 makes the tightness multiplier invisible math',
  },
];
