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
 * NOTHING HERE MINTS ANY MORE, and that is the whole of F04 stage (b). Eleven
 * keys were deleted because each one made points out of an act rather than out of
 * ground covered — `linkBase`, `closeBonus`, `timingBonus`, `aimBonus`,
 * `nerveBonus`, `flybyBase`, `flybyCloseBonus`, `rescueBonus`, `rescueSpan`,
 * `anomalyBonus`, `hopBonus` — and `burnRate` stopped minting and became the
 * scale that turns edge depth into a band. What is left is one source
 * (`climbPerPx`, metres climbed while engaged) and a chain of multipliers on it.
 *
 * Every axis those keys carried survives; PORT_NOTES 74 has the table of where
 * each one went. The two that are worth repeating here because they look like
 * losses and are not: a rescue is now paid STRUCTURALLY, at about 7x an ordinary
 * swing, because the link after one banks 2.44x the carry and cashes it in the
 * fire band — measured, and the opposite of what was predicted. And the anomaly
 * pays nothing directly because its reward is the charged window it opens, which
 * is spent rather than received.
 *
 * MOST OF THE MAGNITUDES BELOW ARE PROVISIONAL AND SAY SO AT THEIR DECLARATION.
 * F04's ruling is that the axioms rule and the numbers get measured, and every
 * magnitude in the new formula is a threshold — which `AGENTS.md` says is a
 * percentile of real play. That is stage (c), and it cannot start until there are
 * recordings from the CURRENT build: the whole existing corpus is 20-25 August and
 * predates the release kick, the flyby retune and the ending. Calibrating on it
 * would produce numbers that look measured, which VISION names as worse than not
 * measuring at all.
 *
 * The exceptions, which carry their own measured rationale and should not be
 * moved on feel: `closeSpan`, `flybyTurnSpan` (a percentile of how far real
 * passes actually bend the ship), `streakStep` and `streakMax` (both retuned
 * against recorded sessions, and the second already mis-tuned once on too small a
 * sample), and all three `burn*` keys — calibrated on the 159 dead-zone drags in
 * the corpus, with `burnEdgeSpan` pinned by a test to the hazard band's own width
 * rather than chosen at all.
 */
export interface ScoreConfig {
  // --- the carry: the one place points are made ---
  /**
   * Points per world pixel climbed while engaged. THE ONLY SOURCE OF POINTS.
   *
   * Axiom 1: progress is the only base currency. Everything else in this file is
   * a multiplier on what this produced, so a session's score is entirely a
   * question of how much ground it covered and how well it covered it.
   *
   * PROVISIONAL. Direction 08's worked example prices a metre at 1 point against
   * the 0.25 here, and which of those is right is a stage (c) question — it is
   * the scale of every number the player ever sees, and it cannot be settled
   * against a corpus flown under a different release.
   */
  climbPerPx: number;
  /**
   * Each consecutive engagement adds this much to the rate the carry accrues at.
   *
   * CHAIN IS ENGAGEMENT, NOT ACCURACY, and it is a different counter from the
   * streak below with a different way of breaking — see `ScoreState.chain`. It
   * steps on every capture begun, zips and passes included, and it breaks when
   * the ship has climbed a full `grabRange` without engaging anything. So it
   * measures whether you are still using the field, and the streak measures
   * whether the swings you finish are any good.
   *
   * Direction 08 puts it inside the carry accrual rather than in the cash step,
   * which is what stops it being a second copy of the streak: metres climbed
   * under a long chain are worth more AS THEY ARE CLIMBED, and the carry the
   * player can see glowing already has it priced in.
   *
   * UNCAPPED, deliberately, and that is the one place this departs from the
   * board's own +10%/link. VISION's standing open call is that the multiplier
   * ceiling binds about 22 seconds in and the most prominent progression number
   * on screen then never moves again — pinned for 74% of an 85-second session. A
   * second ceiling would reproduce exactly that, on the number that is meant to
   * reward flying the field rather than stopping in it. The streak keeps its
   * ceiling because a ceiling there is what makes a great chain distinguishable
   * from a merely long one.
   *
   * PROVISIONAL: +10% is Direction 08's figure and no session has been flown
   * under it.
   */
  chainStep: number;
  /**
   * What an arrival right on top of a body multiplies the carry by.
   *
   * TIGHTNESS, and it is one term where there used to be three: `closeBonus` paid
   * a tight grab, `flybyCloseBonus` paid a tight pass and `nerveBonus` paid a
   * grab so tight it was already inside the minimum orbit. All three were reading
   * the same quantity — clearance above the minimum orbit — and paying it three
   * different flat sums at three different moments.
   *
   * It scales from 1 at `closeSpan` of clearance to this at zero, so a loose
   * arrival is never a penalty: nothing is taken away, rewards are withheld
   * (VISION pillar 5). A nerve grab lands at the top of it by construction,
   * because a line already headed inside the minimum orbit has no clearance left.
   *
   * PAID AT THE ARRIVAL, on everything carried into it — periapsis for a grab,
   * closest approach for a pass. That is what makes a capture two scoring events
   * still: the arrival prices the carry, the departure sets the tier. It is also
   * why the carry visibly jumps at the bottom of a dive, which is the receipt the
   * deleted grab popup used to be.
   *
   * PROVISIONAL. It replaces 23.6% of corpus `best` (closeBonus 12.8, flybyClose
   * 6.3, nerve 4.5) and 2 is a doubling for a perfect arrival, which is legible
   * rather than measured.
   */
  tightMax: number;
  /**
   * Clearance above the minimum orbit, in px, at which tightness has decayed to
   * nothing. 200 spans real play: the closest grab on record cleared the floor by
   * 25px and the furthest by 268.
   *
   * ONE SPAN FOR ARRIVALS OF BOTH KINDS. A pass measures it at the closest
   * approach and a grab at the press, which is the same choice read at the moment
   * each one is actually made.
   *
   * NOT `cap.tightness`, which reads as the same idea and is useless as one:
   * measured over 112 real releases it sits at 0.99 or above for three quarters
   * of them, because the dive almost always reaches the minimum-orbit floor. Grab
   * clearance is the quantity with actual spread.
   *
   * IT IS ALSO THE PIXEL. Axiom 5 says a multiplier the player did not see drawn
   * before it scored is invisible math, so the minimum-orbit ring draws this span
   * as a gradient above itself — see `drawTightGradient` in `src/render/body.ts`.
   * Change this and that gradient changes with it; they read the same number.
   */
  closeSpan: number;

