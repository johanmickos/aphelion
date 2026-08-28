/**
 * Simulation configuration — the single source of truth for physics tuning.
 *
 * Ported verbatim from the prototype's CONFIG (index.html), minus keys that were
 * declared but never read. See docs/PORT_NOTES.md.
 *
 * A run freezes a Config at start and never mutates it (see the run lifecycle),
 * which is what makes `(config, seed, inputLog) -> trajectory` reproducible.
 */
export interface SimConfig {
  // --- core physics ---
  /** Gravitational parameter. Acceleration is GM / (r^2 + soft^2). */
  GM: number;
  /** Softening length; avoids the singularity at r -> 0 and keeps the sim stable. */
  soft: number;
  /** Physics substeps per frame. */
  SUB: number;
  /** Minimum orbit clearance above a planet's surface: minR = planet.R + minOrbitGap. */
  minOrbitGap: number;
  /** Baseline drift speed the ship spawns with. */
  cruise: number;

  // --- phase-clock settle ---
  /** Sweep rate vs. real orbital speed. The headline feel knob. */
  phaseRate: number;
  /** Final roundness of the settled orbit: 1 = circle, lower = residual oval. */
  tightenFrac: number;
  /** Seconds to ease orbit shape and phase rate into the settled orbit. */
  settleDur: number;
  /**
   * FRAME-DENOMINATED. Clearance is eased over this many *frames*, not seconds,
   * so its real duration depends on dt (83ms at 1/60). This is the sole legal
   * frame-denominated constant, inherited from the prototype and quarantined
   * here deliberately. Do not add others. See docs/PORT_NOTES.md note 8.
   */
  clearEaseFrames: number;

  // --- flyby / hold-to-capture ---
  /** Speed shed per second while holding a flyby. */
  flybyBrake: number;
  flybyFuelPerSec: number;
  /** Fraction of brake spent killing radial-out motion vs. tangential. */
  flybyRadialBias: number;
  /** Brake multiplier when already sailing outward; lower = wider return arc. */
  flybyOutwardEase: number;
  /** Brake reaches full strength at this speed. */
  flybyBrakeRefSpeed: number;
  /** Below this speed the brake is off entirely; slow grabs coast on gravity. */
  flybyBrakeMinSpeed: number;
  /**
   * The flyby brake's fuel cost scales with the brake actually applied, instead
   * of being a flat rate for as long as the button is held.
   *
   * WHY. `speedTaper` scales the brake to zero between `flybyBrakeRefSpeed` and
   * `flybyBrakeMinSpeed`, and the burn ignored it. Below 120px/s the impulse is
   * identically nothing and the ship was still paying 40 fuel/second for it.
   *
   * The repo's own `fast unbound grab -> flyby, braked` scenario had this sitting
   * in it the whole time: of a full tank, 47 fuel buys the full-strength brake
   * (400 -> 204px/s), 23 buys the tapering one, and the last **26 buys zero
   * impulse** — a quarter of the tank for nothing, over which speed falls 116 ->
   * 91 on gravity alone.
   *
   * This is a price correction, not a discount. At full strength the rate is
   * unchanged, which is where a real rescue is bought; only the part that was
   * being sold twice goes away. Holding a dead brake is still not free — a
   * capture suppresses `fuelRegen`, so it costs the regen it forgoes.
   */
  flybyFuelTracksBrake: boolean;
  /**
   * A flyby brake also lowers the whip-energy mark the freeze reads back.
   *
   * WHY. `whipE` is the peak specific orbital energy seen during the dive, kept
   * as a running MAX so the minimum-orbit floor cannot crater it — a head-on dive
   * that clips the floor loses radial speed to the clamp, and reading the
   * instantaneous speed at the freeze would flatten its oval into a circle. That
   * is right for the floor, which is a clamp the player did not ask for.
   *
   * The brake is the opposite kind of event: the player spent fuel to shed that
   * energy on purpose, and the max never came back down, so the freeze handed all
   * of it back. Measured on the repo's own `fast unbound grab -> flyby, braked`
   * scenario, the ship arrives at periapsis doing 375px/s and the phase clock's
   * first tick puts it at 543 — a 45% step, in one tick, after a brake that cost
   * 28 fuel. Reported from a phone as an anomaly capture "snapping" as it settled;
   * there the step was 179 -> 335px/s.
   *
   * So the mark follows the brake down by exactly the energy the impulse removed,
   * and nothing else changes: the floor still cannot lower it, and an unbraked
   * dive never reaches this code.
   */
  flybyBrakeShedsWhip: boolean;
  /**
   * Fraction of a flyby's brake spend handed back the moment it converts into a
   * capture. 0 disables it.
   *
   * WHY IT EXISTS. A brake sets up the capture that follows it, but its cost was
   * charged entirely against that capture's budget while the release refund was
   * sized for a capture that needed no brake. So a converted flyby — the harder
   * play — cost 40 more and paid exactly the same. Measured on the session that
   * prompted it: a 1.33s brake spent 53 fuel and converted, the capture it
   * converted into began on 13.9, ran dry mid-circularization, puttered out, and
   * took the streak from x2.00 to x1.00 — then cost 2.7s of drifting to refuel.
   *
   * WHY IT PAYS AT THE CONVERSION. The refund has to arrive before the settle
   * spends the fuel it is meant to cover. Folded into the release it would land
   * after the putter-out it exists to prevent, which is the entire failure.
   *
   * WHY 0.5. It is the value at which a rescue that WORKS costs about what a
   * capture costs. Over that session's four expensive conversions the net brake
   * bill lands at 18 / 13 / 20 / 26 fuel against a median capture burn of 18-20,
   * and the worst following capture bottoms out at 20 fuel instead of 2. Every
   * putter-out is gone by 0.25 already; the extra is headroom, on the same
   * reasoning as `linkFuelReward` — condition the constraint, do not remove it.
   *
   * WHY ONLY ON CONVERSION. A brake that fails still pays in full, which is where
   * the tension the refund must not blunt actually lives: over 18 braking episodes
   * the 13 that converted spent 160 fuel and the 5 that sailed past spent 167. The
   * refund touches the first group and leaves the second exactly as expensive.
   *
   * `brakeSpent` accumulates what was actually DEDUCTED rather than what was
   * quoted, so a brake held against an empty tank cannot earn a refund for fuel
   * that was never spent.
   */
  flybyConvertRefund: number;

