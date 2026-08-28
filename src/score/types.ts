/** Scoring types. Nothing here is ever read by the simulation. */
import type { Body } from '../sim/types.ts';
import type { DeadlineWall } from '../sim/rescue.ts';

/** One thing that happened to the score, on one tick. */
export interface ScoreAward {
  tick: number;
  /**
   * THREE KINDS, WHERE THERE WERE SEVEN. F04 stage (b) deleted `grab`, `hop`,
   * `rescue` and `burn` — not by a popup policy but by the economy: none of them
   * mints any more, so none of them is a payment, so none of them is an award.
   *
   * That is 47% of every popup in the game removed structurally. PORT_NOTES 59
   * measured the reported defect — "so many at so many different points that the
   * user doesn't know what they're being rewarded for" — at 31.7 things a minute,
   * with 74% of awards carrying nothing but a number, composed link 36% / grab
   * 32% / rescue 11% / flyby 10% / shouts 7% / burn 4%.
   *
   * Every one of the deleted axes still scores; it scores as a multiplier on the
   * swing that follows, which is announced by a pixel instead of by a number
   * floating off the ship. A tight arrival multiplies the carry, a hot pass sets
   * the band, a zip steps the chain, and a rescue is worth about 7x an ordinary
   * swing without anything anywhere naming it a rescue.
   *
   * `link` and `flyby` are the two ways a swing cashes, and they are the same
   * event wearing different clothes: `carry * tier * band * streak`, settled at
   * the moment the ship stops being able to change what it did. They are mutually
   * exclusive by construction — a flyby that converts does so BEFORE its
   * periapsis, since conversion needs bound and inbound, so a pass that becomes a
   * capture is paid once, as a link.
   *
   * `mote` is a dot flown through in the run-in carpet: the one award that is not
   * about a body, the one that still mints, and the one that steps nothing. See
   * `ScoreConfig.moteBonus`.
   */
  kind: 'link' | 'flyby' | 'mote';
  /** Points actually applied. Never negative — nothing takes points away. */
  points: number;
  /**
   * Everything the carry was multiplied by: `tier * band * streak`.
   *
   * The whole product rather than the streak alone, because the popup prints it
   * and the receipt has to explain its own number. A player who reads `x6.00`
   * beside a total that is six times the carry can check the arithmetic; one who
   * reads the streak alone cannot.
   */
  multiplier: number;
  /**
   * The rung this release earned, as its multiplier. 1 for a release inside the
   * window that cleared no rung.
   *
   * Carried as the number rather than as a name because F04 owns the price and
   * F09 owns the vocabulary — TRUE / SHARP / PERFECT are Direction 06's words and
   * naming them here would be pre-empting a plan that is still open.
   */
  tier: number;
  /** Which of the three fire bands the swing cashed in: 1, 2 or 3. */
  band: number;
  /**
   * The priced carry this swing cashed, before `multiplier`.
   *
   * Points rather than pixels: the chain rate and every arrival's tightness are
   * already in it, which is what "the carry" means. `climb` is the same swing in
   * raw pixels, and the two are deliberately both here — a receipt that reported
   * only the priced figure could not show what the pricing did.
   */
  carry: number;
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
  /**
   * World pixels of climb that fed this swing's carry, gate included.
   *
   * The RAW ground covered, so `carry / climb` is exactly what the chain and the
   * arrivals were worth per pixel. Metres lost to the coast gap are not in it:
   * they never became carry, and reporting them would make the ratio a lie.
   */
  climb: number;
  /**
   * Deepest this swing got into the dead zone, 0..1. 0 for one that never burned.
   *
   * The PEAK rather than the integral, and the integral is what selected `band` —
   * so the two together say how the band was earned: a long shallow graze and a
   * brief plunge at the line can cash in the same band, and only the second one
   * reads as a plunge. It is the number the debrief and the replay quote.
   */
  heat: number;
  /**
   * Degrees of heading the pass swept, press to release. Flyby only.
   *
   * Nothing else reports it because nothing else needs it. A grab and a link are
   * paid on an instant, and a capture that converts is judged on the orbit it
   * reached rather than on the arc it took to get there.
   */
  turn: number;
  /**
   * Seconds since the orbit froze, at the release. Link only; 0 for a pass.
   *
   * RECORDED BECAUSE `timing` CANNOT BE INVERTED WHERE IT MATTERS. `timing` is
   * the envelope's value, and the envelope has a flat top — so every release
   * inside the plateau reports 1.00 and the one number that would say WHERE in
   * the plateau it was is gone. Calibrating the plateau's width therefore had no
   * measurement available at all: 118 of 652 recorded links saturate `timing`
   * and not one of them can say by how much.
   *
   * This is the same defect PORT_NOTES 75 records from the other side — a field
   * that exists on the award and not in the tuple leaves a report unable to say
   * what happened — and it is `boostT` rather than an unclamped fraction because
   * `boostT` is the free variable: the envelope is derived from it and from three
   * config keys the report already carries, so any envelope can be re-graded off
   * it after the fact.
   */
  boostT: number;
  /**
   * How tight the grab this swing BEGAN with was, 0..1. Link only.
   *
   * FOR THE RECORD AND NOT FOR PRICING, and the distinction is the reason `close`
   * beside it is 0 on a link. Arrival qualities belong to the arrival, which
   * already priced the carry this award is cashing — anything that reads them at
   * the cash step is paying for them twice, and `close` stays zeroed so it cannot.
   * This carries the same quantity where a REPORT can see it, because nothing has
   * recorded an arrival's tightness since F04 removed the grab award, and
   * `SimConfig.flybyConvertRefund` is now graded on exactly it.
   *
   * So: read it in a harness, never in a renderer and never in a weight.
   */
  arrival: number;
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
  /**
   * Seconds since the orbit froze. The free variable `timing` is derived from,
   * and the one the flat top of the envelope throws away. See `ScoreAward.boostT`.
   */
  boostT: number;
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
 *
 * `turn` is the exception and is deliberately NOT here: it is the only quality of
 * a flyby that is not finished at the bottom. See `FLYBY_TURN_MIN`.
 */
export interface PendingFlyby {
  body: string;
  close: number;
  clearance: number;
  skim: number;
  defl: number;
}

export interface ScoreState {
  /**
   * Points CASHED in the current life. A death takes them.
   *
   * This was `score`, and the rename is F04 stage (a): Direction 08 splits the
   * live number into what is at stake and what has been paid, and `score` was
   * already the second of those — every award adds to it the instant it is made.
   * Renaming it rather than adding a third number is what keeps one definition:
   * a `score` beside a `bank` would be two names for one total, which is the
   * defect `finishLineY` and `runInBand` are in `AGENTS.md` for.
   *
   * A death still takes it, which is the Daily economy. The mode matrix (F05) is
   * where that stops being universal — INFINITE lets the bank survive — and it is
   * deliberately not encoded here yet.
   */
  bank: number;
  /**
   * Points climbed and not yet cashed — Direction 08's "at stake, glowing".
   *
   * THE ONLY POT IN THE GAME. Metres accrue into it at `climbPerPx`, priced as
   * they are climbed by the chain rate, and multiplied whole by the tightness of
   * every arrival. A release empties it into `bank` at `tier * band * streak`;
   * a death takes it.
   *
   * It is deliberately a number the player can see without reading one: the
   * craft's trail carries it, because axiom 4 says points exist in two states and
   * the player should always be able to see what death would cost.
   */
  carry: number;
  /**
   * The same swing in raw world pixels, un-priced.
   *
   * Kept beside `carry` rather than derived from it, because deriving it would
   * need the chain rate and every arrival's tightness back out of a product that
   * has already collapsed them. It exists so a receipt can say what the pricing
   * was worth — see `ScoreAward.climb` — and for nothing else: no score reads it.
   */
  carryPx: number;
  /**
   * Consecutive engagements, unbroken by a long coast or a death.
   *
   * NOT THE STREAK, and the difference is the reason both exist. This steps on
   * every capture BEGUN — a grab, a zip, a pass that never converts — and breaks
   * when `coastClimb` runs past the gate, so it asks whether the ship is still
   * using the field. `streak` steps only on a swing that CASHED and breaks on a
   * putter-out, so it asks whether the swings being finished are landing. One
   * counter serving both would be paying a single quantity twice, which is the
   * "combos of combos" axiom 1 refuses.
   *
   * It prices metres as they are climbed rather than the swing as it cashes —
   * see `ScoreConfig.chainStep` — which is what puts it inside the carry and the
   * streak in the cash step, two systems with two pixels and no overlap.
   *
   * A zip steps it, which is where `hopBonus` went: a hop is an engagement, so a
   * charged window drives the chain instead of paying a flat 500 a body.
   */
  chain: number;
  /**
   * Climb accrued in the current coast, in world px. Reset by any engagement.
   *
   * THE GAP GATE. Axiom 3 says disengaged metres earn nothing, and 63.7% of all
   * climb in the corpus is coasted — so where the gate falls decides most of the
   * economy. It falls at `cfg.grabRange`: metres stop counting once the ship has
   * climbed a full grab-range without engaging anything, which is aimless drift by
   * the game's own definition of reach.
   *
   * Measured rather than chosen, over 401 coasts: at the board's own rung (25m)
   * the gate leaves 58.6% of climb unpaid, which is 93% of the way to paying only
   * for captured metres; at `grabRange` it leaves 7.3%. The swing between bodies
   * stays paid, which is what VISION's one non-negotiable feeling requires.
   *
   * IT READS THE GLOBAL `cfg.grabRange` AND MUST KEEP DOING SO. If reach becomes a
   * per-body trait it has to MULTIPLY this, never replace it — otherwise how
   * patient the economy is with drifting would change according to which planet
   * happened to be nearby. Same shape as `traits.charges` and `traits.claimable`,
   * both of which are booleans so the config can keep the magnitude.
   *
   * IT BREAKS THE CHAIN TOO, on the same edge. One definition of "the ship has
   * stopped using the field", so the metres stop counting and the chain resets at
   * the same instant rather than at two thresholds that would need keeping in
   * step.
   */
  coastClimb: number;
  /**
   * `highWaterY` as of the end of last tick, so the carry can accrue per tick.
   *
   * It replaced `climbFromY`, which anchored a whole inter-link stretch and was
   * only read when a link cashed — so it could never say which metres were
   * coasted, which is the question the gate turns on.
   */
  lastHighY: number;
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
  /**
   * Live cash multiplier: the streak ladder, and nothing else.
   *
   * The tier and the band are properties of a swing that has not happened yet, so
   * they cannot be live; the chain is inside the carry rather than beside it. What
   * the HUD shows as `xN` is this.
   */
  multiplier: number;
  /**
   * Which fire band the carry would cash in right now: 1, 2 or 3.
   *
   * Published for the same reason `burnHeat` is — the drawing and the points must
   * not be able to disagree about how hot it is — and read off `burnBank` rather
   * than off the instantaneous heat, because the band is what the swing has DONE
   * at the edge and not where it happens to be this tick.
   */
  band: number;
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
  /**
   * Degrees of heading the current capture has swept so far.
   *
   * A running sum of `cap.defl`, which is the simulation's own per-tick heading
   * change — so there is exactly one definition in the codebase of how far a
   * heading moved in a tick, and this is its integral.
   *
   * SWEPT AND NOT NET, which was tried first and is the wrong measure by one
   * case. Over the 206 paid flybys in `diagnostics/` the two are interchangeable
   * where it matters — the same 21 passes fall below 8 degrees either way, and the
   * percentiles agree to a degree through p70. They part on six passes, every one
   * of them shaving clearance 0 and paying 987-1899: a hard skimming pass bends
   * hard one way and the flyby brake, which is 85% radial, straightens it back
   * out, so the ship leaves on roughly the heading it arrived on having been
   * thrown right around the planet. Net reads that as no steering at all. The
   * suite's own flyby fixture is the extreme of it — 200 ticks, 83 fuel, 500px/s
   * shed to 112, and a net course change of 3.5 degrees.
   *
   * The exploit this exists to close is not reached by the difference: a tap
   * sweeps as little as it nets, because there is no time to bend and unbend.
   */
  capTurn: number;
  /** Grab clearance of the current capture, in px above the minimum orbit. */
  grabClearance: number;
  /**
   * The dive has swung through periapsis, so the arrival has already priced the
   * carry. Edge-detected because it may only price it once per capture.
   */
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
   * Heat integrated over the current SWING, in band units.
   *
   * It used to be points and used to be paid and reset when the fire went out.
   * Both were wrong under the constitution: minting per second near the wall is
   * what axiom 1 bans by name, and a flare that ended before the release would
   * have taken its evidence with it. It now survives the fire dying and is
   * emptied by the cash, so a swing that rode the edge early still cashes in the
   * band it earned.
   *
   * Fractional and un-rounded: heat is integrated a tick at a time and rounding
   * each slice would lose most of a short flare.
   *
   * A DEATH DROPS IT, which is the whole stake. 78% of edge-drags end in the wall
   * and pay nothing at all — the drama is free and only the save is paid.
   */
  burnBank: number;
  /** Hottest instant of the current swing. 0 for one that has not burned. */
  burnPeak: number;
  /** Names of anomalies already claimed this life. Cleared by `endLife`. */
  claimed: string[];
  /**
   * A press made AFTER the last one that could still have turned the ship away,
   * or null. Set at the press, cleared if the ship turns away regardless.
   *
   * Observability, not scoring — nothing here pays or withholds a point. It is
   * here rather than recomputed by the renderer because the scorer already asks
   * `rescueDeadline` this exact question on this exact tick, and a second forward
   * simulation of the same press is both waste and a second place for the answer
   * to live. `burnHeat` is the precedent: a field the simulation never reads,
   * kept by the observer, consumed by the drawing.
   *
   * Measured over the corpus, a press past the cross is fatal 94% of the time and
   * precedes 43% of all deaths by a median 0.85s. The 6% that live are why this
   * clears on the turn-away rather than persisting to the end of the capture.
   */
  doomed: { wall: DeadlineWall; tick: number } | null;
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
  /**
   * Dots in the carpet that have already been paid for.
   *
   * A COUNT, not a set of indices, because the simulation only ever takes them —
   * `Mote.taken` goes false to true within a life and a respawn resets every one
   * of them at once. So the number taken can only rise while a life lasts, and the
   * difference between it and this is exactly how many awards are owed.
   */
  motes: number;
  /** Last observed `chargedT`, to edge-detect a window opening and closing. */
  wasCharged: boolean;
  /**
   * Carry accrued while the current charged window was open.
   *
   * It was `hopTotal` — a running sum of the flat 500 each hop paid — and the
   * flat award is gone, so what a frenzy is worth is no longer a sum of receipts.
   * It is four planets of altitude taken at a chain that stepped on every one of
   * them, which is exactly this.
   *
   * STILL A RESTATEMENT AND STILL NOT A PAYMENT. Nothing is banked here; the
   * metres were already in `carry` as they were climbed, and they cash at the next
   * release like any others. The closing tally exists so the window has a receipt
   * at all — see `Tally`.
   */
  hopCarry: number;
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