  // --- the tier: how the swing was released ---
  /**
   * Shaping exponents on the two release qualities, before they are graded.
   *
   * THEY DO NOT SET HOW STRICT THE LADDER IS, AND AN EARLIER VERSION OF THIS NOTE
   * SAID THEY DID — "raising them pushes the rungs toward the tip, so only precise
   * clears a rung". That is algebraically false, because the thresholds below are
   * derived from the SAME exponents. A rung asks
   *
   *   aim^sa * timing^st  >=  zone^(sa + st)
   *
   * and dividing through by `sa + st` turns it into: the WEIGHTED GEOMETRIC MEAN
   * of the two axes, with weights `sa : st`, is at least `zone`. Scaling both is
   * an exact no-op. Swept over the 47 recorded releases from (1,1) to (10,8) the
   * rung mix moves by one swing, which is rounding in the report's two decimals.
   * For a flyby, which passes one quality as both axes, the exponents cancel
   * completely and the sweep does not move a single pass.
   *
   * WHAT IS LIVE IS THE RATIO, and it decides one thing: how far a strong aim can
   * carry a weak boost, and the reverse. Swept 1:5 to 9:1 over the same releases,
   * PERFECT moves 17 -> 12 and the unrewarded tail 12 -> 9. At 3:2 aim carries
   * three fifths of the weight, which is the claim being made about which half of
   * VISION pillar 2's fight matters more.
   *
   * SO THE STRICTNESS IS THE ZONE FRACTIONS ALONE. The thresholds below still
   * have to be re-derived if a sharpness moves — `zone^(sa+st)` changes value —
   * but re-deriving them is book-keeping that puts the ladder back exactly where
   * it was, not a way to tighten it.
   */
  aimSharpness: number;
  timingSharpness: number;
  /**
   * The conjunction quality at which a release earns each rung.
   *
   * Direction 06 rev 2 names three: TRUE at the inner 60% of the window, SHARP at
   * the inner 30%, PERFECT within +/-8% of the centre. F04's ruling is that the
   * tier grades the CONJUNCTION of the release marker and the boost envelope
   * rather than the angle alone — VISION pillar 2 is that those two fight, and an
   * angle-only tier would grade a perfectly-aimed release at a dead envelope as
   * PERFECT.
   *
   * So the quality is `aim^aimSharpness * timing^timingSharpness` and a rung
   * means BOTH axes are inside that zone:
   *
   *   TRUE     0.40^3 * 0.40^2 = 0.0102
   *   SHARP    0.70^3 * 0.70^2 = 0.1681
   *   PERFECT  0.92^3 * 0.92^2 = 0.6591
   *
   * A pass grades the same way on one axis instead of two, by passing its swept
   * turn as both — `turnFrac^(aimSharpness + timingSharpness)`, which lands a
   * pass that sweeps 40% of `flybyTurnSpan` on exactly the TRUE line. One ladder,
   * both manoeuvres, no second set of thresholds to drift.
   *
   * PROVISIONAL IN A SPECIFIC WAY: the zone FRACTIONS are Direction 06's design
   * intent, which a measurement cannot refute. Whether the resulting rungs land
   * where percentiles of real play say they should is stage (c).
   */
  tierTrueAt: number;
  tierSharpAt: number;
  tierPerfectAt: number;
  /**
   * What each rung multiplies the carry by. Direction 06 rev 2's ladder.
   *
   * A release inside the window but under TRUE pays x1 and says nothing: "the
   * make speaks in numbers; no word spent". A miss pays nothing at all, because
   * there is no release and therefore no cash.
   *
   * THE GRADE PRICES THE WHOLE CARRY, not the moment. A PERFECT does not award a
   * flat bonus, it doubles everything carried through that orbit — which is what
   * makes a high carry into a hard window the game's core bet, and the compass
   * arc's width the posted odds.
   *
   * PROVISIONAL: 1.25 / 1.5 / 2 are the board's ratios and stage (c) owns them.
   */
  tierTrue: number;
  tierSharp: number;
  tierPerfect: number;
  /**
   * Degrees of course change at which a flyby reaches the top of the tier ladder.
   *
   * This is the term that decides what a flyby is FOR. Where the ship was is
   * already priced by tightness; only this describes what the pass DID to it, and
   * without it a pass would be paid for arriving next to a planet rather than for
   * using one. Reported from play as: fly past at speed, tap beside each planet,
   * collect 1000+ a time.
   *
   * 81 degrees, and the number it replaced is a worked example of the trap this
   * key's last paragraph warns about. Sixty was p73 of the 249 paid flybys in
   * `diagnostics/`, whose swept turn runs p10 9.6, p25 17.8, p50 34.3 — but those
   * passes are RECONSTRUCTIONS off replays that predate the award. Measured
   * instead over the 42 passes RECORDED by a phone under it, the distribution is
   * p10 22, p25 35, p50 62, p90 123, max 156: sixty degrees had ended up BELOW
   * the median real pass, so 21 of the 42 clamped `turnFrac` to 1 and took the
   * top rung automatically. A 64-degree pass and a 156-degree pass graded
   * identically, and half of every pass in the game was a PERFECT.
   *
   * 105 IS WHERE THE TWO MANOEUVRES GRADE ALIKE, which is the only reading of "one
   * ladder" that survives the two distributions being different shapes. Sweeping
   * the span and comparing the rung mix against the recorded releases, pooled over
   * the seven sessions flown on this envelope — 153 releases and 85 passes:
   *
   *   releases                   25% none  36% TRUE  29% SHARP  10% PERFECT
   *   passes at span  81         27%       27%       11%        35%
   *   passes at span 105         40%       24%       19%        18%
   *   passes at span 130         51%       28%       15%         6%
   *
   * The error surface is flat from 105 to 110 and shallow either side of it, so
   * this is a range whose minimum is 105 rather than a number chosen for looking
   * like one.
   *
   * IT HAS NOW BEEN RE-MEASURED TWICE AND MOVED BOTH TIMES, 60 -> 81 -> 105, and
   * the sample doubled at each step: 249 reconstructed passes, then 42 recorded
   * ones, then 85. Expect it to move again, and note what the defect looks like
   * each time — the span sits under the top of real play, so passes clamp
   * `turnFrac` to 1 and take the top rung automatically. At 81 that was 26 of 85,
   * which is an 82-degree pass and a 142-degree pass grading identically; at 105
   * it is 10.
   *
   * A HIGH "no tier at all" SHARE IS NOT THE DEFECT and should not be tuned away.
   * 40% of passes scoring nothing is this key working: a pass that barely bends
   * the ship was never meant to be paid for arriving next to a planet.
   *
   * A SPAN AND NOT A FLOOR, which is the half a gate cannot do. The passes that
   * pay wrongly are not the near-zero ones but the mid band riding a ladder built
   * out of them; no floor low enough to spare real play reaches those. The floor
   * that does exist, `FLYBY_TURN_MIN`, decides only whether the pass is a scoring
   * event at all.
   *
   * CALIBRATE AGAINST SESSIONS FLOWN UNDER THE AWARD, not against the corpus
   * average: most reports predate the flyby award and their passes are
   * reconstructions. The one session played with it on screen sweeps far harder
   * — p50 58.9 degrees against 34.3.
   */
  flybyTurnSpan: number;

