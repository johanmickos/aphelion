/** Scoring types. Nothing here is ever read by the simulation. */
import type { Body } from '../sim/types.ts';

/** One thing that happened to the score, on one tick. */
export interface ScoreAward {
  tick: number;
  /**
   * `grab` and `link` are two separate scoring events on one capture.
   *
   * A grab is judged on how you arrived — how close you let the body get, and
   * whether you were already boring in. Those facts are settled the instant you
   * press, and holding them back until the release put the feedback two seconds
   * after the act it described. A link is judged on how you left: where in the
   * boost window, and how near the compass marker.
   *
   * The grab pays when the dive SWINGS THROUGH PERIAPSIS, not when the button
   * goes down. A tap that never reaches the bottom earns nothing, which is what
   * stops a stationary tap-tap-tap next to a planet from being a points faucet —
   * and it means holding on into a full orbit still collects, because periapsis
   * is already behind you.
   *
   * `flyby` is the one that is not part of a capture at all.
   * A grab too fast to be held becomes a flyby; hold it through its closest
   * approach without letting gravity catch you and it pays, and it steps the
   * streak. It exists because the ladder used to be a count of LINKS, so a run
   * that crossed the field fast could never climb it — measured over one session,
   * a chained life ran at x5-x7 while a life covering 3.1x the ground per second
   * topped out at x2 and earned a fifteenth as much per pixel climbed. Speed is
   * skill and had no way to be paid for it.
   *
   * Mutually exclusive with `grab` by construction: a flyby that converts into a
   * capture does so BEFORE its periapsis (conversion needs bound and inbound), so
   * by the time the radius bottoms out the phase is `clear` and the grab award is
   * the one that fires. Nothing is paid twice.
   *
   * `burn` is the odd one out of all of them: the only award that ACCRUES rather
   * than being read off an instant. It integrates how deep into the edge dead zone
   * a captured ship is and pays when the fire goes out, one capture can raise two
   * of them, and a DEATH cancels one outright — see `endLife`.
   */
  kind: 'grab' | 'link' | 'hop' | 'flyby' | 'burn' | 'rescue';
  /** Points actually applied. Never negative — nothing takes points away. */
  points: number;
  /** The multiplier in force. */
  multiplier: number;
  /** The body this is about. */
  body: string;
  /**
   * How close the ship let the body get before grabbing. 0..1, 1 = surface.
   *
   * On a `flyby` this is measured at the closest approach rather than at the
   * press, because a flyby's press is not the choice — the pass is. Same units,
   * same span, different moment, and that difference is the whole distinction
   * between committing to a body and shaving past it.
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
  /**
   * Worst per-sample heading deflection anywhere in the capture, in degrees.
   *
   * Above `KINK_THRESHOLD_DEG` the ride visibly snapped — the brake bit hard, or
   * the dive came in steep enough to be flung around. That used to read purely as
   * a smoothness defect; it is also what a reckless capture feels like from the
   * inside, and it is now scored as one.
   */
  defl: number;
  /** Where in the boost envelope the release landed. 0..1. Link only. */
  timing: number;
  /** Best compass alignment at release. 0..1. Link only. */
  aim: number;
  /** World pixels of climb banked into this link. */
  climb: number;
  /**
   * Deepest the drag got into the dead zone, 0..1. Burn only.
   *
   * The PEAK rather than the integral, because it is what the word is chosen on
   * and a word describes the moment, not the invoice. Two drags worth the same
   * points can be a long shallow graze and a brief plunge at the line; only the
   * second deserves to be called an inferno.
   */
  heat: number;
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
  defl: number;
  timing: number;
  aim: number;
  /** What the release was lined up with, for the readout. */
  target: Body | null;
}

/**
 * A flyby's closest approach, held until the pass ends. See `pendingFlyby`.
 *
 * The qualities are measured at the bottom and never re-read, because that is
 * where the pass was decided — by the time it is paid the ship is seconds away
 * and has none of them any more.
 */
export interface PendingFlyby {
  body: string;
  close: number;
  clearance: number;
  skim: number;
  defl: number;
}

