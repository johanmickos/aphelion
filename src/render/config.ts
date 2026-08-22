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
