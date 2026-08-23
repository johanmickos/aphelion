/**
 * Scoring weights.
 *
 * DELIBERATELY NOT IN `SimConfig`, for three reasons that are each on their own
 * sufficient:
 *
 *   - `test/tune.test.ts` asserts every tune-panel knob moves the ship by more
 *     than half a pixel. A score weight moves no pixel, so it would read as a
 *     dead knob and fail a test that exists to catch dead knobs.
 *   - `SimConfig` is compared field by field by the equality gate and recorded in
 *     the golden baseline. Adding keys there forces a golden recapture every time
 *     a number is retuned, for a value physics never reads.
 *   - A run freezes its `SimConfig` and a diagnostics report carries it. Score
 *     weights are code, not run parameters: two players on the same build are
 *     scored the same way, and a replay of an older report is scored by today's
 *     rules, which is what you want when you are balancing.
 *
 * The scoring equivalent of the tune-panel guarantee lives in `test/score.test.ts`:
 * every key here must change the score of some session, or it is not a weight,
 * it is decoration.
 *
 * THESE NUMBERS ARE A FIRST CUT AND HAVE NOT BEEN PLAYTESTED. They were chosen
 * for legible relative size — a perfect link is worth about eight ordinary drift
 * seconds and about five times a sloppy one — not by playing. Capture feel moved
 * with the clearance fix (PORT_NOTES 18); calibrate against how the game plays
 * now, not against the numbers here.
 */
export interface ScoreConfig {
  // --- what one capture-and-release is worth ---
  /** Paid for any release that earned its boost, before bonuses. */
  linkBase: number;
  /** Points per world pixel climbed since the previous link. */
  climbPerPx: number;
  /**
   * Full bonus for grabbing from right on top of a body.
   *
   * Paid by the GRAB award at periapsis, not by the release — how close you let
   * the body get is settled the instant you press, and reporting it two seconds
   * later attached it to the wrong act.
   */
  closeBonus: number;
  /**
   * Grab clearance, in px above the minimum orbit radius, at which `close` has
   * decayed to zero. 200 spans real play: the closest grab on record cleared the
   * floor by 25px and the furthest by 268.
   */
  closeSpan: number;
  /** Full bonus for releasing at the peak of the boost envelope. */
  timingBonus: number;
  /** Full bonus for releasing exactly on a compass marker. */
  aimBonus: number;
  /**
   * Flat bonus for a nerve grab: a late press on a line that was already headed
   * inside the minimum orbit. See `src/score/praise.ts`. Paid by the GRAB award.
   *
   * Flat rather than proportional, because the thing being rewarded is a
   * threshold being crossed — you either held your nerve or you did not — and
   * because a word that promises a boost the points do not reflect is worse than
   * no word. Set it to 0 to keep the word and drop the points.
   */
  nerveBonus: number;
  /**
   * Shaping exponents. The underlying measures are generous ramps — alignment is
   * linear over a full 90 degrees, the boost envelope over ~1.8 seconds — which
   * is right for a gauge you read at a glance and far too soft for a reward.
   * Raising them concentrates the points near the tip, so "close enough" reads on
   * the compass but only precise pays.
   */
  aimSharpness: number;
  timingSharpness: number;

