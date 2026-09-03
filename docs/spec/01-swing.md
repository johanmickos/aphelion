# 01 · The swing — characteristics

**Board**: none. This spec is authored, per **ADR-0004**: *"the physics workstream opens by
naming the characteristics of the swing and mapping them onto the prototype's behaviour, and no
implementation of it is accepted until the author has flown both builds and signed off."*

This file is that naming. It was written in [M1.1](../plan/m1-the-swing.md) by measuring the
prototype, and it is the only artifact that carries the old feel across a repo boundary the
project has chosen to keep closed (ADR-0001). No file was copied and no line is linked; every
fact the rewrite needs is stated here, because the day the prototype stops being checked out is
the day it stops being consultable.

**Depends on**: [07 · Boundary](./07-boundary.md) for the boundary predicate,
[17 · The daily field](./17-daily-field.md) for the field the numbers have to survive,
[08 · The economy](./08-economy.md) for what a swing is worth. Spec
[02 · The release](./02-release.md) reads §7's envelope for the quality a release kick is scaled
by (ADR-0012), and is rebased on this file in M2.

---

## 0 · How to read the numbers in this file

Per [the spec README](./README.md), every figure says which of three kinds it is. In this file:

- **Measured** — taken from the prototype under the tuning described in §1, either from recorded
  phone sessions or from sweeps driving its own simulation headlessly. Cited with what was
  measured and how many.
- **Ruled** — an author decision, dated. There are few, and they are marked.
- **An opening position** — a plausible number with nothing behind it. There are three, and each
  says so in the sentence that carries it.

**Units.** All lengths are in the **prototype's world units**, whose field is 390 wide — because
that is what every measurement was taken in, and a spec that silently rescales its own evidence is
worse than one that does not scale it at all. This repo's design space is **1170 × 2532**
(ADR-0010, spec [00 · §7](./00-tokens.md)), exactly **3×** in each direction.

> **Conversion, ruled 2026-08-27 and confirmed by the author 2026-08-27 (§13.3 is closed).** To
> make the rewrite feel the same on the same phone, lengths, speeds and accelerations all scale by
> **k = 3**, and the gravitational parameter by **k³ = 27** (it has units of length³ / time²).
> **Times, angles, ratios and tick counts are unchanged.** So `μ` becomes 148 500 000, the
> softening length 54, the floor gap 36 — and every duration, every angle and every fraction in
> this file transfers untouched. The simulation carries the factor as one constant
> (`SCALE` in `src/sim/units.ts`) and derives every length from it and from the figure stated
> here, so both numbers stay visible at the point of use.

Wherever a characteristic can be stated as a ratio, an angle or a duration, **it is**, and the
tolerance is written on that form. Those survive the conversion; absolute pixel figures are given
for scale and are the weaker statement.

**Tolerances.** Every characteristic below carries one, because M1.3's acceptance is that each
becomes an automated test. A tolerance is a band the rewrite must land inside, not a target to
reproduce: the physics is being rewritten (ADR-0004) and bit-equality with the prototype is
explicitly not the goal.

---

## 1 · What was measured, and against what

The prototype at `~/git/aphelion`, at its commit **`ff13a5d`** — *"Make the punch big and make
all of it fade"*. Its simulation behaviour version is **28**. The prototype moved on during the
measuring, and what has landed since is a `strange` flag and a `type` string on a body: metadata
with no arithmetic in it, so nothing below is stale against it.

Two sources, used for different things.

**Recorded sessions.** 67 diagnostics reports from real phone play. Of those, **6 ran a physics
configuration identical to the prototype's current tuning** — the others differ in at least one
key that changes the shape of a swing, and are excluded rather than averaged in, because
`VISION.md`'s seventh pillar rules that the standing hazard is staleness and that a threshold
measured under tuning that has since moved is worse than an unmeasured one.

That cohort is **474 seconds of play, 278 presses, 270 grabs, 95 converted swings released, 24 run
endings**, over a field of 60 bodies. Its remaining config differences are in the finish carpet,
the release punch and the escape fling — none of which touch anything characterised below.

