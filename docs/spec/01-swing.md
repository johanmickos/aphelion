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

> **Conversion, ruled 2026-08-27 (author to confirm — see §13).** To make the rewrite feel the
> same on the same phone, lengths, speeds and accelerations all scale by **k = 3**, and the
> gravitational parameter by **k³ = 27** (it has units of length³ / time²). **Times, angles,
> ratios and tick counts are unchanged.** So `GM` becomes 148 500 000, the softening length 54,
> the floor gap 36 — and every duration, every angle and every fraction in this file transfers
> untouched.

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

| Property | Value | Kind |
|---|---|---|
| Force law | `a(r) = GM / (r² + soft²)`, directed at the body | Measured |
| `GM` | 5 500 000 (units³/s²) | Measured |
| `soft` | 18 | Measured |
| Departure from inverse-square | 9.4% weaker at the floor (r ≈ 56), 3.1% at r = 100, 0.8% at r = 200 | Measured |
| Where gravity acts | **Only while a body is held, and only from the held body** | Measured |

Three things here are surprising enough to state plainly, because a rewrite will get all three
wrong by default.

**Gravity is not ambient.** A coasting craft feels no force from anything. Measured: 300 ticks (5
simulated seconds) of free flight leave the speed **bit-identical** — not nearly constant,
identical. The field is not an n-body problem and never was; it is a sequence of two-body problems
with straight lines between them. That is also what makes the compass exactly solvable (§11).

**A held craft feels only its own body.** Other bodies contribute a bounce if touched, never a
pull. So a swing is genuinely one grab, one body, one orbit — the unit `CONTEXT.md` names.

**Mass is not a function of radius.** Every body in the prototype has the same `GM` regardless of
its radius, which runs 34.3 – 55.5 in the generated field. Radius sets only the orbit floor and the
collision surface. Spec 01's brief asked for "the mass-to-radius relation"; **there is not one to
carry**, and inventing one here would be exactly the kind of plausible number this project
refuses. See §13.

> **Tolerance.** Coasting speed constant to within 1 part in 10⁹ over 600 ticks. Acceleration
> under a held body within **2%** of `GM / (r² + soft²)` at every radius from the floor to the
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
| How it arrives | Eased over **5 frames** (83ms at 60Hz) — never a snap | Measured |
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
strike the body kills a coasting craft on contact; the same approach grabbed reaches a stable orbit
at 339 units/s. One second after the press, a grabbed path has separated from the line it was on by
11 – 154 units, bending the heading by up to 122°.

> **Tolerance.** Clearance fires on **50 – 60%** of real grabs. Where it fires, the resulting
> periapsis is **≥ the floor** on 100% of grabs — this is exact. Speed after the impulse is
> **≤ 0.98 × local escape speed** on 100% of grabs, so no grab can eject the craft it caught. The
> impulse spreads over **80 – 90ms** of simulated time; a single-tick application is a failure
> however correct the endpoint.

---

## 5 · The dive, and the freeze

Between the press and the closest approach the craft is on **real integrated gravity and nothing
else**. Nothing authors the shape of a dive. That decoupling — clearance, then simulated shape,
then authored tightness only at the end — is what took the prototype sixteen failed attempts, and
the failures were all the same failure: rigid or snapped orbit insertion. **Keep the dive
simulated.**

At the first radius minimum while the button is held, the orbit **freezes**: the craft is handed
from integrated gravity to a closed-form phase clock, and `VISION.md`'s second pillar starts its
stopwatch here.

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
| Angular rate settled | `√(GM/r) / r` — measured 320 °/s at r = 56 | Measured |
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

> **Tolerance.** Settled revolution period within **±10%** of `2πr / √(GM/r)`. Angular rate at the
> freeze within **±10%** of `v_peri / r_peri`. Eccentricity at the freeze **≤ 0.6** on 100% of
> swings, with p50 over real play inside **0.50 – 0.62**. Radius monotone toward the settled circle
> over the settle — **no overshoot at all**, which is exact.

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

| Property | Value | Kind |
|---|---|---|
| Ramp | Linear, 0 → peak over **0.45s** | Measured |
| Plateau | Peak held until the settle ends at **1.2s** | Measured |
| Decay | Linear, peak → 0 over **1.4s**, reaching zero at **2.6s** | Measured |
| Peak magnitude | `boostMax × (tightness − 0.5) / 0.5`, floored at 0 | Measured |
| `tightness` | `(grabDistance − r_peri) / (grabDistance − floor)` | Measured |
| `boostMax` | **60** units/s | Measured, and tuning — see §13 |
| Real-play peak | p05 0, p25 38, p50 **59**, p75 60, p95 60 — the cap binds on most swings | Measured |

**The ramp is the footgun's safety catch.** A reflexive tap-through earns almost nothing; you must
hold a moment to arm it. That is what turned the boost from an always-loaded weapon into a skill
window, and it is not negotiable.

**A dive pays only if it halves the gap.** The threshold at 0.5 tightness means, exactly:
`r_peri < (grabDistance + floor) / 2`. Committing halfway to the floor is the price of admission,
and it is a clean statement a test can hold. Measured, the envelope of impact parameters that still
pay runs **0.67 – 0.99 of the grab distance**, tightening as the approach gets faster and the grab
gets longer: close and slow, almost any aim pays; far and fast, you must be within about seven
tenths.

**Tightness follows the depth of the dive, not the quality of the aim.** The prototype's own design
document claimed the opposite and that mechanic was never implemented. Commit harder, hold tighter
— the aim is paid for separately, by the compass.