  // --- boost ---
  boostThreshold: number;
  boostMax: number;
  /** Seconds to ramp the boost 0 -> full. Holding is what arms it. */
  boostArmTime: number;
  /** Seconds for the boost to fade to zero after its peak. */
  boostDecayTime: number;
  /**
   * The boost holds at its peak until the settle finishes, instead of beginning
   * to decay the instant it arms.
   *
   * WHY. `boostT` and `settleT` start together at the periapsis freeze, so with
   * `boostArmTime` 0.45 and `settleDur` 1.2 the boost peaked 38% of the way into
   * the settle and was 46% dead by the time the orbit was round — the window
   * closed inside the manoeuvre it was meant to reward. Completing a
   * circularization therefore guaranteed missing it.
   *
   * Measured over the three sessions that carry award records, the median hold
   * was 1.42s, 1.47s and 1.83s against an envelope that reached zero at 1.85s.
   * In the last of those, 6 of 11 links paid no boost and no fuel, including the
   * best capture of the session (grab closeness 0.74, aim 0.95, held 1.83s), and
   * the tank bottomed out at 3. The two links that DID pay well came off the two
   * loosest grabs of the session, released early — the axis was paying for haste
   * rather than for flying the capture.
   *
   * The ramp is untouched, so a reflexive tap-through still earns nothing and the
   * footgun stays disarmed. Only the start of the decay moves, and it tracks
   * `settleDur` rather than a second constant — `settleDur` is a tune knob, and a
   * hardcoded plateau would silently re-break the moment it was dragged.
   *
   * AND IT OVER-CORRECTED, WHICH IS WHY `boostPeakAt` EXISTS. Holding the peak
   * from `boostArmTime` all the way to `settleDur` left a 0.75s plain — 29% of
   * the envelope — over which a release could not be graded at all, and the tier
   * reads that quantity as one of its two axes: across the 652 links recorded on
   * sessions flown with this on, `timing` reads full on 18.1% against `aim`'s
   * 2.0%. So this key still owns where the decay starts, `boostPeakAt` owns where
   * the ramp ends, and between them the flat top is a window rather than a plain.
   * Neither end is a constant and both move with the settle.
   */
  boostHoldsThroughSettle: boolean;
  /**
   * How far into the settle the boost reaches its peak, as a fraction of
   * `settleDur`. Only read when `boostHoldsThroughSettle` is on.
   *
   * WHY IT IS NOT `boostArmTime`. That key answers a different question — how
   * long a press has to be held before it has armed anything at all — and it is
   * the floor here rather than the answer: `max(boostArmTime, boostPeakAt *
   * settleDur)`, so the footgun stays disarmed however this is set and a settle
   * dragged shorter than the ramp cannot invert the two.
   *
   * WHY IT IS A FRACTION. The same reason the decay's start tracks `settleDur`
   * instead of a second constant: both ends of the plateau have to move with the
   * manoeuvre they bracket, and both are tune knobs. A plateau written down in
   * seconds would silently re-tune itself the first time `settleDur` was dragged,
   * which is the trap `boostHoldsThroughSettle`'s own note names.
   *
   * WHAT IS WRONG AT 1.0. The plateau then spans the whole settle and the timing
   * axis stops discriminating over 29% of the envelope — which matters because
   * the tier grades the CONJUNCTION of that axis and aim, and a conjunction whose
   * halves are not equally hard is really a grade on the harder half. Measured
   * over the 652 links recorded by a phone across the 31 sessions flown with the
   * plateau — the awards, so this survives a divergence — `timing` reads 1.00 on
   * 118 of them (18.1%) against `aim`'s 13 (2.0%). Nine times apart.
   *
   * 0.75 IS A FIT AND NOT A PERCENTILE, WHICH IS THE HONEST DESCRIPTION. Where
   * inside the plateau those 118 releases sat cannot be recovered from any
   * recording: `timing` saturates across the whole flat top and `boostT` was not
   * in the tuple. That is fixed going forward — `ScoreAward.boostT` is recorded
   * now, and it exists because of this key — but it does not help the numbers
   * that are already on disk.
   *
   * What the recordings DO say is the shape of the distribution on the other
   * side, where `timing` inverts. Release density peaks at boostT 1.35-1.80s, so
   * the plateau sits on its RISING flank: 54 releases land in the 0.15s just past
   * the plateau's edge, and a density extrapolated linearly back through the
   * plateau from there predicts ~135 saturations against the 118 observed. Under
   * that fit, moving the peak to 0.75 of the settle — boostT 0.90 — leaves 64% of
   * them still saturating, so 18.1% falls to about 12%.
   *
   * IT CANNOT BE PUSHED UNTIL THE TWO AXES MATCH, and the reason is worth knowing
   * before someone tries. A release at settle completion scores the peak BY
   * CONSTRUCTION however narrow the plateau — that is the whole of what
   * `boostHoldsThroughSettle` protects — so there is a floor under `timing`'s
   * saturation that aim does not have. Narrowing past it stops removing free
   * marks and starts removing earned ones.
   *
   * PROVISIONAL, AND SAYS SO. A fit through one measured density is weaker than a
   * percentile of the thing itself, and the thing itself is measurable from the
   * next session. Re-measure it there rather than defending this.
   */
  boostPeakAt: number;
  /** Fraction of the boost that permanently carries into drift velocity. */
  boostPermFrac: number;
  /** Transient burst multiplier, for a punchy escape. */
  boostPunch: number;
  /** Seconds for the transient escape burst to fade during drift. */
  boostBurstDecay: number;
  /**
   * The punch every release lands, at full quality. Pure transient.
   *
   * WHY EVERY RELEASE, AND WHY IT ALL FADES. Measured across 366 releases in the
   * 28 diagnostics reports that replay faithfully, 54% earned no kick at all — and
   * only 31 of those flew badly. The rest were manoeuvres that were flown and paid
   * nothing: 128 still flybys, 165 that never reached periapsis. Letting go felt
   * like nothing happening.
   *
   * SO THIS IS FEEL AND `boostMax` IS ECONOMY, and the split is the whole design.
   * The punch goes ENTIRELY into `ship.burstX/Y` and none of it into the permanent
   * velocity, so it can be large enough to read at a glance without changing what
   * a run is worth. A player tapping beside planets gets the punch and keeps none
   * of it; a player flying well gets the punch AND the boost underneath it.
   *
   * That is also what makes it safe to pay on an earned release too, on top of the
   * boost it already earned. The boost economy is untouched — `boostMax`,
   * `boostPermFrac` and `boostPunch` all mean exactly what they meant — and a weak
   * conversion now lands instead of dribbling.
   *
   * A TAP PAYS NOTHING, structurally rather than by a guard. Quality for a
   * non-converting release is deflection, `lastAngle` is seeded from the real
   * velocity at the grab and `defl` starts at 0, so a press-and-release with no
   * arc between them has no quality to be paid for.
   */
  releaseKick: number;
  /**
   * Deflection, in degrees per tick, at which a non-converting release is at full
   * quality.
   *
   * 2.1, the p90 of deflection at a real flyby release across the corpus, against
   * a distribution of p25 0.32, p50 0.61, p75 1.11, p90 2.10, p99 3.32. A
   * percentile rather than a round number for the reason `praise.ts` gives at
   * length: a plausible value gets this wrong in both directions.
   *
   * A converted release does not use this — its quality is how close to the top of
   * the boost envelope it let go, which it already knows.
   */
  flybyDeflSpan: number;
  /**
   * Shapes quality into punch. 1 is linear; below 1 lifts the weak end.
   *
   * 0.5 — a square root — and the reason is that linear made the bottom of the
   * range invisible. At the median recorded flyby the linear punch was 29% of full
   * and read as nothing at all on a ship doing several hundred px/s. The square
   * root lifts that to 54% while leaving the top exactly where it was, which is
   * the shape the ask actually described: noticeable even when weak, without
   * making a great release worth less by comparison.
   *
   * It cannot lift a tap, because it cannot lift zero.
   */
  kickShape: number;
  /**
   * How much longer a full-quality kick lasts, as a fraction of `boostBurstDecay`.
   *
   * 0.5, so a release at the top of its envelope holds its punch half again as
   * long. Quality therefore enters twice — once as size, once as duration — which
   * is a real risk and the reason the second channel is the gentler one.
   */
  kickHold: number;
  releaseFlingBoost: number;