  // --- the burn ---
  /**
   * Clearance, in px above the minimum orbit, at which reentry heat reaches zero.
   *
   * The span is narrow on purpose. Widening it does not lengthen the burn — the
   * speed term is what bounds it — it only lets a slow, shallow pass smoulder.
   * Measured: at a span of 30 the median flare runs 0.17s, and at 80 it runs
   * 0.18s.
   */
  burnSpan: number;
  /**
   * Planet-relative speed, in px/s, below which nothing burns however low it is.
   *
   * THIS IS THE KEY THAT MAKES THE BURN MEAN ANYTHING, and it is why heat is not
   * simply altitude. The simulation actively steers every dive down onto `minR`
   * — that is the clearance fix — so being at the floor is not an achievement:
   * measured across 1386 real captures, 68% of settled orbits sit at EXACTLY zero
   * clearance. A burn gated on depth alone would pay most for parking.
   *
   * A parked minimum orbit is slow, though. How slow is not a matter of sampling:
   * a settled capture is a circle at radius >= `minR`, so its speed is
   * sqrt(GM/minR), maximised by the smallest body in the field. Under
   * DEFAULT_CONFIG that is R=34 and a gap of 12, giving a hard ceiling of
   * **345.8 px/s** that no parked orbit anywhere can exceed.
   *
   * 355 sits above that closed form with margin to spare. It is deliberately NOT
   * the 342 px/s the diagnostics corpus happened to top out at — that sample
   * never parked on the smallest planet, and a gate set to it would have burned
   * while parked on the one field where it mattered. Sample the physics, not the
   * recordings, where the physics can be solved.
   */
  burnSpeed0: number;
  /**
   * Speed at which the heat term saturates.
   *
   * This started at the p99 of real low passes, 560, and that was too wide by
   * half. It made the ramp 200px/s across when a typical skim runs 370-400 — the
   * bottom fifth of it — so speed swamped depth and a beautiful 2px graze read as
   * heat 0.15, which is a plume too faint to see and 14 points. Reported as "I
   * didn't see any red glow or flare or counter rolling up as I hugged the edge",
   * on a session that did exactly that.
   *
   * 520 keeps the spread the ladder needs — peak heat p25 0.25, p50 0.44, p75
   * 0.73, p90 0.92 — without saturating the middle. Narrower was tried: at 430
   * the median flare saturates at 0.90 and the rarity ladder has nothing left to
   * grade.
   */
  burnSpeed1: number;
  /**
   * Points per heat-second.
   *
   * Heat is `depth * speed`, both 0..1, so a whole second held at full heat pays
   * this — which never happens: the hot pass is a flash. Derived, not picked: the
   * median capture that burns integrates 0.0747 heat-seconds, so 1125 is what
   * puts it at the ~84 points the band was chosen for, alongside `closeBonus` 150
   * and `nerveBonus` 200. The best capture on record lands at ~182.
   */
  burnRate: number;
  /**
   * Heat below which the ship is not burning: no flame, and no points.
   *
   * It brackets the flare — a burn award is owed when heat falls back under this
   * — so it decides what counts as one pass rather than two, and it withholds the
   * points from a smoulder too faint to draw. A weight, not a constant, because
   * it changes what a session scores.
   *
   * Raised from 0.05 once the flame got its presentation curve, and the two are
   * one decision: `drawBurn` renders sqrt(heat), so 0.10 is the point at which
   * the fire becomes plainly visible. Below it there was nothing to see and a
   * couple of points to collect, which is the worst of both — a payout with no
   * picture. Now every burn that pays is a burn you watched.
   */
  burnMinHeat: number;

  // --- the streak ---
  /**
   * Each link after the first adds this much to the multiplier.
   *
   * This — not `streakMax` — is the lever that decides what a chain is worth. The
   * ceiling only ever bites at the very top; the step is what every link past the
   * first is paid. Measured over one recorded 10-link session, raising it from
   * 0.25 to 0.4 is a 23% larger session score and a 60% larger marginal reward
   * for one more link.
   *
   * DELIBERATELY LEFT AT 0.25 pending a decision on the boost-timing axis. The
   * step is the incentive to chain FAST, and the reason `timing` pays around 6%
   * of link points is that waiting 0.45s at the boost peak costs a link and the
   * streak already pays more for the link than the peak pays for the wait.
   * Raising the step deepens exactly that arbitrage. Settle whether the peak is
   * worth waiting for, then tune this — in that order, or this gets tuned twice.
   */
  streakStep: number;
  /**
   * Multiplier ceiling. At `streakStep` 0.25 it binds on the 17th consecutive
   * link.
   *
   * KEPT AT 5, and briefly changed to 3 on the strength of two sessions before
   * the next one showed why that was wrong. The evidence for "unreachable" was a
   * cohort of short lives — a build without `grabLeadTime`, without the crash-cone
   * fix, and with half the flyby brake — where the best chain was 4 links. On the
   * current build a single life has chained 32 grabs across 69 seconds and 88% of
   * the field, which reaches this ceiling and then some.
   *
   * That is the property wanted: a top a great run touches and an ordinary one
   * does not. A ceiling low enough to bind early is worse than one that never
   * binds, because a 21-link chain is harder than a 9-link chain and paying them
   * the same rate is the reward failing to track the difficulty.
   *
   * The lesson is about sample size, not about this number. Two sessions cannot
   * establish the shape of a distribution whose interesting end is rare by
   * construction.
   */
  streakMax: number;
  /**
   * Raw points for capturing an anomaly, before the multiplier.
   *
   * Sized against a link's ~300-400 raw so the capture lands as two or three
   * links' worth: at a maxed streak that is around 4000, a visible number at the
   * moment of greatest tension. Deliberately not larger. The ten-second window is
   * meant to be the prize, and a flat award big enough to dominate would turn a
   * run's score into a count of anomalies found rather than a measure of how well
   * it was flown.
   */
  anomalyBonus: number;
  /**
   * Added to the multiplier while an anomaly bonus is running, ON TOP of
   * `streakMax` — see `multiplierFor`.
   *
   * At a maxed streak this is x5 -> x7 for the window's duration, worth roughly
   * 2500-3000 across the four links it covers. Set against dying and losing a
   * 16-link streak, that is the arithmetic that has to make going worth it.
   */
  anomalyBonusMult: number;
  /**
   * Seconds the bonus runs, starting at the RELEASE from the anomaly.
   *
   * From the release and not the grab because converting the flyby, settling and
   * waiting for a release angle costs 1.5-2s that would otherwise burn a fifth of
   * the window inside an orbit going nowhere — and would mean holding a tighter,
   * better orbit actively cost bonus time. Starting at the release makes the
   * number here the number the player experiences.
   *
   * This is a weight, not a constant: it multiplies how many links the bonus is
   * paid on, so it changes what the bonus is worth and belongs with the rest of
   * them. See the note on `ScoreConfig` about what does and does not live here.
   */
  anomalyBonusSecs: number;
}

