/**
 * The world's units, and the one number that sets them.
 *
 * Spec [01](../../docs/spec/01-swing.md) states every length in the prototype's
 * world units, whose field is 390 wide, because that is what its measurements
 * were taken in and §0 rules that a spec which silently rescales its own
 * evidence is worse than one that does not scale at all. This repo's design
 * space is 1170 × 2532 (ADR-0010), exactly three times that in each direction.
 *
 * **The conversion is confirmed** (author, 2026-08-27, closing spec 01 §13.3):
 * the rewrite should feel the same in the hand on the same phone, so lengths,
 * speeds and accelerations scale by 3, and a gravitational parameter — units of
 * length³ / time² — by 3³ = 27. Times, angles, ratios and tick counts are
 * unchanged and appear below exactly as the spec states them.
 *
 * Every length in the simulation is derived from `SCALE` and the spec's own
 * figure, written as a product so the reader can see both. Declining the
 * conversion later, or moving to a different design size, is this one constant.
 */

/**
 * Design units per prototype unit.
 *
 * Not `3` written thirty times: it is the highest-leverage number in spec 01 and
 * it wanted a name before it wanted a value.
 */
export const SCALE = 3;

/** The same factor applied to a gravitational parameter, which is a volume rate. */
const VOLUME_SCALE = SCALE * SCALE * SCALE;

/**
 * How long a tick lasts.
 *
 * Ticks are the only clock in the game (ADR-0006) and this is the single place a
 * second is named. It is here so that the physical constants below can be the
 * ones spec 01 measured — accelerations in units per second squared, speeds in
 * units per second — rather than a set of per-tick figures 3600× away from every
 * tolerance they have to be checked against.
 *
 * Naming a second is not reading a clock. Nothing in `src/sim/` or `src/state/`
 * can reach `Date`, `performance` or a timer; `pnpm portable` proves it. What
 * crosses the boundary is a duration handed in from outside, and
 * [`clock.ts`](./clock.ts) is the only thing that accepts one.
 */
export const SECONDS_PER_TICK = 1 / 60;

/**
 * Integration steps inside one tick — spec 01 §12.
 *
 * Six is **converged, not chosen**: `test/sim/integrate.test.ts` holds the
 * convergence against a 96-substep reference on every run, which is the form
 * spec 01 §12's tolerance asks for — *"a convergence test, not a fixed number,
 * so the rewrite can choose its own count and prove it."*
 */
export const SUBSTEPS = 6;

/** The most ticks one call may catch up by, so a stall cannot become a fast-forward. */
export const MAX_CATCH_UP_TICKS = 3;

/**
 * The gravitational parameter of a body of median radius — spec 01 §2's
 * 5 500 000, converted.
 *
 * A body's own parameter is a function of its radius; see
 * [`body.ts`](./body.ts). This is the anchor that function is normalised to, so
 * that moving the exponent leaves the median body untouched.
 */
export const MEDIAN_MASS = 5_500_000 * VOLUME_SCALE;

/** The median body's radius — spec 01 §13.2's field median of 44, converted. */
export const MEDIAN_RADIUS = 44 * SCALE;

/**
 * The softening length in `a(r) = μ / (r² + ε²)` — spec 01 §2's 18, converted.
 *
 * It is what makes the force law depart from inverse-square close in: 9.4%
 * weaker at the floor, 3.1% at r = 100 prototype units, 0.8% at 200. That
 * departure is measured behaviour, not a numerical safety valve, so the constant
 * is part of the physics rather than a guard on it.
 */
export const SOFTENING = 18 * SCALE;

/**
 * How far above a body's surface its floor sits — spec 01 §6a's 12, converted.
 *
 * A **feel choice** and stated as one: 16 read as too loose and 10 as a touch
 * tight, and below 8 the craft would clip the surface. Nothing else in the swing
 * depends on it.
 */
export const FLOOR_GAP = 12 * SCALE;

/**
 * How steeply mass follows radius, in `μ(R) = MEDIAN_MASS × (R / MEDIAN_RADIUS)ⁿ`.
 *
 * **An opening position at 2**, and the one genuine knob in the simulation.
 * Spec [04 · §1](../../docs/spec/04-bodies.md) rules *"mass is size"* and spec
 * [01 · §13.2](../../docs/spec/01-swing.md) defers only how steeply — to the M1
 * gate, on the phone, against this repo's own field rather than the prototype's.
 * `0` reproduces the prototype exactly, where every body had one mass and radius
 * touched only the floor and the collision surface.
 *
 * It is a parameter and not a constant because the author explicitly deferred
 * it, which is the argument [AGENTS.md](../../AGENTS.md) §6 asks a knob to make.
 * When the gate closes, this becomes a number and the parameter goes away.
 */
export const MASS_EXPONENT = 2;