export interface ScoreState {
  /** Points banked in the CURRENT life. A death takes them. */
  score: number;
  /** The highest any life reached this session. Never reset by a death. */
  best: number;
  /**
   * Consecutive scoring passages — earned links and paid flybys — unbroken by a
   * putter-out or a death.
   *
   * Links alone until flybys joined them, and that was the bug the flyby award
   * exists to fix rather than an incidental widening. The ladder is the game's
   * only source of scale, and a count of links can only be climbed by stopping at
   * bodies: a life that crossed 3.1x the ground per second sat at x2 while a
   * chained one ran at x5-x7. Both styles now step the same ladder, so which one
   * scores is decided by how well it is flown and not by which one the counter
   * happens to be able to see.
   */
  streak: number;
  /** Live multiplier: the streak ladder, plus any anomaly bonus on top. */
  multiplier: number;
  /** Session totals, across every life. Diagnostics, not the score. */
  grabs: number;
  links: number;
  flybys: number;
  burns: number;
  /**
   * Dead-zone heat this tick, 0..1, and 0 whenever the ship is not burning.
   *
   * The renderer's only input for the flame. Published on the score state rather
   * than derived a second time from the snapshot, so the fire and the points
   * cannot disagree about how hot it is — see `src/score/burn.ts`.
   */
  burnHeat: number;
  /** The most recent award, for the HUD to flash. */
  lastAward: ScoreAward | null;

