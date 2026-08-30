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
 * How much a press prefers a body **up the climb** to one below.
 *
 * *"Show all nearby planets on compass, both ahead and below, but when I'm
 * traveling and grabbing planets, somehow favor grabbing ahead planets more than
 * lower ones. This helps the game move upwards, but also lets players catch a
 * breath and go back down a rung"* (author, 2026-08-29).
 *
 * **A preference and not a rule**, and it had to be smooth. Spec
 * [01 · §3](../../docs/spec/01-swing.md) is emphatic that the grab is *"a fact
 * rather than a threshold"* and that *"a threshold is a cliff the player falls
 * off as a body drifts across an arbitrary line"* — so a flat penalty on
 * everything below the craft would put that exact cliff at the craft's own
 * altitude. What is weighted instead is **how far** above or below, saturating:
 * `rise / (1 + |rise|)` runs smoothly from −1 to 1 and is the same shape
 * [`gripOf`](../state/body.ts) and the tide already use.
 *
 * The rise is measured in the body's **own grab range**, which is a length it
 * already carries, so no new scale is invented and a big body's preference
 * reaches as far as its reach does.
 *
 * At 0.5 a body directly above at one full grab range beats one below at the same
 * distance unless the lower one is **2.3× nearer** the lead point — which is a
 * tie-break rather than a refusal, because the lead already puts the answer where
 * the player is going.
 *
 * **Swept over 200 pilot runs**, downward grabs fall 15.3% → 14.7% → 13.8% →
 * 12.8% → 9.5% across 0, 0.15, 0.3, 0.5 and 0.8, with the median climb unmoved
 * at 1 212 and the endings within noise. That is **weak evidence and says so**:
 * the pilot presses at sampled distances rather than choosing a target, so it
 * mostly measures the field's own geometry and not a preference. An opening
 * position, on the bench, and what settles it is the author flying it.
 */
export const CLIMB_BIAS = 0.5;

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
 * The shortest the clearance may take — spec 01 §4's 5 frames, 83ms at 60Hz and
 * inside its measured 80 – 90ms band.
 *
 * It is a floor rather than the duration now, and the reason the floor exists is
 * unchanged: *"a single-tick application is a failure however correct the
 * endpoint"*. What the player feels is a grab that gathers the craft up, and a
 * snap reads as the world moving rather than the craft turning. A small turn
 * still takes exactly this long, so nothing about the median grab has moved.
 */
export const CLEARANCE_TICKS_MIN = 5;

/**
 * The longest it may take.
 *
 * **A hard limit and not a preference**: the clearance asks each tick what is
 * still owed, and as the craft closes, a turn buys less angular momentum —
 * `r × speed` falls while the momentum the floor asks for does not. So a
 * clearance paid later is paid at a worse exchange rate, and past a point it
 * stops being able to turn for it and starts buying *speed* instead, which is
 * the failure [`clearance.ts`](./clearance.ts) exists to avoid.
 *
 * Ten is measured. Swept over 1 171 real grabs at 5, 6, 8, 10, 12 and 16 ticks:
 * the biggest single-tick turn between the press and the freeze falls from a p90
 * of 12.5° to 6.9° by ten, **three grabs in 1 171 come out worse**, and no
 * periapsis lands below the floor at any value. At twelve the count of grabs made
 * worse quadruples and spec 01 §5a's periapsis speed band starts failing.
 */
export const CLEARANCE_TICKS_MAX = 10;

/**
 * How fast the clearance may turn the craft, in radians per tick.
 *
 * **Derived from the thing it is handing the craft to.** Measured over 499
 * settled ticks across 200 runs, a settled orbit turns the nose p50 3.50° and
 * p90 **5.07°** per tick; a clearance that turns faster than the orbit it is
 * delivering the craft into is the thing that reads as a snap rather than as a
 * grab gathering the craft up. At five fixed ticks it turned **three and a half
 * times faster than that** — the turn owed is a median 59.5° over 554 real
 * clearances, which is 11.9° a tick.
 *
 * Where the time is there, the rate is honoured. Where it is not,
 * [`CLEARANCE_TICKS_MAX`](#) wins, because a clearance that ran out of approach
 * is worse than one that turned briskly (author, 2026-08-28, flying it).
 */