/**
 * How far a body of median mass is on offer from — spec 01 §3's 560, converted.
 *
 * Spec [01 · §13.2](../../docs/spec/01-swing.md) rules that **grab range scales
 * with mass**, so this is the median body's reach and [`grab.ts`](./grab.ts)
 * derives the rest; at `MASS_EXPONENT = 0` every body is the median one and the
 * range is flat 560, which is the prototype exactly.
 *
 * Measured, and generous relative to what is used: over 270 real grabs the
 * distance to the grabbed body was p95 351, so the reach is about 1.6× the p95
 * actually taken. A rewrite whose refusal rate is materially higher has made the
 * grab a skill it is not.
 */
export const MEDIAN_GRAB_RANGE = 560 * SCALE;

/**
 * How far ahead of itself the grab looks, in seconds — spec 01 §3.
 *
 * The question asked is *"which body am I arriving at"* rather than *"which body
 * am I beside"*. A time and not a length, so it is unchanged by the conversion,
 * and continuous in both position and velocity — a heading test, a closing-speed
 * rule or a cone would each need a threshold, and a threshold is a cliff the
 * player falls off as a body drifts across an arbitrary line.
 */
export const LEAD_SECONDS = 0.2;

/**
 * How close to a body's surface is too close to be caught by it — spec 01 §3's
 * ≈ 32.5, converted.
 *
 * The other half of the too-late refusal is that the heading ray strikes the
 * body: inside this gap there is no longer room for the clearance in §4 to lift
 * the path, so the grab declines rather than promising a floor it cannot hold.
 * Measured at 0.4% of 278 real presses.
 */
export const TOO_LATE_GAP = 32.5 * SCALE;

/**
 * How many ticks the clearance impulse is spread over — spec 01 §4's 5 frames.
 *
 * A tick count, so it is unchanged by the conversion. 83ms at 60Hz, inside the
 * spec's 80 – 90ms band. *"A single-tick application is a failure however
 * correct the endpoint"*: what the player feels is a grab that gathers the craft
 * up, and a snap reads as the world moving rather than the craft turning.
 */
export const CLEARANCE_TICKS = 5;

/**
 * The most of local escape speed a clearance may leave the craft at — spec 01 §4.
 *
 * Below one by construction, so a grab **cannot eject the craft it caught**. The
 * prototype measured the alternative: adding tangential speed to raise a
 * periapsis handed a craft at half escape speed up to 277 units/s and put it
 * above escape, and its author reported *"I kind of shot off the planet at super
 * speed"*.
 */
export const CLEARANCE_ESCAPE_FRACTION = 0.98;

/**
 * The most of escape speed a freeze will hand a craft at its periapsis — spec
 * 01 §5a's measured `v_peri / v_escape(r_peri)` of **0.77 – 0.99**.
 *
 * A separate decision from [`CLEARANCE_ESCAPE_FRACTION`](#) that happens to
 * share its value, and it exists for a different reason: the clearance's cap
 * keeps a *grab* from ejecting the craft, and this one keeps the **freeze from
 * handing out an orbit that is not one.** A craft that arrives unbound is above
 * escape at its own closest approach by definition, and the freeze captures it
 * anyway (spec 01 §4 — *"a grab converts a lethal line into an orbit"*); without
 * this it would then ride a bound ellipse at a speed that ellipse cannot hold.
 *
 * It is not the eccentricity cap and it does not do the eccentricity cap's job.
 * §6a's *"the dive sets the speed, and the cap does not apply to it"* is about
 * the **shape** clamp leaking into the rate, which it still must not.
 *
 * The prototype's own table is the evidence it is here: approach speeds of 200
 * and 260 from the same distance freeze at **the same 435 units/s**, which two
 * different dives only do if something clamped them, and `0.98 × √2` — this
 * against the circular speed — is **1.386**, which is §6a's measured ceiling of
 * 1.40 to three figures.
 */
export const FREEZE_ESCAPE_FRACTION = 0.98;

/**
 * The most eccentric shape a freeze will hand out — spec 01 §6.
 *
 * **A feel call and the author's** (spec 01 §13.5): measured, it binds on all but
 * the slowest dives — real play is p25 0.58, p50 0.60, p75 0.60 — which is more
 * work than a safety limit should be doing, and whether the rewrite keeps it,
 * moves it, or shapes the approach so it stops binding is decided at the M1 gate.
 * It is what makes four dives differing only in approach speed ride the *same*
 * ellipse; the speed they ride it at is deliberately not capped with it.
 */
export const ECCENTRICITY_CAP = 0.6;

/** Ticks in a duration spec 01 states in seconds. Times transfer unscaled (§0). */
function ticksFor(seconds: number): number {
  return Math.round(seconds / SECONDS_PER_TICK);
}

/**
 * How long the settle lasts — spec 01 §6's 1.2s.
 *
 * The stretch in which the orbit rounds toward a circle and the speed the dive
 * earned is spent. *"The reward for a good dive is a speed advantage with a
 * 1.2-second shelf life, and cashing it before it expires is the whole of §11's
 * timing problem."*
 */
export const SETTLE_TICKS = ticksFor(1.2);

/** Where the boost envelope reaches full — spec 01 §7's 0.45s after the freeze. */
export const BOOST_ARM_TICKS = ticksFor(0.45);