  // --- escaping the dead zone ---
  /**
   * Extra fling handed to a release that got out of the danger band alive, in
   * world units per second. 0 turns the whole thing off, which is what
   * `PROTOTYPE_CONFIG` holds.
   *
   * AT THE RELEASE, AND NOT AT THE ESCAPE, which is a correction. It was a shove
   * applied the instant the ship stopped closing on the wall, on the theory that
   * exploding out of the fire should happen in the fire. Reported as "the kick
   * during arc doesn't feel good", and the measurement agreed for a reason that
   * was not obvious: speed added mid-capture is speed the capture has to shed to
   * convert and settle, so across the 22 escapes in the corpus it cost 56-64% of
   * the link points those captures used to earn. The reward was quietly taxing
   * the manoeuvre it was rewarding.
   *
   * Split by `boostPermFrac` and `boostPunch` exactly as the release splits every
   * other boost, so this is a punchy transient plus a smaller permanent carry
   * without inventing either. That is also the only place a FADING component can
   * live: `ship.burstX/burstY` is read by `stepDrift` and nowhere else.
   *
   * NOT gated on `earned`, unlike the boost it rides alongside. 81% of escapes
   * are released while still a flyby, and a flyby earns no boost at all — gating
   * this the same way would pay nothing to four escapes in five.
   *
   * THE SIMULATION DEFINES THE TRIGGER FOR ITSELF, and has to. What is being
   * rewarded is a scoring idea — the rescue, the burn — and `src/score/` is an
   * observer the simulation may not know exists. So the rule is stated in pure
   * simulation terms; see `escapeShove`. The scorer recognises the same instant
   * for its own purposes, and the two agree because they read the same arithmetic.
   */
  escapeFling: number;
  /**
   * Fraction of this capture's unrefunded fuel handed back at the escape.
   *
   * An escape costs a median 34 fuel between the press and the turn-away, p90 59,
   * and leaves a quarter of them under 25 in the tank — a mechanic that punishes
   * the player for surviving it. Half is the value note 29 measured for the brake
   * refund, on the reasoning that a rescue which WORKS should cost about what a
   * capture costs; the median escape nets 17 against a median capture burn of
   * 18-20, so the same number lands in the same place here.
   *
   * UNREFUNDED, and that word is load-bearing. `flybyConvertRefund` already
   * returns half the brake to a flyby that converts, and paying a fraction of the
   * gross on top would be note 29 happening again — the note is titled "A rescue
   * paid for itself twice". `Capture.fuelSpent` and `fuelBack` are tracked apart
   * so this can pay for what is genuinely still out of pocket. It matters less
   * than it sounds only because 67% of escapes never reach the first refund at
   * all: 46% are released while still a flyby, and 21% never braked.
   */
  escapeRefund: number;
  /**
   * How far inside a boundary counts as the danger band, in world units.
   *
   * MUST MATCH `ScoreConfig.burnEdgeSpan` and `RenderConfig.hazardZoneWidth`, and
   * `test/score.test.ts` pins all three. Three copies is one more than anybody
   * wants, and the alternative was worse: the simulation cannot import the scorer,
   * so a band it must recognise has to be stated here, and the renderer has always
   * needed its own to paint the gradient. Pinned, they cannot drift; unpinned, a
   * player would be paid for escaping a fire that started somewhere else.
   */
  escapeBandWidth: number;

  // --- fuel ---
  fuelMax: number;
  fuelRegen: number;
  fuelPerSec: number;
  /**
   * Fuel returned by a release that earned its boost, scaled linearly by
   * `cap.boost / cap.boostFull` at the moment of release. 0 disables the refund.
   *
   * WHY IT EXISTS. `fuelRegen` only runs while not captured, so the tank pays for
   * time spent NOT playing: a fast chain starves and a pause refuels. Measured
   * over two recorded sessions an earned capture costs a median 23-26 fuel, and a
   * 32-grab chain ran the tank to 4.3 with 17% of the life under a quarter tank —
   * so the resource was punishing exactly the thing the streak multiplier
   * rewards. This is the other half of that economy: a chain that is flown well
   * pays for itself.
   *
   * WHY IT IS SCALED AND NOT FLAT. A flat refund is a subsidy, not a reward. Swept
   * against both sessions, a flat 3 per link — 13% of a capture — already erases
   * every low-fuel moment in the 70-second chain, because a long chain collects it
   * many times. Scaling by the boost envelope keeps the condition the point: only
   * a release near the peak comes close to paying for its own capture.
   *
   * WHY 20 AND NOT 25. It shipped at 25 and came down after the first session
   * played with it, which is also the first session that could be read properly:
   * a 16-link chain never dropped below 39 fuel and spent none of its life under
   * a quarter tank, against 4 and 18% before the refund existed. That is the
   * constraint removed rather than conditioned. The same session doubled the
   * median release from 0.15 to 0.30 of the envelope, so the refund is compounding
   * on releases that are themselves getting better — which is the intended
   * feedback, and the reason to leave headroom rather than pay the full cost of a
   * capture back.
   *
   * WHY THE BOOST ENVELOPE. It is the axis the player is already being asked to
   * play and the one that does not currently pay: as points the peak is worth
   * about 6% of a link while being the largest weight in the scoring file, because
   * waiting 0.45s for it costs a link and the streak pays more for the link. Fuel
   * is the lever that can win that argument, because it is spent, watched, and
   * missed. Points could not, and adding more of them would not have.
   *
   * WHY IT STILL PAID ALMOST NOTHING. That reasoning was right about the axis and
   * wrong about the obstacle: the cost was not waiting 0.45s FOR the peak, it was
   * that the peak had already decayed away by the time the settle finished. See
   * `boostHoldsThroughSettle`, which moved the decay's start and took this session's
   * zero-paying links from 6 of 11 to 0 while the two sessions that were never
   * starved moved by under 8 fuel at their minimum. That is the shape of a defect
   * being fixed rather than a subsidy being added, and it is why the reward stayed
   * at 20 instead of going up.
   *
   * `earned` is `releaseCapture`'s own test — a real orbit, past periapsis, not a
   * flyby, not a putter-out — and is the SAME quantity the scorer reads as
   * `PendingLink.earned`. Deliberately not a second definition of "a good
   * release": the sim cannot see the score, and two notions of success would drift
   * apart the first time either moved.
   */
  linkFuelReward: number;