  // ------------------------------------------------------------------- stats
  /**
   * What the CURRENT life has measured about itself. Reset by `endLife`.
   *
   * Read `lastRun` instead if you want the run that just ended — see its note,
   * which is the whole reason these are three fields and not one.
   */
  run: RunStats;
  /**
   * The run that just ended, sealed on the tick it ended.
   *
   * WITHOUT THIS THE SHEET SHOWS ZEROES. `endLife` fires on the FIRST tick of the
   * ending hold, so by the time anything draws a summary the life it is
   * summarising has already been reset — the same trap `AGENTS.md` records for
   * the score itself ("a death zeroes it, so at the last tick of a recording it is
   * usually zero, which will make any weight you are testing look dead"). Sealing
   * a copy before the reset is what lets a post-mortem exist at all.
   *
   * Null until the first life ends.
   */
  lastRun: RunStats | null;
  /**
   * Ticks the ship has been drifting, uncaptured, right now. Reset by a capture.
   *
   * Not a stat and not a weight: it exists only so the debrief can say how long
   * the ship had been adrift when the run ended, which is the question a player
   * asks after an out-of-bounds death.
   */
  driftTicks: number;
  /**
   * How the last run ended at a boundary, sealed on the ending tick.
   *
   * NULL FOR EVERY OTHER ENDING. An impact, a fall behind the floor and a clear
   * all have their own cue, and a line about a wall would be answering a question
   * nobody asked.
   *
   * SEPARATE FROM `lastRun` ON PURPOSE. `RunStats` is the set of numbers that
   * have a session best to be compared against, and folds element-wise through
   * `foldSessionMax`. Neither of these does: "the furthest-left wall of the
   * session" is not a thing, and a longest-drift record would be a prize for
   * dying slowly.
   *
   * `alight` is whether the ship was still burning as it went. Measured over the
   * corpus, 126 of 195 side-wall deaths (65%) were on fire within the final half
   * second and 95 (48%) on the very last tick — so this is not a rare flourish,
   * it is the commoner of the two ways to leave the field, and the one the notice
   * used to describe as "off course".
   *
   * READ ON THE LAST LIVE TICK, with no window and no threshold. `endLife` zeroes
   * `burnHeat`, and it runs after this seal, so `sc.burnHeat` here still holds the
   * value from the tick before the ending — which is exactly "was it burning as it
   * crossed". A tolerance window would need a constant nobody can measure the
   * right value of.
   *
   * Sealed at the same moment and for the same reason as `lastRun` — `endLife`
   * runs on the FIRST tick of the ending hold, so anything drawn afterwards that
   * reads live state is describing a run that has already been reset.
   */
  lastEnding: { wall: DeadlineWall; driftSecs: number; alight: boolean } | null;