/**
 * Where the boost envelope leaves its plateau — spec 01 §7's 1.2s.
 *
 * The same instant the settle ends, and that is not a coincidence: the plateau
 * exists because completing a circularisation used to guarantee missing the
 * window it was meant to reward.
 */
export const BOOST_PLATEAU_TICKS = SETTLE_TICKS;

/** Where the boost envelope reaches nothing again — spec 01 §7's 2.6s. */
export const BOOST_ZERO_TICKS = ticksFor(2.6);

/**
 * The boost a dive of full depth is worth, in design units per second — spec
 * 01 §7's 60, converted.
 *
 * **Tuning, and M4's** (spec 01 §13.4): the envelope's shape and timing are M1's
 * and are fixed, its magnitude is an economy number spec 08 will move, and every
 * tolerance in §7 is written on the shape so that moving it does not invalidate
 * them. It is not a physics constant.
 */
export const PEAK_BOOST = 60 * SCALE;

/**
 * The depth a dive must reach before it is paid anything — spec 01 §7.
 *
 * Exactly: `periapsis < (grab radius + floor) / 2`. Committing halfway to the
 * floor is the price of admission.
 */
export const PAYING_DEPTH = 0.5;

/**
 * How much of the boost a release keeps — spec 01 §8's 22%.
 *
 * The rest is the punch, and it is spent rather than kept (ADR-0012). *"A
 * release that put all of its boost into permanent velocity would compound up
 * the field forever; 22% keeps the escalation bounded"*, and spec 01 §5a's flat
 * median speed across eight altitude bands is the evidence it works.
 */
export const PERMANENT_SHARE = 0.22;

/**
 * How close to a body's surface counts as contact for a coasting craft — spec
 * 01 §10's `R + 5`, converted.
 *
 * **It is the craft's own hull.** The dart the renderer draws is 15 design units
 * half-width — five prototype units, this number exactly — so `R + 5` is not a
 * shell around the body but the radius at which the craft, which the simulation
 * carries as a point, actually touches it. Everything §10 says about contact
 * reads differently once that is seen: a *graze* is the hull brushing the
 * surface, not a near miss.
 *
 * A different number from [`BOUNCE_GAP`](#) by one unit, and that difference is
 * not worth tidying away: the two are measured separately and the asymmetry
 * they carry is that the same geometry is lethal coasting and safe held.
 */
export const IMPACT_GAP = 5 * SCALE;

/**
 * How head-on an approach has to be before contact kills — spec 01 §10's 0.18.
 *
 * `−(v · n̂) / |v|`, so it is a **ratio and does not scale**. Below it the
 * contact is a graze and the craft lives: *"flinging tangentially past a body
 * you have just left is legitimate flying"*, and a bare distance test would kill
 * the manoeuvre the game is about.
 */
export const GRAZE_RATIO = 0.18;

/**
 * How hard a graze pushes back — the prototype's 0.8, and **spec 01 §10 does not
 * state it**.
 *
 * §10 says what a graze is not — lethal — and stops. Something still has to
 * happen, because a graze is the craft's hull *on* the surface (see
 * [`IMPACT_GAP`](#)) and a craft left alone there sinks into the disc it is
 * touching. And the lethality test cannot clean that up on a later tick: along a
 * straight line the fraction of speed pointed at a body only ever **falls** past
 * the entry point, so a contact that arrived as a graze stays one however deep
 * it goes.
 *
 * The prototype skips it off at the same `R + 5`, and this is that behaviour
 * carried rather than a ruling invented (ADR-0013). Measured across the whole
 * graze band, it costs the craft **up to 17°** of heading at the lethal
 * threshold, falling to nothing as the pass becomes exactly tangential. The hole
 * spec 01 leaves is recorded in the plan rather than papered over.
 */
export const GRAZE_RESTITUTION = 0.8;

/**
 * How close to a body the craft may come while holding a *different* one — spec
 * 01 §10's `R + 6`, converted.
 *
 * Never lethal. A grab is a promise that you will not be killed by the thing you
 * grabbed, and spec 01 §10 extends the safety to the whole field for as long as
 * one is held.
 */
export const BOUNCE_GAP = 6 * SCALE;

/** How hard that bounce pushes back — spec 01 §10's 0.6. */
export const BOUNCE_RESTITUTION = 0.6;

/**
 * How far past the corridor's line is out — spec 01 §10's 4 units, converted.
 *
 * A grace rather than a second line: the line is where the corridor stops and
 * this is the slack the predicate is measured with, which is the form the
 * prototype states it in.
 */
export const CORRIDOR_GRACE = 4 * SCALE;

/**
 * How far the fell-behind line trails the high-water mark — spec 01 §10's 700,
 * converted.
 *
 * `CONTEXT.md` is emphatic that this is **not** the floor: the floor is the
 * orbit's and is 12 units above a body's surface, and these two were confused
 * once. The line trails the climb, so it is pressure to keep going rather than a
 * wall met once.
 */
export const FELL_BEHIND_GAP = 700 * SCALE;