  // --- field ---
  /** Playfield is this much wider than the design viewport. */
  fieldWidthFrac: number;
  /** How many bodies the field holds. */
  bodyCount: number;
  /**
   * How many anomalies the field holds, on top of `bodyCount`. 0 disables them
   * entirely, which is what keeps the equality gate at zero — there is no
   * separate flag because a field with no anomalies in it is the off state.
   *
   * 3 over the ~43 rows a full field holds. A life reaches 29-48% of the climb,
   * so that is about one encounter a life and occasionally two: rare enough to
   * stay an event, common enough that the window, the bonus and the bubble can
   * actually be tuned against real play rather than against one sighting.
   */
  anomalyCount: number;
  /**
   * How far below the highest point reached a run may fall before it ends.
   * 0 disables it entirely.
   */
  backtrackLimit: number;
  /**
   * Rising past the topmost body ends the run as `cleared` — you beat the field.
   *
   * OFF IN THE PROTOTYPE CONFIG, which is the whole reason it is a flag. The
   * prototype has no notion of finishing: its field is eight bodies and its only
   * vertical ending is `out-of-bounds` 800px above the last of them. Turning this
   * on there would end runs the prototype keeps flying and move the equality gate
   * off zero, so it stays false and the proof stays intact.
   *
   * WHY THE LINE IS THE CREST AND NOT THE CEILING. `fieldBounds().top` sits 800px
   * further up and is already a death. Firing the clear there would mean the
   * player crosses a line that has been drawn in hazard red for the whole run and
   * is congratulated for it — and, worse, that a session which flew the entire
   * field could still be killed by the 800px of empty space above it, having
   * already done everything the course asked. The 2026-08-23 capture died exactly
   * there, in 2.7 seconds of nothing, having cleared all sixty bodies.
   */
  clearAtTop: boolean;
  /**
   * How far above the last planet the finish line sits, and therefore how deep the
   * carpet is. 0 disables the funnel.
   *
   * ONE KEY OWNS THE WHOLE GEOMETRY, and it did not used to. The line was
   * `crest - grabRange` and the band was `line + finishFunnelDepth`, which agreed
   * only because both numbers were 560 — so the first attempt to make the carpet
   * deeper pushed its BOTTOM down past the crest, into the approach to the last
   * planet, where a press is a slingshot and must not become a carve. See
   * `finishLineY`, which now derives the line from this and keeps `grabRange` as a
   * floor under it.
   *
   * 560 -> 840, on a playtest of the deployed build: "extend the carpet a touch".
   * At 560 the run-in lasts 1.5s at an ordinary crossing and 0.87s at a fast one,
   * which is room for two carves and no more — and it was shortest exactly when
   * the run had gone best. 840 makes those 2.3s and 1.3s. The ceiling moves up with
   * it; `CEILING_GAP` in `world.ts` records why it has to.
   *
   * Inside this band a drifting ship is steered toward the middle of the field
   * and accelerated upward, so it arrives at the line centred and fast. That is
   * not decoration: the ceremony on the other side is a warp, and a warp that
   * begins with the ship drifting sideways at the edge of the corridor has to
   * cheat — teleport it, or swing the camera off it — at the exact moment the
   * player is watching hardest. Flying into the transition is the only version
   * that does not lie.
   *
   * The band starts at the crest and ends at the line, so it begins exactly where
   * the last planet is and never fights an approach to it. It also never fights
   * an ORBIT: `driftAccel` is called from `stepDrift` only, so a captured ship
   * feels nothing.
   *
   * `src/render/` sizes the chevron runway off the same BAND — not off this key
   * directly, since `grabRange` can floor it — so the picture cannot promise a
   * pull the physics does not apply.
   */
  finishFunnelDepth: number;
  /**
   * Centring stiffness, in 1/s². Paired with critical damping, so the ship eases
   * to the middle instead of oscillating across it.
   *
   * A spring rather than a constant sideways push, because the correction has to
   * scale with how wrong the line is: a ship already centred should feel nothing
   * at all, and one at the wall should feel a lot.
   *
   * IT IS NOT WHAT CENTRES THE SHIP, and it was briefly asked to be. Set high
   * enough to deliver a ship to the middle of the field it takes the line away
   * from the player: "it's satisfying to cross the finish line roughly in the
   * line they were going". Crossing on your own heading is the reward for having
   * flown there. The centring belongs AFTER the line, where nothing is being
   * flown any more — `CENTRE` in `src/render/ceremony.ts` does it, and the ship
   * is frozen by then.
   *
   * So what is left for this to do is narrow and worth stating: stop a ship
   * drifting into a side wall in the last stretch, where a death would be
   * maximally galling. A spring is the right shape for exactly that job — the
   * force scales with displacement, so it is nearly nothing in the middle of the
   * corridor and firm near the edges, which is the difference between a guide and
   * a rail.
   *
   * 32 -> 13, measured against that narrower job. Drifting sideways into the last
   * stretch at 430px/s from 250px off-centre: at 0 every such drift dies at the
   * wall, so the guide is genuinely load-bearing and not decoration. 13 is the
   * lowest stiffness that saves all of them, and it still delivers the ship to
   * the line 105-148px off-centre — visibly the player's own line rather than the
   * middle of the field. At 32 the same drifts arrive 30-42px out, which is a
   * rail.
   *
   * A ship 300px out and still accelerating outward at 380px/s dies at every
   * stiffness up to 20, and that is correct: it is aimed at the wall rather than
   * drifting toward it, and a guide that rescued it would be flying the ship.
   *
   * Overshoot is zero across the whole range, because the damping is derived
   * rather than guessed.
   */
  finishFunnelPull: number;
  /**
   * Upward acceleration at the line, in px/s², ramping from zero at the crest.
   *
   * Sized to be felt rather than to dominate. What it is buying is a takeoff into
   * the ceremony, not a speed record — the slingshot off the last planet is still
   * what most of the arriving speed comes from.
   *
   * 650 -> 380, on a report that the crossing was "a touch too fast to appreciate
   * the finish line". The measurement that decided the size of the cut is that
   * the runway lasts 0.78-0.87s almost regardless of this value — a ship inside
   * it is accelerating, so a bigger boost mostly buys a faster exit rather than a
   * shorter stay. Cutting it therefore costs about 0.04s of runway and takes a
   * 300px/s arrival across the line at 542 instead of 667: still nearly a
   * doubling, and no longer a blur.
   *
   * The rest of that report was answered in the ceremony rather than here. What
   * made the line hard to look at was that it vanished on the tick it was
   * crossed; it now recedes down the screen through a coast phase before the warp
   * starts. See `COAST` in `src/render/ceremony.ts`.
   *
   * 380 -> 800 when this stopped being the WHOLE profile and became only its last
   * quarter. Paired with the fifth-power curve it is worth far less than the
   * number suggests: measured from a 300px/s arrival, the ship is still doing 301
   * a quarter of the way along the runway and 315 at the halfway point, and
   * crosses at 609. Under the old smooth ramp the same arrival was already being
   * pushed from the first pixel.
   *
   * The sweep that chose it: 550 crosses at 548, 800 at 609, 1100 at 671, 1500 at
   * 747. 800 is about a doubling — unmistakably a kick, and still slow enough
   * that the chequers are a thing you see rather than a thing you passed.
   */
  finishFunnelBoost: number;
  /**
   * Gentle acceleration held through the whole runway, in px/s².
   *
   * THE RUNWAY IS NOT A LAUNCH RAMP. It used to be: `finishFunnelBoost` ramped
   * smoothly from the crest to the line, so the ship was being pushed harder with
   * every pixel and arrived at the chequers already at its top speed. Reported as
   * wanting to reach the line "at roughly the speed they come in (maybe a slight
   * boost to show they're grabbed), and then only speed up in the last bit across
   * the line".
   *
   * That is two different accelerations, so it is two numbers. This one is the
   * slight boost — enough to feel picked up and carried, not enough to change how
   * fast the line arrives. The kick is `finishFunnelBoost`, and it is now shaped
   * to stay out of the way until the very end.
   *
   * 90 -> 45 WHEN THE CARPET GOT DEEPER, and this is the term that had to move
   * rather than the kick. It is a rate applied for the whole crossing, so its
   * total is the one thing in the funnel that grows with how long the crossing
   * takes: at `finishFunnelDepth` 840 and 90, a 300px/s arrival crossed at 726
   * against the 607 the boost sweep had chosen by ear. Halved, it crosses at ~700 —
   * a 15% gain after a 55% longer runway, which is the runway doing something
   * without becoming the launch ramp the note above says it must not be.
   *
   * The kick is deliberately untouched. It is normalised over the band by
   * construction, it is the part that was swept against "a thing you see rather
   * than a thing you passed", and it fires at the exact moment the player is
   * watching hardest.
   */
  finishFunnelHold: number;
  /**
   * How much speed a side wall returns inside the run-in, 0..1. 0 disables the
   * bumpers and the walls stay lethal there.
   *
   * NOTHING MAY DIE IN THE CARPET. The chevrons say "you are nearly there" and
   * the funnel is actively carrying the ship, so a run that ends against a side
   * wall in that stretch is the game taking something away at the exact moment it
   * had promised to hand it over. At worst a bumper makes the finish a silly,
   * bouncy one; at best it changes nothing because the ship was never near a wall.
   *
   * IT IS ALSO WHAT LETS THE GUIDE STAY LIGHT. `finishFunnelPull` was measured
   * against "does it stop drifts dying at the wall", which is a job that wants
   * stiffness — and stiffness is exactly what takes the crossing away from the
   * player. With the walls no longer lethal here, that pressure is gone: the pull
   * can go on being a nudge, and the one case it was never able to save — a ship
   * 300px out and still accelerating outward — now bounces instead of dying.
   *
   * 0.72 rather than a perfect 1: some speed has to be lost or a ship arriving
   * across the corridor rattles between the walls all the way to the line. Enough
   * left to read as a real bounce.
   */
  finishBumper: number;
  /**
   * Sideways acceleration a held press applies in the carpet, px/s². 0 turns the
   * carve off; `carpetLift` and `carpetMoteCount` switch off independently.
   *
   * THE CARPET IS THE ONE PLACE THE BUTTON DOES NOT MEAN GRAB. Everywhere else in
   * the game a press reaches for a planet; here, with nothing left in range worth
   * reaching for, it bends the line instead. That is not a second control scheme:
   * it is the same button doing the only thing left to do in a stretch where the
   * flying is already over and the ship is being carried.
   *
   * WHY A LATERAL PUSH AND NOT A TURN. A force perpendicular to the velocity is
   * the obvious model and draws prettier arcs — and it can also turn the ship all
   * the way round, which is precisely what the carpet must not permit. A constant
   * sideways acceleration on a ship that is always rising draws a parabola, and
   * cannot reverse the climb no matter how long it is held. The no-going-backwards
   * rule is therefore a property of the shape of the force rather than a clamp
   * bolted on after it, and `carpetLift` only has to catch a ship that arrived
   * already falling.
   *
   * WHILE IT IS HELD THE CENTRING SPRING IS OFF. `finishFunnelPull` exists to stop
   * a drift dying at a wall, and at 13 it is stiff enough to fight a carve to a
   * standstill near the edges. Hold and the funnel lets go of the wheel; let go
   * and it takes it back and pulls the ship home. That exchange is what makes the
   * shapes close on themselves rather than run away, and it costs nothing in
   * safety because `finishBumper` already means nothing can die in here.
   *
   * 1100 -> 2200, reported off the deployed build as simply not noticeable, and the
   * measurement says why: what the player feels is the movement DURING the press,
   * not the excursion the lateral speed goes on to produce after it. At 1100 a
   * 0.33s press moved the ship 50px sideways while it was held — 7% of a 741px
   * corridor, four ship-widths, indistinguishable from a lean. At 2200 the same
   * press moves 121px while held and peaks at 259 before the funnel's spring nulls
   * it, which is a third of the corridor and unmistakably a swerve.
   *
   * It STAYS at 2200 now that `carpetCarveMax` owns the far end of the curve. This
   * number is the response — how quickly the ship answers a press — and the report
   * that called 2200 too strong was about where the ship had got to by the end of
   * a half-second hold, which is the cap's job. Cutting this to fix that would
   * have walked straight back into "not noticeable".
   */
  carpetCarve: number;
  /**
   * Fastest the carve will push the ship sideways, px/s. 0 lets it run away.
   *
   * THE ACCELERATION IS UNBOUNDED IN TIME AND THE HOLD IS NOT A TAP. That is the
   * whole of what went wrong at `carpetCarve` 2200 with no ceiling: the strength
   * was sized against a 0.33s press, and the session that reported it held for 30,
   * 35 and 34 ticks — 0.5 to 0.58s. Under a constant push, distance goes as the
   * square of the hold, so those produced 1100-1250px/s of sideways speed against
   * a corridor 741px wide. Recorded off the phone: `vx` peaked at 1360, the ship
   * reached a wall three times in 2.3 seconds, and each bumper handed back 750px/s
   * for the next carve to build on. Pinball.
   *
   * Lowering the acceleration does not fix it, and that is why this key exists
   * rather than a smaller number. The two complaints — "not noticeable" at 1100
   * and "way too strong" at 2200 — are about different halves of the same curve:
   * how fast the ship responds when you press, and how far it has gone by the time
   * you let go. One number cannot set both. The acceleration owns the first and
   * this owns the second.
   *
   * 500, CHOSEN AGAINST THE VERSION NOBODY CALLED PINBALL. `carpetCarve` 1100 was
   * reported as not noticeable, but its EXCURSIONS were never small — a 0.33s tap
   * peaked 212px off centre and a 0.57s hold 341px. What it lacked was rate. Its
   * speeds are therefore the honest ceiling to aim under: tap 367px/s, hold
   * 623px/s. At 2200 capped here, a tap peaks at 391 and a hold at 462, so every
   * lateral speed in the carpet is now at or below what the "too weak" build
   * already produced — while the acceleration, which is the half that was actually
   * being complained about, is untouched at double it.
   *
   * On excursion it is still MORE than that build on every axis: tap 239px against
   * 212, hold 290 against 341 at a third of the speed.
   *
   * And a WALL IS STILL REACHABLE, which matters — a sustained hold arrives at a
   * bumper in about 1.4s, so it is a thing you choose on an ordinary crossing and
   * something you cannot quite buy on a fast one. The bumper calms down with it: a
   * bounce returns 360px/s instead of the 750 that was feeding the next carve.
   */
  carpetCarveMax: number;
  /**
   * How hard the carpet insists on lifting a ship that is not climbing, 1/s.
   *
   * A ONE-SIDED SPRING ON VERTICAL SPEED, not a clamp. It pulls `vy` up to
   * `carpetRise` and then does nothing at all, so a fast climb never feels it and
   * a ship that arrives falling is caught rather than stopped dead. A hard clamp
   * was the first version and it reads as a teleport: a ship dropping into the
   * band at 300px/s loses that speed between one tick and the next.
   *
   * 9 arrests a 300px/s fall in about 0.15s, over roughly 22px of descent — which
   * is to say the carpet pushes you up and there is no going backwards, without
   * any instant where the picture jumps.
   */
  carpetLift: number;
  /** The upward speed the carpet holds a ship to, px/s. See `carpetLift`. */
  carpetRise: number;
  /**
   * Dots scattered up the carpet. 0 for none.
   *
   * Placed alternating either side of the centre line, evenly spread up the band,
   * so the row of them zig-zags and collecting the set means weaving — which is
   * the carve teaching itself. A random scatter was tried first and reads as
   * confetti: with no pattern to follow there is nothing to aim at, and the player
   * flies straight through the middle collecting whatever happens to be there.
   */
  carpetMoteCount: number;
  /** How near the ship has to pass to take a dot, px. */
  carpetMoteRange: number;
  /**
   * A grab below escape speed is a capture, never a flyby.
   *
   * The prototype also called it a flyby when the ship was momentarily moving
   * radially outward, regardless of speed — so passing a planet on the way up
   * qualified even at a quarter of escape speed. Measured over the real field,
   * that was 41% of all grabs, and every one of them then took the conversion
   * path below.
   */
  boundGrabsCapture: boolean;
  /**
   * How fast a bound grab already moving OUTWARD has to be, as a fraction of
   * escape speed, before it counts as a flyby after all.
   *
   * `boundGrabsCapture` traded one failure for its mirror. The prototype called
   * any outbound grab a flyby regardless of speed; that rule replaced it with
   * "bound is always a capture", which says nothing about whether the capture is
   * REACHABLE. A capture converts at periapsis, and if the ship is already
   * climbing away at 94% of escape speed, periapsis is on the far side of an
   * orbit some ten seconds wide — while the field wall is under three seconds
   * away. The grab takes, `clear` spends no fuel because only the settle and the
   * brake ever do, and the run coasts silently out of bounds.
   *
   * Measured over 55 recordings, 60 minutes, 694 grabs that began in `clear`:
   *
   * ```
   *   OUTBOUND grabs        n   reached periapsis   run ended still holding
   *     below 0.65         31        12 (39%)              3 (10%)
   *     0.65 and above     78         4 ( 5%)             16 (21%)
   *   INBOUND, 0.80+      136       124 (91%)              1 ( 1%)
   * ```
   *
   * So the line is 0.65 — the resolution the data supports, not a rounder number
   * that looks more deliberate. Above it an outbound grab is a capture that
   * essentially never completes; below it, it completes about as often as an
   * ordinary slow one. Being a flyby is the right answer for the rest, because
   * the brake is exactly the mechanism that fixes them: it sheds radial speed
   * (`flybyRadialBias`), it already knows this case (`flybyOutwardEase`: "brake
   * gently so the ship coasts wide and arcs back"), and conversion needs bound
   * AND inbound, so a braked outbound grab converts when it has actually turned
   * around rather than the instant it is classified.
   *
   * It also restores the thing the player expects and the report asked about:
   * holding costs fuel, and the readout says `BRAKING`.
   *
   * 0 reproduces the prototype's rule (every outbound grab is a flyby) and 1
   * disables the carve-out entirely (`boundGrabsCapture` as it was).
   *
   * **The prototype holds 1, not 0**, and that is note 21 rather than taste. The
   * key is inert under `boundGrabsCapture: false` so the prototype itself cannot
   * tell the difference — but `configFromReport` resolves a missing key from
   * PROTOTYPE_CONFIG, and a report recorded before this key existed ran with
   * bound grabs as captures. 1 is what those sessions actually did; 0 would
   * replay every one of their outbound grabs as a flyby and still call itself
   * faithful.
   */
  outboundFlybyFrac: number;
  /**
   * A flyby that converts into a capture gets its clearance impulse.
   *
   * Clearance was only ever computed in `beginCapture`, so anything that became a
   * capture by conversion never got it and dived straight through the surface —
   * to a periapsis of 6 inside a 46px planet in the case that prompted this. The
   * floor then caught it, destroying 44% of its speed in one substep, which is
   * what the 56-degree kink and "stuck to the surface" both were.
   */
  /**
   * A flyby gets its clearance impulse at the PRESS, not only if it converts.
   *
   * WHY. This is the floor pin, reported twice from a phone as "my ship got stuck
   * on the surface" and "I got stuck when trying a kinky capture". The chain, all
   * confirmed:
   *
   * 1. A near-radial flyby dives into the minimum-orbit floor.
   * 2. The clamp cancels inward radial velocity every substep; with no tangential
   *    component left, the total reaches exactly zero.
   * 3. Below 1px/s the flyby brake is off, so no fuel burns and nothing pushes.
   * 4. Conversion needs `vrad < 0`. At rest it is not, so the capture never
   *    converts — and `applyClearance`, the thing that exists to stop a dive
   *    reaching the floor, is gated behind exactly that conversion.
   * 5. Gravity pulls in, the clamp cancels it. Stable equilibrium.
   * 6. On release the velocity is still zero, so the ship drifts at zero forever.
   *    It never falls behind the floor, leaves the field, or crashes. Only a
   *    reset escapes.
   *
   * Measured over 1224 close, fast, near-radial presses: **23.6% pinned**, rising
   * with speed — 6.5% at 300px/s, 34% at 500. Not a knife edge, and worst exactly
   * where the game is being played hardest. With this on, none of the 1224 pin.
   *
   * The fix is to stop gating the cure behind the thing the disease prevents. A
   * flyby aimed inside the surface becomes a grazing pass, which is what the same
   * impulse already does for every bound dive — consistency rather than a new
   * behaviour. Collateral over 1599 flyby presses with realistic aim: conversions
   * 1325 -> 1318, and 19 of the 104 that used to sit in flyby forever now resolve.
   *
   * Two alternatives were measured and rejected. A minimum tangential speed at the
   * floor clamp catches every route, but the clamp is the contact the capture feel
   * rests on and note 38 put more bound dives onto it. Ending the run at a
   * standstill is simplest and leaves the stall in place, trading "I got stuck"
   * for "I died for no visible reason".
   */
  /**
   * Seconds a zip takes to glide the ship onto its orbit, or 0 to disable zipping.
   *
   * A zip replaces a capture's dive with the authored glide an anomaly already
   * uses (note 43): the press is the arrival, and a boundary-matched curve carries
   * the ship onto its orbit in this long however far away it pressed. What it
   * glides TO is not authored by anything — it is the orbit the dive would have
   * reached, so aim still decides where the ship ends up. Measured across 248
   * captures that lands at 0.29-0.96 of the press distance, median 0.45.
   *
   * WHY IT EXISTS. The zip out to an anomaly reads as the best moment in the game,
   * and the ride home is the flattest: median 3.42s from press to parked, of which
   * 2.22 is a dive the player has already earned the right to skip.
   *
   * Its own key rather than the anomaly's authored `settleDur`, because a zip is not
   * an anomaly — and because a zip is a per-run tuning, where the rest stop's glide
   * is part of what an anomaly IS. See `src/sim/bodies.ts`.
   * The two happen to be equal today and have no reason to stay so.
   *
   * Inert in the prototype config, which has no anomalies and therefore nothing
   * that ever opens a charged window.
   */
  zipDur: number;
  /**
   * Seconds the charged window runs, starting at the RELEASE from an anomaly.
   * 0 disables it, and with it every zip in the game.
   *
   * While it runs, every grab zips — see `zipOrbit`. That is the anomaly's whole
   * reward now. It replaced two things that asked nothing of the player once
   * earned: a single `zip` charge with no expiry, and a ten-second x2 scoring
   * window. What is here instead is a countdown you have to spend, and a hop
   * chain is worth what you can execute rather than what you were handed.
   *
   * Seven seconds is about four hops: a hop cycle is the 0.45s glide, plus
   * `boostArmTime` before a release earns its boost, plus the crossing to the next
   * body. Started at five, which measured at three hops in a real session and read
   * as a repeat rather than a rhythm. Still short on purpose — it ends while the
   * player still wants more, and it keeps the anomaly a moment in a run rather
   * than the run's whole subject.
   *
   * SIMULATION, NOT SCORE. This gates a physical ability, so it cannot live in
   * `ScoreConfig` — `src/sim/` may not import from `src/score/`, and a simulation
   * that asked the scorer whether zipping is allowed would stop being a pure
   * function of (config, seed, inputLog). What a hop is WORTH is a weight and does
   * live there, as `hopBonus`.
   */
  chargedSecs: number;
  /**
   * Orbit radius a charged hop settles onto, in world units. 0 falls back to the
   * orbit the dive would have reached.
   *
   * ABSOLUTE, not a multiple of the body's minimum orbit, so that height and
   * period are literally identical on every hop — 247px/s and 2.29s a lap at 90.
   * That is the point: a frenzy is a rhythm, and a rhythm needs every beat to be
   * the same. It is the same idiom the anomaly's authored `orbitR` already uses, which is part of
   * why a rest stop reads as a place rather than as a result.
   *
   * WHY IT EXISTS. A zip used to land on `max(minR, predictedCaptureOrbit())` —
   * the orbit the dive would have flown to — so that aim still decided the
   * outcome (note 47). Measured across 108,000 approach geometries, that is not a
   * gradient but a lottery: 43% pin exactly at `minR`, the median sits 1.36x above
   * it and the top quartile 3.1x to 8.1x, which is 0 to 330px of spread with no
   * way for a player to tell in advance which they will get.
   *
   * Low, but deliberately not the minimum. `minR` runs 46-68 across the field, so
   * this clears the tightest orbit in the game by 22px at worst; and it sits well
   * inside the anomaly's own 130, so a hop still feels tighter than a rest stop.
   *
   * Clamped above `minR` at the point of use, so a body large enough can never
   * put this orbit underground.
   */
  chargedOrbitR: number;
  /**
   * Put the first anomaly level with the opening body, for testing. DEV ONLY.
   *
   * `placeAnomalies` deliberately skips the bottom eighth of the field, because
   * an anomaly beside the opening bodies asks for the commit before the player
   * has a corridor rhythm to break away from. That is right for play and wrong
   * for iterating on the charged window, which otherwise costs a minute of
   * climbing before it can be looked at once.
   *
   * A CONFIG KEY AND NOT AN `import.meta.env.DEV` CHECK. Nothing under `src/sim/`
   * may read bundler syntax — `pnpm portable` enforces it — and more importantly a
   * run is `(config, seed, inputLog)`: as a config key this is recorded in the
   * diagnostics report, so a replay reproduces the field the dev session actually
   * flew. A build-time branch inside world generation would make dev reports
   * silently unreproducible. `app/main.ts` sets it, which is where knowing about
   * the bundler is legal.
   *
   * False in both configs. It is turned on by the shell, never by a default.
   */
  anomalyAtSpawn: boolean;
  clearanceOnFlyby: boolean;
  clearanceOnConvert: boolean;
  /**
   * The clearance nudge turns the velocity toward tangential instead of simply
   * adding tangential speed, and never adds enough to unbind the ship.
   *
   * WHY. Adding tangential delta-v is the honest way to raise a periapsis and also
   * a free energy injection, bounded only by `circSpeed(target) * 1.2` — about
   * 283px/s, comparable to a whole orbit's speed. Sampled over bound dives it puts
   * a ship at HALF its escape speed above escape: at r=120 and 151px/s it adds 277
   * and leaves it doing 334 against an escape speed of 303. The capture then never
   * reaches periapsis, coasts, and leaves the field. Reported as "I kind of shot
   * off the planet at super speed", with the nearest body 349px behind the wreck.
   *
   * Turning at constant speed raises angular momentum, and therefore periapsis,
   * for nothing — and cannot unbind by construction. It clears the target on its
   * own in 94 of 144 sampled dives; beyond that it tops up under a cap, and what
   * is still short the floor clamp catches. Riding the floor is expensive (note 18
   * measured it destroying 44% of a ship's speed in one substep) but survivable,
   * where being ejected from a capture is neither.
   */
  clearanceEnergyNeutral: boolean;
  /**
   * Furthest a grab can reach. 0 is unlimited.
   *
   * Gravity in this simulation only exists during a capture, so without a limit
   * the ship can seize a body it cannot see — which reads as the game reaching
   * out for you rather than you reaching for it.
   */
  grabRange: number;
  /**
   * Generate the field instead of using the prototype's hand-authored eight.
   *
   * The authored layout is the *prototype's* world and cannot be retuned without
   * breaking the equality gate, so PROTOTYPE_CONFIG keeps it and the game builds
   * its own. The opening body is still the authored one either way, so the first
   * approach keeps its tuned geometry.
   */
  proceduralLayout: boolean;
  /**
   * Seed for the generated part of the field.
   *
   * Part of the config rather than a module constant because it is part of the
   * recipe: a run is `(config, seed, inputLog)` and the field is the world that
   * recipe is played in, so a report that does not carry the seed cannot be
   * replayed once the seed can change. It rides the full config a report already
   * stores, and `configFromReport` fills it from PROTOTYPE_CONFIG for reports
   * recorded before it existed — which is the one field they were all played on.
   *
   * Unread when `proceduralLayout` is false: the prototype's eight are authored.
   */
  worldSeed: number;
  /** Vertical gap between generated rows, in world units, before jitter. */
  bodySpacing: number;
  /**
   * Hold the climb's high-water mark still while a capture is running.
   *
   * The mark is what the trailing floor hangs from, and an orbit is a round
   * trip: letting it advance sets the floor at the orbit's apex, and the far
   * side of the same orbit then descends into it. Any settled orbit wider than
   * half `backtrackLimit` is fatal by construction with this off.
   */
  holdClimbInCapture: boolean;
  /** Furthest a lone body in a row sits from the centre column. */
  bodyWeave: number;
  /**
   * How far out the two lanes of a forked row sit.
   *
   * Kept separate from `bodyWeave` because they answer different questions. The
   * weave is how much a single body wanders; the spread is how far apart two
   * bodies have to be before a row reads as a choice rather than as one wide
   * obstacle. Tying them together would mean widening the weave to widen a fork,
   * which walks every single body toward a wall.
   */
  bodySpread: number;
  /** Chance a generated row holds two bodies instead of one. 0 disables forks. */
  rowPairChance: number;
  /**
   * Seconds of velocity a press looks ahead when choosing which body to take.
   * 0 takes the body that is nearest right now.
   *
   * Raw nearest-distance hands a fast ship the planet it has just left, because
   * "behind me and receding" and "ahead of me and closing" are the same number.
   * Looking ahead scales with speed for free: a drifting ship barely moves in
   * `grabLeadTime`, so deliberately re-grabbing the body behind you still works.
   */
  grabLeadTime: number;