export const CLEARANCE_TURN_PER_TICK = (5.07 * Math.PI) / 180;

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
 * ## Measured at the body's **floor**, and not at the radius the dive stopped at
 *
 * **Ruled 2026-08-30**, and it is the third time this project has bent a real
 * equation on purpose: *"this is another instance where the real world equations
 * need to be bent, because at the end of the day we're chasing something that
 * feels really good, regardless of what physics says"* (author).
 *
 * The bound above used to be evaluated at the **freeze radius**, and escape speed
 * falls with radius — so it read as a speed limit that gets slower the further
 * out you are. A deep dive freezes close and never notices it; a **shallow,
 * glancing grab freezes far out, where the limit is low, and is slammed down to
 * it in one tick.** That is the fastest, loosest grab in the game being punished
 * hardest for being fast and loose. Traced on the author's own run: 1 606 → 1 244
 * (−23%), 1 209 → 859 (−29%), and **1 247 → 597 (−52%)**, with the radial part of
 * the velocity accounting for 0 – 5% of it. *"I had a nice release from a planet,
 * grabbed another, and immediately felt slowed down."*
 *
 * **And the reason the bound existed does not bind.** Its own comment was *"an
 * orbit cannot be ridden faster than the speed that would leave it"* — true under
 * gravity, and after the freeze there is no gravity: the craft rides a closed-form
 * phase clock ([`orbit.ts`](./orbit.ts)) and cannot leave anything. It was
 * braking for an escape that the freeze had already made impossible.
 *
 * So it is measured at the **floor** — the tightest orbit the body offers, and
 * the highest escape speed it has — which makes it one limit per body instead of
 * one per landing spot. It is still a bound and still the same 0.98 of one;
 * what changed is that it stopped depending on where the dive happened to stop.
 *
 * Measured over 120 pilot runs, on the thing that was the complaint:
 *
 * | | worst freeze | p10 | freezes losing over 20% |
 * |---|---|---|---|
 * | at the freeze radius | 54% kept | 67% | **91 of 333 — 27%** |
 * | **at the floor** | **67% kept** | **73%** | **53 of 374 — 14%** |
 *
 * It halves how often the game slams the craft and lifts the worst slam from
 * −46% to −33%. It also converts more captures — 374 against 333 — and doubles
 * the slowest exits in the corpus, p05 359 → 765.

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
 * How much faster a release leaves than it will be travelling a moment later.
 *
 * **Spec [01 · §8](../../docs/spec/01-swing.md) measured the prototype at ×1.8
 * and 0.45 is what was flown**: *"all of the velocity kicks are a bit too
 * intense, let's scale them back a touch"* (author, 2026-08-29). The measurement
 * stands as a measurement of that codebase; this is a different game with a
 * different camera, a different field scale and no hitstop under it, and
 * `VISION.md`'s seventh pillar is that a carried number is a starting position
 * and not an authority. **It is the first slider on the bench.**
 *
 * **The other 78% of the boost, and the half of ADR-0012 that was never built.**
 * That ADR replaced the hitstop with *"a kick on every release, scaled by the
 * quality of the swing"* and said it is *"bought with speed rather than with
 * stopped time"* — and `CONTEXT.md`'s **punch** is *"carried entirely by the
 * transient"*. [M2.4](../../docs/plan/m2-the-instrument.md) built the punch's
 * **feel**, on the craft's own stretch; this is its **speed**, and it is what the
 * author asked for after flying that: *"both a good capture and a good release
 * should provide a small kick to the ship's velocity, that fades after a bit,
 * scaled by the quality."*
 *
 * ## It does not bend the ray, and that is what makes it safe
 *
 * The thing that looked like it would forbid this is spec 01 §11: the compass is
 * a **solved reading** rather than a simulation *"because drift is a straight
 * line"*, so *"where do I let go to reach that body"* has a closed form. A burst
 * along the **exit tangent** adds no sideways component at all — the craft
 * covers the same ray, only faster — so the geometry the compass solves is
 * untouched, the same bodies are reachable, and the route is identical. What
 * changes is **when**: measured at the median exit speed, a body 700 design units
 * out arrives in 0.43s against 0.72s, **40% sooner**.
 *
 * ## What it costs, stated
 *
 * Spec 01 §9's *"speed constant to within 1 part in 10⁹ over 600 ticks"* is no
 * longer true of a craft that has just let go, and that tolerance is amended
 * rather than quietly broken. **The half of §9 that was load-bearing survives
 * exactly**: the heading is still constant to 10⁻⁶ radians, the path is still an
 * exact straight line, and coasting still applies no force — this is the release
 * spending what the release paid, not something coasting does to itself.
 */
