/**
 * What each kind of body IS, as data.
 *
 * DELIBERATELY NOT `SimConfig`. A config key is something a RUN can differ by: it
 * is compared when a replay decides whether a report came from the same build, it
 * costs a `PROTOTYPE_CONFIG` value and a golden recapture, and it appears in every
 * diagnostics header. That toll is correct for a key that tunes the simulation. It
 * should not be charged for saying how wide an anomaly's shelter is.
 *
 * Eight of the seventy-eight keys in `SimConfig` described one body type, and at
 * that rate the four types Direction 04 asks for would have taken the config past
 * a hundred and twenty. None of them vary per run — an anomaly is the same anomaly
 * in every field — so they are a table beside the generator, exactly as `KNOBS` is
 * a table beside the tune panel and `LEVEL` is one beside the accolades.
 *
 * WHAT STAYS IN `SimConfig`, AND WHY THE LINE IS THERE. This table answers "what
 * is a body of this type"; the config answers "how many, and where". `bodyCount`
 * and `anomalyCount` are the course, `worldSeed` is the field, and `chargedSecs`
 * is the length of a reward window that two consumers outside the simulation
 * divide by. Those are all per-run. Nothing here is.
 *
 * ADDING A TYPE IS A ROW HERE plus a case in the renderer's draw switch. If it
 * costs more than that, the traits are not finished — see `BodyTraits`.
 */
import type { Body, BodyTraits } from './types.ts';

export type BodyTypeId = 'planet' | 'anomaly';

export interface BodyType {
  /** Which member of the `Body` union this builds. */
  kind: Body['kind'];
  /**
   * The radius range the generator draws from, as `min + rnd() * (max - min)`.
   *
   * A pair rather than a base and a spread, because the two ends are what anyone
   * reasoning about the field actually holds in mind — "34 to 56" — and because
   * the arithmetic is then identical to the two literals it replaced.
   */
  radius: readonly [min: number, max: number];
  /**
   * How far OUTSIDE the corridor wall a body of this type is placed. 0 puts it in
   * the corridor with everything else.
   *
   * Placement, on a table about identity, and it earns its place here rather than
   * in the course spec because it is half of a PAIR. `SimConfig.anomalyBubble`
   * used to say of itself: "Sized against `anomalyOffset` rather than chosen
   * freely, and the relationship is what matters" — at 400 against 250 the shelter
   * reaches 150px back inside the corridor, so a ship crosses the barrier already
   * protected. Split the two across a table and a config and that relationship has
   * nowhere to be stated, which is how it stops being true.
   *
   * How MANY of a type a field holds, and how they are spread up it, stay in the
   * course. That is the line: this says what one is and where it stands relative
   * to the wall; the course says how many walls' worth there are.
   */
  wallOffset: number;
  /** What a body of this type can do. See `BodyTraits`. */
  traits: BodyTraits;
}

/**
 * The types, and the whole of what distinguishes them.
 *
 * Frozen and shared: a field of sixty planets holds sixty references to one
 * `traits` object, because it contains no per-body value.
 */
export const BODY_TYPES: Readonly<Record<BodyTypeId, BodyType>> = Object.freeze({
  /**
   * The baseline the field is made of, and the thing every other type is a
   * departure from: no capability, every ordinary role.
   */
  planet: Object.freeze({
    kind: 'planet',
    // The authored range, from `DEFS`. It was written out twice in the generator
    // — once on the fork path and once on the single-row path — and both were the
    // same expression, which is how two copies of one number stay agreeing right
    // up until they do not.
    radius: [34, 56] as const,
    wallOffset: 0,
    traits: Object.freeze({
      authored: null,
      shelter: 0,
      charges: false,
      claimable: false,
      routable: true,
      landmark: false,
      counted: true,
    }),
  }),

  /**
   * An alien body sitting outside the corridor, past the barrier.
   *
   * A normal gravitating body in every respect the simulation cares about —
   * captured by the same code, orbited by the same phase clock, contacted by the
   * same policy. Everything that makes it special is below.
   *
   * The authored orbit is what makes it a REST STOP rather than a test of the
   * approach: a fixed modest orbit at a fixed unhurried pace, reached in a third
   * of the time a planet's settle takes, because the arrival is not the point
   * here. It was reported as "a wasted second spent waiting to stabilise before
   * the thing that was committed to actually arrives".
   */
  anomaly: Object.freeze({
    kind: 'anomaly',
    radius: [40, 56] as const,
    wallOffset: 250,
    traits: Object.freeze({
      authored: Object.freeze({ orbitR: 130, orbitPeriod: 3, refuel: 30, settleDur: 0.45 }),
      // Reaches 150px back inside the corridor at a `wallOffset` of 250, so a
      // ship crosses the barrier already protected and the transition is never a
      // surprise. Also the miss window: near 300px/s it buys about 1.3s of flight
      // past the anomaly before the far edge, which is long enough to see the
      // mistake arrive and short enough to be clearly over.
      shelter: 400,
      charges: true,
      claimable: true,
      routable: false,
      landmark: true,
      counted: false,
    }),
  }),
});
