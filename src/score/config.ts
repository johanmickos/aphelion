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

  // --- the streak ---
  /** Each link after the first adds this much to the multiplier. */
  streakStep: number;
  /** Multiplier ceiling. */
  streakMax: number;
}

/**
 * The live scoring rules.
 *
 * The shape of the model, which is the part worth arguing about:
 *
 *   grab = (close + nerve)                       x multiplier   at periapsis
 *   link = (base + climb + timing + aim)         x multiplier   at the release
 *
 * Two events, because they are settled at different moments and describe
 * different acts. The grab is judged on how the ship arrived and pays when the
 * dive swings through the bottom — not at the press, so a tap that never gets
 * there earns nothing and tapping beside a planet is not a faucet. The link is
 * judged on how it left.
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

  streakStep: 0.25,
  streakMax: 5,
} satisfies ScoreConfig);