  // --------------------------------------------------- observer bookkeeping
  /** The capture as of last tick. See `PendingLink`. */
  pending: PendingLink | null;
  /** `highWaterY` the current climb banks from. Null between lives. */
  climbFromY: number | null;
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
  /** Worst deflection seen so far in the current capture. */
  maxDefl: number;
  /** Grab clearance of the current capture, in px above the minimum orbit. */
  grabClearance: number;
  /** The dive has passed periapsis; the grab award is owed. */
  periSeen: boolean;
  /**
   * The current flyby's radius as of last tick, and whether it is still falling.
   *
   * A flyby's closest approach has to be found here rather than read off the
   * capture, because `stepSim` deliberately does not look for one: periapsis
   * detection is gated on `phase !== 'flyby'`, since a flyby has no orbit to
   * freeze. So the observer runs the same rising-edge test the simulation runs,
   * on the radius it can already see.
   *
   * `flybyR` is Infinity between passages, which is also what makes the first
   * tick of one report `dR < 0` — never a spurious bottom-out on the tick the
   * tracking starts.
   */
  flybyR: number;
  flybyFalling: boolean;
  /**
   * A qualifying flyby closest approach, waiting for the pass to end.
   *
   * WHY IT WAITS. The obvious moment to pay is the closest approach itself, by
   * symmetry with the grab award — and it is wrong for two measured reasons. A
   * flyby can bottom out while still unbound, arc back on the brake, and THEN
   * convert into the capture that pays a grab: measured across 446 synthetic
   * approaches, that is 100% of presses at 420px/s and 59% at 340. Paying at the
   * bottom would pay one press twice and step the ladder twice for it, and the
   * act it would be paying for is usually an overshoot — grabbed too fast, went
   * long, braked back. A fumble recovered is not a fast pass.
   *
   * It also broke a pin worth keeping: a zip glides straight to the parked orbit,
   * so it skips the overshoot, and paying at the bottom made zipping strictly
   * worse than flying on every fast approach — a discount, when a zip is supposed
   * to buy back the flying time and change nothing about the price.
   *
   * So the award is owed at the bottom and paid when the pass ENDS STILL BEING A
   * PASS. Converting clears it. That is the same shape as the link, which is
   * judged mid-flight and paid at the release, and it makes the three events read
   * as one rule: pay at the moment the act finished being reversible.
   */
  pendingFlyby: PendingFlyby | null;
  /**
   * Points banked by the flare currently burning, before the multiplier.
   *
   * Fractional and un-rounded: heat is integrated a tick at a time and rounding
   * each slice would lose most of a short flare. It is committed to the score in
   * one award when the fire goes out, so the invariant that awards sum to the
   * score inside a life still holds.
   */
  burnBank: number;
  /** Hottest instant of the flare currently burning. 0 when nothing is. */
  burnPeak: number;
  /** Ticks left before the grab award lands. -1 once it has. */
  grabDue: number;
  /** Names of anomalies already claimed this life. Cleared by `endLife`. */
  claimed: string[];
  /**
   * A rescue armed at a press and waiting on its outcome, or null.
   *
   * Read once, on the first tick of a capture, from the drift state the press was
   * made in — and never again, because the answer is a property of that instant.
   */
  rescue: { side: 1 | -1; quality: number; body: string } | null;
  /**
   * A press made AFTER the last one that could still have turned the ship away,
   * or null. Set at the press, cleared if the ship turns away regardless.
   *
   * Observability, not scoring — nothing here pays or withholds a point. It is
   * here rather than recomputed by the renderer because the scorer already asks
   * `rescueScar` this exact question on this exact tick, and a second forward
   * simulation of the same press is both waste and a second place for the answer
   * to live. `burnHeat` is the precedent: a field the simulation never reads,
   * kept by the observer, consumed by the drawing.
   *
   * Measured over the corpus, a press past the cross is fatal 94% of the time and
   * precedes 43% of all deaths by a median 0.85s. The 6% that live are why this
   * clears on the turn-away rather than persisting to the end of the capture.
   */
  doomed: { side: 1 | -1; tick: number } | null;
  /**
   * A rescue that came back out of the FIRE, or null.
   *
   * Set at the moment a rescue pays, if the ship is alight then. Asked for as
   * "by 'tight' I mean that the player would've been in the flames section of
   * the side", which turns out to need no threshold at all: `burnHeat` is already
   * a fact the scorer keeps, and being on fire is the definition rather than a
   * percentile of one. Measured over the corpus, 26 of 224 rescues (12%) qualify
   * — 0.4 a session — and their presses run a median quality of 0.81 against 0.54
   * for the rescues that stayed cold, which is why the author's reading and a
   * quality percentile land in nearly the same place.
   *
   * Observability, like `doomed` and `burnHeat`: nothing here pays or withholds a
   * point. The rescue award is what pays.
   */
  tight: { side: 1 | -1; tick: number } | null;
  /**
   * Bodies a rescue has already been paid against this life. Cleared by `endLife`.
   *
   * The same shape as `claimed`, for the same reason it exists there. A drag along
   * the wall is spent hanging off ONE distant planet, and the author's own
   * playtest found the behaviour it guards against — "I can tap a bunch to extend
   * my burn through the red zone". Every one of those taps is a press with almost
   * no window left that does turn the ship away, so without this the tightest
   * possible rescue would also be the most repeatable one, several times a second.
   *
   * Per body rather than per press, so rescuing yourself onto a DIFFERENT planet
   * still pays: that is a new decision about a new body, not the same one
   * collected twice.
   */
  rescued: string[];
  /**
   * Bodies already hopped to in the CURRENT charged window.
   *
   * Cleared on the rising edge of the window, not on its close, so the log always
   * describes the window in progress. Without it the optimal line inside a frenzy
   * is to bounce on one planet: a press-glide-release cycle is about 1.2s, so the
   * same body would pay three times without the ship going anywhere — in a game
   * whose whole subject is climbing. The zip itself is never refused; it simply
   * stops paying, which keeps the ability honest and the points earned.
   */
  hopped: string[];
  /** Last observed `chargedT`, to edge-detect a window opening and closing. */
  wasCharged: boolean;
  /**
   * Hop points banked in the current charged window, for the closing tally.
   *
   * A running sum of points ALREADY PAID, never a pot waiting to be paid. Hops
   * bank as they land, so a death mid-window keeps every one the player actually
   * landed; the tally at the end is a receipt, not a payment. Cleared with the
   * window and by `endLife`.
   */
  hopTotal: number;
  /**
   * Consecutive captures that were flown recklessly. See `src/score/reckless.ts`.
   *
   * Separate from `streak`, which counts links and drives the multiplier. A run
   * of rough captures is a different thing from a run of good releases, and
   * conflating them would mean one could not happen without the other.
   */
  recklessStreak: number;
  /** This capture has already been counted into `recklessStreak`. */
  capKinked: boolean;
  /** Mid-kink right now, so one rough passage does not shout every tick. */
  inKink: boolean;
  /** Same rising edge, for the harder threshold that shouts on its own. */
  inHardKink: boolean;
  /** Last observed `telemetry.putterOuts`, to edge-detect a dry capture. */
  putterOuts: number;
}
