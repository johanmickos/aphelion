/** Scoring types. Nothing here is ever read by the simulation. */
import type { Body } from '../sim/types.ts';

/** One thing that happened to the score, on one tick. */
export interface ScoreAward {
  tick: number;
  kind: 'link' | 'miss';
  /** Points actually applied, signed. A penalty is capped by the score on hand. */
  points: number;
  /** The multiplier in force. Always 1 for a miss — penalties are never scaled. */
  multiplier: number;
  /** The body this is about. */
  body: string;
  /**
   * How close the ship let the body get before grabbing. 0..1, 1 = surface.
   *
   * NOT `cap.tightness`, which reads as the same idea and is useless as one:
   * measured over 112 real releases it sits at 0.99 or above for three quarters
   * of them, because the dive almost always reaches the minimum-orbit floor.
   * Grab clearance is the quantity with actual spread — 25px to 268px in the
   * same 112 — and it is the thing a player chooses.
   */
  close: number;
  /**
   * The same measurement in raw pixels above the minimum orbit radius.
   *
   * Carried alongside the normalised `close` rather than derived from it, because
   * deriving it needs `closeSpan` and `src/score/praise.ts` deliberately does not
   * see `ScoreConfig` — its thresholds are percentiles of measured play and move
   * no points. Two numbers meaning the same thing is how they start disagreeing;
   * one measurement carried twice in different units does not.
   */
  clearance: number;
  /**
   * Closest approach the pre-grab drift line would have made, in px above the
   * minimum orbit radius. Negative means the ship was on a line INTO the
   * minimum-orbit zone — it was going to hug the planet whether or not it grabbed.
   *
   * This is what `clearance` alone cannot say. A ship 50px off a planet on its way
   * past is in the same place as one 50px off and boring straight in, and only the
   * second one is a nerve grab. Drift is a straight ray — the escape burst is
   * exactly parallel to the release velocity, so it scales speed and never bends
   * the path — which is what makes this exactly computable rather than a guess.
   */
  skim: number;
  /** Where in the boost envelope the release landed. 0..1. Link only. */
  timing: number;
  /** Best compass alignment at release. 0..1. Link only. */
  aim: number;
  /** World pixels of climb banked into this link. */
  climb: number;
}

/**
 * A capture as it stood at the end of the previous tick.
 *
 * The release is resolved from the input edge at the START of a tick, before any
 * physics runs, so the capture as of the end of the previous tick is EXACTLY what
 * `releaseCapture` saw. Holding a copy is what lets the score read a release
 * without the simulation having to announce one.
 */
export interface PendingLink {
  /** The same test `releaseCapture` uses to decide a release earned its boost. */
  earned: boolean;
  body: string;
  close: number;
  clearance: number;
  skim: number;
  timing: number;
  aim: number;
  /** What the release was lined up with, for the readout. */
  target: Body | null;
}

export interface ScoreState {
  /** Points banked in the CURRENT life. A death takes them. */
  score: number;
  /** The highest any life reached this session. Never reset by a death. */
  best: number;
  /** Consecutive earned links, unbroken by a miss, a putter-out or a death. */
  streak: number;
  /** Live multiplier, derived from the streak. */
  multiplier: number;
  /** Session totals, across every life. Diagnostics, not the score. */
  links: number;
  misses: number;
  /** The most recent award, for the HUD to flash. */
  lastAward: ScoreAward | null;

  // --------------------------------------------------- observer bookkeeping
  /** The capture as of last tick. See `PendingLink`. */
  pending: PendingLink | null;
  /** `highWaterY` the current climb banks from. Null between lives. */
  climbFromY: number | null;
  /** Per body, one of the OFFERED / GRABBED / JUDGED bits. Cleared each life. */
  flags: number[];
  /** Edge-detects the start of an ending hold. */
  endingSeen: boolean;
  /**
   * The drifting ship as of the end of last tick, and whether it was captured.
   *
   * A grab resolves from the input edge at the START of a tick, before physics,
   * so this is EXACTLY the state `beginCapture` read — which is what lets the
   * skim line be reconstructed without the simulation storing it.
   */
  lastDrift: { x: number; y: number; vx: number; vy: number } | null;
  wasCaptured: boolean;
  /** Skim clearance of the grab that started the current capture. */
  grabSkim: number;
  /** Last observed `telemetry.putterOuts`, to edge-detect a dry capture. */
  putterOuts: number;
}