  /**
   * Element-wise maximum across every life this session, for the "· best 940"
   * figure the sheet prints beside each row.
   *
   * MAX AND NOT "BEST", WHICH IS NOT THE SAME WORD FOR EVERY ROW. On top speed
   * and chain a maximum is plainly an achievement; on `roughPasses` it is the
   * worst you flew, not the best. Calling the field what it does — the largest
   * value seen — keeps it honest, and lets the sheet choose its own wording per
   * row rather than inheriting a judgement from the field name.
   */
  sessionMax: RunStats;
}

/**
 * What one life measured about itself.
 *
 * Pure observation. Nothing here is read by the simulation, nothing here is a
 * `ScoreConfig` weight, and nothing here feeds a points calculation — so adding a
 * field costs no golden recapture and cannot reach `test/score.test.ts`'s proof
 * that every weight moves some outcome.
 *
 * Several of these are DERIVED AT DISPLAY TIME rather than counted here. Planets
 * cleared is a function of `highWaterY` and the field, so counting it per tick
 * would be a second definition of a number the world already answers; the sheet
 * asks the field instead.
 */
export interface RunStats {
  /** Ticks the life lasted. Seconds are `ticks * dt` — never a wall clock. */
  ticks: number;
  /** Highest speed reached, px/s, captured or drifting. */
  topSpeed: number;
  /**
   * Path length flown, px.
   *
   * Integrated from SPEED rather than summed from position deltas, which was the
   * obvious way and is wrong: a respawn teleports the ship the length of the
   * field, and a position-delta sum would bank that jump as distance travelled.
   */
  distance: number;
  /**
   * Longest chain the life reached.
   *
   * The number the live multiplier cannot show. `streakMax` binds at 5 — the
   * 2026-08-23 capture sat pinned there for 63 of its 85 seconds — so the readout
   * on screen stops moving long before the chain does, and everything the player
   * did after that is invisible to them. This is the part that kept going.
   */
  peakChain: number;
  /** Seconds spent inside the burn, integrated over every flare. */
  fireSecs: number;
  /**
   * Passages flown roughly — `RECKLESS_DEG`, one count per passage.
   *
   * DELIBERATELY THE 27-DEGREE LINE AND NOT `KINK_THRESHOLD_DEG`. 15 degrees is
   * the smoothness metric `tools/replay.ts` reports, and the playtest of
   * 2026-08-22 measured it firing on 42% of captures — a statistic about the
   * physics, not an achievement about the pilot. 27 is already defined as "was
   * that rough", already edge-detected so one rough passage counts once however
   * many ticks it spans, and already the line `recklessStreak` is built on.
   */
  roughPasses: number;
  /** 1 if the life ended by flying into a planet, else 0. */
  impacts: number;
  /** Anomalies claimed. */
  anomalies: number;
  /** Points the life had banked when it ended. */
  score: number;
  /**
   * Highest point reached, in world y (up is negative).
   *
   * The raw mark rather than a percentage, because the denominator belongs to the
   * field and the field belongs to the caller. A sheet that knows the bodies can
   * turn this into "48 / 60"; one that does not still has something true.
   */
  highWaterY: number;
}