/**
 * How much of the dive's own speed the **settle** leaves the orbit with, above
 * the circular speed at its floor.
 *
 * **Zero is the game spec 01 §6a describes**, and it is a governor: the settle
 * eases the momentum from what the dive earned all the way down to `circular`,
 * so *"by 1.2s every one of those dives is at exactly the circular speed at the
 * floor, however it arrived."* Every settled swing then leaves at the same speed
 * whatever brought it in — measured over the author's own 20 converted swings,
 * exit speed correlates with approach speed at **−0.93**, arriving fast (>950)
 * pays ×0.83 and arriving slow pays ×1.17, and the exits themselves cluster on
 * p50 **936** against a circular speed at the median floor of 940.
 *
 * Flown, that reads as being punished for going fast: *"I feel like I'm losing
 * zippy progress and am being unnecessarily slowed down by the game"* (author,
 * 2026-08-29). This is the dial that answers it, and the physics it bends is
 * §6a's, which was already deliberately inconsistent.
 *
 * **It cannot compound, and the reason is a clamp that is already there.** The
 * freeze holds the sweep below `FREEZE_ESCAPE_FRACTION` of escape speed at the
 * periapsis, and measured, that clamp binds on essentially every dive — so the
 * speed the settle eases *from* is near-constant whatever the approach was. What
 * this returns is therefore a **bounded lift on the setpoint**, not a share of
 * what the craft brought, and spec 01 §5a's flat speed-by-altitude survives it
 * by construction. Swept over six pilot runs, the fastest exit in the corpus is
 * **1 500 units/s at every value** — the governor still governs, and only where
 * it sits has moved.
 *
 * ## What the sweep says, over 120 pilot runs each
 *
 * | value | exit after a settle | a fast arrival pays | exit p05 | exit p50 | out of bounds |
 * |---|---|---|---|---|---|
 * | **0** | 971 | ×0.88 | 286 | 954 | 68% |
 * | 0.15 | 1 025 | ×0.93 | — | — | — |
 * | **0.30** | 1 080 | ×0.98 | **359** | 938 | 69% |
 * | 0.45 | 1 134 | ×1.03 | 681 | 966 | 73% |
 *
 * **0.30 is the value this file would recommend and it is the author's to rule.**
 * A fast arrival breaks even instead of paying 12%; the *slowest* swings in the
 * corpus get **25% faster** while the median does not move, which is the shape
 * the ask asked for — *"keep the game rewarding at all speeds"* — because what it
 * lifts is the floor of the distribution and not its middle. Spec 01 §8's
 * tolerance (median exit inside 840 – 1 050) and spec 01 §10's (out-of-bounds the
 * plurality at 60% or more) both still hold, which they do not at 0.45: there the
 * median leaves the band and a run is over in a third fewer ticks.
 *
 * **Ruled 0.30, 2026-08-29**, on the second asking and on that table: *"when I
 * captured it and entered orbit, I felt that my velocity dropped a bit too much
 * while circularising. Can we tweak that somehow to carry a bit more? I recall
 * from the original prototype that the orbital mechanics were not truly natural
 * to improve the game's feel, and I wonder if this is another instance of
 * that."* It is exactly that instance — §6a says so in its own words — and this
 * is the dial on it.
 *
 * **What it does not fix, and the distinction is worth keeping.** On the swing
 * that prompted it the craft went **1 031 at the freeze → 618 at tick 40 (−40%)
 * → 744**, and this dial moves only the last of those three numbers. The **dip**
 * is the frozen ellipse carrying the craft out to apoapsis, where it is far from
 * the body and therefore slow, and it is governed by
 * [`ECCENTRICITY_CAP`](#eccentricity_cap) instead — measured, dropping that from
 * 0.6 to 0.3 shallows the trough from −47% to −35% and changes where the craft
 * ends up not at all. **The dip is the oval**, which is the element the author
 * asked for and the compass is drawn on, so it is left alone and the cap stays
 * on the bench where spec 01 §13.5 already put it.
 */
