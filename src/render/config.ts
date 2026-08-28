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
import { DESIGN_W } from '../sim/world.ts';

export interface RenderConfig {
  // --- camera ---
  /**
   * Width of the design window in world units. The playfield is wider; we pan.
   *
   * NOT A KNOB, AND NOT ITS OWN NUMBER. The world's layout is authored at
   * `DESIGN_W` and `fieldBounds` measures the corridor as `DESIGN_W *
   * fieldWidthFrac`, so the framing and the field are two readings of one width.
   * It sat here as a literal 390 beside the simulation's literal 390 — the same
   * two-definitions-of-one-line defect `finishLineY` and `runInBand` were each
   * written to close, and silent in the same way: change one and the camera frames
   * a window the corridor is no longer measured against, so `followCamera`'s
   * `field.width <= cam.designW` test decides whether to pan at all against the
   * wrong number.
   *
   * It stays a `RenderConfig` field rather than being read from `world.ts` at
   * every call site, because the camera is constructed from a config and a test
   * may want to frame a narrower window. What is gone is the second literal.
   */
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
   * WHY. An anomaly sits `BODY_TYPES.anomaly.wallOffset` past the wall and the view may not reach
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

  // --- the body lamp ---
  //
  // Direction 04's feel settings, and they are HERE rather than as consts in
  // `src/render/body.ts` because none of them has been flown. They were reasoned
  // from the corpus, which can say what the picture must not claim and cannot say
  // what it should feel like — and a value that can only be judged in motion has
  // to be reachable from the phone that is doing the moving. Nothing here can
  // touch a trajectory, which is what keeps them out of `SimConfig`.
  /**
   * How tightly the tide tracks the craft, in units of 1/second, at the two ends
   * of the pull ramp: `Rest` when the body is barely pulling, `Full` at its own
   * minimum orbit.
   *
   * Low is liquid and heavy, high is snappy. The pair is a ramp rather than one
   * number because that is the claim: a body reaches lazily from far away and
   * snaps to you when it has you, so the tracking rate is itself a reading of how
   * hard the gravity is. 4 and 14 are the board's intent expressed as rates, and
   * are the single most conspicuously unflown thing on the body — the board names
   * `tideLag` as its feel setting and never says what it should be.
   */
  bodyTideLagRest: number;
  bodyTideLagFull: number;
  /**
   * How long a released body stays dark, in seconds.
   *
   * NOT PERMANENT, AND THE CORPUS IS WHY. The board wants the lamp to go out for
   * good — "a spent field behind you is the run's scoreboard, drawn in the world"
   * — and there would be something to draw: a session holds a median of 6 distinct
   * bodies, p90 12, max 17. But 15 of the 28 faithful sessions RE-GRAB a body they
   * had already held, a median of once. A permanent mark tells the player a body
   * is used up in over half of the sessions where they go back and successfully
   * use it again, and a cue that lies about availability is worse than no cue.
   *
   * So it decays: hard at the release, recovered by the time going back is a real
   * option. 3 is roughly the fastest observed return to a body. What is unflown is
   * whether the mark reads at all at that length — 0 turns it off, which is the
   * comparison worth making before defending the number.
   */
  bodySpentRecover: number;
  /**
   * Rim alpha for a body the craft is nowhere near. "A constellation of dim
   * rings" — this sets how dim, and therefore how much a field ahead reads as
   * structure rather than as noise.
   */
  bodyRimRest: number;
  /**
   * The pull at which a rim starts to bloom, which is where AHEAD becomes IN
   * REACH.
   *
   * Not a gameplay threshold — the tide is what says a press will land, and it has
   * no threshold at all. This one only decides where the lamp is worth lighting,
   * so being a little wrong here costs nothing a player could name. It is a knob
   * anyway because "a little wrong" is exactly the kind of judgement a still frame
   * cannot make: what it really sets is how many rims are blooming at once in a
   * dense stretch.
   */
  bodyEmitAt: number;
  /**
   * Peak alpha of the grip gradient above a body's minimum-orbit ring.
   *
   * THE PIXEL FOR THE TIGHTNESS MULTIPLIER, and it is required rather than
   * decorative. Direction 08's axiom 5: "if a scoring rule can't point at the
   * pixel that announced it, the rule is wrong", and the pixel has to be drawn
   * BEFORE the score touches it, so a word afterwards does not qualify. The ring
   * announces the FLOOR; the multiplier is graded over `ScoreConfig.closeSpan`
   * above it, and until this landed nothing drew that at all.
   *
   * It is a knob because how strongly it should read is exactly the judgement a
   * still frame cannot make: too faint and it is decoration, too strong and every
   * body in a dense stretch wears a halo. 0 turns it off, which is the comparison
   * worth making before defending the number.
   */
  bodyGripAlpha: number;

