/**
 * Render-only tuning. Deliberately separate from SimConfig: nothing here can
 * affect a trajectory, so none of it belongs in the frozen run config.
 *
 * Which bodies the compass signposts, and how far off a release may be, used to
 * live here as `compassRange` and `compassMaxTargets`. They moved to
 * `src/score/aim.ts` when the score started paying for alignment: those two are
 * now game rules, and a render-only value that silently re-tunes the score would
 * be the worst of both. What is left here is the drawing — ring sizes and hues.
 */
export interface RenderConfig {
  // --- camera ---
  /** Width of the design window in world units. The playfield is wider; we pan. */
  designW: number;
  /** Start panning when the ship comes within this fraction of a window edge. */
  cameraMarginFrac: number;
  /** Camera follow rate (exponential lerp coefficient). */
  cameraFollow: number;
  /**
   * How far ahead of the ship the view sits, as a fraction of the window width,
   * at `cameraLookRefSpeed` and above.
   *
   * WHY. The horizontal deadzone parks the ship at whichever margin it last
   * crossed, so travelling right you sit at the RIGHT margin and see mostly where
   * you have been. Coming back off the right wall the camera then holds
   * completely still for 288px — about a second — before the ship reaches the far
   * margin and it finally moves. Reported as the camera lagging behind, and it is
   * not the smoothing: it is a deadzone that has no idea which way you are going.
   *
   * This is NOT the "default the target to centred" fix the deadzone comment
   * warns about. That one oscillates because the target is a function of the
   * camera's own position, so correcting it changes it. This is a function of the
   * ship's velocity, which the camera cannot influence, so there is no loop.
   */
  cameraLookAhead: number;
  /** Speed at which the look-ahead reaches full extent. */
  cameraLookRefSpeed: number;
  /**
   * How much a settled orbit locks the view to the body being orbited, 0..1.
   *
   * **0 is the old camera** — pure ship-following everywhere, which is what to
   * compare against. 1 holds a true orbit perfectly still. Nothing between the
   * two is a different mode; it is the same blend at less strength.
   *
   * Only a SETTLED orbit is affected at any value. The dive, the flyby and the
   * drift are ship-followed regardless, because that is the exciting part and it
   * should be flown rather than watched.
   */
  cameraOrbitLock: number;
  /**
   * How fast the lock eases in and out, in units of 1/second.
   *
   * This IS the blend, since `orbitLock` steps rather than ramps: the settle keeps
   * its full oval and the lock arrives when the orbit becomes round. 3 is a third
   * of a second, slow enough to read as the view settling with the orbit and fast
   * enough not to trail it. The same rate carries the lock back out at the
   * release, which is the other discontinuity.
   */
  cameraOrbitEase: number;
  /**
   * How close to the window's edge the backstop lets the ship get, in design px.
   *
   * Deliberately much smaller than `cameraMarginFrac`. The deadzone's margin says
   * where the ship should SIT; this says only where it may not go, and using the
   * margin for both made the guarantee fight every framing decision above it —
   * most visibly the orbit lock, where the bound orbits with the ship and drags a
   * stationary camera 83px back and forth.
   *
   * Sized to keep the ship's own sprite fully on screen with a little air, so
   * hitting it means the ship was genuinely about to disappear.
   */
  cameraBackstopEdge: number;
  /**
   * Ceiling on how far past a barrier an anomaly's bubble lets the view reach.
   *
   * Sized to the 150px of bubble that sits inside the corridor, so the allowance
   * is fully open by the time the ship reaches the wall and the camera crosses
   * already moving.
   */
  cameraBarrierRelax: number;
  /**
   * How far the view leans toward an anomaly while inside its bubble, 0..1, as a
   * weight on the same subject blend a settled orbit uses.
   *
   * WHY. An anomaly sits `anomalyOffset` past the wall and the view may not reach
   * it until the bubble opens the barrier, so on a fast approach it arrives on
   * screen almost at the same moment as the ship. Measured on the session that
   * reported it: the anomaly's disc first appeared 0.15s AFTER the press and 0.23s
   * before impact, at 303px/s. The lead buys 0.40-0.50s of it instead.
   *
   * Half, not one. At 1 the view sits on the anomaly and the ship is the thing
   * being watched from a distance, which reads as the camera having left; at 0.5
   * the frame holds both and the anomaly is simply in it early. The ceiling worth
   * knowing: an instant camera glued to the anomaly reaches 0.83s, so this is most
   * of what camera work can buy and the rest of the fix is not the camera's.
   */
  cameraAnomalyLead: number;

  // --- starfield ---
  starCount: number;
  /** Slowest layer's parallax factor. */
  starParallaxMin: number;
  /** Fastest layer's parallax factor. */
  starParallaxMax: number;
  /** Horizontal parallax as a fraction of the vertical factor. */
  starParallaxHorizFrac: number;