  // --- the band: how deep the swing rode the edge ---
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
   * How much more a metre is worth when it is climbed at the lethal line.
   *
   * The carry's rate becomes `climbPerPx x chain x (1 + fireBoost x heat)`, so at
   * full heat a metre is worth `1 + fireBoost` of an ordinary one and at the band's
   * inner edge it is worth exactly an ordinary one. Nothing is minted: a swing
   * that climbs nothing in the fire is paid nothing for the fire, which is the
   * whole point of moving it here.
   *
   * IT REPLACED A THREE-RUNG LADDER — `bandTwoAt`, `bandThreeAt`, `bandStep` — AND
   * THE LADDER FAILED IN THREE DIRECTIONS AT ONCE. Reported from play, all in one
   * session: a two-tenths-of-a-second graze that doubled 813px of climb earned
   * nowhere near the wall, and paid 6,860 against a p90 swing of 1,496; the
   * deepest burn of the same run, at 0.94 heat, paying ZERO because that swing
   * climbed nothing; and a pass visibly inside the red scoring nothing at all,
   * because at 0.20 heat the integral needed 0.77s to cross a threshold with no
   * pixel. One decoupling, pointing three ways: the payout was chosen by a
   * threshold on an integral and then applied to a carry earned somewhere else.
   *
   * A RATE FIXES THE PIXEL, WHICH WAS DOCUMENTED AS BROKEN. PORT_NOTES 74 records
   * that the hazard gradient's three drawn steps are NOT the thresholds — they
   * mark where the heat that fills them changes rate — so a player could cross a
   * visible step and earn nothing. Under a rate the continuous gradient is
   * literally the payout: deeper red, more per metre, drawn before it scores.
   *
   * AND IT BELONGS HERE BY F04'S OWN RULING. An axis describing how the swing was
   * FLOWN prices the carry; an axis describing the RELEASE grades the cash. That
   * is why grab quality was re-homed into the carry rather than added to
   * `priceSwing`. The fire is a during-the-swing axis that sat at the cash only
   * because it was banked as an integral.
   *
   * PROVISIONAL, AND THE MEASUREMENT IT WANTS IS ONE NOBODY CAN TAKE YET. What
   * decides this number is how many metres a real wall-ride actually climbs while
   * hot, and no recording can say: every replay on this build diverges within a
   * few hundred ticks, and `fireSecs` is a duration rather than a distance. 1.5 is
   * placed so that a metre at the lethal line is worth two and a half ordinary
   * ones — the same top-end ratio the deleted ladder had, applied to the right
   * metres. `ScoreAward.band` now reports what it was worth per swing, so the next
   * session measures it directly.
   */
  fireBoost: number;