  // --- the deadline: the point of no return ---
  /**
   * Seconds-to-cross at which the deadline starts fading in, and at which it
   * reaches full strength.
   *
   * MEASURED, NOT CHOSEN, and re-measured on 2026-08-25 because the old pair had
   * quietly stopped being what they claimed. The rule is `deadlineFullSecs` = the
   * median lead between the cue becoming computable and the cross, and
   * `deadlineFadeInSecs` = p75 of the same. Over 640 cross episodes in all 64
   * recordings that distribution is now median 1.32s, p75 2.63s — so the shipped
   * 1.65 / 3.67 had drifted to p58 / p87 as the corpus grew, and the cue was
   * appearing earlier and reaching full strength later than the rule says.
   *
   * Full strength at the median means the deadline is solid for at least half of
   * every approach that has one; fading in at p75 means three approaches in four
   * never see it appear out of nothing.
   *
   * These get re-derived, not nudged. A threshold calibrated on a stale feel is
   * worse than an unmeasured one, because it looks defensible.
   */
  deadlineFadeInSecs: number;
  deadlineFullSecs: number;
  /**
   * Lead below which a cross is not drawn at all, in seconds.
   *
   * A BIRTH GATE: it decides whether a mark is ever born, never whether a living
   * one survives. Testing it live would blink the mark out at the moment the ship
   * is closest to it, which is the opposite of what it is for.
   *
   * The cohort it removes is real and measured. 24% of episodes end with the ship
   * sailing through the cross, and those appear with a median 0.27s of lead —
   * against p10 = 0.22s over all episodes. With no residue left behind, such a
   * mark is a red blink with no time to inform anything and nothing to study
   * afterwards.
   *
   * NOT A PERCENTILE. It is simple human reaction time: a cue that arrives with
   * less lead than that cannot influence the press it exists to inform. The
   * lesson for those runs lands in the debrief instead, where there is time to
   * read it.
   */
  deadlineMinLeadSecs: number;
  /**
   * The confirm after a press: peak alpha, and how long it lasts.
   *
   * WHAT IT IS FOR. Split by outcome over 640 episodes, 74% of them end because
   * the player pressed — so the press is the cue's normal ending, not an
   * exception, and this is the only thing that ever tells the player their read
   * was good. The lift is scaled by how close the press was to the cross, which
   * is the reward for timing it late.
   *
   * MILD, DELIBERATELY. The glow this replaces reached 0.74 on alpha AND 1.15x on
   * width, tuned for a mark that then sat fading for 1.6 seconds. At a quarter of
   * a second the same peak lands as a blink — reported as "REALLY visually loud.
   * It should be much milder" — so the duration coming down brought the peak down
   * with it, and the width term went entirely. Two channels moving together is
   * what made the old mark shout.
   *
   * The deadline is meant to be faint enough to fly past.
   */
  deadlineConfirmAlpha: number;
  deadlineConfirmSecs: number;
  /** The dot: filled core radius, outer ring radius, ring stroke width. */
  deadlineMarkerCoreR: number;
  deadlineMarkerR: number;
  deadlineMarkerRing: number;
  /**
   * The track's faint length and its weighted stretch, both in design units.
   *
   * `deadlineArmMaxPx` says where the track stops being a hairline — NOT where it
   * stops existing. The clamp it replaces cut the track off entirely at this
   * length, which measured badly: the cross first appears a median 375px away and
   * 772px at p75, so a 150px clamp drew a floating segment a quarter-screen ahead
   * of the ship, connected to nothing. It only genuinely emerged from the ship in
   * the bottom quartile, which is the cohort that arrives too late to matter.
   *
   * `deadlineLeadLenPx` is the final stretch, where the track thickens and
   * brightens into the dot.
   */
  deadlineArmMaxPx: number;
  deadlineLeadLenPx: number;
  /**
   * The track's profile: how faint the hairline is relative to the track, the
   * track's own alpha, and what the final stretch reaches.
   *
   * All three are fractions of `deadlineAlpha`, so the cue has ONE overall
   * strength and these say only how it is distributed along its own length.
   *
   * A PROFILE IN SPACE, NOT A RESPONSE IN TIME. An earlier pass had the final
   * stretch brighten as the ship approached, which measured as redundant: the
   * track is anchored to the ship, so its length already IS the proximity. A
   * second channel restating a first is how a clean instrument turns back into a
   * smear.
   *
   * RAISED AFTER PLAY, and only these two. Reported as "the two-channel cue is
   * not very noticeable" over a 68s session that nonetheless spent 62% of its
   * rescue windows — so the cue was informing presses and simply hard to see. The
   * faint end was the problem: the hairline landed at 0.053 alpha over a
   * starfield. It is 0.124 now.
   *
   * `deadlineAlpha` deliberately did NOT move with them. The confirm is a LIFT
   * over it — 0.5 to 0.62 — so raising the base would have quietly flattened the
   * one piece of positive feedback the cue has, which is the opposite of the
   * complaint.
   */
  deadlineHairFrac: number;
  deadlineTrackAlpha: number;
  deadlineLeadAlpha: number;
  /**
   * HALF-width of the track, and the extra half-width it gains at the cross.
   *
   * Half, because `ribbon` lays each point out at `p ± normal * w` — so these are
   * half of the stroke widths they were tuned as. Tuned at 1.6 and 2.6 as canvas
   * `lineWidth`, which is a full width; shipping those numbers unchanged drew the
   * track at twice the weight it was chosen at.
   */
  deadlineTrackWidth: number;
  deadlineLeadWidth: number;
  /**
   * Overall alpha of the cue, and the fraction of it left where a press would NOT
   * be accepted.
   *
   * The track is broken rather than blanked over a hole: 370 of 640 live stretches
   * are not contiguous, so blanking them would leave the commonest case looking
   * like several unrelated marks instead of one track with gaps in it.
   */
  deadlineAlpha: number;
  deadlineDeadFrac: number;
  /**
   * How fast the deadline reacts to a change, per second: both how the mark
   * follows a moved cross and how a new mark fades in. One rate, because they are
   * one question — 9/s is about a quarter second to converge, under the reaction
   * time the mark exists to be aimed with.
   *
   * Applied PER FRAME, in `Deadline.update`, and that is the whole point of the
   * key. Easing inside `observe` — which runs ten times a second — made
   * `dt * rate` 0.9, so the mark covered 90% of a correction in one step and then
   * sat still for a tenth of a second. A follower in name only.
   *
   * Worth knowing before tuning it: the position term almost never fires. Over
   * the corpus the mark slides in 28 of 205,310 frames, by at most 3.13px,
   * because an acquired cross is genuinely stable. What this rate mostly governs
   * is the fade-in of a new mark.
   */
  deadlineSettleRate: number;