  // --- trail ---
  trailMax: number;
  /** Minimum world-space spacing between trail samples. */
  trailSpacing: number;
  /** Speed at or below which the trail is fully muted. */
  trailSpeedCalm: number;
  /** Speed at or above which the trail is fully hot. */
  trailSpeedHot: number;
  /**
   * World-space gap kept between the ship and the visible head of its wake.
   *
   * A wake starts behind a ship, not under it. Without this the newest sample —
   * which sits 3-10px back depending on speed — draws a dot up to 4.8px across
   * that pokes through the tail notch of a sprite only 6px deep. 12 puts the
   * nearest edge 7.2px behind the centre, clear of the silhouette.
   */
  trailHeadGap: number;

  // --- hazard zones ---
  /** Width of the danger gradient, measured INWARD from the field edge. */
  hazardZoneWidth: number;

  // --- the deadline: the point of no return ---
  /**
   * Seconds-to-cross at which the deadline starts ghosting in, and at which it
   * reaches full strength.
   *
   * Measured, not chosen. Over 640 committed approaches in `diagnostics/`, the
   * lead between the deadline becoming computable and the cross runs median 1.65s,
   * p75 3.67s. Full strength at the median means the deadline is solid for at least
   * half of every approach that has one; ghosting in at p75 means three
   * approaches in four never see it appear out of nothing.
   *
   * A ramp rather than a switch, for the reason `nearestBody` gives about cones:
   * a threshold is a cliff, and a mark that pops into existence is not a deadline.
   */
  deadlineFadeInSecs: number;
  deadlineFullSecs: number;
  /**
   * Seconds a passed cross takes to fade out, aged only while the run is live.
   *
   * Longer than it looks like it needs to be, deliberately. The cross sits a
   * median 0.53s before the wall and p90 1.05s, so a fade shorter than that would
   * finish before the death it is explaining — and explaining the death is the
   * whole job of the mark that stays behind. Frozen during the ending hold for
   * the same reason the popups freeze while paused: nothing should burn down
   * behind the notice the player is reading.
   */
  deadlineFadeOutSecs: number;
  /**
   * How long a DISPLACED mark gets instead, in seconds.
   *
   * Reported as "we should fade old crosses a bit faster if the user taps more.
   * The deadlines add clutter, and it's only the most recent one that matters." Both
   * halves of that are right, and they pull in opposite directions on one number:
   * the mark left behind at a death is the explanation of the death and wants the
   * long fade, while a mark shoved aside by a fresh answer is stale the instant it
   * is replaced.
   *
   * So the duration belongs to the MARK and not to the class. A mark keeps
   * `deadlineFadeOutSecs` for as long as it is the current one, and is cut to this the
   * moment another takes its place. Tapping through the band replaces marks fast,
   * which is exactly when the clutter appears and exactly when this bites.
   *
   * Applied as a rescale rather than a jump — see `Deadline.observe` — so a ghost
   * carries on from the alpha it already had instead of blinking down to it.
   */
  deadlineGhostSecs: number;
  /**
   * A capture this short leaves no mark behind at all, in seconds.
   *
   * Asked for as "only show it if the user holds it for just a few frames, to
   * avoid spamming". A press hides the deadline and leaves the mark fading where the
   * cross was, so a burst of taps leaves a burst of marks — and a tap is not a
   * decision worth recording.
   *
   * MEASURED, because real captures are not as short as they feel. Over the
   * corpus a capture runs a median 1.32s, with p5 at 0.300s and p1 at 0.100s.
   * There is no gap in the distribution to cut at, but there is a distinct tail:
   * 0.18 catches 2% of all captures and sits comfortably between p1 and p5, so it
   * never reaches ordinary play. In a tapping burst it catches nearly all of them,
   * which is the point — it targets the burst rather than the average.
   *
   * NOT the game's own idea of a tap. `ScoreAward` calls a press that never
   * reached periapsis one, because it earns nothing; measured, that is 48% of all
   * captures at a median of 0.72s, which is most of the game rather than a tap.
   */
  deadlineTapSecs: number;
  /** Half-length of the crossbar, and of the arm stub kept after the cross is passed. */
  deadlineBarHalf: number;
  deadlineStubHalf: number;
  /**
   * How much the mark shrinks and grows with the fire waiting at the cross.
   *
   * SIZE AND NOT BRIGHTNESS, and that is the whole reason this is a separate key
   * rather than a term folded into `deadlineAlpha`. Alpha already carries how close
   * the deadline is — it ramps in with time-to-cross and fades out once the mark
   * is passed — so a prize term there would make a dim cross mean either "small
   * fire" or "still far away", with no way to tell which. Note 51's lesson about
   * spending one channel on two signals, applied to a world object instead of to
   * text.
   *
   * The mark scales between these two multiples of its configured size, so a big
   * fat deadline is a big fire and a thin one is a formality.
   *
   * THEY COMPOUND WITH `deadlineNearWidth`, which is what made the mark read as too
   * thick: a big prize and a press right on the cross used to multiply out to
   * 1.99x, near double. Both were brought in together rather than either alone —
   * the two signals are independent and each still has to be legible on its own,
   * so the fix was the product and not one of the factors.
   */
  deadlinePrizeMin: number;
  deadlinePrizeMax: number;
  /**
   * Predicted burn, in raw bank points, at which the mark reaches full size.
   *
   * Measured over the 548 committed approaches in `diagnostics/`: the fire
   * waiting at the cross runs p25 280, median 402, p75 613, p90 857. 860 is that
   * p90 — the mark saturates only on the top tenth, so the middle of real play
   * spends its time in the middle of the scale rather than pinned at the top.
   *
   * Only 3% of crosses have no fire at all, which was the surprise: the flight
   * AFTER the press carries the ship deeper than the cross itself, so nearly every
   * rescue burns. The scale is about how much, not whether.
   */
  deadlinePrizeFull: number;