  // --- crash ---
  /** How close (px beyond the surface) the crash cone reaches. Gates grab refusal. */
  crashConeRange: number;
  /**
   * Lower bound on crash-cone severity while the heading ray hits a surface.
   *
   * The prototype's 0.4 sits ABOVE the 0.35 refusal threshold, which makes the
   * distance term inert and the gate binary: any forward intersection within
   * `crashConeRange` refuses, at any distance and any speed. 0 lets the distance
   * term decide, which is what it was written to do.
   */
  crashConeSeverityFloor: number;
  /**
   * Seconds to hold on a crash before respawning.
   *
   * 0.7 in the prototype, 0.45 in the game. The hold is there so the player sees
   * WHAT happened — the boxed notice, the point of impact — and 0.7s was long
   * enough to also feel like being made to wait for it. Failure staying cheap is
   * the thing `src/app/lifecycle.ts` argues hardest for, and a hold is the one
   * place that cost is paid on every single death.
   *
   * IT IS A DEFAULT-ONLY OVERRIDE, and this key is a good example of why that
   * discipline exists. `crashPause` had no entry in `DEFAULT_CONFIG` at all —
   * the game simply inherited the prototype's value — so editing "the" value
   * edited the prototype's, and `port-equality` failed immediately with a phase
   * mismatch at tick 121. The gate caught it in one run. An override is the only
   * safe way to move a shared value.
   *
   * It bounds nothing else: a worthy death's sheet freezes this rather than
   * racing it, so shortening the hold does not shorten the time a report is on
   * screen.
   */
  crashPause: number;
  /** Only near-parallel grazes survive; anything steeper kills. */
  crashGrazeDot: number;
}

