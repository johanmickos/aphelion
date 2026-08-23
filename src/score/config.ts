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
 * MOST OF THESE NUMBERS ARE STILL A FIRST CUT. They were chosen for legible
 * relative size — a perfect link is worth about eight ordinary drift seconds and
 * about five times a sloppy one — not by playing. Capture feel moved with the
 * clearance fix (PORT_NOTES 18); calibrate against how the game plays now, not
 * against the numbers here.
 *
 * The exceptions, which carry their own measured rationale and should not be
 * moved on feel: `closeSpan`, `flybyCloseBonus` (why closeness and not speed),
 * `flybyBase` and `streakStep` (both retuned against a recorded speed run),
 * `streakMax` (which has already been mis-tuned once on too small a sample), and
 * all three `burn*` keys — calibrated on the 159 dead-zone drags in the corpus,
 * with `burnEdgeSpan` pinned by a test to the hazard band's own width rather than
 * chosen at all.
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
   * Paid for any flyby held through its closest approach, before closeness.
   *
   * A flat floor rather than the whole award, because the act being paid for is
   * committing to the pass at all: pressing on a body you are already too fast to
   * hold, and staying on it while the brake burns fuel and gravity decides
   * whether it catches you. What you do with the pass is `flybyCloseBonus`.
   *
   * SIZED AGAINST THE STREAK, not against a link. The points are the smaller half
   * of what a flyby is worth — the larger half is that it steps the ladder, which
   * is what a fast run could not previously do at all. Measured over the sessions
   * in `diagnostics/`, an ordinary chained life makes 2.7 unconverted flybys a
   * minute and a fast one makes upward of 38, so this is paid ~14x more often to
   * the style it is meant to reward without needing to know which style it is
   * looking at. Make it much larger and the density stops being a multiplier
   * story and starts being a faucet.
   *
   * Raised 60 -> 80 while `flybyCloseBonus` went 120 -> 300, which is deliberately
   * NOT a proportional bump: this half is paid for showing up and that half is
   * paid for the line. At 60/120 a mean pass in the first session flown under the
   * flyby award was 45% flat base; at 80/300 it is 31%, so the volume floor stayed
   * roughly where it was in absolute terms and the skill half grew. See
   * `streakStep` for the session and what the pair was calibrated against.
   */
  flybyBase: number;
  /**
   * Full bonus for a flyby that shaves the minimum orbit, decaying to zero over
   * `closeSpan` exactly as a grab's closeness does.
   *
   * Closeness and not speed, and that is a measurement rather than a preference.
   * Speed at closest approach was the obvious axis and discriminates nothing: an
   * unconverted flyby is unbound BY DEFINITION, so its speed is pinned near
   * escape velocity — p50 314px/s, p10 149, and 90% of every flyby ever recorded
   * sits in a band 250px/s wide. Clearance over the same 167 passages runs 0px to
   * 318px with a median of 60, which is real spread and is a choice the player
   * makes on the way past. Same reasoning that put grab clearance ahead of
   * `cap.tightness`.
   *
   * 120 -> 300, and this is the half of the flyby award that was raised, because
   * it is the half that discriminates. The first fast session flown under the
   * award shaved p10 0px / p50 67px / p90 189px across 43 passes — the same median
   * as its own grabs — so the closeness term was already separating good passes
   * from lazy ones and was simply priced too low to matter. It is now the largest
   * closeness bonus in the file, above `closeBonus`, which is correct: a grab that
   * comes in tight also gets to bank a link, and a flyby gets one number and is
   * gone.
   */
  flybyCloseBonus: number;
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
   * Distance from the lethal side line, in px, at which dead-zone heat reaches
   * zero. The inner edge of the red band.
   *
   * MUST MATCH `RenderConfig.hazardZoneWidth`, and `test/score.test.ts` pins the
   * two together. The flame's intensity is meant to track the red gradient the
   * player can already see; a fire that peaked somewhere other than where the red
   * does would be teaching a line that is not the line.
   */
  burnEdgeSpan: number;
  /**
   * Points per heat-second of dragging the dead zone.
   *
   * Derived from the drags that SURVIVE, because those are the only ones that
   * ever pay — a death drops the banked flare entire. Their median integrates
   * 0.153 heat-seconds, so 555 puts it at ~85 points, the band `closeBonus` 150
   * and `nerveBonus` 200 already occupy. The best on record lands at ~510.
   *
   * Re-derived when `burnMinHeat` dropped to the band's edge: lighting on the
   * shallow grazes too pulled the median integral down, so the same points band
   * needs more rate behind it.
   *
   * Worth noticing that this is a THIRD of the rate the reentry burn used, for
   * the same points: an edge-drag lasts four to ten times longer than a periapsis
   * flare, so the same payout needs far less rate behind it.
   */
  burnRate: number;
  /**
   * Heat below which the ship is not burning: no flame, and no points.
   *
   * It brackets the flare — a burn award is owed when heat falls back under this
   * — so it decides what counts as one drag rather than two, and it withholds the
   * points from a smoulder too faint to draw. A weight, not a constant, because
   * it changes what a session scores.
   *
   * As close to the band's outer edge as a weight is allowed to sit. "The second
   * they enter the dangerous red zone" is the brief, and the honest value for that
   * is zero — heat is exactly 0 outside the band or while drifting, so `heat > 0`
   * already brackets a drag perfectly and needs no threshold at all.
   *
   * It is 0.01 rather than 0 for a mechanical reason worth writing down:
   * `test/score.test.ts` proves a weight is live by trying it at 0, half and
   * double, and every one of those is 0 when the value is 0 — so a zero weight
   * reads as a dead one and fails a test that is right to exist. 0.01 is 0.6px
   * inside a 60px band: the same instant, and still a number.
   *
   * At the old 0.10 the fire kindled 54px out, and 7% of band entries grazed the
   * outer strip and left without ever lighting — visibly in the red with nothing
   * happening, which is precisely what the brief was about.
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
   * 0.25 -> 0.4, which unblocks the note this used to carry. It was parked at 0.25
   * pending the boost-timing axis, on the grounds that `timing` paid ~6% of link
   * points and raising the step would deepen the arbitrage against waiting for the
   * peak. That axis has since been fixed — its window used to close inside the
   * settle — and in the session this was retuned against `timing` paid 20% of link
   * points, alongside `aim` at 22% and `climb` at 39%. The premise for parking it
   * is gone, so it moved.
   *
   * WHAT IT WAS RETUNED FOR: the ladder's climb is a tax that a short life pays in
   * full and a long one amortises. Over one 133s speed-run session — six lives,
   * 8001 ticks, 97 awards — only two lives lived long enough to reach the ceiling,
   * and both took ~25s to get there; the other four burned 48s of flying, 36% of
   * the session, and never got past x2.25. At 0.25 the ceiling binds on the 17th
   * scoring event, at 0.4 on the 11th, which is inside a fast life instead of at
   * the end of one.
   *
   * It is NOT the lever that rebalances speed against chaining, and should not be
   * reached for as though it were. Rescored across that session and four
   * chain-heavy ones in `diagnostics/`, this step pays the speed run 1.18x and the
   * chain runs 1.07-1.13x — near-uniform inflation. The flyby weights are the only
   * measured lever that is style-specific (1.30x against 1.00x), which is why both
   * moved together and why they moved for different stated reasons.
   *
   * And neither closes the headline gap the author noticed, because that gap is
   * not in the weights: the displayed score is `best`, the best SINGLE LIFE, and
   * that session summed 87,866 across six lives while showing 33,860. Per second
   * inside a life it was the highest earner on record (1168 pts/s against 967 for
   * the best chained life in `diagnostics/`). Speed was already paid at parity per
   * second; it just gets a third as many seconds. If the gap still reads wrong
   * after this, the thing to reconsider is the aggregation rule, not this number.
   */
  streakStep: number;
  /**
   * Multiplier ceiling. At `streakStep` 0.4 it binds on the 11th consecutive
   * scoring event — links and paid flybys both.
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
   * What one hop inside a charged window pays. See `SimConfig.chargedSecs`.
   *
   * FLAT, and the only award in the game that is. Every other one ends in
   * `raw * multiplier`; this one does not, so an anomaly found on a cold run pays
   * exactly what one found at x5 pays. That is deliberate: reaching an anomaly is
   * hard and usually costs the streak on the way out to it, and a reward that
   * shrank precisely when it was hardest to earn would be the wrong shape.
   *
   * It also REPLACES the grab award for the capture it lands on, rather than
   * adding to it — a hop is one clean number. Nothing about flying well is lost:
   * the link at the release is untouched and still scores aim, timing and climb
   * with the full multiplier, so the skill is still paid, just at the other end of
   * the capture.
   *
   * 500 against three hops in a five-second window is ~1500 a frenzy. Sized
   * against the x2 window this replaced, which was reckoned at 2500-3000 — so an
   * anomaly is worth somewhat less than it was, and the difference is made up by
   * where the hops leave you: four planets of altitude is ~280 raw climb banked
   * into the next link, and climb is paid by the mechanism that already exists.
   */
  hopBonus: number;
}

