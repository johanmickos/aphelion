# M8 · The anomaly

The one optional thing in the game. A **body** outside the corridor, a **shelter** that lets you
reach it, an authored orbit that fills the tank, and a **charge** that repaints the sky and reels
every grab for as long as you are inside its stretch.

**Scoped in full on 2026-09-01**, across eleven decisions, after the author flew M3.3's sky and
found the half that was missing:

> *"The anomaly effect is good. What's missing is the actual anomaly planet, which is a purple
> planet that refuels your ship and gives you a 'grab and boost' effect when you depart it. None of
> this is implemented here, and to be honest I don't know how much of it is scoped."*

**The answer to that last part was: one third of one of its three mechanics.** The specs had the
sky, had re-pointed the fuel away from any body, and had ruled the body out by name — spec 17 §6's
*"Geometry: None"*. What follows is the reconciliation, and the specs carry it: spec
[04 · §4](../spec/04-bodies.md) gains the type, spec [05 · §5](../spec/05-field.md) is rewritten
around the body, spec [13 · §4](../spec/13-fuel.md) moves the fuel onto it, and spec
[17 · §6](../spec/17-daily-field.md) is clarified.

---

## What it is

### The body

Outside the **line**, one a day, at the **foot of its own stretch**. It projects a **shelter** that
suspends the line and only the line — not the top, not the **fell-behind line**. The prototype's
reason is carried unchanged: *"a shelter that suspended the others would open a hole with nothing on
the far side of it: a ship exempted from every bound drifts forever in a straight line. Leaving the
far side must always be reachable and always be fatal."*

The shelter reaches back **inside** the line, so the craft crosses already protected. **The miss
needs no new rule**: float through, leave the far side, and the next tick puts you outside the line.

It carries **no address**. The day's 40 are unchanged and every invariant in spec 17 §5 is untouched;
this is a 41st thing beside the ladder. There is one a day, so *the anomaly* names it.

### Finding it

A **fourth compass ring in AURORA**, additional — it never displaces one of the three that spec
00 §6 draws. The three-ring ruling of 2026-08-29 was about choosing between equivalent next steps;
this is not one of those, and it says so by being violet.

**Its reach needs no new constant, and this is the nicest fact in the whole design.** `AIM_RANGE` is
2 400 design units and an anomaly ~900 laterally from the nearest bodies is inside that from **two
bodies past in either direction**. `FELL_BEHIND_GAP` is 2 100 against bodies ~810 apart, so a craft
may drop back **2.6 bodies** to come and get it. *The instrument shows it for exactly as far as the
rules allow returning for it* — and those two constants were ruled for entirely unrelated reasons,
months apart, and were never tuned to each other.

### Crossing the boundary

Spec 07's bands keep their geometry and their closing-speed law inside a shelter, drawn in **AURORA
instead of ION**. One channel changes. The edge still says how hard you are diving at it; it says
*strange* where it would have said *risk*.

The alternatives were both refused. Bands that flared normally would be the game shouting *you are
about to die* at the one moment the player is safe — the game lying. Bands that went dark would ask
the player to read safety off an **absence**, at speed, in their peripheral vision.

**M3.4 builds this**, because M3.4 builds the boundary. It is the anomaly that creates the case.

### Arriving

The orbit is **authored**: a fixed modest radius at a fixed unhurried pace, settling in about a third
of spec 01 §6's time. *"The arrival is not the point here"* — the prototype added it against a report
of *"a wasted second spent waiting to stabilise before the thing that was committed to actually
arrives."*

**This is the mechanism that makes *rest stop* true.** Spec 05 §5 and `VISION.md` have both used the
phrase since the beginning; without an authored orbit it was decoration, because arriving at the
anomaly would have been exactly as demanding as arriving anywhere else.

### Holding it

`f` fills toward 1.0, and the halo goes AURORA and breathes while it does — the filling made visible
rather than a second signal.

**Saves still cost.** The author's first description was *"no fuel is burned during this period"*, and
spec 13 §1 makes that a no-op: *"passive drain: none. Fuel is not a clock."* Fuel does exactly one
thing, which is limit the deadline window — so *no fuel burned* would have meant **free saves**, and
free saves plus the reel would leave nothing in the stretch able to kill. Ruled the other way. The
charge removes the risk in a **capture**; it does not remove the risk in the **line**.

### Leaving it: the charge

It runs **while the craft is inside the anomaly's stretch, having taken it**. No clock, no counter —
spec 16 §4 rules that *nothing in this game expires on a clock*, and one predicate is what spec 05 §5
has always claimed for this. Climb out and it ends.

| | |
|---|---|
| Every **grab** | **reels** the craft onto an identical orbit — same radius, same pace, every body |
| The body just released | excluded from targeting |
| **Arrival** | never said — it grades a dive, and a reel has none |
| **Knock** | never said — no floor contact to price |
| **Release tier** | not graded |
| **Save** | costs what it costs |
| The **sky** | repainted: curtains, cloud bed, true-black gaps |

## The two measurements that decided the grading