/**
 * The prototype's parameter set, exactly as index.html declares it.
 *
 * FROZEN FOREVER. The equality gate runs against this, so the proof that
 * src/sim reproduces the prototype survives any amount of game tuning. Never
 * edit these to change how the game feels — edit DEFAULT_CONFIG below.
 */
export const PROTOTYPE_CONFIG: Readonly<SimConfig> = Object.freeze({
  GM: 5_500_000,
  soft: 18,
  SUB: 6,
  minOrbitGap: 16,
  cruise: 97,

  phaseRate: 1.0,
  tightenFrac: 1.0,
  settleDur: 1.2,
  clearEaseFrames: 5,

  flybyBrake: 320,
  flybyFuelPerSec: 54,
  flybyRadialBias: 0.85,
  flybyOutwardEase: 0.35,
  flybyBrakeRefSpeed: 200,
  flybyBrakeMinSpeed: 120,
  flybyFuelTracksBrake: false,
  flybyBrakeShedsWhip: false,
  flybyConvertRefund: 0,

  boostThreshold: 0.5,
  boostMax: 95,
  boostArmTime: 0.45,
  boostDecayTime: 1.4,
  boostHoldsThroughSettle: false,
  // Inert: nothing reads it while the hold is off, which is what keeps this key
  // out of the equality gate. It carries the game's value rather than a second
  // number nobody would maintain.
  boostPeakAt: 0.75,
  boostPermFrac: 0.22,
  boostPunch: 1.8,
  boostBurstDecay: 1.3,
  releaseKick: 0,
  flybyDeflSpan: 2.1,
  kickShape: 0.5,
  kickHold: 0,
  releaseFlingBoost: 1.0,

  // Off. The prototype has no dead-zone burn to escape from, and a fling here
  // would move the equality gate off zero for a mechanic it never had.
  escapeFling: 0,
  escapeRefund: 0,
  escapeBandWidth: 60,

  fuelMax: 100,
  fuelRegen: 15,
  fuelPerSec: 18,
  linkFuelReward: 0,

  fieldWidthFrac: 1.2,
  bodyCount: 8,
  anomalyCount: 0,
  backtrackLimit: 0,
  clearAtTop: false,
  finishFunnelDepth: 0,
  finishFunnelPull: 0,
  finishFunnelBoost: 0,
  finishFunnelHold: 0,
  finishBumper: 0,
  carpetCarve: 0,
  carpetCarveMax: 0,
  carpetLift: 0,
  carpetRise: 0,
  carpetMoteCount: 0,
  carpetMoteRange: 0,
  boundGrabsCapture: false,
  // Inert here — but it is also what an older report replays under. See the key.
  outboundFlybyFrac: 1,
  zipDur: 0,
  chargedSecs: 0,
  chargedOrbitR: 0,
  anomalyAtSpawn: false,
  clearanceOnFlyby: false,
  clearanceOnConvert: false,
  clearanceEnergyNeutral: false,
  grabRange: 0,
  proceduralLayout: false,
  worldSeed: 0x5eed_1e55,
  bodySpacing: 0,
  holdClimbInCapture: false,
  bodyWeave: 44,
  bodySpread: 44,
  rowPairChance: 0,
  grabLeadTime: 0,

  crashConeRange: 70,
  crashConeSeverityFloor: 0.4,
  crashPause: 0.7,
  crashGrazeDot: 0.18,
} satisfies SimConfig);