/**
 * The live scoring rules.
 *
 * The shape of the model, which is the part worth arguing about:
 *
 *   grab  = (close + nerve)                      x multiplier   at periapsis
 *   link  = (base + climb + timing + aim)        x multiplier   at the release
 *   flyby = (base + close)                       x multiplier   at closest approach
 *   burn  = (dead-zone depth, integrated)        x multiplier   when the fire dies
 *
 * Four events, because they are settled at different moments and describe
 * different acts. The grab is judged on how the ship arrived and pays when the
 * dive swings through the bottom — not at the press, so a tap that never gets
 * there earns nothing and tapping beside a planet is not a faucet. The link is
 * judged on how it left. The flyby is judged on a pass that was never a capture
 * at all, and pays at the bottom of it for the same reason the grab does.
 *
 * The flyby's real payload is not in the line above: it steps the streak. Before
 * it, the ladder counted links, so the only way to reach a large multiplier was to
 * stop at bodies — and a life measured covering 3.1x the ground per second earned
 * a fifteenth as much per pixel as a chained one, capped at x2 while the chained
 * life ran at x5-x7. Speed was already the harder thing to do and was the thing
 * the score could not see.
 *
 * The burn is judged on a stretch of the ride: how long the ship spent inside the
 * dead zone at the field's edge while hanging off a planet, and how deep it went.
 * It is the only one that accrues rather than being read off an instant, the only
 * one that can pay twice in one capture, and the only one a DEATH can cancel —
 * `endLife` drops the banked flare, so the 78% of edge-drags that end in the wall
 * pay nothing at all. The fire on those is a warning, not an award. Only pulling
 * out alive collects: the drama is free and the rescue is what scores.
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
  flybyBase: 80,
  flybyCloseBonus: 300,
  aimSharpness: 3,
  timingSharpness: 2,

  burnEdgeSpan: 60,
  burnRate: 555,
  burnMinHeat: 0.01,

  streakStep: 0.4,
  streakMax: 5,
  anomalyBonus: 800,
  hopBonus: 500,
} satisfies ScoreConfig);
