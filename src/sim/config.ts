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

  // --- aim scoring (feeds the boost and the tighten target) ---
  aimInwardW: number;
  aimProxW: number;
  aimSpeedW: number;
  aimProxRef: number;

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
   * Generate the field instead of using the prototype's hand-authored eight.
   *
   * The authored layout is the *prototype's* world and cannot be retuned without
   * breaking the equality gate, so PROTOTYPE_CONFIG keeps it and the game builds
   * its own. The opening body is still the authored one either way, so the first
   * approach keeps its tuned geometry.
   */
  proceduralLayout: boolean;
  /** Vertical gap between generated bodies, in world units, before jitter. */
  bodySpacing: number;

  // --- crash ---
  /** How close (px beyond the surface) the crash cone reaches. Gates grab refusal. */
  crashConeRange: number;
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

  aimInwardW: 0.55,
  aimProxW: 0.25,
  aimSpeedW: 0.2,
  aimProxRef: 240,

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
  proceduralLayout: false,
  bodySpacing: 0,

  crashConeRange: 70,
  crashPause: 0.7,
  crashGrazeDot: 0.18,
} satisfies SimConfig);

/**
 * The live game tuning. Starts from the prototype and diverges deliberately.
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
  fieldWidthFrac: 1.9,
  bodyCount: 32,
  proceduralLayout: true,
  bodySpacing: 360,
} satisfies SimConfig);

/**
 * Bump whenever a change to `src/sim/` alters behaviour.
 *
 * A diagnostics report records this, so a replay can tell "you were running older
 * code" apart from "the simulation is non-deterministic". Those look identical in
 * the numbers and could not be more different in what they mean.
 */
export const SIM_VERSION = 3;

/** The canonical simulation timestep. Passed as a parameter, never read globally. */
export const FIXED_DT = 1 / 60;

/** Accumulator ceiling: 3 steps at 1/60 reproduces the prototype's 0.05 dt clamp. */
export const MAX_CATCHUP_STEPS = 3;