/**
 * How much faster the craft rides a frozen orbit than the orbit itself implies.
 *
 * **The prototype's `phaseRate`, carried**, and its own config calls it *"sweep
 * rate vs. real orbital speed — the headline feel knob."* It sits at 1.0 there
 * and never moved, so what crosses is the **mechanism** and not a value: it is
 * the one lever that changes how fast an orbit reads without changing anything
 * about its geometry.
 *
 * It multiplies the angular momentum the phase clock is driven from, so the
 * sweep rate and the tangential speed scale **together** — `ω = L/r²` and
 * `v = L/r`. What that leaves alone is everything that decides *where*: the
 * radius at every angle, the shape the settle rounds toward, the periapsis the
 * rings are stacked on, and the exit tangent. So spec
 * [01 · §11](../../docs/spec/01-swing.md)'s compass is solved on exactly the same
 * geometry — the dot does not move — and spec 01 §7's envelope is a clock in
 * ticks and does not move either. **What changes is the pace of the orbit and
 * the speed a release leaves at.**
 *
 * It is the answer to *"can't we add a base speed boost to the general ship
 * velocity, without affecting the physics equations used for orbit
 * calculations?"* (author, 2026-08-30) — and the prototype had already built the
 * seam for it and left it at one.
 */
export const PHASE_RATE = 1;

export const SETTLE_RETURN = 0.3;

export const TRANSIENT_SHARE = 0.45;

/**
 * How long the burst takes to spend itself, in seconds — spec 01 §8's **1.3s**,
 * *"decaying linearly to nothing"*.
 *
 * Linear rather than exponential because §8 says so and because it has to **end**:
 * an exponential never reaches zero, and a craft that never quite returns to
 * constant speed is a craft whose coast is never the straight-line-at-constant-speed
 * the compass is solved on.
 */
export const TRANSIENT_SECONDS = 1.3;

/**
 * How much longer the burst carries at full quality, as a fraction of the span
 * above — spec 01 §8's parenthetical **×1.5**, and ADR-0012's *"half again as
 * long"*.
 *
 * Quality's second channel, and deliberately the gentler one: a mistimed release
 * still gets a burst, and what it loses is how far the burst carries it. The
 * craft's stretch is scaled on the same pair of curves
 * ([`punch.ts`](../state/punch.ts)), so the thing seen and the thing felt are one
 * reading of one number.
 */
export const TRANSIENT_STRETCH = 0.5;

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

/**
 * How hard that bounce pushes back.
 *
 * **0.2, and it was 0.6** (author, 2026-08-28). Spec 01 §10 states 0.6 without
 * marking it, and it is the prototype's, carried. Flown, it is a ricochet: over
 * 300 runs it turned the craft more than 90° in a single tick **16 times**, up
 * to 165°, on a manoeuvre the player did not make and cannot see coming — the
 * craft is holding one body and brushes another.
 *
 * Swept at 0.6, 0.4, 0.2, 0.1 and 0: the count of >90° flips falls 16 → 9 → 6 →
 * 5 → 1, and **below 0.2 the craft starts skidding** — the longest unbroken
 * contact goes from one tick to 44 at 0.1 and 86 at 0, which is a second and a
 * half of the craft sliding along a planet it is not holding. The endings barely
 * move across the whole range (out-of-bounds 218 → 205 of 300), so this changes
 * how a contact reads and not what the game is.
 *
 * 0.2 is where the flips are cut by two thirds and the skid has not started.
 * There is a symmetry argument under it too: the **floor** — the body actually
 * held — has restitution 0 and slides, and it was odd that a body you are *not*
 * holding pushed back harder than the one you are.
 */
export const BOUNCE_RESTITUTION = 0.2;

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