  // --- the skull ---
  /**
   * Peak alpha of the doom skull.
   *
   * Louder than the deadline's 0.5: the deadline is something to read while deciding, and
   * this is the announcement that there is nothing left to decide.
   */
  doomAlpha: number;
  /**
   * Seconds a tick represents, for the verdict badges that beat on the tick.
   *
   * Here rather than imported from `SimConfig` because it is a RENDER fact — how
   * fast a pulse looks — and because nothing in `src/render/` should be reaching
   * into the simulation's timestep to animate itself. If the two ever disagree a
   * badge beats at the wrong speed, which is a cosmetic bug; reading `FIXED_DT`
   * here would make the renderer's animation a function of physics tuning, which
   * is a worse one.
   */
  verdictTickSecs: number;
  /** Peak half-width of the long arm and of the crossbar, in design units. */
  deadlineArmWidth: number;
  deadlineBarWidth: number;
  /**
   * Alpha at the peak of the arm, and the fraction of it left where a press
   * would NOT be accepted.
   *
   * The arm is broken rather than blanked over a hole: 370 of 640 live stretches
   * are not contiguous, so blanking them would leave the commonest case looking
   * like several unrelated marks instead of one deadline with gaps in it.
   */
  deadlineAlpha: number;
  deadlineDeadFrac: number;
  /**
   * What the mark reaches, in alpha and in width, when a press lands right on it.
   *
   * THE COMPASS'S OWN IDIOM. Its rings run `(0.15 + 0.5 * align)` on alpha and
   * `(2 + 2 * align)` on width, so both rise together as the sweep lines up, and
   * the author named it: "I like how we do the compass by making the color
   * brighter when the ship is in the window." Here `align` is how close the ship
   * is to the cross, so the mark tightens and burns brighter over the last stretch
   * exactly as the decision gets sharper.
   *
   * IT REPLACED A LABEL, AND IS BETTER THAN ONE. Two badges were tried and cut on
   * sight — SAFE for the recovery, then Nice! for the press that dared it — with
   * "it's too crowded and the anticipation is fun" and "the 'nice!' is a bit
   * cluttered". An instrument reacting is worth more than a word about the
   * instrument, and it costs no threshold: how close a press was is a number, not
   * a category.
   *
   * KEYED TO THE PRESS, not to the approach. It rose continuously with proximity
   * for one session and lit on every approach, including the ones the player was
   * going to sail straight past — ambience rather than an answer. `Mark.glow` is
   * frozen at the press instead, so a mark the ship drifted past never lights.
   *
   * The width half compounds with `deadlinePrizeMax`, and together they reached 1.99x
   * — reported as looking "a bit thick". Both came down; see the note there.
   *
   * 0.95 first, reported as "there are times that the cross glows a bit too
   * bright". The lift matters more than the ceiling: half again over `deadlineAlpha`
   * is plainly legible as the mark sharpening, where nearly double read as the
   * mark shouting. The deadline is meant to be faint enough to fly past.
   */
  deadlineNearAlpha: number;
  deadlineNearWidth: number;
  /**
   * How fast the deadline reacts to a change, per second: both how the mark follows
   * a moved cross and how a new mark fades in. One rate, because they are one
   * question — 9/s is about a quarter second to converge, under the reaction time
   * the mark exists to be aimed with.
   *
   * Applied PER FRAME, in `Deadline.update`, and that is the whole point of the key.
   * Easing inside `observe` — which runs ten times a second — made `dt * rate`
   * 0.9, so the mark covered 90% of a correction in one step and then sat still
   * for a tenth of a second. A follower in name only.
   *
   * Worth knowing before tuning it: the position term almost never fires. Over
   * the corpus the mark slides in 28 of 205,310 frames, by at most 3.13px,
   * because an acquired cross is genuinely stable. What this rate mostly governs
   * is the fade-in of a new mark, of which there are 541.
   */
  deadlineSettleRate: number;
  /**
   * Longest the drawn arm may be, in design units.
   *
   * The cross sits a median 432px ahead and 1551px at p90 across the recorded
   * approaches, against a 390x844 viewport — so an unclamped arm is routinely
   * twice the height of the screen, describing a stretch with nothing in it to
   * decide. 260 is two thirds of the viewport's width: long enough to read as a
   * lead-in to the mark, short enough never to become a line across the map.
   */
  deadlineArmMaxPx: number;