**The prototype tried letting aim decide the reeled orbit and refused it.** Over **108 000 approach
geometries** that was *"not a gradient, a lottery: 43% pin exactly at the floor and the top quartile
sits 3.1× to 8.1× above it"* — reported as *"I sometimes got high orbits and sometimes low."* What
replaced it is one identical orbit every time, *"because a frenzy is a rhythm, and a rhythm needs
every beat to be the same."*

**And the author, having flown that**: *"with the zip I found myself not caring where in the orbit I
was as long as I was on the upper half."*

That second one is a mechanism rather than a taste, and it is why the grading is switched **off**
rather than left in to say nothing. A release is graded on the window it leaves through, and that
window is worth something because the next capture is uncertain. A reel makes the next capture
certain — so the release stops buying anything and only decides *up or not up*. **Both halves of
spec 01 §11's tension go at once.** Leaving the grading on would have priced a decision the design
had already removed.

*"The player will want to use this to jump upwards quickly. The timing comes down to when to grab,
since that's what will reel them towards the planet. Generally it's just a frenzy where they can't
really do any wrong"* (author).

**And it pays without a new rule.** [ADR-0009](../adr/0009-fuel-tracks-skill-not-points.md) scales
points with **metres climbed**, so a stretch flown fast banks more than one flown slowly —
*"the faster they work, the more quickly they'll be rewarded with points and exciting colours."* The
charge pays **tempo**; the economy converts tempo into points on its own. Nothing mints, so
ADR-0009's second law is untouched.

## What this reverses

**The sky becomes the reward rather than the place.** The curtains, the cloud and the true-black bed
draw only while the craft is charged; a stretch flown without taking the anomaly is ordinary VOID
with spec 05 §4's ≤ 6% ramp over it.

This reverses what M3.3 built and what passed its gate on 2026-09-01, and it is the author's, ruled
with the build in their hands. **What it costs**: most runs never see the set piece. **What it buys**
is that §4's own sentence becomes literally true — *"weather on the horizon, never spent early"* is
now a horizon promising weather you have to go and fetch.

The ramp stays exactly as built and is the whole of what the place says on its own. Measured, its
full 6% allowance is **dimmer than the faintest star in the sky above it**, so the hint is a hint.

## The order, and why it is not negotiable

**Placing the body bumps `FIXTURE_FIELD_VERSION` and `SIM_VERSION` together.** A new body changes
what the field is; a shelter changes when a run ends. Every recorded dispatch stops replaying.

**And the camera's parked session records that the dispatch corpus is its only evidence** — searched
over 51 grab-and-release pairs, the fixture field provably cannot reproduce the problem that session
exists to solve ([M2](./m2-the-instrument.md)'s notice). This design **requires** a sideways camera:
the anomaly sits far enough out that the craft is well past the **538 design units** M1.4 measured as
survivable off-picture.

So the thing that needs the camera would delete the camera's evidence. The order follows from that
and from nothing else:

| | | why here |
|---|---|---|
| 1 | **M3.4** · the boundary | the violet bands land with it |
| 2 | **M3.5**, **M3.6** | as planned |
| 3 | **the camera session** | while the corpus is still live |
| 4 | **M4** · the economy | fuel has to exist before the tank can fill |
| 5 | **this** | one deliberate bump, with a camera that can already follow it |

**The alternative was considered and is recorded**: land the mechanism inert — a shelter radius of
zero everywhere and no body placed — so the flight is provably unchanged and `test/sim/version.test.ts`
proves it, the way `BOW_GAIN`, `WAKE_AMPLITUDE` and the chain are all held at a named zero. It works,
and it was declined for a simpler reason: **it would be a step with nothing to fly and nothing to
gate on**, and every step in this plan ends in something that runs on a phone.

## Acceptance

- The anomaly is reachable only by leaving the corridor, and only through its shelter; a craft that
  crosses the line anywhere else still dies.
- Floating through it kills, and the death is the ordinary out-of-bounds ending with no special case.
- The fourth ring is drawn from two bodies past it in either direction, and never displaces one of
  the three.
- Inside a shelter the boundary's bands are AURORA and their intensity still tracks closing speed.
- Holding the authored orbit fills the tank; leaving it starts the charge; climbing out of the
  stretch ends it.
- While charged: every grab reels, the body just released is never the target, and no arrival, knock
  or release tier is said. A save costs what it costs.
- A run that never takes the anomaly sees no curtains at any altitude.
- The day still has exactly 40 addressed bodies and spec 17 §5's invariants all hold.

**Verify**: `pnpm test`, plus the author flying it — the gate is whether the trip out is worth
taking, which no test can answer.

## Open

- **The lateral offset, the shelter's radius, the authored orbit's radius and pace, and the settle's
  length** are all opening positions, to be derived from the prototype's magnitudes against this
  repo's geometry when this is built and measured on the author's own play after.
- **Whether re-taking the anomaly re-arms the charge.** Assumed yes, as the simplest rule, and
  self-limiting: going back down costs the altitude that is the points, and the fell-behind line
  allows only 2.6 bodies of it.
- **What the camera must deliver**, stated as a number rather than a design: enough sideways travel
  to hold the craft's orbit around a body outside the line inside the guaranteed band. That is the
  camera session's to answer.