/**
 * The live game tuning. Starts from the prototype and diverges deliberately.
 *
 * The bar any change to these has to clear:
 *
 *   - Gravity catches and reels — physical, never snapped.
 *   - Fast whip, eccentric oval first, optional circle if held.
 *   - Tightness follows the depth of the dive: commit harder, hold tighter.
 *   - Never settle wider than the grab radius. Never clip the surface.
 *   - Slow approaches fall inward gently, not in a sharp spin.
 *   - Release flings along the tangent. Boost is punchy, then fades.
 *   - The slingshot is free; circularising costs.
 *   - Too fast means bend the path — hold to capture, and pay fuel for it.
 *   - You can always recover before the crash cone. Inside it, too late.
 *
 * Per-sample deflection above 15 degrees is a visible kink, and is the single most
 * important smoothness metric; `tools/replay.ts` reports kinks on every recorded
 * session.
 *
 * Every difference from PROTOTYPE_CONFIG is a decision, listed here so the drift
 * is never accidental:
 *
 *  - minOrbitGap 16 -> 12   The ring read as too loose at 16, a touch tight at
 *                           10. Swept 16 down to 4: the floor is never breached
 *                           anywhere in that range, deflection moves under 1.5
 *                           degrees and peak speed rises ~2%, so this is purely
 *                           a feel choice. Below 8 the ship sprite would clip.
 *  - crashConeRange 70 -> 50  Grabs were refused earlier than they needed to be,
 *                           costing genuine last-second saves. The cone
 *                           over-warns anyway because it tests a straight ray
 *                           against a curved path (PORT_NOTES 1), so pulling the
 *                           refusal in partly compensates until that is fixed.
 *  - crashConeSeverityFloor 0.4 -> 0   That compensation was not enough, because
 *                           the floor made the range irrelevant. `crashCone`
 *                           clamps its severity up to 0.4 and `inCrashCone`
 *                           refuses above 0.35, so the distance term could never
 *                           reach the threshold and the gate was binary. Measured
 *                           over every recorded session: all ten crash-cone
 *                           refusals sat 28-50px above the surface, all ten were
 *                           followed by a crash within 0.30s, and forcing each
 *                           grab through produces a clean capture that bottoms
 *                           out 0.0-0.1px above the minimum-orbit floor. The cone
 *                           had never once refused a grab that was unrecoverable.
 *                           At 0 the distance term decides and the refusal keeps
 *                           its inner ~32px, which is a real too-late zone.
 *  - grabLeadTime 0 -> 0.2  A press took the nearest body by raw distance, so a
 *                           ship at 300 px/s leaving one planet for the next was
 *                           handed the one behind it — an instant flyby that
 *                           burns the tank and captures nothing. Over 322 recorded
 *                           presses, 28 aimed at a body the ship was receding from
 *                           while another in range was closing; a 0.2s lead flips
 *                           7 of them and every flip has that same signature.
 *                           Nothing flips below 216 px/s, so a slow re-grab of the
 *                           planet behind you is untouched, which is the point:
 *                           the lead is a distance only when you are moving.
 *  - flybyBrake 320 -> 600   Holding a too-fast grab sheds speed nearly twice as
 *  - flybyFuelPerSec 54 -> 40  hard, for less per second. Together they make a
 *                           flyby 2.5x cheaper to convert: the fuel it costs to
 *                           shed a given speed is rate/brake, which falls from
 *                           0.169 to 0.067 per px/s. Deliberately a large move —
 *                           "too fast" was the failure mode that ended runs
 *                           without ever feeling like a decision, and the brake
 *                           is the only thing the player can do about it.
 *
 *                           NOTE: `FLYBY_HARD` in src/render/hud.ts is the
 *                           readout's line between "braking" and "TOO FAST", and
 *                           it was measured under the OLD brake. It is now
 *                           pessimistic — see the comment there.
 *  - fuelRegen 15 -> 30     Twice as fast to recover a drained tank. The tank
 *                           only empties when a flyby brake drains it, so this
 *                           and the two above are one decision: how expensive a
 *                           save is, and how long you wait before you can try
 *                           again.
 *  - fieldWidthFrac 1.20 -> 1.90  The corridor felt constrictive, and a wider
 *                           field gives more room to find a planet to curve away
 *                           from before reaching a boundary.
 *
 *                           1.90 specifically, because a run should not open on a
 *                           red warning stripe. The ship spawns 90px left of the
 *                           field's centre (inherited from the prototype), so the
 *                           camera clamps against the left boundary at t=0. It is
 *                           not enough to push the hard line off screen: the
 *                           hazard gradient reaches 60px INWARD from it, and that
 *                           faint red is what you actually notice. Clearing the
 *                           gradient needs field.left + 60 < -90, i.e. 1.77+;
 *                           1.90 leaves 25px of margin so smaller phones are safe
 *                           too.
 *
 *                           Spawning at the literal field centre would be the
 *                           obvious alternative and is not viable: the centre is
 *                           x=195 and P1 sits at x=189 with R=46, which is a
 *                           collision course drifting straight up.
 */