  // --- the streak: how many swings in a row landed ---
  /**
   * Each scoring passage after the first adds this much to the cash multiplier.
   *
   * This — not `streakMax` — is the lever that decides what a run of good swings
   * is worth. The ceiling only ever bites at the very top; the step is what every
   * passage past the first is paid.
   *
   * IT IS NOT THE CHAIN. `chainStep` prices metres as they are climbed and breaks
   * on a long coast; this prices the swing at the moment it cashes and breaks on
   * a putter-out or a death. Two counters because they answer different questions
   * — are you still using the field, and are the swings you finish landing.
   *
   * 0.25 -> 0.4, measured over one recorded 10-link session: a 23% larger session
   * score and a 60% larger marginal reward for one more link. WHAT IT WAS RETUNED
   * FOR: the ladder's climb is a tax that a short life pays in full and a long one
   * amortises. Over one 133s speed-run session — six lives, 8001 ticks, 97 awards
   * — only two lives lived long enough to reach the ceiling, and both took ~25s to
   * get there; the other four burned 48s of flying, 36% of the session, and never
   * got past x2.25. At 0.25 the ceiling binds on the 17th scoring event, at 0.4 on
   * the 11th, which is inside a fast life instead of at the end of one.
   *
   * It is NOT the lever that rebalances speed against chaining, and should not be
   * reached for as though it were. Rescored across that session and four
   * chain-heavy ones, this step pays the speed run 1.18x and the chain runs
   * 1.07-1.13x — near-uniform inflation.
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

  // --- the one flat award left ---
  /**
   * What one dot in the run-in carpet pays. See `SimConfig.carpetMoteCount`.
   *
   * THE ONLY THING IN THE GAME THAT STILL MINTS, and it survives the constitution
   * for the reason Direction 12 gives: it is found money on a victory lap, after
   * the last planet is behind you. Every dot is the same dot, so there is no
   * quality here for a multiplier to be a multiplier OF, and there is nothing left
   * above the carpet to spend one on.
   *
   * A DOT DOES NOT STEP THE STREAK OR THE CHAIN EITHER. Ten free rungs at the end
   * of every cleared run would make both ladders a fact about the carpet rather
   * than about the flying.
   *
   * 150, against a swing at a good chain and a maxed streak worth several
   * thousand: the full set is about half of one good release. The carpet is a
   * victory lap and the points are a receipt for having flown it well, not a
   * second course.
   */
  moteBonus: number;
}