/**
 * The live scoring rules.
 *
 * The shape of the model, which is the part worth arguing about:
 *
 *   grab = (close + nerve)                       x multiplier   at periapsis
 *   burn = (heat integrated over the pass)       x multiplier   when the fire dies
 *   link = (base + climb + timing + aim)         x multiplier   at the release
 *
 * Three events, because they are settled at different moments and describe
 * different acts. The grab is judged on how the ship arrived and pays when the
 * dive swings through the bottom — not at the press, so a tap that never gets
 * there earns nothing and tapping beside a planet is not a faucet. The link is
 * judged on how it left. The burn is judged on the ride between them.
 *
 * The burn is the only one that accrues rather than being read off an instant,
 * and the only one that can pay twice in one capture — a settle that dips through
 * the hot zone on two successive passes lights twice, because it did.
 *
 * It does NOT double-pay `close`, which is the obvious worry. `close` is settled
 * at the press and the burn at periapsis, and measured over 1386 real captures
 * they are ANTI-correlated: peak heat against grab clearance is -0.36, against
 * apoapsis -0.43. A grab from inside 10px flares 0% of the time — there is no
 * dive left to build speed with — which is exactly where `close` pays most. The
 * far, stretched grab does not burn either: it arrives as a flyby that has to be
 * braked, and braking sheds the speed the heat is made of. What burns is the
 * middle: a moderate orbit, dived hard.
 *
 * `close` is how near you let the body get before committing to the grab.
 * `cap.tightness` was the obvious candidate and is the wrong one — it saturates
 * at 0.99+ across three quarters of real releases, so it paid every capture the
 * same and discriminated nothing. Grab clearance has real spread and is a choice
 * the player makes. `timing` is the boost window, which is the skill mechanic the
 * player is already playing. `aim` is the compass, which until now was advice
 * with nothing behind it.
 *
 * Timing and aim are the interesting pair because they FIGHT. The boost peaks a
 * fixed 0.45s after the orbit freezes, and the ship is wherever its sweep has
 * carried it by then; the marker is at a fixed angle. Getting both means shaping
 * the dive so the peak lands on the marker, and that is a real skill with a real
 * ceiling — built entirely out of physics that already exists.
 *
 * `climb` is banked rather than paid continuously: altitude gained since the last
 * link is only cashed at the next one. Coasting therefore earns nothing until you
 * engage again — which is now the ONLY pressure to keep engaging. There was a
 * penalty for rising past a body you could have taken, and it was removed for
 * being too punitive: banking the climb withholds a reward, which is a different
 * thing from taking points off someone who was already having a bad run.
 */
export const DEFAULT_SCORE_CONFIG: Readonly<ScoreConfig> = Object.freeze({
  linkBase: 100,
  climbPerPx: 0.25,
  closeBonus: 150,
  closeSpan: 200,
  timingBonus: 250,
  aimBonus: 200,
  nerveBonus: 200,
  aimSharpness: 3,
  timingSharpness: 2,

  burnSpan: 30,
  burnSpeed0: 355,
  burnSpeed1: 520,
  burnRate: 1125,
  burnMinHeat: 0.1,

  streakStep: 0.25,
  streakMax: 5,
  anomalyBonus: 800,
  anomalyBonusMult: 2,
  anomalyBonusSecs: 10,
} satisfies ScoreConfig);