> **Tolerance.** Arm time within **±0.05s** of 0.45. Plateau ending within **±0.1s** of the settle's
> end. Zero within **±0.15s** of 2.6s. The envelope is **exactly zero at the freeze** and
> **monotone non-decreasing to the plateau and non-increasing after it** — both exact. Paying
> threshold at `r_peri = (grabDistance + floor)/2` within **±3%**. Over real play, median peak
> magnitude **≥ 0.9 of the maximum**, because the cap binding on most swings is the measured shape
> and a rewrite where it rarely binds has made a different game.

---

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
zero restitution — the floor — and against any other body at `R + 6` with 0.6 restitution. The same
geometry is lethal coasting and safe held, and that asymmetry is the rule, not an oversight: a grab
is a promise that you will not be killed by the thing you grabbed.

**The graze exemption exists to preserve a real manoeuvre.** Flinging tangentially past a body you
have just left is legitimate flying, and at 0.18 the exemption covers it without covering anything
that reads as a crash.

**The high-water mark is held during a grab for a measured reason.** An orbit is a round trip, and
the height gained going round its near side is not ground kept. Counting it put the trailing floor
at the orbit's apex — which the far side of that same orbit then flew straight into, killing a
craft that had not lost a unit of altitude.

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
| What is integrated | **The dive only.** After the freeze the phase clock is closed-form | Measured |

**Six substeps is converged, not chosen.** Measured against a 96-substep reference on six dives
spanning the envelope: periapsis radius agrees to **0.03 units**, periapsis speed to **0.1 units/s**,
and the dive duration is **identical to the tick**. Sixteen times the work buys nothing.

**The stability argument spec 01 asked for.** The relevant question is how far the craft moves in one
integration step relative to the geometry it must not miss. The worst integrated step in 474 seconds
of real play was **1.45 units**, at 521 units/s — against a smallest body radius of **34** and a floor
gap of **12**. A 23× margin on the tightest feature in the field.

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
implementing agent's.

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

**2 · The mass-to-radius exponent — and spec 04 has already ruled the half of this I asked
about.** Spec [04 · §1](./04-bodies.md) says **"Mass is size; nothing else changes"**, and
[§2](./04-bodies.md) hands the mapping here: *"the exact mapping from mass to (arc, α, k) is set in
M1 alongside the gravity model (spec 01); the three must move together and monotonically with
mass."* So mass varying with size is settled, and the tide is already specified to read it. **The
prototype does not implement any of it** (§2): one `GM` for every body, with radius entering only
the orbit floor and the collision surface. What is open is the **exponent**, and it is not a free
choice — measured, it decides how much of the swing changes with size and in which direction.

Today, size already changes the swing **backwards**, because periapsis pins at a floor of `R + 12`:
a bigger body is further away at its closest, so it is *slower and lazier*. Orbital speed at the
floor falls 345 → 285 across the field's radii, the settled revolution rises 0.84s → 1.49s, and
**§11's peak arc runs 56% → 35%** — so the tension is not the flat 43% §11 quotes for the median
body, it varies by 21 points across the field, and the timing skill a player learns on a small body
does not transfer cleanly to a large one. That is a finding, not a design.

Scaling mass with size does not add variation on top of that — **it cancels it**, because the two
effects pull opposite ways. Measured, normalised so the median body is unchanged:

| Law | peak arc, small → large | periapsis speed | dive duration | bound catches at typical range |
|---|---|---|---|---|
| Constant (today) | 56% → 35% | 463 → 387 | 0.57 → 0.50s | same for every body |
| Mass ∝ R² *(constant surface gravity)* | 45% → 42% | 368 → 465 | 0.68 → 0.45s | 3/12 → 9/12 |
| Mass ∝ R³ *(constant density)* | 40% → 46% | 332 → 513 | 0.72 → 0.43s | 2/12 → 9/12 |

**Both scalings flatten the tension and turn size into a speed lever instead** — which is arguably
the better trade, since it makes the timing skill transfer between bodies while size stays legible
in the hand. The cost is in the last column and it is real: **a small body stops being catchable at
the distances players actually grab from.** Today's `GM` is tuned so the *median* grab — 150 units
out at 271 units/s — sits almost exactly on the line between a bound catch and one that must be
braked with fuel. Any mass scaling moves that line per body: under R³ a small body is bound only
inside ≈71 units, which is essentially at its surface, so every grab of one becomes a braked flyby.
That lands the difficulty on **fuel**, which ADR-0009 and spec [13](./13-fuel.md) reserve for what a
*save* costs.

**Ruling wanted: the exponent, and whether the radius range moves with it.** Three levers can pay
for the catchability if the exponent is steep — narrowing the radius range from today's 1.6×,
scaling the grab range with mass so a weak body reaches less far, or accepting braked small bodies
as a deliberate texture (52% of real grabs already begin as flybys, so this is a difference of
degree). Whatever is chosen, spec [04 · §2](./04-bodies.md)'s tide mapping is written from it.

**3 · The design-space conversion.** §0 rules ×3 on lengths and ×27 on `GM` on the arithmetic that
the design space is exactly three times the prototype's and the phone is the same phone.
**Author to confirm the intent**, because it is the highest-leverage number in the file: confirming
it says the rewrite should feel the same in the hand, and declining it says the rewrite should feel
different, which is a legitimate thing to want and would change every absolute figure here at once.

**4 · `boostMax` at 60 is tuning, and M4 owns it.** The envelope's **shape and timing** are M1's and
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