**Sweeps.** The prototype's own simulation, driven headlessly under that tuning against a single
body of radius 44 (the field's median), with the approach geometry set exactly: the craft placed
at a chosen distance with a chosen speed and a chosen impact parameter, then grabbed. This is
where the functional relationships come from; the sessions are where the percentiles come from.

**Fidelity.** Three of the six sessions replay bit-faithfully on this machine (max position
difference 0.01px, 0.01px and 0.46px over their checkpoints). The prototype records a real caveat
that this file inherits: `sin`, `cos` and `atan2` are engine-approximated, the phase clock calls
them every tick, and a long unbroken swing amplifies the difference — so figures drawn from late
in a long session are weaker evidence than figures drawn from early in one. Where a number below
comes from the sessions' **own recorded scoring**, rather than from a replay, it says so; those
are evidence about the session and are immune to the drift.

---

## 2 · Gravity

`μ` and `ε` below are the standard names for a gravitational parameter and a softening length.
They are **not** carried config keys, and nothing requires the rewrite to hold them under those
names or at all — the row that matters is the first one, which is a curve a test can sample.

| Property | Value | Kind |
|---|---|---|
| Force law | `a(r) = μ / (r² + ε²)`, directed at the body | Measured |
| `μ` — gravitational parameter | 5 500 000 (units³/s²) | Measured |
| `ε` — softening length | 18 | Measured |
| Departure from inverse-square | 9.4% weaker at the floor (r ≈ 56), 3.1% at r = 100, 0.8% at r = 200 | Measured |
| Where gravity acts | **Only while a body is held, and only from the held body** | Measured |

Three things here are surprising enough to state plainly, because a rewrite will get all three
wrong by default.

**Gravity is not ambient.** A coasting craft feels no force from anything. Measured: 300 ticks (5
simulated seconds) of coasting leave the speed **bit-identical** — not nearly constant,
identical. The field is not an n-body problem and never was; it is a sequence of two-body problems
with straight lines between them. That is also what makes the compass exactly solvable (§11).

**A held craft feels only its own body.** Other bodies contribute a bounce if touched, never a
pull. So a swing is genuinely one grab, one body, one orbit — the unit `CONTEXT.md` names.

**Mass is not a function of radius.** Every body in the prototype has the same `μ` regardless of
its radius, which runs 34.3 – 55.5 in the generated field. Radius sets only the orbit floor and the
collision surface. Spec 01's brief asked for "the mass-to-radius relation"; **there is not one to
carry**, and inventing one here would be exactly the kind of plausible number this project
refuses. See §13.

> **Tolerance.** Coasting speed constant to within 1 part in 10⁹ over 600 ticks. Acceleration
> under a held body within **2%** of `μ / (r² + ε²)` at every radius from the floor to the
> grab range. No measurable acceleration on a coasting craft from any body at any distance.

---

## 3 · The grab

One press. It takes exactly one body, and the choice is a fact rather than a threshold.

| Property | Value | Kind |
|---|---|---|
| Range | **560** — a body further away than this is not on offer | Measured |
| Which body | Nearest to `position + velocity × 0.2s`, not nearest to the craft | Measured |
| Refusal: out of range | Nothing within 560 | Measured |
| Refusal: too late | The heading ray strikes the body **and** the craft is within ≈ 32.5 of its surface | Measured |
| Conserved across the grab | **Position exactly. Velocity exactly**, unless §4 fires | Measured |

**The lead is not a cone.** The query point is displaced by two tenths of a second of the craft's
own velocity, so the question asked is *"which body am I arriving at"* rather than *"which body am
I beside"* — and it is continuous in both position and velocity, costing nothing at rest. A
heading test, a closing-speed rule or a cone all need a threshold, and a threshold is a cliff the
player falls off as a body drifts across an arbitrary line. Keep the displacement; do not
reintroduce the line.

**The range is generous relative to what is used.** Measured over 270 real grabs, the distance to
the grabbed body was p05 92, p25 120, p50 150, p75 222, p95 351 — so the reach is about 1.6× the
p95 actually taken. Of 278 presses in 474 seconds, **270 grabbed, 7 were refused for range (2.5%)
and 1 for being too late (0.4%)**. No press was refused for any other reason. A rewrite whose
refusal rate is materially higher has made the grab a skill it is not.

> **Tolerance.** Grab range within **±10%** of 560 (×3 = 1680 in design units). Refusal rate over
> a comparable corpus of real presses **below 5%**, with the too-late refusal below 1%. The chosen
> body must be the one nearest to the lead-displaced point in **100%** of cases — this is exact,
> not statistical.

---

## 4 · Clearance: what a grab does to a path that was going to miss

A press does not merely attach the craft to a body; where the path it was on would strike the
surface, the grab lifts it clear. This is the single most load-bearing behaviour in the swing and
the easiest to get wrong.

| Property | Value | Kind |
|---|---|---|
| When it fires | The unperturbed periapsis of the current path is inside the floor | Measured |
| Floor | `minR = R + 12`; for the field's radii, **46.3 – 67.5** | Measured |
| What it does | Turns the velocity toward tangential **at constant speed** wherever a turn alone suffices | Measured |
| When a turn is not enough | Adds speed, capped at **0.98 × local escape speed**, then turns for the rest | Measured |
| How it arrives | Eased at **no more than 5.07°/tick**, over **5 – 10 frames** — never a snap | Measured |
| How often it fires | **54%** of 270 real grabs | Measured |
| Total Δv when it fires | p05 0.4, p25 28, p50 52, p75 124, p95 194, max 281 | Measured |
| Turn applied | 3.6° – 62° across the sweep, largest on head-on dives | Measured |

**Turning first is the whole design, and it was learned expensively.** Simply adding tangential
speed is the textbook way to raise a periapsis and it is also a free energy injection: the
prototype measured it handing a craft at half its escape speed up to 277 units/s and putting it
*above* escape, so the grab never reached its own closest approach, coasted, and left the field —
reported by its author as *"I kind of shot off the planet at super speed"*. Rotating the velocity
toward tangential at constant speed raises angular momentum, and therefore periapsis, for nothing,
and **cannot unbind the craft by construction**. Where turning alone still falls short, the floor
in §5 catches the remainder — expensive, but survivable, where being flung out of a grab is
neither.

**And a grab converts a lethal line into an orbit.** Measured: a straight approach that would
strike the body kills a coasting craft on contact; the same approach, grabbed, reaches a stable orbit
at 339 units/s. One second after the press, a grabbed path has separated from the line it was on by
11 – 154 units, bending the heading by up to 122°.

**The rate is the characteristic; the duration is the consequence** (author, 2026-08-28, flying
it). This spec used to measure only the *time* — five frames, 80 – 90ms — and say nothing about how
fast the craft turned in it. With a fixed duration and a turn that runs 3.6° to 62°, the rate
between two grabs varied seventeenfold, and the tail is what reads wrong: **47% of grabs owe a
clearance, the median one owes 59.5°, and five frames of that turns the craft at 11.9° a frame.**
Measured against the thing it is handing the craft to, that is three and a half times too fast — a
settled orbit turns the nose p50 3.50° and **p90 5.07°** per frame, over 499 settled frames.

So the bound is the orbit's own rate and the ease takes as long as its turn needs. Where the time
is not there the **ten-frame cap wins**, because the clearance re-asks each frame what it still
owes and a turn buys less angular momentum the closer the craft gets — a clearance paid later is
paid at a worse exchange rate, and past a point it stops turning and starts buying speed, which is
the failure this section exists to avoid. Ten is measured: swept over 1 171 real grabs at 5, 6, 8,
10, 12 and 16 frames, the biggest single-frame turn between the press and the freeze falls from a
p90 of **12.5° to 6.9°**, three grabs in 1 171 come out worse, and no periapsis lands below the
floor at any value. At twelve, §5a's periapsis speed band starts failing.

> **Tolerance.** Clearance fires on **50 – 60%** of real grabs. Where it fires, the resulting
> periapsis is **≥ the floor** on 100% of grabs — this is exact. Speed after the impulse is
> **≤ 0.98 × local escape speed** on 100% of grabs, so no grab can eject the craft it caught. The
> impulse spreads over **at least 80 – 90ms** of simulated time and never more than 167ms; a
> single-tick application is a failure however correct the endpoint. Over a corpus of real grabs
> the biggest single-frame turn between the press and the freeze is **p90 ≤ 7°**.

---

## 5 · The dive, and the freeze

The swing is **real physics with three authored transitions in it**, and that combination is the
design rather than a compromise (author, 2026-08-27). The transitions are:

1. **The clearance impulse at the grab** (§4) — lifts a striking path clear of the floor, by
   turning at constant speed wherever turning suffices, so it cannot invent energy.
2. **The freeze at closest approach** (§5, §6) — hands the craft from integrated gravity to a
   closed-form phase clock, clamping the orbit's *shape* while carrying the dive's *speed*
   uncapped. §6a is the whole of why that inconsistency is deliberate.
3. **The 1.2s settle** (§6) — eases angular momentum from what the dive earned to what a circle
   needs, spending the advantage on a fixed clock.

Everything between them is simulated and must stay so. Between the press and the closest approach
the craft is on **real integrated gravity and nothing else**. Nothing authors the shape of a dive. That decoupling — clearance, then simulated shape,
then authored depth only at the end — is what took the prototype sixteen failed attempts, and
the failures were all the same failure: rigid or snapped orbit insertion. **Keep the dive
simulated.**

At the first radius minimum while the button is held, the orbit **freezes**: the craft is handed
from integrated gravity to a closed-form phase clock, and `VISION.md`'s second pillar starts its
stopwatch here.

> ## ⚠ Ruled, 2026-08-30 — the freeze's escape bound is measured at the floor
>
> **The bound was a speed limit that got slower the further out you froze.** §6 holds the frozen
> sweep below `FREEZE_ESCAPE_FRACTION` of escape speed, and it was evaluated at the **radius the
> dive stopped at**. Escape speed falls with radius, so a deep dive never noticed it and a
> **shallow, glancing grab — which is the fastest, loosest grab in the game — was slammed down to
> it in a single tick.** Traced on the author's own run: 1 606 → 1 244 (−23%), 1 209 → 859 (−29%),
> and **1 247 → 597 (−52%)**, with the radial part of the velocity accounting for 0 – 5% of it.
> *"I had a nice release from a planet, grabbed another, and immediately felt slowed down."*
>
> **And the reason the bound existed does not bind.** Its own words were *"an orbit cannot be
> ridden faster than the speed that would leave it"* — true under gravity, and after the freeze
> there is none: the craft rides a closed-form phase clock (§6) and cannot leave anything. It was
> braking for an escape the freeze had already made impossible.
>
> So it is measured at the body's **floor** — the tightest orbit it offers, and its highest escape
> speed — which makes it one limit per body rather than one per landing spot. Measured over 120
> pilot runs:
>
> | | worst freeze | p10 | freezes losing over 20% |
> |---|---|---|---|
> | at the freeze radius | 54% kept | 67% | **91 of 333 — 27%** |
> | **at the floor** | **67% kept** | **73%** | **53 of 374 — 14%** |
>
> It halves how often the game slams the craft, lifts the worst slam from −46% to −33%, converts
> more captures (374 against 333) and doubles the slowest exits in the corpus (p05 359 → 765).
>
> **What it costs this file, stated.** §5a's arrival band is now measured against escape at the
> **floor** rather than at the local radius, and in that form it is *tighter* than it was: the
> whole of §5b's sweep lands in **0.65 – 0.98** where it used to run 0.72 – 1.81 against the local
> radius, and the top of it is `FREEZE_ESCAPE_FRACTION` exactly. §6a's settled speed sits up to
> **1.4×** its own circle against 1.2 before. And §8's median exit leaves its 840 – 1 050 band, at
> **1 102** — the third tolerance in this file bent this week, and bent on the same principle the
> author stated when they ruled it: *"this is another instance where the real world equations need
> to be bent, because at the end of the day we're chasing something that feels really good,
> regardless of what physics says."*

### 5a · Speed and radius at closest approach

This is the headline characteristic and it is not the one a physics intuition predicts.

**Periapsis radius is pinned at the floor across almost the whole envelope.** Over a sweep of
approach speeds 60 – 260 units/s and impact parameters from 0 to 0.55 of the grab distance, the
frozen radius lands between **56.0 and 58.7** against a floor of 56 — within 5% of the floor
everywhere. It escapes the floor only above an impact parameter of roughly **0.6 of the grab
distance**, where the natural path already clears. Real play agrees: p25 53.0, p50 59.1, p75 67.4,
against a floor that runs 46.3 – 67.5 for the field's radii.

**Periapsis speed is a narrow band, and the approach barely moves it.** Over a **four-fold** range
of approach speed the frozen speed lands between **340 and 440 units/s**. Stated dimensionlessly,
which is the form that survives everything: `v_peri / v_escape(r_peri)` = **0.77 – 0.99**. Real
play: p05 217, p25 349, p50 406, p75 438, p95 459.

**The dive normalises speed.** That is the sentence to carry. The ratio of frozen speed to approach
speed is p50 **1.51**, but p05 0.99 and p95 4.18 — a slow approach is accelerated and a fast one is
barely changed, and both arrive at roughly the same place doing roughly the same thing. It is why
the top of the field is not faster than the bottom: measured over 474 seconds and eight altitude
bands up to 11 129 units of a 12 120-unit field, **median speed is flat at 260 – 300 units/s in
every band**. The escalation `VISION.md` hoped was emergent in accumulated speed is not there, and
this is the reason.

### 5b · How long the dive takes

| Source | p05 | p25 | p50 | p75 | p95 |
|---|---|---|---|---|---|
| Real play, grab → freeze (s) | 0.15 | 0.30 | **0.42** | 0.82 | 2.13 |

Across the sweep it runs 0.33s (close and fast) to 2.63s (far and slow), rising with grab distance
and falling with approach speed. **It is the player's only lever on the timing in §11**, and the
whole reason the tension there is a skill rather than a reflex.

> **Tolerance.** Over a sweep of the real-play envelope (grab distance 90 – 350, approach speed
> 60 – 400, impact parameter 0 – 0.6 of grab distance): frozen radius within **±8% of the floor**;
> `v_peri / v_escape(r_peri)` inside **0.72 – 1.00**; frozen speed to approach speed at p50 inside
> **1.3 – 1.7**. Over real recorded play: median dive **0.30 – 0.55s**, p95 **below 2.6s**. And the
> flatness is itself a test — **median speed in the top altitude band within ±20% of the bottom
> band's**, because a rewrite that quietly compounds speed up the field has broken spec
> [17](./17-daily-field.md) before spec 17 is written.

---

## 6 · The orbit

After the freeze the craft is no longer integrated. It rides a **phase clock**: an ellipse that
tightens toward a circle on a fixed schedule, swept by an angular rate derived from angular
momentum. This is closed-form and therefore cannot accumulate integration error.

| Property | Value | Kind |
|---|---|---|
| Shape at the freeze | An ellipse through the craft's actual position, treating it as periapsis | Measured |
| Eccentricity | From the dive's **peak** energy, not its instantaneous speed, **capped at 0.6** | Measured |
| Real-play eccentricity | p25 0.58, p50 **0.60**, p75 0.60 — the cap binds on most swings | Measured |
| Radius over time | Tightens toward a circle at the periapsis radius over **1.2s**, on a smootherstep | Measured |
| Angular rate at the freeze | `v_peri / r_peri` — measured 400 – 450 °/s | Measured |
| Angular rate settled | `√(μ/r) / r` — measured 320 °/s at r = 56 | Measured |
| Revolution, settled | **1.12s** at the median body (R 44); 0.84s smallest, 1.49s largest | Measured |

**Eccentricity comes from the dive's peak energy for a reason.** A head-on dive that clips the
floor loses radial speed to the clamp, and reading the instantaneous speed at the freeze would
flatten its oval into a circle — turning the most committed approach in the game into the least
interesting orbit.

**Why the radius has to tighten rather than hold.** As the orbit rounds toward a circle, holding
the oval's angular momentum would spin that small circle at periapsis speed forever. Angular
momentum is eased toward the circular value over the same 1.2s, which is what keeps the handover
seamless. A rewrite that rounds the shape without easing the momentum will produce an orbit that
looks right and moves wrong.

> ## ⚠ Ruled, 2026-08-29 — §6a's governor keeps 30% of the dive
>
> *"When I grab planets at farther distances, my velocity is cut down a noticeable and unpleasant
> amount. I feel like I'm losing zippy progress and am being unnecessarily slowed down by the
> game... I think we need to bend physics here to make gameplay feel better. How can we address
> this feeling, and keep the game rewarding at all speeds?"* (author, 2026-08-29).
>
> **The measurement first, because the attribution is inverted.** Over the author's own 20
> converted swings, `exit ÷ approach` correlates with **approach speed at −0.93** and with **grab
> distance at +0.77** — far grabs *gain*. Arriving fast (>950) pays **×0.83**; arriving slow pays
> **×1.17**. The exits themselves cluster on p50 **936**, against a circular speed at the median
> body's floor of **940**. Swept headlessly, exit speed is ~970 at **every** grab distance from 300
> to 1 200 and at every approach speed. It is not a distance effect. **It is a governor**, and this
> section is where it lives: the settle eases the momentum from what the dive earned all the way
> down to `circular`, so nothing about the approach survives it.
>
> §8's non-monotone curve is the same fact seen along the hold: **1 298 at the freeze, 712 at tick
> 30 (−45%), back to 976 by 72 and flat after** — this repo reproducing §8's measured 411 → 248 →
> 326 (×3: 1 233 → 744 → 978) almost exactly. The simulation is faithful; what is missing is that
> the player has no way to see it, and the boost's plateau (ticks 27 – 72) sits directly on the
> exit-speed trough (tick 30).
>
> **`SETTLE_RETURN` is built and ships at zero**, which is arithmetically this section unchanged.
> It is what the settle eases *toward*: `circular + SETTLE_RETURN × (what the dive earned −
> circular)`. It cannot compound, and the reason is already in this section — the freeze clamps the
> sweep below escape speed and that clamp binds on essentially every dive, so what the dial moves
> is the **setpoint** and not a share of what the craft brought.
>
> Swept over 120 pilot runs at each value:
>
> | value | exit after a settle | a fast arrival pays | exit p05 | exit p50 | out of bounds |
> |---|---|---|---|---|---|
> | 0 — before | 971 | ×0.88 | 286 | 954 | 68% |
> | **0.30 — ruled** | 1 080 | ×0.98 | **359** | 938 | 69% |
> | 0.45 | 1 134 | ×1.03 | 681 | 966 | 73% |
>
> **0.30 is what the evidence recommends.** A fast arrival breaks even; the **slowest** swings in
> the corpus get 25% faster while the median does not move, which is the shape *"rewarding at all
> speeds"* asks for — it lifts the floor of the distribution rather than its middle. §8's tolerance
> (median exit inside 840 – 1 050) and §10's (out-of-bounds the plurality at 60% or more) both
> still hold; at 0.45 the median leaves the band and a run is over in a third fewer ticks.
>
> **Ruled 0.30 on the second asking**, after the author flew a capture and traced it: *"when I
> captured it and entered orbit, I felt that my velocity dropped a bit too much while
> circularising. Can we tweak that somehow to carry a bit more? I recall from the original
> prototype that the orbital mechanics were not truly natural to improve the game's feel, and I
> wonder if this is another instance of that."* **It is that instance** — this section says so in
> its own words — and the recollection is exactly right.
>
> **What it changes in this file, stated rather than implied.** §6a's *"the settle spends it"* is
> now *the settle spends most of it*: measured over the whole envelope, the settled speed sits
> **1.00 – 1.20× its own circle** with a spread of under 15%, against a freeze that hands out
> 20 – 45%. So **two thirds of what a dive earns is still gone by 1.2s and nothing more goes
> afterwards** — the shelf life survives, and what it is a shelf life *of* is now the difference
> rather than the whole. §6a's sentence that matters is *"no dive keeps a permanent edge"*, and the
> step is bounded and does not grow with the approach, so it holds.
>
> The settled orbit is therefore a circle **ridden faster than a circle should be ridden**, which
> is this section's third disagreement rather than a fourth: the floor sets the radius, the cap
> sets the shape, and the dive now keeps a share of the speed. `test/sim/freeze.test.ts` asserts
> both halves, because the pair is the mechanism.
>
> **What it does not fix.** On the swing that prompted it the craft went **1 031 at the freeze →
> 618 at tick 40 (−40%) → 744**, and this moves only the last number: 744 becomes about 1 046, and
> ×0.73 of the approach becomes ×1.02. The **dip** is the frozen ellipse carrying the craft out to
> apoapsis where it is far from the body and slow, and it is [`ECCENTRICITY_CAP`](#)'s — measured,
> 0.6 → 0.3 shallows the trough from −47% to −35% and changes the settled speed not at all. **The
> dip is the oval**, which is the element the author asked for and the compass is drawn on, so it
> is left alone and the cap stays on the bench where §13.5 put it.
>
> `SIM_VERSION` is **5**; every recipe recorded before it is refused.

### 6a · The floor sets the radius, the cap sets the shape, the dive sets the **speed**

This is the mechanism the whole swing turns on, it is not what a physics engine does by default,
and a tidy-minded rewrite will delete it. Confirmed by measurement, author 2026-08-27.

Same body, same grab distance, head-on, varying only the approach speed:

| Approach | a | e | periapsis | apoapsis | speed at the freeze | ← speed at 0.3 / 0.6 / 0.9 / **1.2s** |
|---|---|---|---|---|---|---|
| 80 | 119.5 | 0.530 | 56.1 | 182.8 | 387 | 277 / 239 / 285 / **313** |
| 120 | 140.0 | 0.600 | 56.0 | 224.0 | 400 | 275 / 232 / 277 / **313** |
| 160 | 140.0 | 0.600 | 56.0 | 224.0 | 415 | 280 / 234 / 278 / **313** |
| 200 | 140.0 | 0.600 | 56.0 | 224.0 | 435 | 285 / 236 / 279 / **313** |
| 260 | 140.0 | 0.600 | 56.0 | 224.0 | 435 | 285 / 236 / 279 / **313** |

Read the middle four rows. **The ellipse is identical** — same semi-major axis, same eccentricity,
same periapsis, same apoapsis — and the craft rides it at **400, 415, 435, 435**. A faster dive
does not buy a different orbit. It buys **the same orbit, flown faster.**

Three separate quantities produce that, and they are deliberately not consistent with each other:

- **The floor sets the radius.** Periapsis lands on `R + 12` for essentially every dive (§5a).
  Swept from a gap of 4 to 24, it is **never breached at any setting** — the floor is a floor, not
  a suggestion. The gap is low and it is a **feel choice**: 16 read as too loose and 10 as a touch
  tight, and below 8 the craft would clip the surface. Nothing else in the swing depends on it.
- **The cap sets the shape.** Eccentricity is clamped at 0.6, and the clamp binds on all but the
  slowest dives — which is why four of five rows above are the same ellipse.
- **The dive sets the speed, and the cap does not apply to it.** The sweep rate is seeded from the
  dive's **peak** orbital energy, uncapped. So the craft sweeps an e = 0.6 oval at a rate derived
  from an orbit that would have been more eccentric than that. **This is physically inconsistent on
  purpose.** Making the two agree — the obvious correction — throws away the only channel by which
  the quality of a dive survives into the orbit.

**And the settle spends it.** By the end of the 1.2s every row above is at **exactly 313** — the
circular speed at the floor — however it arrived. The reward for a good dive is a speed advantage
with a **1.2-second shelf life**, and cashing it before it expires is the whole of §11's timing
problem. A rewrite where holding indefinitely preserves the advantage has removed the reason to let
go.

> **Tolerance.** Settled revolution period within **±10%** of `2πr / √(μ/r)`. Angular rate at the
> freeze within **±10%** of `v_peri / r_peri`. Eccentricity at the freeze **≤ 0.6** on 100% of
> swings, with p50 over real play inside **0.50 – 0.62**. Radius monotone toward the settled circle
> over the settle — **no overshoot at all**, which is exact. The floor is **never breached**, at any
> gap setting — exact, and it is the one guarantee a grab makes.
>
> And §6a is three tests, because it is three claims:
>
> 1. **Two dives differing only in approach speed produce the same frozen ellipse** — semi-major
>    axis and eccentricity within 1% — **and different sweep rates**, differing by at least 5%.
>    A rewrite that returns the same rate has collapsed the channel; one that returns a different
>    ellipse has let the cap leak into the shape.
> 2. **Speed at the end of the settle is the circular speed at the settled radius, within 1%, for
>    every dive** — so the advantage is fully spent and no dive keeps a permanent edge.
> 3. **Speed at the freeze exceeds the settled circular speed by 20 – 45%** across the real-play
>    envelope. Measured 1.24× – 1.40×; the band is the room the rewrite has.

---

## 7 · The boost envelope

Zero at the freeze. Ramps to peak, holds, decays to nothing. The plateau exists because completing
a circularisation used to guarantee missing the window it was meant to reward.

```
       1.0 |        ┌───────────────┐
           |       ╱                 ╲
           |      ╱                   ╲
           |     ╱                     ╲
       0.0 |____╱                       ╲______
           0   0.45           1.2         2.6   seconds after the freeze
              arm            settle      zero
```

**Stated as something a test can see from outside.** The boost is not a variable to be inspected;
it is **how much faster a release leaves than the orbit it left from**. Everything below is written
on that observable — exit speed measured against the orbital speed at the radius the craft let go
at — so a test never reaches inside the simulation and the rewrite is free to compute it however it
likes.

| Property | Value | Kind |
|---|---|---|
| Ramp | Linear, 0 → full over **0.45s** after the freeze | Measured |
| Plateau | Full boost held until the settle ends at **1.2s** | Measured |
| Decay | Linear, full → 0 over **1.4s**, reaching zero at **2.6s** | Measured |
| Full boost | `peak × (depth − ½) / ½`, floored at 0 | Measured |
| **Depth** | `(grab radius − periapsis) / (grab radius − floor)` — how far the dive committed | Measured |
| Peak | **60** units/s at full depth | Measured, and tuning — see §13 |
| Real-play full boost | p05 0, p25 38, p50 **59**, p75 60, p95 60 — the cap binds on most swings | Measured |

**Depth is an Aphelion quantity, not a carried variable.** It is stated as a ratio of two things a
test can measure — where the grab happened and where the craft got to — precisely so that it does
not require the rewrite to keep a number by that name. Whether the implementation stores it, derives
it, or never names it at all is not this file's business.

> ## ⚠ The safety catch was not catching anything, 2026-08-30
>
> The paragraph below is the spec's own statement of intent and it was **false as built**, because
> it guards the wrong channel. The boost is what the ramp gates, and the boost is worth 0 – 14
> design units/s on the swings in question. What a tap-through actually banks is the speed the
> **dive** gave it: gravity accelerates a falling craft and stops acting at the release (§2), so the
> way in was free and the way out was never charged.
>
> Measured over the **129 swings** in the author's dispatches:
>
> | When the swing let go | n | Median speed handed to the craft | Share that gained |
> |---|---|---|---|
> | **Never froze — released in the dive** | 27 | **+548** | **81%** |
> | Before the boost armed | 31 | +18 | 58% |
> | Armed, inside the settle | 19 | −235 | 37% |
> | Held past the settle | 52 | +71 | 56% |
>
> So the reflexive tap-through was the **best-paid move in the game**, at 7.7× a fully flown swing,
> and it was the only category where four releases in five came out faster. The author flew it and
> named it: *"my tap fly-bys towards the end were being rewarded with new speed despite not
> interacting much with the planets."*
>
> **§5a had already bent under it.** Its headline — *"median speed is flat at 260 – 300 units/s in
> every band"* — now reads **213, 307, 324, 299, 315, 356, 263, 349** over eight bands of the same
> corpus, and periapsis speed p95 is **502** against §5a's 440.
>
> **What is built** is `DIVE_PAYBACK` (`src/sim/units.ts`), which returns an unfinished swing toward
> the speed the press found it at. The heading a dive bent the craft onto is kept — that is the half
> worth having, and taking it would be taking a verb away. **It ships at ½ rather than 1**: full
> payback was flown the same hour and refused as *"too slow and anemic"*, which is its own finding —
> with the tap closed, `PERMANENT_SHARE × PEAK_BOOST` is about **40** units/s against approach speeds
> near 1 000, so nothing else in the game is an engine. What a well-flown swing should be worth is
> the open question underneath, and the author has named **fuel** as their answer.
>
> **Nothing in §7's own tolerance moved**: the envelope is measured on releases from a frozen orbit
> and never sees this. `SIM_VERSION` is 7 and every recipe recorded before it is refused.

**The ramp is the footgun's safety catch.** A reflexive tap-through earns almost nothing; you must
hold a moment to arm it. That is what turned the boost from an always-loaded weapon into a skill
window, and it is not negotiable.

**A dive pays only if it halves the gap.** A depth of ½ means, exactly:
`periapsis < (grab radius + floor) / 2`. Committing halfway to the floor is the price of admission,
and it is a clean statement a test can hold. Measured, the envelope of impact parameters that still
pay runs **0.67 – 0.99 of the grab distance**, tightening as the approach gets faster and the grab
gets longer: close and slow, almost any aim pays; far and fast, you must be within about seven
tenths.

**Depth is depth, not aim.** What the boost pays for is how far the dive committed, and nothing
about where the craft was pointing. The prototype's own design document claimed the opposite and
that mechanic was never implemented — so this is a place where the document and the program
disagreed, and the program is the evidence. Commit harder, hold tighter; the aim is paid for
separately, by the compass.

> **Tolerance**, and every one of these is read from exit speeds alone, with no access to the
> simulation's internals. Release the same swing at successive ticks and measure how much faster
> each release leaves than the orbital speed at its own release radius. That curve must: be
> **exactly zero at the freeze**; reach its maximum at **0.45s ± 0.05**; hold within 1% of that
> maximum until **1.2s ± 0.1**; reach zero at **2.6s ± 0.15**; and be **monotone non-decreasing
> before the plateau and non-increasing after it**, exactly. The paying threshold sits at
> `periapsis = (grab radius + floor) / 2` within **±3%**. Over real play, the median maximum is
> **≥ 0.9 of the largest seen**, because the cap binding on most swings is the measured shape and a
> rewrite where it rarely binds has made a different game.

---

> ## ⚠ Scaled back again, 2026-08-31 — the extension is gone
>
> **`TRANSIENT_STRETCH` is 0.** *"The release speed boost effect is a bit too fast right now. Can we
> scale it back a bit more?"* — the third message about this curve and the second asking for less of
> it while the peak stays where the first one put it. So the peak does not move: a release still hits
> 78% harder than it did before the square. What goes is the extension a good release earned.
>
> | | Peak | Span at full quality | Distance it adds |
> |---|---|---|---|
> | stretch 0.25 | 0.800 | 1.63s | 0.434 |
> | **stretch 0** | **0.800** | **1.30s** | **0.347**, −20% |
>
> Measured on the run they sent, the burst runs on **69% of ticks against 85%**. That is what *"too
> fast"* was describing: a span of 98 ticks against release gaps of 57 – 143 meant consecutive
> releases overlapped, so the craft was almost never *between* kicks. At 78 ticks most of them no
> longer do.
>
> **What it costs is a real idea.** ADR-0012's transient was *"half again as long at full quality"*,
> so a good release was paid in both amplitude and duration; it is now paid in amplitude alone. That
> is the cleaner of the two — a punch is a hit, and a hit that lasts longer is a push — and the
> **stretch** keeps the other reading, where length costs no speed.
>
> `SIM_VERSION` is 9.

> ## ⚠ The kick is a kick, 2026-08-31 — the transient is a square now
>
> **`burstOf` spends the transient on the square of what is left of its span rather than on a
> line**, at a share of **0.8** and with the good-release extension halved to 0.25. The author,
> having flown a deeper *stretch* and found it was the wrong half of the punch: *"I felt the kick
> upon release still isn't noticeable enough. When I release well I feel like the kick lasts too
> long, so I go REALLY fast. Let's scale that part back just a hair. More generally, though, I'd
> like for there to be more of an initial **kick** to the boost, that then fades away into the
> current feel."*
>
> Harder, shorter, and less of it on the release they said it about — three things no straight line
> can do at once, because raising a line's start raises everything under it. At full quality:
>
> | | Peak | Span | Distance it adds |
> |---|---|---|---|
> | 0.45, linear | 0.450 | 1.95s | 0.439 |
> | **0.8, squared** | **0.800** | **1.63s** | **0.434**, −1.2% |
>
> The two curves cross at **0.65s** — above the old line for the first two thirds of a second and
> below it after, which is *"an initial kick that then fades away into the current feel"* as
> literally as a curve can put it. A **poorer** release gains a few percent of distance instead of
> losing it, because its peak rises by the same 78% from a much lower start; that is the *"more
> generally"* half of the same sentence.
>
> **0.8 is this section's own measured number**, not a new one — and this does not reverse the
> ruling of 2026-08-29 that took the share from 0.8 to 0.45. That one was *"all of the velocity
> kicks are a bit too intense"*, a complaint about how much speed a release hands out, and the
> amount handed out is **lower** here than at 0.45. What went up is the peak, which is what was
> asked for both times: down when it was a long push, up now that it is a short hit.
>
> **What §8's tolerance still holds**: exit speed is the orbital speed plus the boost's permanent
> share, within 5%. The transient never enters `vx`/`vy` and is invisible to it. `SIM_VERSION` is 8
> and every recipe recorded before it is refused.

## 8 · The release

| Property | Value | Kind |
|---|---|---|
| Direction | **Exactly along the tangent** — measured as orbit angle − 90° × direction, every tick | Measured |
| Exit speed | The orbital speed at the release radius, plus the boost's permanent share | Measured |
| Permanent share | **22%** of the boost; the remaining 78% is a transient | Measured |
| Transient | **×1.8** on release, decaying linearly to nothing over **1.3s** (×1.5 that at full quality) | Measured |
| Real-play exit speed | p05 195, p25 274, p50 **314**, p75 346, p95 411 | Measured |

**Exit speed is not monotone in how long you hold.** Measured on one dive, releasing at successive
moments after the freeze: 411 units/s at the freeze, falling to **248 at 0.6s** as the settling
ellipse carries the craft out and around, back to 326 by 1.2s and flat thereafter. Holding longer is
not "more speed"; it is *a different angle at a similar speed*. That is precisely what makes the
timing a decision rather than a greedy accumulation, and a rewrite in which holding monotonically
pays has removed the choice.

**The split between permanent and transient is what keeps the game from ratcheting.** A release
that put all of its boost into permanent velocity would compound up the field forever; 22% keeps
the escalation bounded, and §5a's flat speed-by-altitude is the evidence it works.

> **Tolerance.** Exit direction within **1°** of the tangent on 100% of releases — this is exact,
> and it is the one thing `CONTEXT.md` fixes about a release. Exit speed within **±5%** of the
> orbital speed at the release radius plus the permanent share. Exit speed as a function of hold
> time must be **non-monotone**, with a trough of at least **20%** below the freeze value somewhere
> in the first second — a monotone curve fails this characteristic outright. Over real play, median
> exit speed inside **280 – 350**.

---

> ## ⚠ Built and amended, 2026-08-29 — §8's transient exists, and §9 gives up one word
>
> **§8's transient row was measured in M1.1 and never built.** This repo applied the 22% permanent
> share and nothing else, so ADR-0012's punch had its feel and not its speed. It is built now, on
> the author's ask: *"both a good capture and a good release should provide a small kick to the
> ship's velocity, that fades after a bit, scaled by the quality."*
>
> **§9 gives up *"exactly constant speed"* and keeps everything that sentence was for.** The burst
> runs along the exit tangent and **scales** a velocity rather than adding to one, so the heading
> is untouched to the last bit and the path is still an exact straight line. §9's own reason for
> the rule survives intact — *"because drift is a straight line, 'where do I let go to reach that
> body' has a closed-form answer, which is what makes the compass a solved reading rather than a
> simulation"* — and so does *"coasting earns nothing and costs nothing"*, because the burst is the
> **release** spending what the release paid, not something coasting does to itself. What its
> tolerance now reads is: heading constant to 10⁻⁶ radians over 600 ticks, exactly as before; speed
> constant to 1 part in 10⁹ **once the burst has run out**, which it does in under two seconds and
> to exactly zero.
>
> **The strength is 0.45 and not §8's measured 0.8.** Flown: *"all of the velocity kicks are a bit
> too intense, let's scale them back a touch"* (author, 2026-08-29). §8's ×1.8 stays a measurement
> of the prototype — a different camera, a third of this field's scale, and a hitstop underneath
> it — and `VISION.md`'s seventh pillar is that a carried number is an opening position, not an
> authority. It is on the bench.
>
> **What it changes about a run, and what it does not.** Same ray, same bodies reachable, same
> route; a body 700 design units out arrives **40% sooner**. `SIM_VERSION` is **4**, and every
> recipe recorded before it is refused.

## 9 · Coasting

**No drag. No gravity. No force of any kind.** A coasting craft travels in an exact straight line
at exactly constant speed. Measured: bit-identical velocity over 300 ticks.

This is not an approximation to be improved. The economy says coasting earns nothing and costs
nothing (`CONTEXT.md`, spec [08](./08-economy.md)), and the physics agrees with it exactly rather
than approximately. It is also load-bearing elsewhere: because drift is a straight line, *"where do
I let go to reach that body"* has a closed-form answer, which is what makes the compass a solved
reading rather than a simulation (§11).

> **Tolerance.** Speed constant to within 1 part in 10⁹ over 600 ticks of coasting. Heading constant
> to within 10⁻⁶ radians over the same. Both are effectively exact and should be written as such.

---

## 10 · Death

Four ways to end a run. Three are deaths; the fourth is the win.

| Ending | Predicate | Kind |
|---|---|---|
| **Impact** | Contact with any body while coasting, at `R + 5`, **unless** the approach is a near-parallel graze: lethal only when `−(v · n̂) / \|v\| > 0.18` | Measured |
| **Out of bounds** | Leaving the corridor sideways by more than 4 units, or falling out of the bottom | Measured |
| **Fell behind** | 700 units below the high-water mark. The mark **does not advance while a body is held** | Measured |
| **Cleared** | Above the point where the last body has gone out of grab range | Measured |

**Contact while a body is held never kills.** It bounces: against the held body at `R + 12` with
zero restitution — the floor — and against any other body at `R + 6` with **0.2** restitution. The
same geometry is lethal coasting and safe held, and that asymmetry is the rule, not an oversight: a
grab is a promise that you will not be killed by the thing you grabbed.

> **0.2, and it was 0.6** (author, 2026-08-28). The prototype's 0.6 was carried unmarked, and flown
> it is a ricochet: over 300 runs it turned the craft more than 90° in a single frame **16 times**,
> up to 165°, on a manoeuvre the player did not make and cannot see coming. Swept at 0.6, 0.4, 0.2,
> 0.1 and 0, the count of those flips falls 16 → 9 → 6 → 5 → 1 — but **below 0.2 the craft starts
> skidding**, the longest unbroken contact going from one frame to 44 at 0.1 and 86 at 0. Endings
> barely move across the whole range (out-of-bounds 218 → 205 of 300), so this changes how a contact
> reads and not what the game is. There is a symmetry under it: the **floor** slides at 0, and a
> body you are *not* holding should not push back harder than the one you are.

> ### ⚠ It does not bounce on the frozen orbit, and the author flew into it (2026-09-03)
>
> > *"I orbit a planet, but I seem to go THROUGH the one next to it rather than bounce against
> > it."* — author, on `diagnostics/2026-09-03T19-21-50-528Z`
>
> **The sentence above is unconditional and the implementation is not.** `bounceOffOthers`
> (`src/sim/contact.ts`) is exactly this rule and it is called from the **dive** and from nowhere
> else. The **frozen orbit** — the half of a hold that runs after the freeze — resolves no contacts
> at all, so the craft passes through any body its orbit crosses.
>
> It is deliberate rather than an oversight, and `contact.ts` says so: on the frozen orbit the
> craft's position is authored by the phase clock and rewritten every tick, so a bounce applied
> there would be overwritten before it meant anything. The prototype draws the same line in the
> same place. **What is missing is this spec's agreement**, and this notice is that gap recorded
> rather than either side being quietly bent.
>
> **Measured over the 37 replayable dispatches**: it happens in **3 runs (8%)** and on **41 ticks
> (0.088%)** of all play. The author's run is the worst in the corpus by a factor of four — twice
> through body #4, 12 ticks then 17, reaching **48 design units past the surface of a 150-unit
> body, 31% of the way through it**. So it is rare, and when it happens it is unmistakable.
>
> ### ⚠ And the cause is the **field**, not the physics (measured 2026-09-03)
>
> > *"Is the reason that there are planets so close to each other? I haven't encountered this in the
> > original prototype, but its planetary spacing is different."* — author
>
> **Yes, and the prototype's mechanism is identical to ours.** Its `stepCapture` runs
> `stepPhysical` — which holds its `capture-other` contact loop — only while the phase is `clear`
> or `flyby`, and hands off to `stepPhase`, its phase clock, at the freeze. So neither game bounces
> on a frozen orbit. The comment in `contact.ts` was right and this is what it was right about.
>
> **What differs is the geometry, by an order of magnitude.**
>
> | | closest rim-to-rim pair |
> |---|---|
> | the prototype's authored eight | **1 721** design units |
> | this field, scatter v1 | **162** design units |
>
> A frozen orbit reaches **p50 300 and p95 708** design units. In the prototype an orbit
> **physically cannot reach** the next body; here **16% of all 241 frozen orbits in the corpus are
> wider than the room to their nearest neighbour**, and three of them actually crossed one.
>
> **All three were on a fork.** A fork is two bodies at one altitude, and this field draws four of
> them at rim gaps of 162, 223, 270 and 646 — the prototype's authored eight has none, its sides
> strictly alternating one body to a row. The two clipping bodies, #5 and #10, are the 162 and the
> 223. **Even the widest fork drawn does not clear a p95 orbit**, and the corridor is not wide
> enough for one that would: the bodies span 1 026 units of it and the largest radius is 168.
>
> So `RIM_GAP` — spec [17 · §5](./17-daily-field.md)'s invariant 3, 40 m — is doing the job it was
> written for, which is stopping two bodies from *overlapping*. **Nothing in either spec asks the
> field to leave room for an orbit**, and that is the gap.
>
> **A fifth way out, and it is the cheapest and the only one that matches the prototype:**
>
> | | what it does | what it costs |
> |---|---|---|
> | **e** · the field's clearance accounts for the orbit, not just the rims | the geometry stops arising, which is exactly why the prototype never shows this | `SCATTER_FIELD_VERSION` → 2, refusing the **18** dispatches flown in it; the 69 fixture ones are untouched. Sparser rows, or no forks, or a wider corridor — a real design decision about the field's density |
>
> **Four more, and all four move `SIM_VERSION` to 10** — which refuses
> all 29 replayable dispatches, a cost `docs/plan/m3-the-field.md` deliberately schedules for after
> M4's fuel:
>
> | | what it does | what it costs |
> |---|---|---|
> | **a** · re-freeze on contact | the orbit is recomputed from the contact, so the craft leaves along a real path | a grab silently becomes a different orbit; the compass the player was reading is gone mid-swing |
> | **b** · the hold breaks on contact | you hit something, the promise ends, and the craft coasts and bounces as §10 already says | the biggest gameplay change of the four, and it can end a run the player thought was safe |
> | **c** · push the craft out along the normal after `placeOnOrbit` | the clipping stops and the orbit is untouched | the craft leaves its own drawn path, which is the one thing the compass promises it will not do |
> | **d** · refuse a freeze whose orbit crosses another body | the geometry never arises | the settle decays the orbit, so an orbit that cleared at the freeze can cross later |
>
> ⚠ **(e) is now the recommendation** and (a) – (d) are what to reach for only if the field's
> density is not negotiable. It is the cheapest in corpus terms, it touches no physics at all, and
> the author's own evidence — *"I haven't encountered this in the prototype"* — is evidence about a
> **field**, because the prototype's code does the same thing ours does.
>
> **The graze exemption exists to preserve a real manoeuvre.** Flinging tangentially past a body you
have just left is legitimate flying, and at 0.18 the exemption covers it without covering anything
that reads as a crash.

**The high-water mark is held during a grab for a measured reason.** An orbit is a round trip, and
the height gained going round its near side is not ground kept. Counting it put the fell-behind line
at the orbit's apex — which the far side of that same orbit then flew straight into, killing a
craft that had not lost a unit of altitude. (**Floor** is the orbit's floor and nothing else; the
line that trails the climb is the **fell-behind line**, and they are 700 units and a whole run
apart.)

**Measured distribution over 24 real endings**: 20 out of bounds (83%), 2 impact (8%), 2 fell
behind (8%). No session in the cohort reached the top. `VISION.md` records the same shape across a
much larger corpus and calls the out-of-bounds death the hardest case the game answers worst.

> **Tolerance.** Each predicate is exact and is tested as such: no contact while a body is held may
> ever end a run; no graze under the threshold may ever be lethal; the high-water mark must not
> advance during a grab. Over a comparable corpus of real play, out-of-bounds is **the plurality
> ending, at 60% or more** — if the rewrite kills mostly by impact it has changed what the game is
> about. Bands are spec [07](./07-boundary.md)'s and arrive in M3; M1 needs the line only.

---

## 11 · The tension — pillar 2, made measurable

`VISION.md`'s second pillar says the two things worth optimising **fight each other**: the boost
envelope peaks a fixed interval after the orbit freezes, while the release dot sits at a fixed
angle, so hitting both means shaping the dive so they arrive together. **That tension is the game.**
This section makes it a number, so that M1.3 can demonstrate it rather than claim it.

**Both halves are genuinely fixed, and for different reasons.**

The **dot sits still** because coasting is a straight line (§9). *"Which orbit angle's tangent points
at that body"* is therefore exactly solvable, and its answer is a property of two body positions —
it does not move while the craft flies. The compass is a reading of that solution, and the same
sweep produces the arc that is drawn and the alignment that is paid, so the player can never be
graded against something invisible.

The **peak arrives on a fixed clock**: 0.45s after the freeze, held for 0.75s (§7). Not 0.45s after
the press — after the *freeze*. And the freeze is where the dive ends.

**So the craft is on a circle whose phase the player set, with a window that opens on a clock.** The
measurement is: **how much of the circle can be reached while the boost is at its peak?**

| Quality demanded | Arc of orbit swept during the window | Fraction of a revolution | Kind |
|---|---|---|---|
| **Peak** (1.00) | 113° → 271° after the freeze — a **156° arc** | **43%** (p50; range 26 – 49%, never above 49) | Measured |
| 0.90 of peak | ≈ 200° arc | 56% | Measured |
| 0.50 of peak | ≈ 416° arc | over 100% | Measured |

Measured over 56 sampled approach geometries spanning grab distances 120 – 350, approach speeds 80
– 260 and impact parameters 0 – 120.

**Read the table.** Half quality is available at **any** heading — the game never refuses to pay.
Peak quality is available at **43% of headings**, so **for 57% of the release directions a player
might want, releasing at peak boost is not on offer.** The only lever on which 43% is the shape of
the dive: where the freeze puts the craft on the circle, and how fast, both of which are decided
before the press-and-hold ever becomes a release. That is the fight, and it is not authored — it
falls out of a boost clock and an orbital period that were both already running.

**It bites in real play, and this is the strongest evidence in the file.** Of 95 converted swings
released under current tuning:

| Where the release fell | Count | Share |
|---|---|---|
| Before the boost had armed | 50 | **53%** |
| Inside the plateau | 11 | **12%** |
| After it had begun decaying | 34 | 36% |

Only one release in eight lands in the window, and **the majority let go before the boost exists at
all** — because the aim arrived first and they took it. That is a player choosing one of two goods,
which is exactly what the pillar asks for.

And from the sessions' **own recorded scoring** — evidence about the session rather than about a
replay, and therefore immune to the trig drift in §1 — over 151 recorded releases:

| Outcome | Share |
|---|---|
| Both peak ≥ 0.75 **and** aim ≥ 0.75 | **36%** |
| Aim alone | 35% |
| Peak alone | 17% |
| Neither | 11% |

> **Tolerance, and this is the one that decides whether the rewrite succeeded.**
>
> 1. **The peak arc must cover strictly less than a full revolution, at every sampled geometry.**
>    Exact, and it is the pillar restated: if the arc reaches 360° the boost peak is reachable from
>    any heading, the two goals stop competing, and the game is gone regardless of how it feels.
> 2. **The peak arc covers 35 – 55% of a revolution**, at p50 over a sweep of at least 40 geometries
>    spanning the real-play envelope. 43% is the measurement; the band is the room the rewrite has.
> 3. **Half-quality remains available at every heading** — the 0.50-of-peak arc exceeds 360° at
>    every sampled geometry. The game withholds the best outcome, never all outcomes (`VISION.md`,
>    pillar 5).
> 4. Over real recorded play, **no more than 25% of converted releases land inside the plateau**,
>    and **at least 25% land before the boost arms**. A rewrite where most releases sit comfortably
>    in the window has made the window easy, which is the same failure as removing it.
> 5. **Both-good releases land between 25% and 50%** on the game's own grading. At 36% measured, a
>    rewrite at 70% has removed the choice and one at 5% has made it a lottery.

Criterion 1 is the acceptance gate. The other four are the shape.

---

## 12 · Tick rate and the integrator

| Property | Value | Kind |
|---|---|---|
| Tick | **1/60s**, fixed. Ticks are the only clock (ADR-0006) | Measured |
| Substeps | **6** per tick — integration step 1/360s | Measured |
| Method | Semi-implicit Euler: velocity from acceleration, then position from the new velocity | Measured |
| Catch-up ceiling | 3 ticks | Measured |
| Clock grain | The caller declares what its clock can resolve, and a reading within one grain of a whole number of ticks is read as that number — bounded so the rounding never borrows more than one tick. Probed at startup, not assumed; **1ms** on the author's phone | Ruled |
| What is integrated | **The dive only.** After the freeze the phase clock is closed-form | Measured |

**The grain is why the last row is there, and it was a bug before it was a row.** WebKit clamps
`performance.now()` to a whole millisecond, so the phone cannot report 16.667ms — it reports 16 or
17, the leftover accumulates, and every so often a frame runs two ticks and moves the world 33ms
while showing one picture. Measured across four phone runs: **34 frames in 1 811 ran two ticks and
37 ran none**, arriving in bursts rather than scattered (variance ÷ mean of **8**, where scatter
gives 1), because a random walk lingers near the boundary it is crossing. The author reported it
twice, as *"some lag when orbiting"* and then as *"visual stuttering"*, and both times the burst is
in the timeline where they said to look.

So the duration now arrives with the grain of the clock that measured it, and a reading within one
grain of a whole number of ticks **is** that whole number — the difference was the instrument, not
the world. Measured through the real `ticksDue`: every 60Hz-family display goes from 70 – 958
double-steps per 6 000 frames to **zero**, 120Hz and 90Hz are untouched, and a frame that genuinely
took two ticks still gets two. What stops it inventing time is a **bound and not a promise**: the
clock remembers what the rounding has borrowed and stops rounding while that exceeds one tick, which
never engages on a real 60Hz display and engages within a second on a 63Hz one — where rounding
every frame would otherwise drag the simulation 2.2 seconds per minute off the wall.

**Nothing about a recipe changes.** [`replayRun`](../../src/sim/replay.ts) never calls `ticksDue`,
so a run replays identically and `SIM_VERSION` does not move. The evidence is in
[the performance write-up](../plan/performance.md) §10.

**Six substeps is converged, not chosen.** Measured against a 96-substep reference on six dives
spanning the envelope: periapsis radius agrees to **0.03 units**, periapsis speed to **0.1 units/s**,
and the dive duration is **identical to the tick**. Sixteen times the work buys nothing.

**The stability argument spec 01 asked for.** The relevant question is how far the craft moves in one
integration step relative to the geometry it must not miss. The worst integrated step in 474 seconds
of real play was **1.45 units**, at 521 units/s — against a smallest body radius of **34** and a floor
gap of **12**. A 23× margin on the tightest feature in the field.

### 12a · Determinism is a property of the arithmetic, not only of the timestep

A fixed timestep makes a run repeatable **on one engine**. It does not make it repeatable across
two, and the prototype learned this the expensive way — which matters here because ADR-0004 makes
a recipe's reproducibility the contract, and a recipe recorded on the author's phone is replayed
on a laptop.

**`Math.hypot` is not required to be correctly rounded, and engines genuinely disagree.** Measured
across 20 000 inputs, JavaScriptCore and V8 return different results **36% of the time**. At six
calls per substep that alone made a phone session impossible to replay: a full session diverged
**5.63 units** against **0.000** for the same session using `sqrt(x*x + y*y)`, and past roughly ten
seconds the drift flipped whole decisions — a grab becoming a fly-past. `sqrt` **is** correctly
rounded by IEEE-754, and `*` and `+` are exact, so the written-out form is identical on every
engine. Overflow is not a concern at this scale: coordinates reach ~1e4, so the squares reach ~1e8
against a float64 ceiling of 1.8e308.

`pnpm portable` already bans `Math.hypot` in `src/sim/` and tells you to write your own. **This is
why**, and the reason belongs here rather than only in the checker, because a rule whose reason
lives somewhere else is a rule someone deletes.

**`sin`, `cos` and `atan2` were the same class of hazard. Closed in M1.2:
[ADR-0014](../adr/0014-the-simulation-owns-its-transcendentals.md) — the simulation owns them.**

They are implementation-approximated too, the prototype's orbit clock calls them every tick, and a
long unbroken swing amplifies the difference — which is why §1 treats late-session replay figures as
weaker evidence, and why the prototype records its scoring events rather than trusting a replay to
recompute them. The three options were a polynomial implementation owned by the simulation, an orbit
clock that composes rotations rather than re-evaluating at an accumulated angle, or accepting
single-engine determinism and saying so in the recipe.

**The hazard was measured before it was decided**, against V8 and JavaScriptCore — the second being
what Safari on the author's phone runs, so it is the pair a recipe actually has to cross. Over 20 000
arguments each, the two engines return different bits for `Math.sin` **4.3%** of the time, `Math.cos`
**4.6%**, `Math.atan2` **17.9%**, and `Math.hypot` **36.4%** — the last reproducing this section's
independently-measured 36% and confirming the method before it was pointed at the unknown rows.
`sqrt(x*x + y*y)` disagreed **0%** of the time.

`src/sim/trig.ts` computes `sin`, `cos` and the angle of a vector from `+`, `-`, `*`, `/` and
`Math.sqrt` alone, all of which IEEE-754 requires to be correctly rounded. The same probe finds the
two engines **identical to the bit** across 80 000 values of it. Accuracy costs nothing — worst error
0.73 ulp against a 256-bit reference, where V8's own `Math.sin` scores 0.81 — and speed costs 2.8× on
`sin`, which is a handful of calls a tick and does not appear in the frame budget ADR-0011 measured.

Composing rotations was rejected because it relocates the problem rather than removing it: the rotor
still needs a `sin` and a `cos`, §6's angular rate changes every tick through the settle so the rotor
is rebuilt constantly, and it does nothing for `atan2`, which the compass reads every frame.

> **Tolerance.** A recipe replayed twice on the same engine produces **byte-identical** state at
> every tick — exact, and it is M1.2's acceptance. Across two engines, the same recipe holds
> position to **within 0.5 units over 60 simulated seconds** — which the prototype's `hypot` form
> meets and its `Math.hypot` form misses by an order of magnitude.

**At the top of the field, with a caveat.** Spec [17](./17-daily-field.md)'s difficulty curve is
explicitly an opening position and no session in the cohort reached the top, so the top-of-field
speeds it will produce are **not measured**. What *is* measured is the reason to expect the margin to
hold: §5a's speed normalisation, confirmed by flat median speed across eight altitude bands up to
11 129 of a 12 120-unit field. The fastest thing in the whole corpus — 1703 units/s — occurs in the
finish funnel, which is **not integrated at all**. The honest statement is that the margin is measured
over the field as it is flown today and is *expected* to hold at the top on a mechanism that is
measured; it is not measured at the top, and §13 records that as a gap to close once a run reaches it.

> **Tolerance.** Substep count sufficient that halving it changes periapsis radius by **< 0.5 units**
> and periapsis speed by **< 2 units/s** over the sweep — a convergence test, not a fixed number, so
> the rewrite can choose its own count and prove it. Worst integrated step over a full run **below
> 4 units**, giving at least an 8× margin on the smallest body. Fixed timestep with a bounded
> catch-up, and **no path by which wall-clock time reaches the simulation** — `pnpm portable` already
> enforces the second half.

---

## 13 · Open

Nothing above is open. What follows is, and each is the author's to close rather than an
implementing agent's — except §12a's trig question, which was explicitly M1.2's and is now closed
above.

**1 · Hitstop — closed, 2026-08-27.** This spec's fixed item 5, ADR-0006 and spec
[02](./02-release.md) all required a 70ms full-world freeze at grab and at release, applied by the
simulation as a time-scale. **The author has ruled it rejected**: flown in the prototype, even a
30ms stop read as the game buffering rather than as punch. What replaces it is **a kick on every
release, scaled by the quality of the swing** — recorded in
[ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md).

The half of that mechanism this file owns is already measured: **quality for a swing that reached a
frozen orbit is its position on the boost envelope in §7**, and §8 records that the kick is a
transient carrying none of itself into permanent velocity, which is what lets it be large without
touching the economy. The other half — quality for a release that never froze an orbit, read from
how hard the body is bending the heading — is M1.3's to implement and M2's to present. Spec 02
carries a notice and is rebased in M2.

**2 · The mass-to-radius exponent — deferred by the author, 2026-08-27, and deliberately.** Spec
[04 · §1](./04-bodies.md) already rules **"Mass is size; nothing else changes"**, and
[§2](./04-bodies.md) hands the mapping here: *"the exact mapping from mass to (arc, α, k) is set in
M1 alongside the gravity model (spec 01); the three must move together and monotonically with
mass."* So mass varying with size is settled and the tide is already specified to read it. **The
prototype implements none of it** (§2): one `μ` for every body, radius entering only the orbit
floor and the collision surface.

**The exponent is not being chosen yet, and the reason is §6a.** The prototype's feel came from
real physics plus three authored transitions, not from the gravity law alone, and picking an
exponent against the prototype's field would be tuning the wrong end of that. It is chosen on the
phone at the M1 gate, against the rewrite's own field. Until then the simulation carries the law as
a parameter:

```
μ(R) = μ_median × (R / R_median)ⁿ     n is an OPENING POSITION at 2, marked as one
```

`n = 0` is the prototype exactly, so the parameter costs nothing to leave open and every value is
one number away.

What the measurement says the choice is between, normalised so the median body is unchanged:

| n | peak arc, small → large | periapsis speed | dive duration | bound grabes at typical range |
|---|---|---|---|---|
| 0 — constant *(prototype)* | 56% → 35% | 463 → 387 | 0.57 → 0.50s | same for every body |
| 2 — constant surface gravity | 45% → 42% | 368 → 465 | 0.68 → 0.45s | 3/12 → 9/12 |
| 3 — constant density | 40% → 46% | 332 → 513 | 0.72 → 0.43s | 2/12 → 9/12 |

**Today size already changes the swing backwards**, because periapsis pins at `R + 12`: a bigger
body is further out at its closest, so it is slower and lazier. Orbital speed at the floor falls
345 → 285, the settled revolution rises 0.84s → 1.49s, and **§11's peak arc runs 56% → 35%** — so
the tension is not the flat 43% §11 quotes for the median body; it varies by 21 points across the
field, and timing learned on a small body does not transfer to a large one. Scaling mass with size
does not add variation on top of that, **it cancels it**, and turns size into a speed lever instead.
Whether that is the better game is the question the gate answers.

**Two consequences are already ruled** (author, 2026-08-27), so that whatever `n` is chosen has
somewhere to land:

- **Grab range scales with mass.** Today it is a flat 560 for every body. A weak body reaching less
  far is legible on its own terms, and it is what keeps a small body grabbable at a distance where
  the grab is still a bound grab rather than a braked one. This is what pays for a steep `n`.
- **Braked small bodies are accepted as texture, not treated as a defect.** 52% of real planet
  grabs already begin as flybys, so this is a difference of degree; small bodies becoming the ones
  you brake into is a difficulty lever spec [17](./17-daily-field.md) may use. It is bounded by the
  first bullet rather than left to run.

The radius range is left where it is. Narrowing it was the third option and is not needed while the
grab range moves.

**3 · The design-space conversion — closed, 2026-08-27.** §0 rules ×3 on lengths and ×27 on `μ` on
the arithmetic that the design space is exactly three times the prototype's and the phone is the
same phone. **The author has confirmed the intent**: the rewrite should feel the same in the hand.
M1.2 carries the factor as a single named constant with every length derived from it, so declining
it later, or moving to a different design size, remains one number in one file.

One consequence is recorded rather than acted on. Spec [17 · §4](./17-daily-field.md)'s difficulty
curve is written in *prototype* magnitudes wearing design-space labels — body radii 55 → 32 against
this file's measured 34.3 – 55.5, and a corridor half-width of 480 in a 1170-wide space. Every
number in that curve is marked an opening position and is M3's to measure, so this is not a
contradiction to resolve now; it is a note for whoever measures it, so the ×3 is applied once rather
than discovered twice.

**4 · The 60-units/s peak boost is tuning, and M4 owns it.** The envelope's **shape and timing** are M1's and
are fixed above. Its **magnitude** is an economy number that spec [08](./08-economy.md) will move, and
every tolerance in §7 is written on the shape so that moving it does not invalidate them. Flagged so
that nobody later reads 60 as a physics constant.

**5 · The eccentricity cap at 0.6 binds on most swings** (§6) — it is doing more work than a safety
limit should. Whether the rewrite keeps a cap, moves it, or shapes the approach so it stops binding is
a feel call.

**6 · Top-of-field speeds are unmeasured** (§12). No recorded session reached the top of a 60-body
field. Close this by flying a full run under spec 17's field once M1.6 exists, and re-measuring the
worst integrated step. It is a gap in evidence, not a suspected defect.

**7 · Three numbers below are opening positions and are marked as such**: the ±10% band on grab range
in §3, the 8× integrated-step margin in §12, and the 60% out-of-bounds plurality in §10. Each exists
so that M1.3 has something to test rather than nothing; none is a percentile of real play, and each
should be replaced by one the first time there is a corpus of the rewrite's own.

---

## What is already fixed, and binding on M1

These come from `CONTEXT.md`, the ADRs and the boards, and are not open. They were binding before
this file had numbers in it and they still are.

1. **One verb.** Press, hold, release. The button means "be caught by that body" on the way in and
   "let go" on the way out. A second input is a repeal, not a feature (`VISION.md`, pillar 1).
2. **The swing is the unit.** One grab, one orbit, one release. It is the unit of play and therefore
   the unit of scoring (spec [08](./08-economy.md)).
3. **The craft has timing and shape, never throttle.** No acceleration input exists.
4. **Release is along the exit tangent.** The nose points along it for the whole orbit. Measured
   above at §8, and exact.
5. **The simulation owns the only clock**, and it counts ticks, not seconds (ADR-0006). Nothing in
   the game measures itself in seconds. Time-scaling remains the simulation's to apply and is
   currently applied by nothing: **the hitstop this item used to cite is withdrawn**
   ([ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md), §13.1). The
   clock is unaffected — it was never the freeze that made ticks the unit.
6. **A run is fully described by its configuration, its seed and its input log** — the recipe. The
   simulation is pure, imports nothing, and runs headless under plain node (ADR-0004, ADR-0006).
7. **The two things worth optimising must fight each other**, and §11 is now the measurement of
   that. It is not authored on top of the physics; it falls out of physics that is already running.

## Acceptance (of this file, at the end of M1)

- Every characteristic above has a value, a source and a tolerance. **Met by this file** — M1.1 is
  the naming, and §13 lists what it could not name and why.
- Each tolerance in §2 – §12 exists as an automated test (M1.3).
- The author has flown the build on a phone and signed off (ADR-0004). The sign-off is a scheduled
  human checkpoint, not a formality to be routed around.
- A recipe replayed twice produces byte-identical simulation state at every tick (M1.2, M1.5).
  **Met for the core** in M1.2, at every one of 3600 ticks and not only at the end; M1.5 extends it
  to a recorded run and a replay CLI.