/**
 * The live scoring rules.
 *
 * The shape of the model, which is the part worth arguing about:
 *
 *   carry  =  SUM over ticks of  climb * climbPerPx * (1 + chainStep * chain)
 *               gap-gated: metres stop counting once the ship has climbed a full
 *               `grabRange` without engaging anything
 *             * tightness   applied at each arrival, to everything carried in
 *
 *   cash   =  carry * tier * band * streak                     at the release
 *
 * ONE SOURCE AND FOUR MULTIPLIERS. That is Direction 08's constitution, and the
 * five axioms it rests on are values rather than findings: progress is the only
 * base currency; skill only multiplies; coasting is unpaid but never punished;
 * points exist as carried or banked; and every multiplier has a pixel that was
 * drawn before it scored.
 *
 * THE UNIT OF SCORING IS THE SWING, because the unit of play is the swing. A
 * release is not a bonus moment, it is payday, and the compass spent the whole
 * orbit setting the wage.
 *
 * A CAPTURE IS STILL TWO SCORING EVENTS, which is the rule `AGENTS.md` states and
 * which survives the rewrite: the arrival prices the carry and the departure sets
 * the tier. The REASON it used to give has expired and should not be quoted any
 * more. It said that paying a grab at the press would make tapping beside a
 * planet a points faucet, because you are already close to the surface — and that
 * is entirely an argument about an additive economy. Under a pure multiplier a
 * tap in place has climbed zero metres, so `0 * anything = 0` and the faucet is
 * structurally impossible. What the rule survives on now is the receipt: two acts
 * graded at two moments, each with its own pixel.
 *
 * `climb` is banked rather than paid continuously, which is VISION pillar 5:
 * altitude is withheld until you engage again, and withholding a reward is a
 * different thing in the hand from confiscating one. The gap gate is where that
 * stops being free — see `ScoreState.coastClimb`, and note that 63.7% of all
 * climb in the corpus is coasted, so where the gate falls decides most of the
 * economy.
 *
 * `tier` is the pair that FIGHT. The boost peaks a fixed 0.45s after the orbit
 * freezes and the ship is wherever its sweep has carried it by then; the marker
 * is at a fixed angle. Getting both means shaping the dive so the peak lands on
 * the marker, and that is a real skill with a real ceiling — built entirely out of
 * physics that already exists, which is what VISION means by looking for the
 * mechanic the simulation is already performing and has no word for.
 *
 * `band` is the fire, and it is the only multiplier that accrues over a stretch of
 * the ride rather than being read off an instant. A death drops it with everything
 * else, so the 78% of edge-drags that end in the wall cash nothing: the drama is
 * free and only the save is paid.
 *
 * `streak` is the ladder, and the flyby is on it. Before that the ladder counted
 * links, so the only way to climb it was to stop at bodies — a life measured
 * covering 3.1x the ground per second earned a fifteenth as much per pixel as a
 * chained one, capped at x2 while the chained life ran at x5-x7. Speed was already
 * the harder thing to do and was the thing the score could not see.
 */
export const DEFAULT_SCORE_CONFIG: Readonly<ScoreConfig> = Object.freeze({
  climbPerPx: 0.25,
  chainStep: 0.1,
  tightMax: 2,
  closeSpan: 200,

  aimSharpness: 3,
  timingSharpness: 2,
  tierTrueAt: 0.0102,
  tierSharpAt: 0.1681,
  tierPerfectAt: 0.6591,
  tierTrue: 1.25,
  tierSharp: 1.5,
  tierPerfect: 2,
  flybyTurnSpan: 105,

  burnEdgeSpan: 60,
  fireBoost: 1.5,

  streakStep: 0.4,
  streakMax: 5,

  moteBonus: 150,
} satisfies ScoreConfig);