  // --- boost halo ---
  /** Glow radius at zero charge / at full charge, in design units. */
  boostGlowMin: number;
  boostGlowMax: number;
  /**
   * Breathing period at zero / full charge, in ms. Shorter = more urgent.
   *
   * Both are deliberately slow. At 300ms the peak read as a flicker rather than a
   * pulse, which is agitating in a game whose whole register is calm — and the
   * hue already says "now", so the rhythm does not have to shout it.
   */
  boostPulseSlow: number;
  boostPulseFast: number;
  /** How much the pulse modulates size and brightness (0 = none, 1 = full). */
  boostPulseDepth: number;
  /** Charge above which the halo is unmistakably "now". */
  boostPeakFrom: number;

  // --- capture visuals ---
  /**
   * How far the compass ring is drawn inward with the ship DURING THE DIVE.
   * 0 holds it at the predicted periapsis, 1 pins it to the ship.
   *
   * Dive-only. Once the orbit freezes the ring is anchored to `cap.rPeri` and
   * stops moving — see the note at its use in `compass.ts` for why following a
   * settled orbit was unreadable.
   */
  gaugeFollow: number;
  /** Radius of the nearest target's ring, above the settled orbit. */
  compassRingInner: number;
  /** Extra radius at the far end of AIM_RANGE, so ring size reads as distance. */
  compassRingSpread: number;
  /** Off-screen planet markers are shown within this distance. */
  edgeMarkerRange: number;
  /** Inset of the arrow ring from the sides and bottom of the window. */
  edgeMarkerInset: number;
  /** Gap left between the header text and the first arrow. */
  edgeMarkerHeaderGap: number;
  /** Half-angle of the drawn crash wedge (cosmetic only). */
  crashConeHalfAngle: number;
}

export const DEFAULT_RENDER_CONFIG: Readonly<RenderConfig> = Object.freeze({
  designW: 390,
  cameraMarginFrac: 0.22,
  cameraFollow: 3,
  cameraLookAhead: 0.18,
  cameraLookRefSpeed: 260,
  cameraOrbitLock: 1,
  cameraOrbitEase: 3,
  cameraBackstopEdge: 18,
  cameraBarrierRelax: 150,
  cameraAnomalyLead: 0.5,

  starCount: 160,
  starParallaxMin: 0.045,
  starParallaxMax: 0.195,
  starParallaxHorizFrac: 0.6,

  trailMax: 16,
  trailSpacing: 3,
  trailSpeedCalm: 110,
  trailSpeedHot: 420,
  trailHeadGap: 12,

  hazardZoneWidth: 60,

  deadlineFadeInSecs: 3.67,
  deadlineFullSecs: 1.65,
  deadlineFadeOutSecs: 1.6,
  deadlineGhostSecs: 0.3,
  deadlineTapSecs: 0.18,
  deadlineBarHalf: 13,
  deadlineStubHalf: 17,
  deadlinePrizeMin: 0.62,
  deadlinePrizeMax: 1.18,
  deadlinePrizeFull: 860,

  doomAlpha: 0.78,
  verdictTickSecs: 1 / 60,
  deadlineArmWidth: 1.3,
  deadlineBarWidth: 1.7,
  deadlineAlpha: 0.5,
  deadlineDeadFrac: 0.18,
  deadlineNearAlpha: 0.74,
  deadlineNearWidth: 1.15,
  deadlineSettleRate: 9,
  deadlineArmMaxPx: 150,

  boostGlowMin: 13,
  boostGlowMax: 42,
  boostPulseSlow: 1000,
  boostPulseFast: 620,
  boostPulseDepth: 0.14,
  boostPeakFrom: 0.82,

  gaugeFollow: 0.25,
  compassRingInner: 26,
  compassRingSpread: 62,
  edgeMarkerRange: 1300,
  edgeMarkerInset: 24,
  edgeMarkerHeaderGap: 6,
  crashConeHalfAngle: 0.42,
} satisfies RenderConfig);
