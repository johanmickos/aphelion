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

  // --- the scar: the point of no return ---
  /**
   * Seconds-to-cross at which the scar starts ghosting in, and at which it
   * reaches full strength.
   *
   * Measured, not chosen. Over 640 committed approaches in `diagnostics/`, the
   * lead between the scar becoming computable and the cross runs median 1.65s,
   * p75 3.67s. Full strength at the median means the scar is solid for at least
   * half of every approach that has one; ghosting in at p75 means three
   * approaches in four never see it appear out of nothing.
   *
   * A ramp rather than a switch, for the reason `nearestBody` gives about cones:
   * a threshold is a cliff, and a mark that pops into existence is not a scar.
   */
  scarFadeInSecs: number;
  scarFullSecs: number;
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
  scarFadeOutSecs: number;
  /** Half-length of the crossbar, and of the arm stub kept after the cross is passed. */
  scarBarHalf: number;
  scarStubHalf: number;
  /** Peak half-width of the long arm and of the crossbar, in design units. */
  scarArmWidth: number;
  scarBarWidth: number;
  /**
   * Alpha at the peak of the arm, and the fraction of it left where a press
   * would NOT be accepted.
   *
   * The arm is broken rather than blanked over a hole: 370 of 640 live stretches
   * are not contiguous, so blanking them would leave the commonest case looking
   * like several unrelated marks instead of one scar with gaps in it.
   */
  scarAlpha: number;
  scarDeadFrac: number;
  /**
   * How fast the scar reacts to a change, per second: both how the mark follows
   * a moved cross and how a new mark fades in. One rate, because they are one
   * question — 9/s is about a quarter second to converge, under the reaction time
   * the mark exists to be aimed with.
   *
   * Applied PER FRAME, in `Scar.update`, and that is the whole point of the key.
   * Easing inside `observe` — which runs ten times a second — made `dt * rate`
   * 0.9, so the mark covered 90% of a correction in one step and then sat still
   * for a tenth of a second. A follower in name only.
   *
   * Worth knowing before tuning it: the position term almost never fires. Over
   * the corpus the mark slides in 28 of 205,310 frames, by at most 3.13px,
   * because an acquired cross is genuinely stable. What this rate mostly governs
   * is the fade-in of a new mark, of which there are 541.
   */
  scarSettleRate: number;
  /**
   * Longest the drawn arm may be, in design units.
   *
   * The cross sits a median 432px ahead and 1551px at p90 across the recorded
   * approaches, against a 390x844 viewport — so an unclamped arm is routinely
   * twice the height of the screen, describing a stretch with nothing in it to
   * decide. 260 is two thirds of the viewport's width: long enough to read as a
   * lead-in to the mark, short enough never to become a line across the map.
   */
  scarArmMaxPx: number;

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

  scarFadeInSecs: 3.67,
  scarFullSecs: 1.65,
  scarFadeOutSecs: 1.6,
  scarBarHalf: 13,
  scarStubHalf: 17,
  scarArmWidth: 1.3,
  scarBarWidth: 1.7,
  scarAlpha: 0.5,
  scarDeadFrac: 0.18,
  scarSettleRate: 9,
  scarArmMaxPx: 260,

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
