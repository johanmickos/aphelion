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

  // --- boost ---
  boostThreshold: number;
  boostMax: number;
  /** Seconds to ramp the boost 0 -> full. Holding is what arms it. */
  boostArmTime: number;
  /** Seconds for the boost to fade to zero after its peak. */
  boostDecayTime: number;
  /** Fraction of the boost that permanently carries into drift velocity. */
  boostPermFrac: number;
  /** Transient burst multiplier, for a punchy escape. */
  boostPunch: number;
  /** Seconds for the transient escape burst to fade during drift. */
  boostBurstDecay: number;
  releaseFlingBoost: number;

  // --- fuel ---
  fuelMax: number;
  fuelRegen: number;
  fuelPerSec: number;

  // --- field ---
  /** Playfield is this much wider than the design viewport. */
  fieldWidthFrac: number;
  /** How many bodies the field holds. */
  bodyCount: number;
  /**
   * How far below the highest point reached a run may fall before it ends.
   * 0 disables it entirely.
   */
  backtrackLimit: number;
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
   * A flyby that converts into a capture gets its clearance impulse.
   *
   * Clearance was only ever computed in `beginCapture`, so anything that became a
   * capture by conversion never got it and dived straight through the surface —
   * to a periapsis of 6 inside a 46px planet in the case that prompted this. The
   * floor then caught it, destroying 44% of its speed in one substep, which is
   * what the 56-degree kink and "stuck to the surface" both were.
   */
  clearanceOnConvert: boolean;
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
  /** Vertical gap between generated rows, in world units, before jitter. */
  bodySpacing: number;
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
  /** Seconds to hold on a crash before respawning. */
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

  boostThreshold: 0.5,
  boostMax: 95,
  boostArmTime: 0.45,
  boostDecayTime: 1.4,
  boostPermFrac: 0.22,
  boostPunch: 1.8,
  boostBurstDecay: 1.3,
  releaseFlingBoost: 1.0,

  fuelMax: 100,
  fuelRegen: 15,
  fuelPerSec: 18,

  fieldWidthFrac: 1.2,
  bodyCount: 8,
  backtrackLimit: 0,
  boundGrabsCapture: false,
  clearanceOnConvert: false,
  grabRange: 0,
  proceduralLayout: false,
  bodySpacing: 0,
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
  fuelRegen: 30,
  fieldWidthFrac: 1.9,
  bodyCount: 60,
  backtrackLimit: 520,
  boundGrabsCapture: true,
  clearanceOnConvert: true,
  grabRange: 560,
  proceduralLayout: true,
  bodySpacing: 280,
  bodyWeave: 72,
  bodySpread: 160,
  rowPairChance: 0.4,
  boostMax: 60,
  grabLeadTime: 0.2,
  crashConeSeverityFloor: 0,
} satisfies SimConfig);

/**
 * Bump whenever a change to `src/sim/` alters behaviour.
 *
 * A diagnostics report records this, so a replay can tell "you were running older
 * code" apart from "the simulation is non-deterministic". Those look identical in
 * the numbers and could not be more different in what they mean.
 */
export const SIM_VERSION = 7;

/** The canonical simulation timestep. Passed as a parameter, never read globally. */
export const FIXED_DT = 1 / 60;

/** Accumulator ceiling: 3 steps at 1/60 reproduces the prototype's 0.05 dt clamp. */
export const MAX_CATCHUP_STEPS = 3;
