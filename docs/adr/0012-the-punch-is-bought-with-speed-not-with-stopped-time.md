# The punch is bought with speed, not with stopped time

[ADR-0006](./0006-three-layers-sim-presentation-renderer.md) put a 70ms full world freeze at
grab and at release into the middle of the game, and made it a **time-scale the simulation
applies** rather than a pause the renderer performs — which is a large part of why the game has
three layers rather than two. Spec [02](../spec/02-release.md) builds its whole 400ms timeline on
it: the hitstop is T0, and every other beat is dated from where it ends.

**The hitstop is rejected.** It was built and flown in the prototype, and the author's ruling is
that *even a 30ms stop made it feel like the game was buffering* — jarring rather than punchy, at
every length tried. Stopping the step also breaks the fixed timestep, so the simulation would have
carried on inside a picture that had not.

**What replaces it: a kick on every release, scaled by the quality of the swing.** The design
asked for a punch graded on two axes — how well the body was taken, and how well the release was
timed — and the useful discovery was that **the simulation was already computing both and had no
word for them**. That is exactly the test `VISION.md`'s second pillar sets: *look for the mechanic
the simulation is already performing and has no word for, before adding one it isn't.*

## The mechanism

**Quality is one number, and there is deliberately only one definition of it.** A swing that
reached a frozen orbit is graded on **when it let go** — its position on the boost envelope, which
spec [01 · §7](../spec/01-swing.md) fixes. A release that never froze an orbit has no envelope, but
the body is still bending its heading, so it is graded on **how hard it is turning at the instant
the button comes up**. Releasing at the top of the turn and releasing at the top of the envelope
are the same skill wearing different clothes. A second definition of "how good was that" is
precisely the kind of pair that agrees until it quietly does not.

**The kick is entirely transient, and that is what lets it be large.** It goes into the decaying
burst and none of it into permanent velocity. So feel and economy are separate channels: a player
tapping beside bodies gets the punch and keeps none of it, while a player flying well gets the
punch *and* the boost underneath it. What a run is worth is untouched.

**A tap pays nothing, structurally rather than by a guard.** A press and release with no arc
between them has no deflection, so there is no quality to be paid for. Nothing has to check.

**Quality enters twice — as size and as duration** — with the second channel deliberately the
gentler one. A release at the top of its envelope holds its punch half again as long as a scraped
one. Strength is the punch; duration is how far it carries.

The prototype's measured shape, carried here as the starting point rather than as gospel: the
punch is shaped by a square root rather than applied linearly, because linear left the bottom of
the range invisible — the median recorded release paid 29% of full and read as nothing happening.
The curve lifts weak releases, leaves the top where it was, and cannot lift a tap because it
cannot lift zero.

## What this does and does not overturn

**It does not touch ADR-0006's layering.** Simulation, presentation state, renderer, and the
simulation owning the only clock, all stand. What is withdrawn is the hitstop *as an example* of
something the simulation time-scales. The clock is still the simulation's and still counts ticks.

**Time-scaling remains available and is now unused.** Nothing in the game applies one today. The
seam stays because it cost nothing to keep and because a future mechanic may want it; but no spec
may assume a freeze exists.

**Spec [02](../spec/02-release.md) needs rebasing and that is M2's work.** Its 400ms timeline is
dated from the end of a hitstop that no longer happens, so every beat in it shifts to T0 and the
release kick has to be written into it. Doing that now would be getting ahead of the milestone that
owns it; spec 02 carries a notice, and [M2](../plan/m2-the-instrument.md) carries the task.

**Spec [01](../spec/01-swing.md)** records the envelope the converted half of quality is read
from, and its item 5 no longer claims a hitstop.

**Consequence**: the release is graded on one number that the physics already produces, so there
is nothing new to tune and nothing new to keep in step. The cost is that the punch is now a
property of the simulation's output rather than of the renderer's timing, so it can be measured —
and must be, because a kick that pays everyone the same is a kick that says nothing.