  // --- the skull ---
  /**
   * Peak alpha of the doom skull.
   *
   * Louder than the deadline's 0.5: the deadline is something to read while deciding, and
   * this is the announcement that there is nothing left to decide.
   */
  doomAlpha: number;
  /**
   * Radius of the doom skull, in design units.
   *
   * THE LEVER THAT MATTERS. The glyph was redrawn once for being "not immediately
   * recognisable as death", and most of what reads as unrecognisable at a glance
   * is this number rather than the path: at 6.2 it renders 6-19px across the
   * camera's real scale range, and the smallest end of that is a smudge whatever
   * is drawn into it. It lives here, next to the alpha, so the two can be judged
   * together.
   */
  doomR: number;
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
  designW: DESIGN_W,
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

  bodyTideLagRest: 4,
  bodyTideLagFull: 14,
  bodySpentRecover: 3,
  bodyRimRest: 0.4,
  bodyEmitAt: 0.3,
  bodyGripAlpha: 0.16,

  deadlineFadeInSecs: 2.63,
  deadlineFullSecs: 1.35,
  deadlineMinLeadSecs: 0.25,
  deadlineConfirmAlpha: 0.62,
  deadlineConfirmSecs: 0.25,
  deadlineMarkerCoreR: 2.9,
  deadlineMarkerR: 5,
  deadlineMarkerRing: 1.6,
  deadlineArmMaxPx: 150,
  deadlineLeadLenPx: 46,
  deadlineHairFrac: 0.55,
  deadlineTrackAlpha: 0.45,
  deadlineLeadAlpha: 1,
  deadlineTrackWidth: 0.8,
  deadlineLeadWidth: 1.3,
  deadlineAlpha: 0.5,
  deadlineDeadFrac: 0.18,
  deadlineSettleRate: 9,

  doomAlpha: 0.78,
  doomR: 7.4,
  verdictTickSecs: 1 / 60,

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