export const DEFAULT_CONFIG: Readonly<SimConfig> = Object.freeze({
  ...PROTOTYPE_CONFIG,
  minOrbitGap: 12,
  crashConeRange: 50,
  flybyBrake: 600,
  flybyFuelPerSec: 40,
  flybyFuelTracksBrake: true,
  flybyBrakeShedsWhip: true,
  flybyConvertRefund: 0.5,
  fuelRegen: 30,
  linkFuelReward: 20,
  fieldWidthFrac: 1.9,
  bodyCount: 60,
  anomalyCount: 3,
  backtrackLimit: 700,
  clearAtTop: true,
  crashPause: 0.45,
  finishFunnelDepth: 840,
  finishFunnelPull: 13,
  finishFunnelBoost: 800,
  finishFunnelHold: 45,
  finishBumper: 0.72,
  carpetCarve: 2200,
  carpetCarveMax: 500,
  carpetLift: 9,
  carpetRise: 60,
  carpetMoteCount: 7,
  carpetMoteRange: 26,
  holdClimbInCapture: true,
  boundGrabsCapture: true,
  outboundFlybyFrac: 0.65,
  zipDur: 0.45,
  chargedSecs: 7,
  chargedOrbitR: 90,
  anomalyAtSpawn: false,
  clearanceOnFlyby: true,
  clearanceOnConvert: true,
  clearanceEnergyNeutral: true,
  grabRange: 560,
  proceduralLayout: true,
  bodySpacing: 280,
  bodyWeave: 72,
  bodySpread: 160,
  rowPairChance: 0.4,
  boostMax: 60,
  boostHoldsThroughSettle: true,
  boostPeakAt: 0.75,
  // Every release lands a punch now, and all of it fades. See the keys' own notes:
  // 54% of releases earned no kick at all, and only 31 of 366 flew badly.
  releaseKick: 54,
  kickHold: 0.5,
  grabLeadTime: 0.2,
  crashConeSeverityFloor: 0,
  /**
   * Sized against `boostMax` (60), since it is split by the same two knobs and
   * arrives at the same moment: a little over half a full boost, so a rescue
   * leaves noticeably harder than an ordinary release without out-running the
   * whip, which is still where speed properly comes from.
   *
   * 34, then 48, then 64, then this, on three reports that it should be stronger.
   * A feel knob: nothing measures it, and nothing can. Worth knowing at this size
   * — it is now above `boostMax` (60), so a rescue leaves harder than a perfectly
   * timed ordinary release does. That is defensible for the rarest manoeuvre in
   * the game and would not be for anything commoner.
   */
  escapeFling: 86,
  escapeRefund: 0.5,
} satisfies SimConfig);

/**
 * Bump whenever a change to `src/sim/` alters behaviour.
 *
 * A diagnostics report records this, so a replay can tell "you were running older
 * code" apart from "the simulation is non-deterministic". Those look identical in
 * the numbers and could not be more different in what they mean.
 */
export const SIM_VERSION = 30;

/** The canonical simulation timestep. Passed as a parameter, never read globally. */
export const FIXED_DT = 1 / 60;

/** Accumulator ceiling: 3 steps at 1/60 reproduces the prototype's 0.05 dt clamp. */
export const MAX_CATCHUP_STEPS = 3;
