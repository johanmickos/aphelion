# Port notes — Stage 0

Logged during the verbatim TypeScript port of `index.html` (the immutable
prototype) into `src/sim/`.

**The bugs below were reproduced, not fixed.** The port's whole value is that
`test/port-equality.test.ts` proves it reproduces the prototype _exactly_ — zero
divergence, not within an epsilon — across the scenario matrix. A drive-by fix
would have destroyed that proof. Each is safe to fix now that equality is green:
the gate will fail loudly and specifically for the affected scenario, which is
exactly the signal you want.

Four changes _were_ made. Every one is apparatus or module boundary, and none of
them moves a trajectory — equality holds at exactly zero with all four in place.
They are notes 5, 7, 9 and 10, marked **CHANGED**.

Each note is referenced at its site in `src/sim/`.

---

## Reproduced faithfully — fix in Stage 2

### 1 — The crash cone is a straight-line ray against a curved path

`src/sim/capture.ts` · `crashCone()`

The cone tests whether the ship's heading _ray_ intersects the planet's circle,
but the real path bends under gravity. It therefore over-warns on a dive that
would capture cleanly, and the instantaneous ray at grab time can disagree with
the wedge that was drawn a frame earlier — the visual and the grab-refusal gate
are computed from the same function but at different moments.

_Fix:_ integrate the natural path forward over a short horizon and test whether it
actually enters the surface, then drive both the visual and the refusal from that
one result so they can never disagree.

**Partly addressed in 19**, which removed the severity floor that was suppressing
the distance term. The ray is still a straight line; the refusal now just reaches
a lot less far.

### 2 — Periapsis floor bounce **[FIXED — see 18]**

`src/sim/step.ts` · the `minR` clamp in `stepPhysical`

A dive that reaches the minimum-orbit floor took one sharp deflection as the clamp
zeroed its inward radial velocity and the settle engaged. Measured rather than
asserted: the `tangential grab` scenario reached the floor exactly
(`r / minR = 1.0000`) and produced a single **46.4°** deflection in `settle`, and
that number was pinned in `test/invariants.test.ts` so that fixing it would fail
there loudly and specifically.

It did. The clamp was never the defect — note 18 has the diagnosis: captures
reached by the flyby-conversion path never received their clearance impulse, so
they aimed below the surface and the floor caught them. The floor is now unreached
by every scenario, and `test/invariants.test.ts` asserts that instead of pinning
the kink.

### 3 — `whipTimeout` was declared but never implemented

The prototype's `CONFIG.whipTimeout` (1.5s) is documented as a safety net: "if no
periapsis within this many seconds, it's a flyby". Nothing reads it. A dive that
never reaches periapsis therefore has no escape hatch.

The key is dropped rather than carried as a lie. Re-adding it means implementing
the guard, which is a behaviour change and belongs in Stage 2.

### 4 — The `whip` phase is never entered

`src/sim/types.ts` · `CapturePhase`

`cap.phase = 'whip'` is assigned nowhere in the prototype. The only occurrence of
the string is the dead branch of the dispatch guard at index.html:485. The `clear`
phase carries the entire dive, long after `clearFramesLeft` reaches zero after 5
frames.

This matters because the prototype's design document described `whip` as a
distinct state with its own row and description. **Anyone porting from the document rather than the
code would have built a state machine the prototype does not have.** The
`whipE` / `whipVmax` energy tracking is live; only the label is fiction.

`CapturePhase` therefore has four members, not five.

### 6 — Every capture reports one spurious kink **[FIXED]**

`src/sim/step.ts` · `updateDefl`, seeded by `beginCapture`

`beginCapture` seeds `lastAngle` from the **position** angle
(`Math.atan2(ry, rx)`), but `updateDefl` compares **velocity** angles. The first
sample of every capture therefore reports the angle between the position and
velocity vectors rather than a turn — measured at ~160° on a typical grab.

Consequence: the prototype's SMOOTH/KINK pill reads "1 KINK" for _every_ capture,
including perfectly clean ones. The metric the design document called "the single most
important smoothness metric" has a false positive on every run.

Reproduced first because it is pure telemetry and never feeds back into physics,
and the invariant tests skipped the first sample of each capture explicitly.

Fixed by seeding `lastAngle` from the velocity angle, which is what `updateDefl`
actually compares against. First-sample deflection across a four-grab spread went
from ~160° to **1.4°–6.9°**, so a clean capture now reads SMOOTH. The invariant
tests no longer exempt the first sample: all ten scenarios stay under the 15° kink
threshold on **every** sample.

This is a deliberate divergence in a displayed value — `index.html` still shows
"1 KINK" on a clean capture. No config flag guards it because the equality gate
compares position, velocity, fuel and phase, and `defl` feeds none of them.

### 8 — `clearEaseFrames` is frame-denominated

`src/sim/config.ts`

Clearance eases over a fixed number of _frames_, not seconds: `stepPhysical`
decrements it only when `s === 0`. Its real duration is therefore a function of
`dt` — 83ms at 1/60, 42ms at 1/120.

This is the **sole legal frame-denominated constant**, inherited and quarantined
with a comment at its declaration. Do not add others: each one silently re-tunes
itself if the timestep ever changes, which is the only thing that makes the
timestep a one-way door.

### 11 — Dead code, dropped

Provably inert, so dropping it cannot move a trajectory:

| Dropped                            | Why                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `CONFIG.phaseRamp`                 | Never read — **and it had a live TUNE slider**, so the panel offered a knob that did nothing |
| `CONFIG.captureInboundMin`         | Never read                                                                                   |
| `CONFIG.boostRetainOrbit`          | Never read                                                                                   |
| `CONFIG.crashDepthFrac`            | Never read; self-documented as superseded                                                    |
| `cap._hitOther`                    | Written at index.html:529, never read                                                        |
| `cap._noFuelGrab`                  | Written at index.html:364, never read — the HUD tests `cap.fuel <= 0.5` directly             |
| `cap._releaseAlign`                | Assigned in render at index.html:951, never read                                             |
| `nextPlanet()`, `roundRect()`      | Defined, never called                                                                        |
| `cap.active ? cap.fuel : cap.fuel` | No-op ternary at index.html:1099                                                             |
| `thx` / `thy` in `stepPhysical`    | Computed each substep, never used                                                            |

### 12 — `cap.fuel` is ship state, not capture state

It persists across captures and regenerates during drift (index.html:789), so it
lives on `SimState`, which is what it already behaved like.

---

## Changed deliberately — apparatus and boundaries

### 5 — Trace timestamps are tick-indexed, not wall-clock **[CHANGED]**

`src/sim/serialize.ts` (and the since-deleted `src/sim/trace.ts`)

The prototype computes `t = (performance.now() - cap.tStart) / 1000`. That makes
the trace — the reference data the gate compares — a function of real frame
timing, so it cannot serve as a baseline at all.

This is the instrument, not the thing being measured, so changing it moves no
trajectory. Everything is addressed by integer tick; a display time is derived as
`tick * dt`.

_Precedent:_ the earlier stashed port hit exactly this. Its notes record that
event times rounded to 5 decimals were slightly **larger** than the true step
time, so a replay comparing `t >= e.t` fired one step late and six scenarios
diverged "in a way that read convincingly like a physics bug."

### 7 — The simulation no longer writes to its input **[CHANGED]**

`src/sim/step.ts`, `src/sim/types.ts` · `SimState.holdConsumed`

`releaseHeld()` and `resetShip()` both assign `held = false` — the sim mutating
the variable that represents player input. With `step(state, input, dt)` and
`inputLog` as the authority on input, that breaks replay at the root.

It cannot simply be deleted, because the behaviour is load-bearing: when fuel runs
dry mid-circularization the sim calls `releaseHeld(true)` **while the player is
still physically holding**, and the `pointerup` that follows is swallowed by the
`if (!held && !cap.active) return` guard. So the fact needs recording — as
`holdConsumed` in state. Effective hold is `input.held && !state.holdConsumed`.

Behaviourally identical; equality holds at zero.

### 9 — Out-of-bounds is evaluated in world space **[CHANGED]**

`src/sim/world.ts` · `fieldBounds()`

The prototype's vertical bound was `(sy - cam.y > H + 400) || (sy - cam.y < -800)`
— the _death condition_ evaluated in screen space, against a camera that is itself
a smoothed lerp, scaled by live viewport height. That put render state inside the
sim and made death device-dependent: a taller screen lets you drift further before
dying.

Now measured in world units from the world's own extents, with margins mirroring
the originals (800 above the highest body, 1244 below spawn). The camera left the
simulation entirely and is now purely a render concern.

**Scope:** the scenario matrix deliberately stays inside the playfield, so the gate
does not cover the out-of-bounds path. That is the one behaviour knowingly left
unverified against the prototype. It is a terminal transition rather than a
feel-critical one, and Stage 1 was going to change it regardless.

### 10 — The world is frozen in absolute units **[CHANGED]**

`src/sim/world.ts`

The prototype authored planet positions in _viewport_ units
(`y: d.y * H`, `x: W * 0.5 + d.dx`) and re-ran `layoutWorld()` on every resize.
Two consequences, both live bugs:

1. **Resize relocated planets mid-flight** and rebuilt the `planets` array with
   fresh objects, leaving `cap.planet` pointing at a discarded one. Measured: a
   portrait→landscape rotation moved P8 by 2317px while the ship kept orbiting a
   planet that no longer existed there. (The earlier stashed build has a commit
   titled "Fix the tether silently detaching after a resize" — same bug class.)
2. **Different devices played a different game.** Gravity is absolute but planet
   _spacing_ scaled with screen height: P1→P8 spans 5047px in portrait and 2331px
   in landscape. That is a difficulty difference, silently, per device.

The layout is now evaluated once at the design viewport (390×844 — the resolution
the feel was tuned at, and the one the earlier golden recorded) and baked in.
Resize is inert. The renderer scales by `viewportHeight / 844` and letterboxes.

Equality is unaffected because the harness pins the prototype's viewport to
390×844, at which the frozen coordinates are exactly what `layoutWorld` produces.

### 14 — Leaving the field holds, rather than respawning silently **[CHANGED]**

`src/sim/step.ts` -> `endRun`, `src/render/overlays.ts`

The prototype teleported the ship back to the start the instant it crossed a
boundary, with no pause and no explanation. An impact already froze, flashed a
readout and then respawned; crossing a line did not, so the two ways to lose a run
were presented completely differently.

Leaving the field now holds exactly as an impact does and shows a red notice —
matching the boundary gradient that was warning you on the way out — before
respawning. `CrashState` became `EndingState` with a `reason`, so the notice is
chosen by cause rather than by a boolean.

This sits in the path note 9 already carved out as outside the gate's coverage.
Two scenarios _did_ cross the boundary, though, which had gone unnoticed because
both sides respawned on the same tick and cancelled out. They are now trimmed to
end before the boundary, and `tools/check-scenarios.ts` fails the build if any
scenario crosses — a gate that silently stops covering something is worse than no
gate.

The trajectory sample still reports `crash` on the wire for an impact, so the
equality comparison keeps comparing like for like.

---

## Caught by the gate

### 13 — A missed early return leaked one tick of fuel regen

`src/sim/step.ts` · `stepSim`

My own porting slip, and the reason the gate exists.

The prototype's drift collision handler does an early `return` **from `update()`**
on a lethal contact, which skips the bounds test _and_ the trailing fuel regen for
that tick. My `stepDrift` returned early from itself but let `stepSim` continue,
so the port regenerated an extra `fuelRegen × dt` = **0.25 fuel** on the crash
tick, and only on the crash tick.

Invisible in position and velocity — those were already bit-identical — and it
surfaced only because the gate compares fuel too. `stepDrift` now returns a
`crashed` flag and `stepSim` aborts the tick.

**Lesson:** compare every field, not just the ones that look like physics.

### 17 — `aim` was computed on every grab and never read **[REMOVED]**

`beginCapture` derived an `aim` score from four weighted terms and stored it on
the capture. Nothing anywhere read it — confirmed by grep and by a sensitivity
sweep, where all four weights moved a trajectory by exactly zero.

The prototype's design document described it as a live mechanic: *"Aim sets tightness monotonically
— precise = tight/fast, lazy = wide."* That is not what happens. Tightness is
derived geometrically in `freezeOrbit` from `(grabR - rPeri) / span`, which is how
deep the dive went, not how well it was aimed. `aim` is vestigial from an earlier
design — the same class of documentation drift as the `whip` phase in note 4.
(That document has since been retired; what survived it was moved to the code it
describes — the capture's rationale now heads `src/sim/capture.ts`.)

Removed, along with five other write-only capture fields found in the same sweep:
`grabSpeed`, `inboundFrac`, `natPeri`, `isFlyby` and `whipVmax`. None could affect
a trajectory, and the equality gate stayed at exactly zero across the change.

Worth being clear about what was NOT done: the mechanic the document describes is
not implemented. Grab quality still does not influence the settled orbit. That is
a live design question, not a cleanup.

**Answered since, and not the way the document proposed.** Grab quality now has a
consumer — `src/score/`, which pays points for how close a release came to a
compass marker and to the peak of the boost envelope. Aim was given a reader
rather than a lever: making it move the ship is what the retired document
described, and it would have failed the equality gate for a mechanic nobody has
played. `test/score.test.ts` pins both halves, so a future attempt to make aim
physical fails there first, by name, before it reaches the gate.

### 18 — Most captures never got their clearance impulse **[FIXED]**
`src/sim/capture.ts` -> `applyClearance`, `src/sim/step.ts`

This is the real cause of "stuck to the surface", and of the floor bounce
recorded as note 2. That note described a symptom two steps downstream.

**The chain.** A grab is classified a flyby when it is unbound *or* "moving
outward with no periapsis ahead". The second clause has no speed term, so passing
a planet on the way up qualifies at any speed — the case that prompted this was
travelling at **97 px/s against an escape speed of 349**, a quarter of escape and
unambiguously captured. Three ticks later gravity turns it inbound and it converts
to `clear`. But clearance was only ever computed in `beginCapture`, so anything
that became a capture by conversion never got it.

That ship then dived toward a natural periapsis of **6.5** — inside a 46px planet —
until the minimum-orbit floor caught it:

```
tick  phase   r      speed   v_radial   radial%   defl
 263  clear   60.6     255     -216.2      85%     2.7
 264  clear   58.0     142        0.0       0%    55.9   <- floor clamp
 266  settle  58.0     278       -0.0       0%     4.6   <- freezeOrbit restores it
```

The clamp zeroes inward radial velocity, which on a steep dive **destroys 44% of
the ship's speed in one substep**. `freezeOrbit` then restores it from the
conserved pre-clamp energy, so there are two discontinuities, not one. The 56
degree kink is the first of them. The orbit then settles into a circle at exactly
`minR`, which on a small body is what reads as being stuck to the surface.

**Prevalence.** Across every grab the field allows: 45 of 109 took this path, and
every one of them dived below the surface. There were **no genuinely unbound
grabs at all** — so in ordinary play, every "flyby" was a misclassified bound
grab, and every `TOO FAST` was shown to a ship that was not.

**The fix**, behind two config flags so PROTOTYPE_CONFIG keeps the old behaviour
and the equality gate stays at exactly zero:

- `boundGrabsCapture` — below escape speed is a capture, whichever way the ship
  happens to be pointing.
- `clearanceOnConvert` — a flyby that becomes a capture gets clearance too.

| across 109 grabs | kinks | worst deflection | floor substeps | seen as flyby |
|---|---|---|---|---|
| before | 45 | 66.4° | 208 | 43 |
| after | **0** | **8.5°** | **0** | **0** |

`boundGrabsCapture` accounts for all of it; with the classification corrected,
nothing converts any more. `clearanceOnConvert` is kept because a capture should
get clearance however it began, but it is currently unexercised — see below.

**Found while verifying, not fixed:** holding a genuine flyby cannot realistically
capture it. The brake's strength is split by `flybyRadialBias`, and an *inbound*
flyby only receives `b * 0.15` on each component — about 48 px/s per second, where
a full tank buys 89 px/s of shed speed. A 430 px/s grab against escape 220 needs
215. The code comment at that site says inbound should "brake hard", and it does
not. So `hold to brake & capture` is advice the physics cannot honour for
genuinely fast grabs. That is a design question, not a port defect.

---

## 15 — JavaScript engines disagree on floating-point math

Not a port note in the usual sense: a property of the platform that constrains
what the diagnostics system can promise.

`Math.hypot`, `Math.atan2`, `Math.sin` and `Math.cos` are **not required to be
correctly rounded** by the ECMAScript spec, and implementations genuinely differ.
Measured directly, JavaScriptCore (Safari, iOS) against V8 (Node), 20,000 random
inputs each:

| function               | results that differ                              |
| ---------------------- | ------------------------------------------------ |
| `Math.hypot`           | **36.10%**                                       |
| `Math.atan2`           | **17.64%**                                       |
| `Math.sin`             | 4.21%                                            |
| `Math.cos`             | 4.21%                                            |
| `Math.sqrt(x*x + y*y)` | **0%** — `sqrt` is correctly rounded by IEEE-754 |

Running the identical simulation in both engines with identical inputs:

```
tick   |Δposition|
1260      0.000000   identical through drift, which touches no transcendentals
1440      0.000004
1620      3.575040
1800      5.629822
```

Drift matches exactly because it is pure `+` and `*`. A capture calls `hypot` six
times per substep, so it diverges, and the freeze at periapsis calls `atan2` and
amplifies it.

**Consequence:** a session recorded on a phone can never be replayed bit-exactly
on a laptop. This is why diagnostics checkpoints carry raw positions alongside the
fingerprint, and why replay fidelity is _graded_ — `exact` when the engine matches,
`close`/`drifted` when only the numbers differ, `diverged` when the run genuinely
took another path. Reporting a cross-engine difference as "the simulation is
non-deterministic" was actively misleading, and cost real debugging time.

**Not fixed, deliberately.** Full cross-engine determinism would mean replacing
those four functions with polynomial implementations built from IEEE-exact
operations. That is tractable (~200 lines) but it would break port-equality with
`index.html`, which calls `Math.*`. The exact gate is worth more than exact
cross-engine replay, because graded fidelity is enough to diagnose gameplay.
Revisit if leaderboards or lockstep multiplayer ever need it.

### 16 — `Math.hypot` replaced with `sqrt(x*x + y*y)` **[CHANGED]**

`src/sim/orbit.ts`

Note 15 established that engines disagree on `Math.hypot` for 36% of inputs, and
that this made phone sessions unreplayable — the error compounded through orbital
motion until, after about ten seconds, it flipped whole decisions (capture became
flyby). Measured growth on a real session:

```
  t(s)   |Δpos|
   1–8    0.004 px
    10    2.130
    12   15.070
    13  128.584   ← flyby vs settle: a decision flipped
```

`Math.sqrt` **is** correctly rounded by IEEE-754, and `*` and `+` are exact, so
`sqrt(x*x + y*y)` is identical on every engine. Substituting it:

|                                    | Math.hypot     | sqrt(x*x+y*y)      |
| ---------------------------------- | -------------- | ------------------ |
| JavaScriptCore vs V8, full session | 5.630000000 px | **0.000000000 px** |

Overflow is not a concern here — coordinates reach ~1e4, so squares reach ~1e8
against a float64 ceiling of 1.8e308.

**The equality gate still holds at exactly zero.** The substitution is applied to
_both_ sides: `tools/prototype-harness.ts` gives the prototype a `Math` whose
`hypot` is the same expression (all 29 of its call sites pass two arguments).
So the gate compares like with like, and what it proves is now stated precisely:
the port reproduces the prototype's algorithm under one documented substitution.
Without that patch the divergence would be 7.169e-12 px — about 125 ulps over a
whole session, physically meaningless but enough to break an exact comparison.

A residual remains: `Math.atan2`, `sin` and `cos` still differ between engines
(18%, 4%, 4%). In practice this now shows up as a single transient ulp that does
not accumulate, because the phase clock re-derives position from `theta` each
tick rather than integrating it. Left alone deliberately — deterministic
polynomial replacements would be ~200 lines for no measurable gain.

---

### 19 — The crash cone's severity floor sat above its own threshold **[FIXED]**

`src/sim/capture.ts` · `crashCone()` · reported from two phone sessions

`crashCone` returns `max(0, min(1, max(0.4, closeF)))` and `inCrashCone` refuses
above `0.35`. The floor is higher than the threshold, so `closeF` — the entire
"how close are you really" term — could never bring the result under the gate.
The refusal was binary: any forward ray intersection within `crashConeRange`
refused, at any distance within it and at any speed. Tuning `crashConeRange`
70 → 50 moved the edge of the band but could not restore the gradient inside it.

Measured by replaying every report in `diagnostics/` — 24 sessions, 322 grab
presses:

| crash-cone refusals ever recorded | 10 |
| --- | --- |
| distance above the surface | 28 · 34 · 38 · 41 · 41 · 43 · 46 · 46 · 48 · 50 px |
| followed by a crash | 10 / 10, within 5–18 ticks (0.08–0.30s) |
| survivable if the grab were allowed | 10 / 10, each bottoming out 0.0–0.1px above the minimum orbit |

Every one sat in the outer half of a 50px band, and not one was unrecoverable.
The gate has never refused a grab that could not be flown; it has converted ten
survivable states into ten deaths, on exactly the deepest and highest-scoring
approaches. It also contradicts what a grab does: `applyClearance` lifts periapsis
to `minR` on every bound capture, so the cone predicts a straight-line impact for
a ship that stops travelling in a straight line the instant it presses.

_Fixed_ by making the floor configurable — `crashConeSeverityFloor`, 0.4 in
PROTOTYPE_CONFIG and 0 in DEFAULT_CONFIG. At 0 the distance term decides and the
refusal keeps the inner ~32px, which is a real too-late zone. Note 1 is still
open: the ray is still straight.

### 20 — A press took the nearest body, not the one it was arriving at **[FIXED]**

`src/sim/capture.ts` · `nearestBody()` · reported from a phone session

"Behind me and receding" and "ahead of me and closing" are the same number to a
distance comparison. A ship at 311 px/s leaving one planet for the next pressed
with the previous planet 120px behind it and the next 179px ahead, and was handed
the one behind — which, being unbound and outbound, became a flyby that burned 62
fuel over 93 ticks and captured nothing.

Over the same 322 recorded presses, 28 aimed at a body the ship was receding from
while another in range was closing.

_Fixed_ with `grabLeadTime`, 0 in PROTOTYPE_CONFIG and 0.2s in DEFAULT_CONFIG:
the distances are compared from `pos + vel·grabLeadTime` instead of `pos`. A lead
rather than a heading test or a closing-speed rule, because those need a threshold
and a threshold is a cliff — a body would cross from "behind" to "ahead" through an
arbitrary line. Displacing the query point is continuous in position and velocity
and costs nothing at rest, which is what preserves the deliberate re-grab of the
planet behind you: it flips 7 of the 322 presses and none below 216 px/s.

### 21 — A report predating a config key replayed under the new behaviour

`src/app/report.ts` · `configFromReport()` · found while shipping 19 and 20

A report carries its config in full, but a key added after it was recorded is
simply absent. The function returned `r.config` verbatim, so the new key arrived
as `undefined` — `Math.max(undefined, x)` is `NaN`, and `NaN > 0.35` is false, so
every crash-cone refusal in every older report silently stopped happening and the
replay still graded itself FAITHFUL.

_Fixed_ by resolving missing keys from PROTOTYPE_CONFIG. That is not a guess: under
the config split every new key is a flag that is off in the prototype and on in the
default, so the prototype value **is** what the code did before the key existed.
Resolving from DEFAULT_CONFIG would have been the same bug with better manners.
The build-skew banner now prints the resolved value too, so it names what the
session behaved as rather than `undefined`.

---

### 22 — The field was a line, not a route

`src/sim/world.ts` · `createBodies()` · asked for directly

Every generated body sat within 44px of the centre column, in a playfield 741px
wide. The climb was a single column of planets 88px across with 650px of unused
field either side of it, and the only decision it ever offered was when to press,
never where to go.

The generated field is now a sequence of ROWS. Most hold one body and alternate
sides, which is the authored weave; `rowPairChance` of them fork into two lanes
`bodySpread` out on each side, and those are the rows where a release has a
choice. Measured over the generated field at the shipped values (280 spacing, 60
bodies, weave 72, spread 160, fork chance 0.4):

| rows | 42, of which 18 fork |
| --- | --- |
| lateral span | x 38..352, from 151..239 before |
| margin to the nearest wall | 159px |
| closest two bodies | 125px of surface gap |
| reach from a body to the nearest in the next row | 193px min, 242 median, 290 max |

The 380px "is the next body in view" bound is what keeps a fork from becoming two
unreachable options; nothing in the field exceeds 290. `bodyCount` went 32 -> 60
so that the climb stays the length it was (11246px, against 11150 before) despite
rows now costing 280 rather than 360.

Two things in the generator are load-bearing and look arbitrary:

- **The fork decision short-circuits before its RNG draw** when `rowPairChance`
  is 0, and the single-body path draws x, then the gap, then the radius, in that
  order. Together with note 21's back-fill, that means every report recorded
  before these keys existed rebuilds a bit-identical field — checked against the
  previous generator over all 24 replayable reports.
- **A forked row leans its lanes equally and oppositely**, and the row's own
  height is carried separately from the height a body is emitted at. Folding the
  lean back into the running height would make each next row's gap the configured
  one plus a lean, compounding all the way up the field.

### 23 — The reckless shout could not fire in practice **[FIXED]**

`src/score/reckless.ts` · reported as "do we still have the reckless logic?"

It was implemented, wired, and rendered, and the author had never seen it. The
only way in was `RECKLESS_STREAK` — three consecutive captures each crossing 27
degrees — which over every recorded session fired a handful of times in 322
grabs. A channel that rare is indistinguishable from one that is broken, which is
exactly how it was reported.

Two ways in now. The streak stays, because "are you doing this on purpose?" is a
fair question that needs three captures to ask. Beside it, `RECKLESS_HARD_DEG`
fires on one capture with no history behind it, and `BONK_SPEED` fires on a fast
impact. Both are measured; the numbers and the distributions they came from are
recorded at their declarations.

The edges are tracked separately for the two deflection thresholds. A single
shared edge would mark a capture as counted when it crossed 27 and never look
again — missing the 80 that followed, which is how a capture actually gets thrown
around.

Note the more obvious home for a bonk, a survived surface graze, is not one:
`crashGrazeDot` is shallow enough that not one session on record has ever had a
graze that lived. Every collision in the corpus is fatal.

---

### 24 — A settled orbit set the floor at its own apex, then flew into it **[FIXED]**

`src/sim/step.ts` · the `highWaterY` update · reported from two phone sessions

The trailing floor hangs from `state.highWaterY`, which advanced on every tick,
capture included. A settled circular orbit therefore raised the floor as it
passed through its own apex, and then carried the ship `2r` down the far side
into it. **Any settled orbit with `2r > backtrackLimit` was fatal by
construction** — at 520 that is every orbit wider than r=260. The session that
reported it:

```
tick  phase   shipY  highWater  floorY  drop  orbitR
1040  drift   -2796    -2796    -2276     0      -     grab
1260  orbit   -3185    -3186    -2666     0    290     apex: the floor moves here
1560  orbit   -2677    -3186    -2666   509    290
1568  fell-behind      -3186    -2666   520      -     dead, still in orbit
```

r=290, diameter 580, limit 520: sixty pixels too tall. The ship never left the
orbit and never lost a pixel of ground.

Measured over every session in `diagnostics/`, settled orbit radius runs p50 106,
p90 116, p99 281, max 294 — so 4 of 179 settled orbits were already in the
un-survivable band, and the ceiling is not 294 but `grabRange`, which is 560.

The second report, "the bottom red dead zone came upon me a bit too quickly", is
the same mechanism seen from the other side: none of that session's deaths were
`fell-behind` at all, but the 390px the ship gained rounding the near side of an
orbit lifted the floor 390px, so the zone appeared to rush upward.

_Fixed_ with `holdClimbInCapture` — false in PROTOTYPE_CONFIG, true in
DEFAULT_CONFIG — which stops the mark advancing while a capture runs. An orbit is
a round trip and the height reached going round is not height kept; the mark
resumes at the release point, which is. Note this **cannot change a trajectory**:
`highWaterY` is read only by the death check and the renderer, so a session
replays position-for-position either way and only the floor's verdict differs.
`backtrackLimit` went 520 -> 700 alongside, covering r=350 even for a grab made
at the top of a climb. Measured on the two reports: the fatal `fell-behind`
disappears, and the deepest drop falls 519 -> 233 and 396 -> 247.

### 25 — The camera had no vertical clamp at all

`src/render/camera.ts` · `cameraTarget()` · reported in the same session

`centerY` was the ship's y, full stop, so the view followed the ship down past
the dashed line into a region where the run is already over. Worse, with the ship
held centred it is the LINE that appears to travel, which reads as the floor
rising rather than as the ship falling.

The view now stops with the floor on its bottom edge. The line then holds still
and the ship visibly falls toward it, which is what is actually happening.

`backtrackFloorY()` in `src/sim/world.ts` is the single definition of that line,
because three places need it and must agree — `stepSim` ends the run at it,
`drawBacktrackFloor` paints it, and the camera refuses to descend past it.

### 26 — The field's seed was a constant, so the field could not be a choice

`src/sim/world.ts` · `src/sim/config.ts` · **[CHANGED]**

`WORLD_SEED` was a module constant, on the reasoning that every player should
climb the same field and a replay must reconstruct it exactly. The second half of
that is a real constraint; the first half was a decision, and NEW MAP reverses
it.

The seed is now `SimConfig.worldSeed`, which is what makes the reversal cheap: a
run is `(config, seed, inputLog)`, a report already carries the FULL config, and
`configFromReport` fills a missing key from `PROTOTYPE_CONFIG` — so the 34 reports
recorded before this replay on precisely the field they were played on, because
that is the value the constant held. Nothing about the report schema moved.

The equality gate is untouched at zero: `PROTOTYPE_CONFIG` sets
`proceduralLayout: false` and the eight authored bodies are placed by hand, so the
key is never read there. The golden was recaptured because the golden stores the
config, not because any number in it moved.

**What actually needed work was the tests.** Every playability property in
`test/world.test.ts` was asserted against one field, which cannot distinguish a
generator that works from a generator that got lucky. Swept over 20,000 seeds the
geometry holds with room to spare — closest two bodies 82px against a required
24, every body 155px inside the playfield, worst next-row reach 370px against a
380 limit — but two assertions were statements about that one seed:

- **Fork fraction.** 0.76% of seeds fall outside the asserted 0.2-0.6. How many
  rows fork is a binomial draw over ~43 rows, so the spread is the generator being
  random, not broken; the range runs 0.132 to 0.714. The per-seed band is now wide
  and the mean is asserted separately, which is where a real change to the fork
  rate shows up.
- **Climb height.** A fork spends two of a fixed `bodyCount` on one row, so a
  fork-heavy seed builds a shorter climb: 1.88x to 2.91x the prototype's height
  against an asserted 2x. The bound is 1.7x now, and the assertion still says what
  it meant — bodies buy height rather than packing the same stretch.

The test file sweeps 64 fixed seeds, generated from a seeded RNG so a failure
names a seed that can be reproduced by hand.

**Known wart, fixed alongside:** a randomised field would have tripped the replay
header's "THIS REPORT CAME FROM A DIFFERENT BUILD" banner, which fired on any
config difference at all — the same flaw that made it fire when a player had
merely moved a tune slider. The header now separates the three cases: keys in
`KNOBS` are a deliberate experiment, `worldSeed` is a different world, and
everything else is build skew, which is the only one the banner is about.

### 27 — The boost window closed inside the manoeuvre it was rewarding

`src/sim/boost.ts` · `src/sim/config.ts` · **[CHANGED]** · reported as "I felt
like I was close to running out of fuel a lot during the fun swinging moments"

`boostT` and `settleT` both start at zero in `beginSettle`, and nothing had ever
compared them. With `boostArmTime` 0.45 and `settleDur` 1.2, the boost peaked 38%
of the way into the settle and was 46% dead by the time the orbit was round,
reaching zero at 1.85s — 0.65s after the manoeuvre finished. **Completing a
circularization therefore guaranteed missing the boost**, and with it the
`linkFuelReward` refund, which scales by `cap.boost / cap.boostFull`.

Nothing caught this because every part of it was individually correct. The
envelope was internally consistent, the refund scaled by it faithfully,
`test/link-fuel.test.ts` asserted exactly that, and the two together paid nothing
for a well-flown capture. The defect lived in the RELATIONSHIP between three
values, which was the one thing no test named.

What the reports say, over the three sessions carrying award records:

```
                    links   median hold   zero-paying links   min fuel
2026-08-21T21-27      16        1.42s          1 / 16            39
2026-08-21T21-55      25        1.47s          3 / 25            47
2026-08-22T07-31      11        1.83s          6 / 11             3
```

against an envelope that hit zero at 1.85s. The last session is what the boost
axis actually was: its best capture — grab closeness 0.74, aim 0.95, CLUTCH and
SIGHTED both — paid **zero**, held 1.83s. Its two best-paying links came off its
two loosest grabs (closeness 0.07 and 0.10), released early. The axis was paying
for haste rather than for flying the capture, which is also why it read as
economically dead in the score calibration.

The fix moves where the decay STARTS, not how the ramp works: the peak holds
until `settleDur`, then decays over `boostDecayTime` as before. The ramp is
untouched, so a reflexive tap-through still earns nothing and the always-loaded
footgun the ramp exists to disarm stays disarmed. It tracks `settleDur` rather
than a second constant
because `settleDur` is a tune-panel slider, and a hardcoded plateau would silently
re-break the moment it was dragged — the same failure mode as a frame-denominated
constant.

Modelled against the recorded fuel curves, replaying each session's checkpoints
with the refunds substituted and the spill above `fuelMax` discarded:

```
                       min fuel   time under a quarter tank   zero-paying links
2026-08-22T07-31
  before                    3               19%                   6 / 11
  linkFuelReward 20 -> 32   5               12%                   6 / 11
  plateau                  45                0%                   0 / 11
```

Raising the reward cannot work: anything times zero is zero, and the zeros are
exactly where the tank drained. The plateau fixes the starved session and moves
the two that were never starved by under 8 fuel at their minimum — the signature
of a defect being fixed rather than a subsidy being added, and the reason
`linkFuelReward` stayed at 20.

The gate is untouched at zero: `boostHoldsThroughSettle` is `false` in
`PROTOTYPE_CONFIG`, where the plateau collapses onto `boostArmTime` and the
expression reduces to the old one exactly — `test/boost-envelope.test.ts` asserts
that with `toBe`, not `toBeCloseTo`, since the prototype comparison is exact.
`SIM_VERSION` went 9 -> 10; the golden was recaptured because a key was added.

**The praise threshold had to be re-measured, and this is the case the rule is
for.** `PEAK` in `src/score/praise.ts` was a percentile of play under the broken
envelope. Moving the envelope lifted the median release from 0.21 to 0.71 without
a player changing anything they did, so at the old 0.44 / 0.52 the boost-peak word
would have fired on 85% and 79% of releases — the same defect as gating at a round
0.90, inverted: a word that lands on almost every release names nothing. It is
0.85 / 0.94 now, still cut at the top ~25% and top ~10%.

The re-measurement deliberately does not re-simulate anything. Each release's true
`boostT` was recovered by inverting its RECORDED `timing` through the old
envelope, then pushed back through the new one — 52 links across the three
sessions carrying award records. Fewer than the original 112 replayed releases and
better evidence, for the reason `AwardRecord` exists at all: an award is written
on the phone and stays true however far a replay drifted, a recomputed one does
not.

**Fixed alongside:** `test/render.test.ts` restated the envelope inline to sweep
the boost halo. It now calls `boostEnvelope`, and derives its tick count from
`settleDur + boostDecayTime` — a copy would have kept sweeping the old shape and
quietly stopped covering the halo's tail.

### 28 — The flyby brake charged full price after it had switched itself off

`src/sim/step.ts` · the flyby brake block · **[CHANGED]** · found while reading
the session that note 27 was verified on

`speedTaper` scales the brake from full strength at `flybyBrakeRefSpeed` (200) to
nothing at `flybyBrakeMinSpeed` (120). The impulse read it; the fuel burn did not,
and charged a flat `flybyFuelPerSec` for as long as the button was held. Below
120px/s the brake applies an impulse of identically zero and the ship was still
paying 40 fuel/second for it.

**The repo's own scenario had it the whole time.** `fast unbound grab -> flyby,
braked` in `test/scenarios.ts`, from a full tank:

```
ticks    speed         taper   fuel        what the fuel bought
 20-90   400 -> 204     1.00   100 -> 53   the full-strength brake
 95-125  183 -> 121  0.78-0.01   53 -> 29   the tapering brake
130-170  116 ->  91     0.00    26 ->  0   nothing at all
```

A quarter of the tank for zero impulse, and the 116 -> 91 over that stretch is
gravity, not the brake. The ship now finishes that scenario on 43.4 fuel instead
of 0, on an identical trajectory — minimum speed 84px/s either way. The brake was
never wrong; only its price was.

This is a price correction and not a discount: at `speedTaper` 1 the rate is
unchanged, which is where a real rescue is bought, and `test/flyby-fuel.test.ts`
asserts the two paths agree to nine decimals across that whole band. Holding a
dead brake is still not free, because a capture suppresses `fuelRegen` — the same
test asserts fuel never rises inside a flyby.

**It broke a knob's coverage, exactly the way this test is known to break.**
`test/tune.test.ts` measures a knob by how far it moves the ship, and its
`fuelRegen` scenario worked by emptying a full tank inside one brake and then
braking again against the `fuel > 0` gate. With the brake no longer billing after
it tapers off, the first hold ends with 45 in the tank, the second brake never
reaches its gate, and `fuelRegen` measured as **0.0px across its whole range** —
i.e. dead. It is not dead; it is +19 fuel/second across 21 seconds of drift in the
very session this note is about. The scenario now opens on a part-drained tank
instead of manufacturing one, which is both closer to when a player actually
notices refuelling and no longer hostage to what a brake costs. This is the second
time this exact thing has happened to `fuelRegen` — see the note above it in the
file — and the pattern is worth naming: when a knob measures inert, the scenario
stopped reaching the mechanism far more often than the knob stopped working.

**What this does NOT explain.** The session it was found in was starved, and it
was not starved by this: measured over its eight braking episodes, 327 fuel went
into the brake and only 9 of it (3%) bought no impulse, because the player never
rode the brake down into the dead band — every episode ended between 157 and
266px/s. Recorded separately so the next reader does not credit the fix with the
wrong symptom. What that session actually shows is in the numbers below.

**The economy after note 27**, from the same session's checkpoints, taking only
intervals with no phase change so no transition or refund contaminates the rate:

```
phase     rate/s     time     net fuel
settle     -18.0     23.0s        -414      33 links refunded +390
flyby      -39.3      8.3s        -327      refunds nothing
orbit        0.0      5.3s           0
drift      +19.0     21.0s        +398      (below fuelRegen 30: clips at fuelMax)
```

The capture loop now recovers 94% of its own cost, which is note 27 working. The
flyby is the entire net drain, and the sharpest cost is not the fuel itself but
where it lands: at t700 a 1.33s brake spent 53 fuel and converted, and the capture
it converted INTO began on 13.9, ran dry mid-circularization, puttered out, and
took the streak from x2.00 to x1.00 — then cost 2.7 seconds of drifting to refuel.
**The brake that sets a capture up is charged against that capture's budget, while
the refund is sized for a capture that needed no brake.** A converted flyby is the
harder play, costs 40 more and pays exactly the same. Fixed in note 29.

---

### 29 — A rescue paid for itself twice

`src/sim/step.ts` · `src/sim/config.ts` · **[CHANGED]** · the cascade note 28 ends on

`flybyConvertRefund` hands back half of what the brake cost, at the moment the
flyby converts into a capture.

**Why it pays at the conversion and not at the release.** The refund exists to
reach the settle that is about to spend the fuel. Folded into `linkFuelReward` it
would arrive after the putter-out it exists to prevent, which is the entire
failure — at t700 the capture was already dry 140 ticks before its release.

**Why half.** Measured, not chosen: it is the value at which a rescue that WORKS
costs about what a capture costs. Over the session's four expensive conversions
the net brake bill lands at 18 / 13 / 20 / 26 fuel against a median capture burn
of 18-20, and the worst following capture bottoms out at 20 fuel instead of 2.
Every putter-out is already gone at a quarter; the rest is headroom, on the same
reasoning `linkFuelReward` records — condition the constraint, do not remove it.

```
refund   worst following capture bottoms at   putter-outs
  0%                  2 fuel                     1 / 13
 25%                 11                          0 / 13
 50%                 20                          0 / 13
 75%                 29                          0 / 13
```

**Why only on conversion.** A brake that fails still pays in full, and that is
where the tension lives that this must not blunt: of 18 braking episodes, the 13
that converted spent 160 fuel and the 5 that sailed past spent 167. The refund
touches the first group and leaves the second exactly as expensive as it was.
Eight of those 13 braked for under a third of a second and spent nothing, so they
collect nothing — the refund finds the rescues and ignores the taps.

`brakeSpent` accumulates what `burn` actually DEDUCTED rather than what it quoted,
so a brake held against a near-empty tank cannot convert into more fuel than it
ever had. `test/flyby-fuel.test.ts` pins that bound directly, and pins the two
places the obvious version of that test goes wrong: an empty ship cannot reach a
flyby at all, because a grab is refused at `fuel <= 0.5`, and a ship on 2 fuel
dies inside 200 ticks and respawns with a full tank, which reads exactly like the
leak being tested for.

### 30 — The fuel ramp is emergent, and both knobs that look like it are not it

no code change · measured on `diagnostics/2026-08-22T08-16-08-005Z.json`, reported
as "at first I felt like the fuel regen was too lenient, but towards the end I
found myself struggling to keep the streak clean and felt the pressure nicely"

The felt ramp is real and it is in the numbers. Halving the session at 32s:

```
                    first half   second half
median fuel              83           50
minimum                  38           23
time at a full tank      17%           7%
time under a quarter      0%           4%
median hold           1.40s        1.65s
settle share of time     40%          49%
drift share of time      20%          21%
```

**The mechanism is that income is flat and spend is not.** Drift share — the only
thing that earns `fuelRegen` — barely moves, 20% to 21%. What rises is the settle,
40% to 49%, at a flat 18/s, because the holds get longer as the chain gets better.
Pressure is produced by playing well, and it arrives without any part of the
config knowing the session has been going on for a while.

**Both obvious ways to tighten the opening make it worse, and this is why the note
exists.** Modelled by walking the recorded checkpoint deltas under the candidate
value:

```
                  first half            second half
fuelRegen 30    med 83  atFull 17%    med 50  min 23  under-quarter  4%
fuelRegen 25    med 81  atFull  8%    med 42  min 16                 9%
fuelRegen 22    med 80  atFull  8%    med 37  min 12                22%
fuelRegen 15    med 78  atFull  8%    med 24  min  1                51%
```

`fuelRegen` is a LATE-game knob wearing an early-game label. Cutting it in half
moves the opening's median by 5 fuel and takes the closing's from 50 to 24. The
opening tops out whatever the rate is, because its drifts are long; the closing
feels every unit, because its drifts are short. Tuning it to fix the opening
destroys precisely the stretch that was reported as feeling right.

`fuelMax` does not touch the opening's leniency either — it translates the whole
curve down and leaves time-at-full unchanged at 17%, because the player still tops
out, just lower. At 80 the closing's minimum falls from 23 to 3; at 70 it runs dry.

So the opening's slack is not a mistuned number, it is the shape of loose play:
long gaps between captures, long drifts, a full tank. About 150 fuel of regen and
34 of link refund were discarded against the cap over the session. That waste IS
the on-ramp, and the game reclaims it automatically the moment the chain tightens.
Left alone deliberately.

**The streak ceiling is no longer out of reach.** This session ran 25 links with
**zero** streak breaks and one death, at 61s — effectively a single 61-second
life. The multiplier climbed unbroken to x5.00 by link 17 and sat there for the
last nine. Previous calibration had `streakMax: 5` needing 17 consecutive links
and being "~2x out of reach"; notes 27 and 29 made it reachable, and the last
third of a good run is now played at a ceiling that pays nothing more and costs
everything to lose. That is a different kind of tension from the one the ladder
was designed around, and worth knowing before anyone re-tunes `streakMax`.

**A drift worth watching, not yet worth fixing.** Releases before the settle
completes have gone 19-32% -> 40% across sessions, because note 27's plateau pays
full boost from 0.45s and nothing now requires finishing the circularization.
Short holds do aim worse — 0.70 under 0.6s against 0.86 between 1.2s and 1.8s —
but points come out level (1485 against 1446) and session-median aim is unchanged
at 0.82, in line with every session before it. Recorded so that if aim does start
falling, the cause is already written down.

**Method note, learned the hard way in this session.** The replay's `findings`
block reported "9 run(s) ended" and "aim 0.37"; the recorded checkpoints show ONE
respawn and a median aim of 0.82. The block is recomputed past a divergence at
t=4.0s and is fiction. The `findings` and the per-life quality averages are replay
output — only the checkpoints and the award table are the session. This was known
(note 15, and the recorder's own comment) and got believed anyway.

### 31 — Anomalies: one predicate, not an alcove

`src/sim/world.ts` · `src/sim/step.ts` · **[CHANGED]** · asked for directly

A purple alien body sitting OUTSIDE the barrier. Aim a release at it, coast
through the wall, capture it, and fling back carrying points and a temporary
multiplier. Miss, and the wall is still there.

**The design was three times larger before the right question was asked.** It
started as a rectangular alcove: the field's side bound made y-dependent, the wall
stepping out and back, `drawHazardZones` tracing a profile instead of a line, the
camera clamp reading bounds at the ship's height, and a shield to survive a bad
exit. Asked what the MINIMUM was that produced the same illusion, all of it
collapsed into one clause:

```js
const outX =
  (pos.x < fb.left - 4 || pos.x > fb.right + 4) &&
  !inAnomalyField(pos.x, pos.y, state.bodies);
```

`fieldBounds` is untouched. An anomaly projects a circular bubble in which the
side boundary is suspended, and that is the whole mechanic. The lesson worth
keeping is that the feature was walls when the thing wanted was a hole.

**Why only the side boundary.** `driftAccel` is zero: a ship exempted from every
bound holds its `y`, so `outY` and the trailing floor never fire, and it drifts in
a straight line forever with only a reset to escape — the shape of the floor-pin
stall. Every bubble must therefore END, and outside it the boundary must bite.
`test/anomaly.test.ts` flies that case rather than reasoning about it, and
`test/world.test.ts` asserts it geometrically for all 64 swept seeds.

**The load-bearing number is a relationship, not a value.** `anomalyBubble` 400
against `anomalyOffset` 250 puts the rim 150px back INSIDE the corridor, so a ship
crosses the barrier already protected. Smaller than the offset and the wall kills
before the exemption starts, which reads as the mechanic simply not working — so
the test asserts the overlap, not the numbers.

**What it cost elsewhere, which was mostly tests.**

- `Body` became a union, as `types.ts` always said it would. Exactly two sites
  switch on `kind` and the compiler named both. An anomaly contacts exactly as a
  planet does: what is special about it is the boundary it projects, not its
  surface, and flying into one still kills.
- `aimTargets` excludes anomalies. They are signposted on a fourth, purple ring of
  their own, solved by `readAnomalyAim` at a wider 900px so it can be seen for
  about three rows. Letting one into the normal reading would displace a real
  planet from a list capped at `AIM_MAX_TARGETS` — and that reading is not only
  what the compass draws, it is what the aim score is paid on, whose thresholds
  are percentiles (note 27). An anomaly is shown and not scored for aim, which is
  the safe direction of this file's rule.
- **The camera could not show it.** `cameraTarget` clamped `left` to
  `field.right - W`, making the rightmost world x it would ever render exactly the
  barrier — an anomaly beyond it was permanently off-screen. The clamp exists to
  avoid spending screen on dead space outside the field; a ship at an anomaly is
  legitimately outside it, so the clamp now yields as far as keeping the ship in
  frame requires.
- `scoreTick` takes `dt`. The scorer owns a duration now, and `FIXED_DT` says of
  itself that it is passed as a parameter and never read globally.
- **Six world tests failed, all correctly.** They analyse the body list AS the
  corridor — how it weaves, forks, spaces its rows, stays inside the playfield —
  and an anomaly is deliberately none of those things. Scoped to planets, with a
  separate block asserting what IS true of anomalies, including that a seed's
  corridor is bit-identical with `anomalyCount` at 0. Without that last one the
  two cannot be compared and turning anomalies off would silently be a different
  game.
- `anomalyBonus` and then `anomalyBonusMult` measured as dead weights, because no
  session in `test/score.test.ts` reached an anomaly and then got home to score
  under the window. Same blind spot as `fuelRegen` in note 28, third time in two
  days: **when a weight measures inert, suspect the fixture before the weight.**
  The new session derives its line from the generator rather than hardcoding a
  position, so it cannot quietly stop reaching the anomaly and go green covering
  nothing.

**The reward adds ON TOP of the streak ceiling** — `min(streakMax, 1 + step *
streak) + bonus`, never inside the `min`. Inside it the bonus does literally
nothing to a maxed streak, which is precisely the player who earned the right to
go and fetch it. Note 30 measured that ceiling being reached at link 17 and held
for the last nine of a good run, paying nothing more and costing everything to
lose; this is the thing to climb toward that the dead spot was missing. The window
starts at the RELEASE, not the grab, so the 1.5-2s of settling and aiming does not
burn a fifth of it inside an orbit going nowhere.

The multiplier readout turns purple while it runs, because `heat` saturates at
`streakMax` — a boosted x7 and an unboosted x5 were otherwise the same colour on
the only gauge that shows it. That is a state, not a rarity, so it stays out of
the accolade ladder.

**Known-open, deliberately.** Leaving the bubble is fatal in both directions, so a
release aimed the wrong way out of an anomaly kills a player who just flew the
hardest thing in the game. The exit is meant to be easy and is not yet: the return
leg is served by the existing compass, which does find corridor bodies from an
anomaly anchor, but the ship dies before reaching them on most release angles.
Measured, not guessed — and left for the next pass at the author's direction.

### 32 — `app/` was never typechecked, and a camera watched the wrong thing

`tsconfig.json` · `src/render/camera.ts` · **[CHANGED]** · reported as "my first
press seems to freeze the ship entirely"

**The freeze was an undefined variable in `app/main.ts`**, referencing a `bodies`
that does not exist in that scope. It threw inside `render()` on the first frame
where `snap.capture` was truthy — the first press — and killed the render loop.

`pnpm typecheck` was green. `tsconfig.json` included `src`, `test`, `tools` and
`*.ts`, and **not `app`** — the entry point of the actual game, and the only file
that wires the simulation, the scorer and the renderer together. Everything the
type system is for was switched off in exactly the place where three layers meet.
`app` is in `include` now, which needed only `vite/client` added to `types`
alongside it. One line of config bought back a whole file.

The lesson is not "check names". It is that a green typecheck was evidence about
a set of files nobody had checked the membership of, and the tests could not
cover it either: they call `scene.draw` directly, so nothing in the suite has ever
executed `main.ts`.

**The camera followed the ship through a capture, which is the wrong subject.**
Measured on the reported session's 16.9-second anomaly orbit: the ship travels
129px vertically per orbit — 15% of the window — with a direction change every
0.6s, against a camera lag of 0.33s. Over half the oscillation's own period. Too
slow to track it and, unlike the horizontal axis, with no deadzone to ignore it,
so the only thing it could do was smear.

A capture is watched, not flown through: the anchor is still, the ship goes round
it, and the compass — the thing actually being read — is drawn centred on the
anchor. Following the anchor takes the camera's vertical travel from 61px to
**0.0px** on a scenario capture. The ship then visibly orbits a fixed point,
which is what is actually happening.

**And it leaned the wrong way.** The horizontal deadzone parks the ship at
whichever margin it last crossed, so travelling right you sit at the right margin
and see mostly where you have been. Coming off the right wall the view then held
completely still for 310px — 1.02s — before the ship reached the far margin.
Reported as the camera lagging, and it is not the smoothing: it is a deadzone with
no idea which way you are going. `cameraLookAhead` biases the target by the ship's
velocity, taking that dead stretch to 240px / 0.78s.

That is NOT the fix the deadzone's own comment warns about. "Default the target to
centred" oscillates because the target is a function of the camera's position, so
correcting it changes it. This is a function of the ship's velocity, which the
camera cannot influence, so there is no loop. It is disabled during a capture,
where vx reverses every half orbit and would put the wobble straight back on the
other axis.

**A regression from note 31, caught while measuring this.** The clamp relaxation
that lets the view follow a ship out past the barrier was unconditional, so it
also fired in ordinary play whenever the ship came within a margin of a wall —
panning up to 80px beyond the barrier to show dead space, which is precisely what
the clamp exists to prevent. Gated on the ship actually being outside the field.
All three are pinned in `test/camera.test.ts` as behaviour, not left to the eye.

**The bonus was invisible for a reason the presentation could not fix.** In the
reported session the anomaly was captured at t4869 and released at t5881, and the
recording ended at t5941 — **1.0s into a 10s window, with zero awards scored under
it**. The window is now shown as well as coloured: the multiplier readout grows
from 12px to 17px and a purple bar drains beside it, because a colour cannot say
how long is left and ten seconds is long enough for "is it still running?" to be
a real question mid-flight.

### 33 — The camera lock is a weight, not a mode

`src/render/camera.ts` · **[CHANGED]** · reported as "it feels a bit jarring when
it snaps to the next planet ... the main thing I don't want is oscillation when
I'm in a true orbit; any other time the old camera was exciting"

Note 32 switched the camera's subject from the ship to the anchor for the whole of
a capture. That removed the wobble and bought a lurch: **the anchor is furthest
away exactly when a capture begins**, up to `grabRange` 560, so every grab dragged
the view across that gap. Measured, a hard switch peaks the camera at 336px/s just
after the grab against the plain follower's own 295px/s.

The requirement, stated precisely, was narrower than what had been built: a TRUE
orbit must not oscillate, and everything else was already good. So the lock is a
weight rather than a mode, and it rides `settleProgress`:

```
phase     clear   flyby   settle        orbit
lock        0       0     0 -> 1          1
```

The subject is `ship + (anchor - ship) * w`, so the residual wobble is exactly
`r * (1 - w)` — continuous, with no mode to switch and therefore no moment at
which anything can jump. And the lurch is gone for a structural reason rather than
by tuning: the weight is zero while the anchor is far away, and only reaches full
once the ship is a settled radius from it, by which point the two are nearly the
same point. Measured on a scenario capture:

```
                peak camera speed   orbit wobble (steady)
plain follower        295px/s              76.9px
hard switch           336px/s               0.0px
weighted              295px/s              0.02px
```

The 9.9px seen across the whole orbit phase is entirely the ease settling over its
first second — `anchorW` 0.946 -> 1.0. Past that it is 0.02px, which is the thing
that was asked for.

`cam.anchorX/Y` are kept after the capture ends rather than dropped with it, so
the weight has something to decay away from; dropping them would snap the subject
back by a whole orbit radius on the release tick — the same jump, at the other
end. `centerCamera` zeroes the lock, because carrying one across a respawn would
hold the new ship's view on the body the old one died at.

The look-ahead from note 32 is scaled by `1 - w` for the same reason it was
disabled during a capture before: a captured ship's velocity reverses every half
orbit, and a look-ahead surviving into a settled orbit puts the wobble straight
back on the other axis.

**Corrected once more, after flying it: the settle is not ramped at all.** Riding
`settleProgress` looked like the smooth choice and was measured to eat half the
oval. The ship swings 59 -> 107 -> 59px across a settle, and because
`settleProgress` is smootherstep'd the lock already reads 0.47 at the apoapsis and
0.83-0.94 through the 12-14px return swing — flattening the most dramatic part of
a capture to under 2px. Of 83px of total swing, 41 survived.

```
where in the settle   swing    ramped    unramped
  40-50% (apoapsis)     8px     5.6px       8.0px
  70-80% (swinging in) 12px     2.1px      12.0px
                       14px     0.9px      14.0px
  TOTAL                83px      41px        83px
```

Reported as missing the bounce during the oval, and the numbers agreed. The lock
now waits for the thing it is named after: zero through the dive AND the settle,
1 in a true orbit. `cameraOrbitEase` — slowed 6 -> 3, a third of a second — turns
the phase change into a glide.

A step is affordable HERE and was not affordable at the grab, and the reason is
the bound: the glide is limited by the settled orbit radius, about 59px, against
the 560px of `grabRange` the first version could lurch across. Measured end to
end, the settle's camera travel is now 72.2px with the lock on and 72.2px with it
off — identical — while a settled orbit goes from 61.06px to 0.52px, and the peak
camera speed is 295px/s either way.

One honest casualty: the test that pinned "a hard switch is the jumpy one" no
longer holds, because slowing the ease to 3 tames a hard switch too. It has been
replaced by the assertion that actually matters — that the settle is bit-for-bit
the unlocked camera — rather than propped up.

**And it caused a regression, caught in testing before it shipped: "I capture the
first planet and the camera flips left/right depending on which side of the planet
I'm on."** The look-ahead was faded out by `1 - w`, the LOCK weight. Unhooking the
settle from that weight — the fix above — unhooked the look-ahead with it, so the
lean ran at full strength through the whole oval, steering off a velocity that
reverses every half orbit. Measured on the reported capture: +397 -> -285 -> +137
-> -207 -> +261 across one settle into orbit.

Two quantities had been conflated. The lock weight says what to look AT, and is
zero through the settle on purpose. Whether velocity MEANS anything is a different
question with a different answer, and `frozenOrbit` now asks it: `clear` and
`flyby` run on real physics and have a real heading, `settle` and `orbit` are the
phase clock and do not. Gating on the whole capture instead was tried and put a
110px lurch into the dive.

### 34 — A backstop must be minimal, or it is a lurch with a good excuse

`src/render/camera.ts` · `src/render/edge-markers.ts` · **[CHANGED]** · reported
as "my ship flew faster than the camera and I couldn't see when I was close to the
anomaly to capture it"

Three findings from one report, and only one of them was the camera.

**The ship really did leave the screen.** `cameraTarget` refuses to aim anywhere
the ship would be off frame, but that constrains the TARGET and `cam.left` only
eases toward it at `cameraFollow` 3. At the 352px/s a release toward an anomaly
reaches, the camera trails by about 117px, so the ship overtook a perfectly
correct target. The guarantee is now enforced on the camera itself, after the
ease. It survives one bounded exception, measured at 3.1px for a single tick and
only within a pixel of `field.left`, where the field clamp and the ship clamp
cannot both be satisfied; the field clamp wins there deliberately.

**The first version of that backstop was worse than the bug.** It repositioned the
ship to the trailing side when it engaged, reasoning that a lagging camera should
show what is ahead — and it did, lifting the anomaly's time on screen from 0.17s
to 0.40s. But the engage condition is marginal exactly when the ship grazes the
edge, so a sub-pixel violation became a **109px jump** mid-settle, and it read as
the view flipping sides. Reverted to a nearest-bound clamp: the smallest
correction that works, and nothing about framing. Where the ship sits inside the
window is the deadzone's and the look-ahead's business, not a safety net's.

**What actually fixed the report was not the camera at all.** `drawEdgeMarkers`
filters `if (b.y >= snap.y) continue` — upward only, because an arrow pointing
back down the climb is clutter and a suggestion to turn around. On the reported
run the ship was 178px ABOVE the anomaly at the release, so the one always-on
indicator was suppressed for the entire approach. There was no compass either,
because that needs a capture, and the anomaly itself was off screen until 0.24s
before arrival. **The player had nothing to read.** Anomalies are exempt from the
filter now and draw in purple, with the distance label the code already had: 1.77s
of live readout across that approach, against 0s.

**Measured and dropped: leaning the view toward the anomaly during the coast.** It
modelled well before the backstop existed and, once the ship was actually kept on
screen, changed the anomaly's time on screen by 0.00s at 200, 260, 300 and
352px/s — twice, under both backstop designs. The window is 390px wide and the
ship has to be inside it, so nothing can show more than `W - margin` ahead
whatever it points at. Seeing further needs a wider view, not a different subject.
It is recorded here because the idea is a natural one to have again, and because
`ANOMALY_FRAME` looked entirely reasonable sitting in the file doing nothing.

---

### 35 — A framing preference is not a bound

`src/render/camera.ts` · **[CHANGED]** · reported as "the camera still oscillates
left/right as I orbit the anomaly — it should be fixed in the center — and a
pretty jagged transition crossing the red zone"

Two symptoms, one mistake made twice: a rule about where the ship should SIT
written as a hard constraint, so it outranked whatever was deciding the shot.

**The anomaly would not stay centred**, measured at 83px of swing with the lock
weight at exactly 1 — the lock was working and its answer was being thrown away.
The author's guess was that the orbit's radius varied; it does not, it is a
constant 62px. Two separate leaks of `shipX` into a target that was supposed to be
the anchor's:

- The backstop clamped `cam.left` into `[shipX - (W - margin), shipX - margin]`.
  Those bounds ORBIT with the ship, so they kept catching a camera whose target
  never moved. A backstop must guarantee the WINDOW; where the ship sits inside it
  is the deadzone's business. It now uses `cameraBackstopEdge` (18px), and locked
  to an anchor the ship is supposed to move around the frame — that is the point.
- `cameraTarget` clamped the target into the field and then rebuilt it from
  `shipX` to put the ship back on screen. Out at an anomaly the anchor is
  legitimately outside the field, so a correct anchor-locked target was being
  discarded and replaced with a ship-following one every frame.

The field rule and the framing rule are now written as an intersection with an
explicit precedence — inside the corridor the field wins and no dead space is ever
shown; outside, framing wins, because a view missing the ship is worse than a view
with some black in it. **A locked orbit is now still to 0.00px with the body at
the exact centre of the window**, which also needed the deadzone to yield: it
parks a subject at the margin, and its reason for existing — that centring
oscillates — is an argument about a subject that MOVES. A locked anchor does not,
so centring on it converges.

**The jagged crossing was the field rule letting go all at once.** Pinned against
the barrier while the ship approached, the camera had to go from stationary to the
ship's speed in a single tick: 1247px/s against a ship doing 228. Two attempts
that did not work are worth recording. Switching the clamp off when the ship is
outside is the discontinuity itself. Ramping the framing edge from zero fixes the
dead-space problem but completes in 18px — 0.08s at that speed — so the jerk
returns intact.

What works is `barrierRelax`: an anomaly's bubble opens the barrier for the CAMERA
over the 150px of bubble that sits inside the corridor, so the view is already
moving when the ship crosses. **1247 -> 382px/s at 228, 1401 -> 430 at 352** — 1.7x
and 1.2x the ship's own speed, which is a catch-up rather than a discontinuity.
Shaped like the bubble rather than like a distance to the wall, because the
allowance exists because of the anomaly and should appear and vanish with it.

The backstop no longer gives up when the field rule and the edge conflict — a ship
crossing a barrier hit that case and sat 5.9px off screen for a tick at 500px/s.
It falls back to the bare window: the ship may touch the edge, never leave it.

**A hole behind the same report, found while measuring it.** The reported orbit
was radius 62 and is still to 0.00px, but at 120 the view panned 55px and at 180,
174px — the field rule was still binding out at the anomaly. Centring a body that
sits `anomalyOffset` beyond the barrier puts the view about 445px past the field
edge, well past anything `relax` opens, so the bound hauled the view back toward
the corridor on every swing that way and let it settle again on the far side. The
field rule now yields to framing the SUBJECT, conditioned on the subject being
outside rather than the ship — inside the corridor the subject is the ship and
`subjX - W/2` would license half a window of dead space permanently. Radius 120 is
now 0.0px and 180 is 6.0px; 240 still pans, because a 240px orbit cannot fit a
centred 390px window and the ship has to win.

---

### 36 — An anomaly is a rest stop, so it authors its own orbit

`src/sim/capture.ts` · `src/sim/types.ts` · **[CHANGED]** · asked for as "these
anomalies should be a bit easier to deal with ... breathing room for the user to
learn about the anomaly, catch their breath, load up on boosts, and continue"

Measured, a capture at an anomaly was indistinguishable from one at a planet, and
in one respect worse:

```
             settled radius   lap     tightness -> boostFull
 press 88        62           1.31s     1.00        60
 press 96        69           1.53s     0.20         0
```

Four ticks late took the entire payoff of the hardest commitment in the game to
zero. Not a skill gradient — a lottery at the end of a blind four-second coast,
and the exact opposite of "load up on boosts". An anomaly now settles to a fixed
130px at a fixed 3s lap with tightness credited in full, at every press timing.

**It needed no plumbing, and the reason is worth recording.** `cap.rPeri` is only
a physical periapsis to ONE consumer — `Lfrozen`. To every other reader, the
compass, the release solver and the renderer included, it is the circle the settle
tightens toward. So overriding it after the freeze authors the radius everywhere
at once with nothing to keep in step, and the frozen ellipse is left honest,
passing through the ship's real position, so the handover has nothing to jump.
`Lfrozen` is computed in `freezeOrbit` from the true radius instead of lazily from
the overridden one. What remains is the settle carrying the ship from 62 out to
130 over `settleDur`, smootherstep'd, peaking at 162px/s.

The pace rides the same seam: `stepPhase` already eased angular momentum toward
the circular value, and now eases it toward the authored rate where there is one.
Easing the same quantity either way is what keeps the settle seamless — the sweep
matches whatever shape currently exists, authored or not.

**Refuel is the first thing in the game that restores fuel inside a capture.**
`fuelRegen` runs only while drifting, so before this, resting anywhere cost the
tank and "catch your breath" was not something the economy could express. Gated on
`u >= 1` so the settled orbit pays and the circularization on the way in does not.
A planet still pays nothing, which `test/anomaly.test.ts` asserts alongside — this
is the anomaly's rule, not a change to what a capture costs everywhere.

**The rules live on the BODY, not on the kind.** `orbitR`, `orbitPeriod` and
`refuel` sit on `Anomaly` beside `bubble`, filled from config at generation. Every
anomaly is identical today; putting them on the instance means anomalies that
differ cost nothing later, and it is the shape `bubble` already established.

**130 is not a taste number.** Twice a planet's 62 so it reads as somewhere else
on arrival, and inside the 177px the camera can hold perfectly still for — that
bound lives in the renderer while the radius lives in `SimConfig`, and nothing
else connects them, so a test asserts the relationship directly.

**The settle is a third of a planet's, for the same reason.** Reported as "I spent
a second or so waiting to stabilize which felt wasted — the screen with just the
purple orb is really powerful and I don't want to delay that effect": the settle
is dead time between committing and getting the thing that was committed to.
`settleDur` joins the other three on the body, at 0.45s against a planet's 1.2s.
`stepPhase` reads `cap.settleDur`, which `freezeOrbit` fills from config for every
ordinary capture, so nothing else changed. Measured end to end, the orbit is
reached at 0.47s instead of 1.20s and **the anomaly is fully centred on screen at
0.72s instead of 2.63s** — the camera gains twice, starting sooner and having less
to travel. The radial glide steepens from 162 to 269px/s, still a glide.

**KNOWN-OPEN, and it undercuts the whole idea.** The boost envelope reaches zero
2.6s after the freeze, and a measured park lasts 8.8s:

```
  rest after settling    boost on departure
        0.0s                 100% of peak
        0.7s                  52%
        1.3s                   5%
        2.0s and beyond        0%
```

So "load up on boosts, catch your breath, and continue" cannot both halves be
true: the fuel gained while resting is paid for with the boost lost. Shortening
the settle makes it marginally worse. Not resolved here because the resolution is
a design choice — hold the envelope open while parked, which removes the release
timing that note 27 just made matter; re-arm it on departure; or accept that
resting and boosting are alternatives. Recorded rather than guessed at.

---

### 37 — Two clamps that both knew the field rule

`src/render/camera.ts` · **[CHANGED]** · reported as "the jagged camera jump on
anomaly departure and return to field"

Measured at **9496px/s on the exact tick the ship re-entered the corridor**. Two
causes, both from the previous two notes.

`subjOut` was a boolean, so the relaxation that lets the view frame a subject
outside the field switched off in a single tick on the way back in. It ramps with
how far outside the subject is now, over half a window.

The larger one: the backstop in `followCamera` ALSO applied the field rule, and
switched it at the boundary, against `cameraTarget`'s own copy of the same rule.
Two clamps that both knew about the field, disagreeing at the crossing, and the
backstop yanked the view 107px. It has one job — the ship stays in the window —
and the field rule belongs to the target, which the ease can only move toward.
Removed. The round trip is 278-484px/s at every release timing tried, with the
settled orbit still at 0.00px and the ship never off screen.

**That invalidated a pin written the same afternoon.** `test/camera.test.ts`
asserted the unrelaxed crossing was harsher than 900px/s, because `barrierRelax`
had looked like the whole of the fix. Removing the duplicate field rule took the
unrelaxed crossing to about 430px/s on its own, so most of that jerk had never
been what note 35 said it was. `barrierRelax` is now worth 13% outbound and 30% on
the way back, and the assertion says that instead — and fails if it ever stops
helping, which is when it should be deleted rather than kept.

---

### 38 — The clearance nudge could fling you out of the capture it was saving

`src/sim/orbit.ts` · `src/sim/capture.ts` · **[CHANGED]** · reported as "what
happened here before death? I kind of shot off the planet at super speed"

`clearanceDv` finds the smallest TANGENTIAL delta-v that lifts a dive's periapsis
clear of the surface. Minimal for that goal, and silent about energy — so on a
near-radial dive it is enormous, bounded only by `circSpeed(target) * 1.2`, about
283px/s, which is comparable to a whole orbit's speed. Sampled over 144 bound
dives that needed clearing, it put **46 of them above escape speed**:

```
  r=120, speed 151 — half the escape speed of 303
  clearance adds 277  ->  334px/s  ->  unbound  ->  gone
```

The ship is then in a capture that can never reach periapsis. It coasts, and in
the reported run it left the field 8px past the right wall with the nearest body
**349px behind it**. The recorded speeds show it plainly and impossibly: 387px/s
at 81px from the planet, then 510 at 139px — you cannot be faster receding than at
closest approach, unless something added energy in between.

The fix turns the velocity toward tangential instead of adding along it. Turning
raises angular momentum and therefore periapsis for nothing, and cannot unbind by
construction. Ejections go 46 -> 0, worst speed gain 277 -> 171px/s.

**Minimal deviation, and that part is load-bearing.** The first version turned
everywhere and put a kink into a scenario that had none — a turn is a sharper
heading change than an addition along the heading, and `clearEaseFrames` is the
one frame-denominated constant in the simulation and may not be lengthened to hide
it. It now starts from exactly what `clearanceDv` would do and only deviates where
that would eject: bit-identical in 93 of 144 sampled dives, and every test that
pins a trajectory still passed without a single number being touched.

21 dives now fall short of the surface target and ride the floor instead. That is
expensive — note 18 measured the floor destroying 44% of a ship's speed in one
substep — but survivable, where being ejected is neither. The "no scenario rides
the minimum-orbit floor" invariant still holds.

**Fixed alongside:** `pnpm check` was failing on another branch's code.
`.claude/worktrees/` holds full checkouts of this repo, and both ESLint and
Prettier were walking them, so a lint error on a different branch blocked a commit
here. Both ignore `.claude` now — the same shape as the `dist` fix that preceded
it, and the second time that directory has broken the gate for reasons unrelated
to any change being made.

**It is on a toggle**, in the tune panel footer, because this changes how the game
feels and the only way to judge that is to fly the same field both ways.
`cameraOrbitLock` 0 is exactly the old camera. Two positions and not a slider: the
question is whether a settled orbit should hold still, and a half-locked orbit
answers neither side of it. `rcfg` is a copy of the defaults now so the toggle can
take effect mid-run — render config cannot reach the simulation, which `pnpm
portable` enforces, so nothing a replay reproduces can move.

### 39 — Every fuel cue lived where nobody was looking

`src/render/fuel-warning.ts` · `src/render/hud.ts` · **[ADDED]** · from
`docs/IDEAS.md`, "flash a brief icon next to ship when running out of fuel"

Fuel is the only resource in the game, and everything that reported on it sat in
the bottom-left corner (the gauge, its flashing LOW badge) or under the score (the
readout's `⚠ LOW FUEL`, `⚠ OUT OF FUEL`). The one moment those matter is the
moment the ship stopped doing what the player asked — the circularisation puttered
out, the flyby brake quit — and at that moment the player is looking at the ship.
The answer was two hundred pixels away, in the periphery, competing with a
starfield.

So the corner gauge is now also drawn beside the ship, miniaturised and empty, for
three flashes on the transition. Deliberately the same object rather than a new
symbol: the shape says "fuel", the colour says how bad, the word says which. Both
colours are `FUEL_RAMP` entries — the ramp's red for empty and its yellow for low
— so the badge and the gauge cannot come to disagree about what red means, the
same reason `accolade.ts` is one table with two consumers.

**A transition, never a state.** Replayed over 54 recordings, 60 minutes of play:

```
                                        fires   per min   sessions
  crossed DOWN through LOW (0.25)          71     1.18      25/54
  crossed DOWN through 0.15                54     0.89      23/54
  ran the tank dry                         36     0.60      15/54
  grab refused for an empty tank            0     0.00       0/54
  re-pressed with an empty tank             0     0.00       0/54

  time spent below LOW: 4.7% of ticks     at zero: 1.1%
```

The tank sits below LOW for 4.7% of a session, so a standing badge beside the ship
would be part of the ship's silhouette for a twentieth of the run and would stop
being a warning. One flash per crossing, at 1.18/min, is roughly one every fifty
seconds.

The threshold is `FUEL_LOW_FRAC`, extracted from the literal `0.25` inside
`drawFuelGauge` and now shared. Measuring 0.15 as an alternative is what settled
it: it only removes a quarter of the firings, which is not worth two cues that
disagree about when the tank is low.

**The re-arm is what makes it a warning and not a tic.** Fuel regenerates during
drift, so a tank parked on the line re-crosses it every second or so. The low
badge re-arms only above 40% of the tank, the empty badge only above 0.5 fuel —
which is `beginCapture`'s own refusal threshold, so it re-arms exactly when a grab
becomes possible again.

**The refused grab has never happened.** Zero times in 60 minutes: the drift you
would be tapping from regenerates enough fuel to grab with before you arrive. It
is wired up anyway, because it is the one case where the game genuinely ignores an
input and the player has no other cue at all, and because `GrabResult` is a union
— a new way to refuse a grab makes the compiler ask whether it belongs here. The
other measured-at-zero trigger, re-pressing mid-capture on an empty tank, was
dropped: running dry already fires while the player is holding.

**It changes nothing under `src/sim/`.** The badge is an observer of
`RenderSnapshot` — fuel, `lastGrab`, `ending` — fed on the fixed tick like `Trail`
(a dip below the line and back can fit between two frames, and that dip is the
whole warning) and aged on the frame delta like `Popups` (three flashes should
look like three flashes at 120Hz). No new snapshot field, no config key, no
`SIM_VERSION` bump; the equality gate stays at exactly zero and the golden did not
move.

It draws BELOW the ship. Score popups rise from `SPAWN_LIFT` above it and keep
rising, and the capture that runs the tank dry is exactly the capture also raising
a word — two channels, two sides. The crash freeze suppresses it entirely: a tank
that ran dry on the way into a planet does not get to explain the planet.

### 40 — A capture you cannot reach is not a capture **[FIXED]**

`src/sim/capture.ts` · `beginCapture()` · **[CHANGED]** · reported as "here my
last capture attempt spent no fuel. Why is that?"

It had not spent any, and nothing was wrong with the fuel. The grab took, entered
`clear`, and `clear` is the free phase — only the settle (`fuelPerSec`) and the
flyby brake (`flybyFuelPerSec`) ever spend. A capture converts to a settle at
**periapsis**, and that grab had none ahead of it.

The press at tick 777 re-grabbed the planet it had released from eleven ticks
earlier:

```
  r = 100      speed 311      escape speed there 331   ->  BOUND (94% of it)
  radial velocity +223                                 ->  already leaving
```

`boundGrabsCapture: true` says a grab below escape speed is a capture, so: phase
`clear`, waiting for a periapsis on the far side of an orbit roughly ten seconds
wide. The checkpoints — phone truth, though that session's replay diverged at tick
200 — show the whole hold in one column:

```
  tick 780   r=100   speed 311   fuel 77.2   clear
  tick 840   r=284   speed 180   fuel 77.2   clear
  tick 900   r=425   speed 140   fuel 77.2   clear
  tick 920   r=467               fuel 81.2   drift   <- released, regen resumes
```

Re-flown from the tick-780 checkpoint: out of bounds against the left wall at
**t=2.78s**. The field was three seconds away and periapsis was ten. Two seconds
of holding the button, no fuel, no burn indicator, and no readout — `clear` is the
one phase with nothing to say, while a flyby gets `BRAKING — n% over`.

**`boundGrabsCapture` had traded one failure for its mirror.** The prototype
called any outbound grab a flyby regardless of speed (41% of grabs, note at the
key); the replacement rule says bound is always a capture, which says nothing
about whether the capture is REACHABLE. Measured over 55 recordings, 60 minutes,
694 grabs that began in `clear`:

```
  OUTBOUND grabs        n   reached periapsis   run ended still holding
    below 0.65         31        12 (39%)              3 (10%)
    0.65 and above     78         4 ( 5%)             16 (21%)
  INBOUND, 0.80+      136       124 (91%)              1 ( 1%)
```

Above 0.65 of escape speed an outbound grab converts four times in seventy-eight
and ends the run one time in five. Below it, it behaves like an ordinary slow
grab. So `outboundFlybyFrac` is 0.65 — the resolution the data supports, not a
rounder number that would look more deliberate. It reclassifies 78 of 694 grabs
(11%), against the 41% the prototype's rule caught.

**A flyby is the right answer for them, not a refusal.** The brake is the
mechanism that fixes this exact shape: it sheds radial speed first
(`flybyRadialBias`), it already knows the case (`flybyOutwardEase` — "brake gently
so the ship coasts wide and arcs back"), and conversion needs bound AND inbound,
so a braked outbound grab converts when it has actually turned around rather than
the instant it is classified. The same re-flight, under the new rule:

```
  t=0.02  flyby   fuel 76.5      the brake fires
  t=1.02  flyby   fuel 59.3      radial speed shed
  t=2.02  clear   fuel 68.2      bound AND inbound -> converted, refund paid
  t=4.02  settle  fuel 63.1      periapsis reached
  t=4.93  orbit   fuel 46.9      settled
```

Out-of-bounds death becomes a stable orbit for 30 fuel — and holding costs fuel,
which is what the report was asking for.

**The prototype holds 1, not 0.** The key is inert under
`boundGrabsCapture: false`, so the prototype cannot tell the difference and the
gate stays at exactly zero — the golden recapture moved one line of recorded
config and not one number. But `configFromReport` resolves a missing key from
PROTOTYPE_CONFIG, and a report recorded before this key existed ran with bound
grabs as captures. 1 is what those sessions did; 0 would replay every one of their
outbound grabs as a flyby and still grade itself faithful. That is note 21, and it
is why the prototype value is chosen by what older reports did rather than by what
looks inert.

**It is a knob**, `CATCH` in the tune panel's FLYBY group, because it changes how
the game feels and the only way to judge that is to fly it. It sits at the top of
that group rather than in CAPTURE: what it moves is which grabs REACH the brake,
so it is the door into the group, not a property of the dive. 1 is the old rule, 0
is the prototype's.

**Fixed alongside:** `pnpm check` failed on a measurement script. `scratch/` is
gitignored for exactly those (AGENTS, "thresholds are measured"), but ESLint and
Prettier were still walking it, so a throwaway file blocked the gate — the third
time a directory that is deliberately not part of the build has done this, after
`dist` and `.claude`. Both ignore `scratch` now.

---

### 41 — The backstop outranked the wall, by 18px, everywhere

`src/render/camera.ts` · **[CHANGED]** · reported as "I can see past the dashed
red line if I approach the side"

Note 37 removed the field rule from `followCamera`'s backstop because two clamps
that both knew the rule fought at the boundary and yanked the view 107px. What was
left behind is a framing-only bound at the full `cameraBackstopEdge` — and that is
not a WEAKER version of the target's rule, it is a stronger one. Applied after the
ease, it outranked the field everywhere: to hold the ship 18px inside the window a
ship hugging a side wall dragged the view exactly 18px past the barrier.

Measured with no anomaly within thousands of px, on both walls and at every speed:
`cam.left` settles at `field.left - 18`.

The fix is not a third rule but one fewer. `panBounds` computes the intersection
once and both the target and the backstop read it, so there is nothing left to
disagree. Continuity across the barrier was never the field rule's doing — it is
the framing edge ramping with how far outside the ship actually is, which note 35
already built and which the shared bound inherits. Inside the corridor the edge is
zero, the field rule binds, and the guarantee degrades to "the ship is somewhere in
the window", which is what it meant before anomalies existed.

The real crossing is unchanged to the pixel: 249px/s at 228 and 390px/s at 352,
the same numbers note 37 measured. The counterfactual arm of that pin — `relax`
forced to zero, which is a barrier crossing with no bubble and therefore something
the simulation cannot produce — is back up to 643-1280px/s, and the pin now says
why that is not a regression.

---

### 42 — The brake bought energy back at the freeze

`src/sim/step.ts` · `src/sim/capture.ts` · **[CHANGED]** · reported as "when I was
approaching to circularize my ship snapped to a lower orbit. The snap was too
jerky."

Two independent causes of one visible thing: the ship SPEEDS UP as it settles.

`whipE` is the peak specific orbital energy seen during a dive, kept as a running
maximum so the minimum-orbit floor cannot crater it — a head-on dive that clips the
floor loses radial speed to the clamp, and reading the instantaneous speed at the
freeze would flatten the oval it earned into a circle. `freezeOrbit` reconstructs
the periapsis speed from it, and that speed is exactly what the phase clock's first
tick flies at.

**The flyby brake is the opposite of a clamp.** The player spends fuel to shed that
energy on purpose, and the maximum never came back down, so the freeze handed all
of it back. On the repo's own `fast unbound grab -> flyby, braked` scenario: 28
fuel spent braking, arrival at periapsis doing 375px/s, first tick of the settle at
**543px/s — a 45% step in one tick**. The mark now follows the brake down by
exactly the energy the impulse removed, behind `flybyBrakeShedsWhip` (false in the
prototype config, so the gate is untouched). The floor still cannot lower it, which
is why the same scenario still steps 11%: that part is the oval, and deliberate.

**An authored orbit has no use for the reconstruction at all.** An anomaly
overrides `rPeri` and authors the sweep, so the ellipse `vPeriTrue` shapes is
discarded — the only thing it can still reach is the speed the settle starts at.
Measured on synthetic arrivals: 155 -> 517px/s, and 257 -> 503. Off the ship's real
speed there is nothing to step, and the eccentricity that survives is the honest
one (0.24 rather than the 0.6 cap on the session that reported it). Needs no flag:
`anomalyCount` is 0 in the prototype config.

---

### 43 — The press is the arrival, because everything before it was waiting

`src/sim/capture.ts` · `src/sim/step.ts` · `src/sim/types.ts` · **[CHANGED]** ·
reported as "the anomaly circularization took way too long" and "I want to settle
into orbit around an anomaly in 500ms or so"

Measured on the two sessions that reported it, press to parked:

```
                  flyby + brake   fall to periapsis   settle    total
session 1            1.93s / 65 fuel        ~0.1s      0.45s    2.47s
session 2            2.10s / 63 fuel         2.00s     0.45s    4.55s
```

`anomalySettleDur` — the thing named after settling — is 10-18% of it. Turning it
down could not have fixed this, and the report that asked for 500ms was asking for
something the knob could not reach.

So an anomaly now freezes at the PRESS. There is no flyby to brake and no dive to
fall, and what is left is an authored approach: a quintic in radius whose near end
is the ship's own position and closing rate and whose far end is the authored
circle, reached with no radial speed left. It takes `settleDur` from anywhere —
that is the whole of "quick regardless of speed or distance", the clock is fixed
and the distance is whatever it is. Measured across seven arrivals from 127 to
426px and 0 to 418px/s: **0.45s, every one.**

**Both ends of the curve are nailed down, and so is the acceleration.** A cubic
was tried first and matches position and velocity, which sounds sufficient and is
not: with nothing said about the second derivative the pull-in opens at full
strength, 8770px/s² arriving between one tick and the next, a 146px/s velocity step
at the instant of the press. Continuous, and still a jolt. The quintic adds
`r''(0) = r''(1) = 0` and costs 25% more peak radial speed in the middle, which
nobody has ever complained about. The first glide tick is now within 2-6% of the
speed the ship pressed with, against 7-35% under the cubic.

The velocity carries its radial component now, which the tangential-only form used
by the ellipse could not: a glide is closing as well as sweeping, and the release,
the trail and the camera all read that vector.

**It costs nothing.** The brake it replaced cost 65 and 63 fuel in the two
sessions, half of it refunded on conversion — an economy that existed to pay for
waiting. The hard part of an anomaly is the release that gets the ship inside the
barrier, and that is already paid for.

Two fixtures had to move, both because they were pinned to a clock that changed:
`test/score.test.ts`'s anomaly session let go at a tick that used to aim home and
now aims out through the far side of the bubble, which killed the ship and took
`anomalyBonusMult` inert with it — the release tick is chosen from the parked
orbit's PHASE, and only part of that circle points back at the corridor.

---

### 44 — The barrier is only negotiable where an anomaly holds it open

`src/render/camera.ts` · **[CHANGED]** · reported as "as I approach the sides the
camera pans past the dashed line and I see the black background beyond it"

Note 41 fixed the backstop outranking the field and was not enough, because the
leak it fixed was the small one. `panBounds` lets framing take over from the field
rule when the ship is OUTSIDE the corridor — which is right at an anomaly, where
the ship is legitimately out there and a view with the ship missing is worse than
a view with some black in it. But "outside the corridor" is also true of the last
four pixels of an ordinary run into the wall, and then of the whole `crashPause`
that holds the wreck out there afterwards. Replayed from the reported session, the
view sat **82px into the void, on both walls**, with no anomaly within thousands of
pixels — and most of it during the 0.7s hold, which is the part of a death the
player actually looks at.

The gate is `escape`: `relax / cameraBarrierRelax`, which is nonzero only inside an
anomaly's bubble. It multiplies both places where the field rule yields — the
framing edge and the `subjOut` ramp — so the handover happens where the barrier is
suspended and nowhere else. Ramped rather than switched, because leaving the far
side of a bubble is fatal and a boolean would snap the view back to the corridor on
the tick of the death; easing it back over the last stretch reads as the safe
ground running out.

**The conflict resolution flipped with it.** When framing and the field cannot both
hold, the range used to be handed to framing outright — which is the other half of
the same bug, since a ship four pixels past a wall makes them unsatisfiable
immediately. Now it resolves to the nearest legal point inside the field range,
which is continuous in `shipX` and means the ship, not the wall, is what leaves the
frame. It is dead; the wall is the thing worth looking at.

That cost the framing guarantee its "however fast" wording, which was always
conditional and is now honestly so: inside the corridor the ship never leaves the
window, and past a wall it does. The pin is split in two to say both.

**A third rewrite of the barrier-crossing pin, and this one changed its meaning
rather than its number.** `relaxOn: false` used to be a rougher version of the same
crossing; `relax` is now the only thing that lets the view past a barrier at all,
so the bare arm is a different outcome — the wall holds and the ship goes off the
edge. Asserted as that, and the relaxed arm is unchanged for the third time at
1.09x and 1.11x of ship speed.

One consequence worth writing down: near an anomaly you CAN see past the dashed
line, by up to `cameraBarrierRelax`, while still inside the corridor. That is note
35 working as designed and it is what makes the crossing smooth. It is bounded to
within 400px of an anomaly, and everywhere else the line is absolute again.

---

### 45 — The anomaly arrived at the same moment the ship did

`src/render/camera.ts` · `src/render/edge-markers.ts` · `src/render/snapshot.ts` ·
**[CHANGED]** · reported as "I didn't have a lot of time to react to the anomaly
to capture it. I was en route to crash into it."

Reconstructed rather than replayed: the approach is pure drift, so a straight line
off the t1500 checkpoint is exact phone truth.

```
  d=560  t1508  in grab range — but a nearer planet takes the press
  d=400  t1539  bubble entry
  d=395  t1540  the anomaly becomes what a press would take
         t1550  the ship crosses the wall
  d=178  t1583  THE PRESS — anomaly still 95px left of the window edge
  d=133  t1592  the anomaly's disc first appears
  d= 84  t1602  crash cone refuses a grab
  d= 66  t1606  impact
```

**The press was made blind.** The anomaly became visible 0.15s AFTER it, and 0.23s
before impact, at 303px/s. It sits `anomalyOffset` past the wall and the view may
not reach it until the bubble opens the barrier, so it arrives on screen with the
ship rather than ahead of it.

Two fixes, because the camera cannot carry this alone. An instantaneous camera
glued to the anomaly — which would itself read as the view abandoning the ship —
reaches 0.83s, so that is the ceiling on camera work. `cameraAnomalyLead` leans the
view toward the anomaly inside its bubble, at half weight, through the same subject
blend a settled orbit uses and riding `barrierRelax` so it arrives with the barrier
opening. Worth 0.23s -> 0.40 on the reported line and 0.117 -> 0.300 on a steeper
synthetic one.

**The larger half was that nothing said the grab was available.** The window is
1.03s — from the tick the anomaly becomes the nearest body to the tick the crash
cone refuses it — against 0.23s of being able to see the thing. So the snapshot now
carries `grabOffer`, which is `grabTarget`'s own answer rather than a second copy
of its four tests, and the edge marker rings the body a press would actually take.
That distinction is the part that surprises: for the first 32 ticks inside
`grabRange` a nearer planet would have taken the press instead, so "an anomaly is
in range" would have been a lie.

The ring survives the body coming into view — off screen it rides the arrow, on
screen it goes round the body — because a cue that blinks out at the moment you
can finally see the thing is worst exactly when it matters.

**`orbitLock` grew a third case, and it is a framing fix rather than tidiness.** A
planet's settle is deliberately unlocked because the oval is the drama; an
anomaly's settle has no oval, it is a glide onto the authored circle (note 43). Left
unlocked, the weight dipped to nothing between the approach's lean and the parked
orbit's lock, and the lock then arrived AFTER the ship had parked and panned
367px/s of its own — with the ship squeezed to 5% of the window width on the way
in, against 14% with the lock held through.

---

### 46 — The floor pin: a run that could not end **[FIXED]**

`src/sim/capture.ts` · `src/sim/config.ts` · **[CHANGED]** · reported as "my ship
got stuck on the surface" and, seven weeks of sessions later, "I got stuck when
trying a kinky capture"

Diagnosed on 2026-08-21 and left unfixed, because the fix was a choice between
three and none had been picked. The second report picked it: this is measurably
common, not a curiosity.

The chain, all confirmed:

1. A near-radial FLYBY dives into the minimum-orbit floor.
2. The clamp cancels inward radial velocity every substep; with no tangential
   component left, the total reaches exactly zero.
3. Below 1px/s the flyby brake is off, so no fuel burns and nothing pushes. The
   recorded fuel sitting perfectly constant is the tell.
4. Conversion needs `vrad < 0`. At rest it is not, so the capture never converts —
   and `applyClearance`, which exists to stop a dive reaching the floor, is gated
   behind exactly that conversion.
5. Gravity pulls in, the clamp cancels it. Stable equilibrium.
6. On release the velocity is still zero, so the ship drifts at zero forever.

**Nothing in the simulation can end a run that is not moving.** It never falls
behind the trailing floor, never leaves the field, never crashes. The reported
session sat at (170.55, -1656.6) with velocity exactly (0,0) for the rest of the
recording. Only a reset escapes.

Measured over 1224 close, fast, near-radial presses under the CURRENT config:
**23.6% pinned**, rising with speed — 6.5% at 300px/s, 34% at 500. Worst exactly
where the game is being flown hardest. The 2026-08-21 note put it at 19% falling to
1%, on a longer-range repro that no longer reaches the stall at all: pressing from
700px out gives the brake time to work, and a dead-centre press from there is now
refused by the crash cone. Re-measuring under the current config was the difference
between "a curiosity at low speed" and "a quarter of the region, worst when fast".

The fix is one clause: stop gating the cure behind the thing the disease prevents.
`clearanceOnFlyby` gives a flyby the same impulse a bound dive already gets, at the
press rather than on conversion. It is a no-op unless the natural periapsis is
inside the floor, so a flyby that would have sailed clear is untouched tick for
tick. A 23,436-press sweep finds 32 standstills with it off and none with it on.

Collateral over 1599 flyby presses with realistic aim: conversions 1325 -> 1318,
and 19 of the 104 that used to sit in flyby forever now resolve — mostly by sailing
out of bounds, which is the honest end of a flyby that cannot be braked.

The two rejected alternatives, both measured rather than argued away: a minimum
tangential speed at the floor clamp catches every route to the floor, but the clamp
is the contact the capture feel rests on and note 38 put more bound dives onto it;
ending the run at a standstill is the simplest and leaves the stall in place,
trading "I got stuck" for "I died for no visible reason".

---

### 47 — The zip is a charge, not an anomaly feature

`src/sim/charges.ts` · `src/sim/capture.ts` · `src/sim/types.ts` ·
`src/score/score.ts` · **[CHANGED]** · asked for as "I LOVE the zip to anomaly
feel — can we have that same ZIP when I press again to capture a planet after
coming home?"

Note 43 made the press the arrival at an anomaly and it reads as the best moment
in the game. The ride home is the flattest: measured over 248 planet captures,
**3.42s median from press to parked**, p90 6.45 — of which 2.22s is a dive the
player has already earned the right to skip.

So leaving an anomaly grants one `zip` charge, and the next capture spends it.

**Built as a ledger rather than a flag, on request**, because the zip is a good
powerup and this is the shape that lets it become one. `SimState.charges` is a
record keyed by `ChargeKind`; `grantCharge` and `spendCharge` live in their own
leaf module so a source knows nothing about what the charge does and the site that
spends it knows nothing about where it came from. A second source — a pickup, a
streak reward — is a one-line call. `freezeOrbit` now takes a structural
`AuthoredOrbit` rather than an `Anomaly`, which is what lets a charge author an
arrival at a body that authors nothing.

**What it glides to is not authored.** It is `predictedCaptureOrbit().periapsis` —
the orbit the dive was heading for, the same curve the compass already previews
while diving — so aim still decides how tight the orbit is, and the parked radius
lands within 15% of the flown one in 86% of approaches. The period is the true
circular one at that radius, so what the ship is left in is physically correct
rather than an authored pace. A zip is a shortcut, not a different destination.

**The scoring call was measured and it reversed the answer.** Judging a zipped
grab on the ORBIT it reaches sounds fairer — the zip does the closing, so score the
closing — and it pays 1.35x the flown award, p90 7.6x, worst **14.6x**. It is most
generous exactly to the lazy point-blank press it was supposed to discourage,
because `predictedCaptureOrbit` applies the clearance correction and lands almost
any near aim at `minR`. On `grabR`, the way every other grab is judged, the ratio
is **1.00 across all 446 pairs**. So the award is untouched and only its TIMING
moves: a flown capture owes it at periapsis, a zipped one when the glide ends,
since there is no periapsis to swing through. `Capture.zipped` exists for that one
question and nothing else.

No flag beyond `zipDur`, and no gate risk: the prototype config has no anomalies,
so it has no source of a charge. `zipDur` is its own key rather than
`anomalySettleDur` because a charge is not an anomaly — the first powerup that
grants one will want to tune it without moving the rest stop's feel.

**Noticed while measuring, not fixed:** a press during the death hold begins a
capture on a dead ship, because input edges are handled before the ending check in
`stepSim`. Harmless today — `respawn` clears the capture and the charges — but it
is why a probe that put `highWaterY` below the ship saw a capture frozen at tick 1
with `settleT` never advancing.

---

### 48 — A subject may not change identity while it is being looked at

`src/render/camera.ts` · **[CHANGED]** · reported as "the field return felt REALLY
abrupt compared to zipping to the anomaly"

The zip home is mechanically GENTLER than the zip out on every axis measured —
peak speed 792 against 1048px/s, peak acceleration 4599 against 5974, total turn
289 against 416 degrees. The glide was never the problem. The camera was, and the
regression was introduced by note 45.

`followCamera` snaps `cam.anchorX/anchorY` to whatever anchor it is handed but
EASES `anchorW`. The subject is `ship + (anchor - ship) * w`, so adopting a
different body while the old one still has weight moves the subject by the
distance between them times that weight, in one tick. Before note 45 there was no
anchor while drifting, so every press started from zero weight and the swap was
free. The approach lean changed that: leaving the anomaly, still inside its
bubble, the lean was holding 0.43 when a press took a planet 500px away.
**6846px/s on that single tick**, against 909 for the whole anomaly zip.

Two fixes, and the second is the one that also makes sense on its own.

`Camera.anchorId` — identity, not position, because comparing coordinates starts
lying the day a body moves. A different id is not adopted until the old weight has
decayed, holding the old position while it does, exactly as the end of a capture
already does. Pressing on the body already being leaned at is not a swap and flows
straight through, which is why the anomaly zip was always fine. 6846 -> 933px/s.

**The lean is for an APPROACH.** It exists to put the anomaly on screen before the
ship gets there; on the way home it is a hand on the shoulder pulling backwards.
Faded by the radial component of velocity rather than switched on its sign, so a
parked orbit — which closes and recedes every half lap — has nothing to flicker.
933 -> 409px/s at the press, and the worst movement anywhere in the glide from
1175 to 792.

For scale, what the camera does at an ordinary planet grab is 151-180px/s. A zip
is a big camera move because the ship really does cross 200px in half a second;
what it should not be is a bigger move than the ship makes. Measured as a ratio of
the ship's own peak speed: ordinary grab 0.38, anomaly zip 0.87, field return
**1.48 before and 1.00 after**.

Two things that were tried and measured worse, recorded so they are not tried
again. Holding the lock through a zipped planet settle — the obvious reading of
note 45's third `orbitLock` case — changes the numbers by nothing at all
(792 both ways): `cameraOrbitEase` is 3 and the glide is 0.45s, so the weight
barely moves before it is over. And decaying a swapped-out anchor FASTER makes it
worse, not better, because the subject then snaps back toward the ship: at 2x,
3x, 5x, 8x the ease the press-tick movement runs 1325, 1705, 2426, 3412px/s
against 933 at the plain rate.


### 49 — The anomaly's reward was received, not spent

`src/sim/types.ts` · `src/sim/capture.ts` · `src/sim/step.ts` ·
`src/sim/config.ts` · `src/score/` · `src/render/` · **[CHANGED]** · asked for as
"a 5s timer during which the player can zip to the next planet… each hop should
provide a purple point boost… the ship electrified, as if infected by the purple
anomaly"

Leaving an anomaly used to grant two things, and neither of them asked anything of
the player once earned:

- **one `zip` charge** (note 47), with no expiry, spent whenever you next felt
  like it;
- **a ten-second x2 scoring window**, which paid out simply for continuing to fly
  the way you already were.

Both are replaced by one thing that has to be **spent under a clock**:
`SimConfig.chargedSecs`, five seconds during which *every* grab zips. What a
window is worth is now a question about how fast you can fly it.

**The window is simulation, not score, and that was forced.** `bonusUntil` was
legal in `ScoreState` because it only ever multiplied points. A window that
decides whether a grab dives or glides changes what the ship can physically do,
and `pnpm portable` forbids `src/sim/` from importing `src/score/` — a simulation
that asked the scorer for permission would stop being a pure function of
`(config, seed, inputLog)` and diagnostics replay would go with it. So it moved:
`SimState.chargedT`, seconds drained by `dt`, which is how every other duration in
the simulation is kept (`ending.t`, `boostT`, `settleT`). The scorer's windows are
tick deadlines instead, because a scorer must not assume how often it is called;
nothing inside `stepSim` has that problem.

**The drain runs at the top of the tick, before the input edges.** Both halves of
that matter. A grab arriving exactly as the window runs out dives rather than
zipping, and a release that opens a window does not immediately lose a slice of it
to the tick it was born in — measured, `chargedT` reads exactly 5.00 the tick
after the release, and the window closes 300 ticks later.

**A hop is read off `cap.zipped`, never off the live window.** A zip is committed
at the press, and the 0.45s glide it buys can outlast the countdown. Re-checking
at the arrival would mean a hop begun legally inside the window silently paid
nothing because it landed a tick late — punishing the player for the one thing the
window is asking of them, which is to hurry.

**`hopBonus` is flat, and it is the only award in the game that is.** Every other
one ends in `raw * multiplier`. Reaching an anomaly is hard and usually costs the
streak on the way out to it, so a reward that shrank exactly when it was hardest
to earn would be the wrong shape. It also *replaces* the grab award rather than
adding to it — one clean number at the busiest moment in the game. Nothing about
flying well is lost: the link at the release is untouched and still scores aim,
timing and climb with the full multiplier, so the skill is still paid, at the
other end of the same capture.

**Once per body per window**, cleared on the rising edge of the window. Without
it, the optimal line inside a frenzy is to bounce on one planet: a
press-glide-release cycle is about 1.2s, so the same body would pay three times
without the ship going anywhere, in a game whose whole subject is climbing. The
zip is never refused — it simply stops minting.

**An anomaly is never a hop, even when zipped to.** Arriving at one is what
`anomalyBonus` exists to pay for, and it opens the next window; calling that a hop
would replace the largest award in the game with a flat 500 and quietly make
chaining anomalies worth less than chaining planets.

**The purple is a fourth channel in `accolade.ts`, not a category colour.** The
ladder means how good, and re-adding a category hue is banned for reasons recorded
at that file. A hop is not an answer to "how good was that?" — every hop pays the
same — so there is no quality for a rarity colour to report. What the colour says
is which MODE the game is in, which is legitimate where a category is not: a
category has to be learned, whereas the player is already looking at an
electrified ship and a draining purple bar. `SHOUT` established the precedent of
an off-ladder channel; this is the second. The hue is the anomaly's own
`rgba(168,92,255)`, and it was measured like the ladder was — **dE 45.8** to its
nearest neighbour, against this set's existing closest pair at **dE 41.0**
(`ROUTINE` vs `good`).

**The arcs are drawn outside the silhouette**, and that is the whole reason they
read: the hull is nine design pixels long and both markings it already carries
live on its outline — amber for a braking flyby, purple for a held grab. A third
treatment there would have to compete with those; the space around the ship is
empty and free. They are seeded from the tick rather than `Math.random`, so a
replay shows the crackle the player saw.

**The web goes forward.** Reported from a faithful replay as "when we have our
anomaly charged, it should never grab the same planet that the player is coming
from — it should really feel like Spider-Man sending sticky web forward and
pulling us ahead". Measured in that session: of five presses inside one window,
**three zipped straight back onto the planet just released from**, because after a
release you are still well inside `grabRange` of it and it is the nearest thing
there is. The claim log stopped them minting points, which was the wrong defence —
the movement was the problem, not the payment.

Excluding `cameFrom` was necessary and **not sufficient**. With only that, the
same session went P17, P18, P19, P18, P17: the ship stopped repeating a body and
started walking DOWN the field one neighbour at a time. On both backward grabs
there were two bodies above and within range, so a forward preference would have
redirected them and refused nothing — which is what it now does. The window went
from two hops to four, climbing P17 → P18 → P19 → P20.

**A preference, not a gate.** `nearestBody` records why a heading cone was
refused: a threshold is a cliff the player falls off as a body drifts across an
arbitrary line. Nothing here is ever forbidden — with no takeable body ahead, the
ordinary nearest one is still offered, minus the one you came from — so the rule
cannot waste a press or let a window expire on a refusal. It only decides WHICH
body a press takes when there is a real choice. "Forward" is up, which is not an
arbitrary axis in this game: the field is a vertical climb, the score pays for
altitude, and falling behind the trailing floor is what ends a run.

**One orbit, every hop.** A zip used to land on the orbit the dive would have
reached — `max(minR, predictedCaptureOrbit().periapsis)` — on the reasoning above
that aim should still decide where the ship ends up. Reported as "I sometimes got
high orbits and sometimes low", and measured across 108,000 approach geometries
that is not a gradient but a lottery:

| | ×minR | px above minR |
| --- | --- | --- |
| min | 1.00 | 0 |
| median | 1.36 | 20 |
| p75 | 3.13 | 123 |
| p90 | 4.78 | 210 |
| max | 8.13 | 330 |

43% pin exactly at the floor and the top quartile sits 3.1x to 8.1x above it,
with no way for the player to tell in advance which they will get. A frenzy is a
rhythm and a rhythm needs every beat the same, so `chargedOrbitR` is now an
absolute 90: identical height AND period on every body — 247px/s, 2.29s a lap.
Absolute rather than a multiple of `minR` because that is what makes it literally
fixed, and it is the idiom `anomalyOrbitR` already uses, which is part of why a
rest stop reads as a place rather than as a result. Clamped above `minR` at the
point of use, so a body large enough can never orbit inside itself. Scoring is
untouched: a zipped grab is paid on press distance, not on the orbit it reaches.

**Numbers.** 500 a hop, about four hops in seven seconds — a hop cycle is the
0.45s glide, plus `boostArmTime` before a release earns its boost, plus the
crossing to the next body. Started at five seconds, which measured at three hops and read as a
repeat rather than a rhythm. So ~2000 a window, against the ~2500-3000 the x2
window was reckoned at, and an anomaly is deliberately worth somewhat less than it was.
The difference is made up where the hops leave you: four planets of altitude is
~280 raw climb banked into the next link, paid by machinery that already existed.

**The charge system is gone.** `src/sim/charges.ts`, `ChargeKind`,
`SimState.charges` and `test/zip-charge.test.ts` all went with it — the window is
the only gate now, so the ledger had neither a source nor a consumer. Keeping it
dormant against a future pickup was considered and declined: speculative
infrastructure for something that does not exist is the same bet as a knob that
does nothing. Git remembers note 47 if a pickup ever wants it, and it should be
rebuilt against whatever the paradigms are then.

**The storm.** While a window runs the sky around the ship becomes a purple
nebula. Lightning was tried and cut: forked bolts over a moving starfield read as
tacky decoration and competed with the ship's own arcs, which are the cue that
means something.

It went through three shapes. A screen-space wash was a filter laid over the
picture and read as the game changing its mind about the palette. A single radial
gradient centred on the ship fixed that and was completely dead — the same smooth
blob at every moment, with no structure to move past, so flying through it felt
like carrying a lamp. What is there now is a field of overlapping clouds hashed
from a coarse WORLD grid: they parallax with the starfield, they differ from one
another in size and in how far they lean pink against deep violet, and the gaps
between them stay near black, which is where the light and dark areas come from.
Nothing darkens anything — the sky underneath is already black, so a dark area is
simply a place no cloud is lighting. The ship is always inside the storm because
cells are drawn around wherever it is; WHICH cloud it is inside changes as it
flies.

**And then it had no direction.** A field of soft blobs reads as fog: reported as
"I don't really see any northern lights effects and I can't quite discern the
purple". So the clouds were demoted to texture and the aurora proper was added on
top — long wavy curtains anchored on world y, sweeping down past the ship as it
climbs. **A stroke stack cannot be a blur, and two attempts at one proved it.** Three
hand-listed passes at 86/44/16 looked drawn on — reported as "the waves look kind
of tacky" — so they became eight passes on an `exp(-2.6t²)` Gaussian profile, on
the theory that finer steps would stop the banding. A screenshot from a phone
settled it: the terraces were still plainly visible as concentric lines fanning
out of every band. They always would be. Every stroke is solid with a hard
boundary, so N passes draw N terraces however their alphas are weighted; more
passes only makes the contour map finer.

So the curtains are now rendered into an offscreen canvas at 1/`DOWNSCALE` and
drawn back up to full size with image smoothing on. The bilinear filter blurs
across every step for free. `DOWNSCALE` is the blur radius in disguise — the
upscale interpolates over that many screen pixels — and 8 is where the softness
stops improving and the ribbon starts losing the wave, whose features are only a
few tens of pixels across.

It is also much cheaper than what it replaced: three strokes over 1/64th of the
pixels plus one composite, against nineteen full-resolution strokes up to 184px
wide. `ctx.filter = 'blur()'` is the direct alternative and stays declined — it
forces an offscreen rasterisation of its own on every draw call, its cost scales
with the blurred area rather than with the geometry, and it would have to be
applied once per curtain rather than once per frame.

The buffer is injectable, and `test/render.test.ts` supplies one. Without that the
suite finds no `document`, takes the hard-stroke fallback, and covers a renderer
that never ships; the charged scene now asserts that a composite actually
happened.

**It shipped broken once, and the cast is why.** `this.target()` returns the
buffer's CONTEXT, and the composite was written as
`ctx.drawImage(buf as unknown as CanvasImageSource, …)` — passing the context
rather than the canvas. A browser throws a `TypeError` for that, which aborted
`Scene.draw` before the starfield, the bodies or the ship were reached, leaving
the black fill and the sky wash and nothing else. Reported from a phone as "the
whole screen goes purple when I release from the anomaly, all other objects
disappear, ship and planets and all" — which is exactly what a half-finished
scene draw looks like from the outside, and reads nothing like a type error.

Two things let it through. The blanket cast turned the one argument the compiler
could have checked into `unknown`, and the recording stub in `test/canvas-stub.ts`
accepted any argument to `drawImage`, so 446 tests stayed green. The stub now
throws on anything without a numeric `width`, the way a browser does — verified by
reintroducing the bug and watching the charged scene fail with the same
`TypeError`. A cast that silences the compiler needs a runtime check standing
behind it, or it is just a way of not being told. The wave is two summed sines of different periods, because
one reads as a drawn ripple and two look blown.

Intensity went up with it — roughly a third across the sky floor, the clouds and
the curtain spine.

**Then they read as horizontal snakes.** Two numbers were wrong together. The band
was too thin — 104px at its widest, which is a line rather than a ribbon — and the
undulation too shallow: 40-130 of amplitude over a 260-580 wavelength never
exceeded a slope of about 0.5, so a curtain lay along the screen instead of
climbing and diving across it. Now 184px wide, with 130-240 of amplitude over a
200-360 wavelength, for slopes of 0.36 to 1.20.

Those cannot be tuned independently. A band 184 wide swinging 240 either way spans
664 world units, against a viewport 651 tall — so `BAND` went 320 to 480 and the
keep rate up to 0.85 to compensate, or the sky would have gone back to being a
wash. Fewer, larger ribbons: 2.4 on screen at once rather than 3.3, and cheaper
for it. The first pass at "less intense" had overcorrected to the point
where the effect was hard to see at all.

Off-screen clouds are culled before a gradient is touched. `REACH` is 760 world
units in every direction and the viewport is a tall narrow slice of that, so most
of the grid is behind the camera's back — measured, the cull takes a frame from
about 29 gradient fills to a mean of 12 and a worst case of 14, and each one that
survives costs up to a full-viewport alpha blend. Curtains are culled vertically
for the same reason, and add a mean of 19 strokes — about 2.4 curtains on screen
at once, eight passes each.

The first version scaled the whole effect by the window's remaining fraction, so
it dimmed linearly to nothing and the end of the best moment in the game arrived
with no signal — reported as "it kind of fizzles". Intensity now HOLDS, the last
fifth agitates (a faster, deeper pulse without the room getting darker), and the
close is a bloom-and-collapse that pulls the storm into the ship. The collapse is
cubic over 1.05s rather than linear over 0.5s: asked for as "a hair longer, so it
exhales", and the shape matters as much as the length — the length belongs in the
release, not the attack, so the bloom stayed brief. The countdown is
the gauge's job; this one's is atmosphere and an ending. That animation is clocked
by `Scene`, not by the drawing, because it describes a window that has already
ended and `chargedFrac` is 0 throughout it.

The ship's glow and arc count build with `hopped.length`, capped at four: past
that the arcs stop reading as separate discharges and become a fuzzy ring.

**The per-hop number is small and the total is large.** `HOP` dropped to 11px:
three or four arrive inside seven seconds, on top of whatever else is in the air,
and at a praise word's size they were the loudest thing on screen for the least
interesting reason — every one is the same number. They are receipts. The closing
`Tally` is the headline at 26px, and it is DISPLAY ONLY: every point in it was
banked as its hop landed. Paying again there would double the window; holding the
points back until there would mean dying mid-window cost the player everything
they had already earned. It drops the `+` so a fourth number arriving as the total
of three does not read as a fourth award, and `endLife` clears the edge so a
frenzy that ends in a wall gets no consolation total.

**A dev-only anomaly at the bottom of the field.** `anomalyAtSpawn` drags the
first anomaly level with the opening body so the window can be reached in seconds
rather than after a minute of climbing. A config key and not an
`import.meta.env.DEV` branch inside world generation, for two reasons: `src/sim/`
may not read bundler syntax, and a run is `(config, seed, inputLog)` — as a key it
is recorded in the report, so a dev session still replays exactly. `app/main.ts`
sets it, which is where knowing about the bundler is legal. The position is
overridden inside the placement loop rather than branched around it, so `rnd()` is
called the same number of times in the same order and the corridor a seed produces
is untouched — pinned by a test.

That needed a FOURTH case in the replay header's config classification. Dev
sessions are where reports come from, so leaving `anomalyAtSpawn` in the skew
bucket would have raised "THIS REPORT CAME FROM A DIFFERENT BUILD" on every report
ever filed — precisely the crying-wolf failure the three-way split existed to end.
It prints as `dev` instead.

`SIM_VERSION` 19 → 20, goldens recaptured. `chargedSecs` is 0 in
`PROTOTYPE_CONFIG`, so the equality gate stayed at exactly zero throughout.
### 50 — Speed had no way to be paid for being speed

`src/score/score.ts` · `src/score/config.ts` · `src/score/types.ts` ·
`src/render/hud.ts` · `src/app/recorder.ts` · **[CHANGED]** · asked for as "I
tried to be as fast as possible… I want there to be multiple ways to reach high
scores of 100k".

One 170-second session carried three lives flown two different ways, which is
what made this measurable rather than a matter of taste. It was recorded before
note 49, so its multiplier still had the anomaly window's x2 on top — that is
where the x7 below comes from, and nothing else in the table depends on it:

```
life        dur    points   links   climb    px/s   maxMult   pts per px
chained    126s   113,697      43  11,599      92      x7          9.80
fast        28s     5,224       5   7,952     287      x2          0.66
```

The fast life covered **3.1x the ground per second** and was paid **a fifteenth
as much per pixel**. The cause was not that climb went unpaid — `climbPerPx` was
working and was 76% of that life's points. **The cause was the multiplier**: the
streak ladder counted LINKS, and a run that crosses the field fast does not stop
at bodies. 43 links buys the ceiling; 5 links buys x2. That single factor is
nearly the whole gap.

Which is also why the obvious fix does not work. Raising `climbPerPx` pays the
chained life MORE — it climbed 11,599px at x5 — so anything that rewards distance
rewards the wrong style. **A speed reward has to key on rate, not distance.**

**So a flyby is now a scoring event.** Hold a pass through its closest approach
and it pays, and it steps the streak. Nothing needs to detect "was that fast",
because density does it for free: replayed out of `diagnostics/`, an ordinary
chained life makes **2.7 unconverted flybys a minute** and the fast life above
made **upward of 38**.

**The gate that was asked for measured useless, and that is the finding worth
keeping.** Speed at closest approach was the natural axis and cannot discriminate:
an unconverted flyby is unbound BY DEFINITION, so its speed is pinned near escape
velocity — across 167 recorded passages p10 149px/s, p50 314, p90 400, with 90% of
them inside one 250px/s band. Clearance over the same passages runs 0 to 318px
with a median of 60, which is real spread and is a choice. `FLYBY_SPEED_MIN` still
exists at 150px/s but it is a floor under a dead tail — the puttered-out flyby
waiting to be dropped — not a bar that selects anything. The distribution is empty
between p10 and p15, so any value in [150, 243) selects the identical 90%.

**Paid when the pass ends, not at the closest approach.** Paying at the bottom
looked right by symmetry with the grab award and is wrong: a flyby can bottom out
unbound, arc back on the brake and convert into the capture that pays a grab, so
one press would be paid twice and step the ladder twice — for what is usually an
overshoot, grabbed too fast and braked back. A fumble recovered is not a fast
pass. Measured across 361 synthetic approaches that become flybys, it would have
double-paid **83% of presses at 420px/s, 80% at 340, 42% at 260, 76% overall.**

Owing the award at the bottom and paying it when the pass ends STILL BEING A PASS
fixes it, and makes the events one rule: **pay at the moment the act finished
being reversible.** Converting clears the debt, so a converted pass pays only its
grab.

The defect was originally caught by `test/zip-charge.test.ts`, which pinned a zip
as worth exactly what the flown capture was worth: paying at the bottom made
zipping strictly worse than flying on every fast approach, because a zip glides
straight to the parked orbit and skips the overshoot. Note 49 has since deleted
that file along with the charge system, and a zipped arrival inside a window now
pays a flat `hopBonus` instead — so that pin is gone and the argument no longer
rests on it. It is recorded because it is how the error was found, and because the
double-pay measurement above is the reason the decision outlives the pin.

**No praise word, deliberately.** The vocabulary in `src/score/praise.ts` is
calibrated on rarity, and a word firing 38 times a minute names nothing. The
multiplier climbing is the feedback.

Measured against every recording in `diagnostics/`: session totals rise a median
of 13.8% (max 47%), and the increase is smallest exactly where a chained run is
strongest — at `streakMax` the extra steps buy no multiplier, only the flat
points, so the 126s chained life above gains about 8%. Re-measured after note 49
landed, against the same 52 recordings: unchanged to the decimal. Reconstructed from the
recorded checkpoints, the same 28-second fast life scores 21,593 instead of
5,224, which extrapolates to **~98k over a 126-second life against the chained
route's 113,697** — from 5% of it to 87% of it.

The equality gate is untouched at exactly zero and the golden did not move:
scoring is an observer and nothing under `src/sim/` changed. See "Scoring is not
`SimConfig`" in AGENTS.md.

---

### 49 — Closeness is given away, so the burn had to be paid for in speed

`src/score/burn.ts` · **[ADDED]** · requested as "a fire-like flare and red point
boost when I pull really close to the edge while capturing a planet, and I want
the points to roll up while the ship is burning"

Read literally, "really close to the edge" is altitude, and altitude is the one
thing in this game that cannot be earned. The clearance correction (note 18)
deliberately steers every dive down onto `minR`. Measured over the 1386 captures
in `diagnostics/`, by phase, the share of captures bottoming out under 0.5px of
clearance:

```
dive (clear)    17%
settle          54%
orbit (parked)  68%
```

Two thirds of settled orbits sit at EXACTLY zero. A burn gated on depth would
have paid most for holding still on the floor — the idle faucet the grab award
already refuses to open by paying at periapsis rather than at the press.

**Speed is what separates a hot pass from parking, and it separates it cleanly.**
A parked minimum orbit is a slow circle: across the whole corpus its speed never
exceeds 342px/s, while a dive whipping through periapsis reaches 430-570. So heat
is `depth * speed` with the speed term starting at 360, just above everything
parking can reach, and of the captures that flare, **zero flare while parked**.
That is also the physics the flame is drawing — heating goes as density times
speed cubed — so the honest mechanic and the legible picture turned out to be the
same one.

**The objection, and the measurement that answered it.** A fast periapsis needs an
eccentric orbit, so the burn looked like it would reward being stretched far out —
paying for the lazy distant grab that `closeBonus` exists to discourage. It does
the opposite. Peak heat against grab clearance correlates **-0.36**, against
apoapsis **-0.43**. A grab from 200px+ out flares 19% of the time; an apoapsis of
400-800px flares **1%**, because a stretched approach arrives as a flyby that has
to be braked, and braking sheds exactly the speed the heat is made of. What burns
is the middle: apoapsis 100-200px, grabbed 25-100px out.

So it does not double-pay `close`, it complements it at the opposite extreme — a
grab from inside 10px flares **0%** of the time, having no dive left to build
speed with, and that is precisely where `close` and the nerve bonus pay most.

**The burn is a flash, and no amount of tuning makes it a burn.** Median flare
0.17s over 760 real ones, p90 0.28s. Widening the hot zone from 30px to 80px moved
the median to 0.18s — the speed term bounds the flare, not the altitude. A tally
cannot be read in 0.17s, so the fire stays the length it really is and the
READOUT is what lingers: the points are settled the instant the flame dies, and
the popup rolls an already-decided number up over 0.8s. It is an animation of a
finished total, not a meter that keeps earning.

**What is red and what is not.** The flame is red because it is fire. The points
and the word ride the rarity ladder like every other award, because colour on an
award means how good it was and nothing else — see `src/render/accolade.ts`. The
alternative was a second exception to that rule alongside the reckless shout, for
a cue that already has a shape, a size and a position nothing else in the game
uses.

Thresholds are percentiles of the same corpus. The word fires at peak heat 0.68
(p70 of flares, about one capture in six) and its better rung at 0.94 (p90, about
one in eighteen); 45% of captures flare at all, and most of those earn points and
no name. `burnRate` 1125 puts a median capture's burn at ~84 points and the best
on record at ~182 — the band `closeBonus` and `nerveBonus` already occupy.

**Retuned once, on the first playtest**, reported as "I didn't see any red glow or
flare or counter rolling up as I hugged the edge". Both cues were in fact working
— replayed through the real render path, the flame drew and the popup counted
`+10 -> +163  SINGED`. They were calibrated into invisibility, and in two separate
ways:

- **The speed ramp was twice as wide as it should have been.** 360-560 came from
  the p99 of low passes, but a typical skim runs 370-400 — the bottom fifth of
  that ramp — so speed swamped depth and a genuine 2px graze scored heat 0.15.
  Narrowed to 355-520: the same graze now reads 0.21, and the session's best pass
  went 0.63 -> 0.79. Narrower was tried and overshoots — at 430 the median flare
  saturates at 0.90 and the ladder has nothing left to grade.
- **The flame was drawn linearly in heat.** `drawBurn` now renders `sqrt(heat)`,
  which is presentation and not physics: heat stays exactly what the scorer
  integrated. A mid flare went from a 27px plume at 21% alpha to 42px at 34%.
  `burnMinHeat` rose 0.05 -> 0.10 to meet it, so the faintest fire that can exist
  is one you can see — before, a heat-0.05 flare paid `+1` and drew nothing, which
  is the worst of both.

**Third pass, and the actual defect: fire that was not bright and not red.**
Reported as "no flames or redness or red text counting my score", on a session
whose replay is bit-exact against the build — so it was not a stale bundle. Three
things were true at once and only one of them was the bug:

- The flame was NOT too brief, which was asserted here in between and was wrong.
  Heat cleared the ignition floor for only 3-7 ticks, but the ember decay stretched
  each episode to 65-77 frames — 1.08 to 1.28 SECONDS on screen, three times.
- It was too dim and the wrong colour. Opacity was linear in `vis`, on the
  assumption that heat near 1.0 would be typical. It is not: a real skim scores
  about 0.25, so `vis` sat near 0.5 and every flame drew at half strength —
  measured, peak alpha 0.37 against a near-white (255,236,190) core, which over
  black is RGB (94,87,70). A warm grey smudge, no brighter than the trail that is
  always there.
- So heat now drives SIZE and COLOUR TEMPERATURE and only gently drives opacity:
  `alpha = 0.58 + 0.42*vis`, and the white-hot core is reserved for a flare that
  earned it (`white = vis^2`) so everything below reads as orange-red. At the
  player's own heat of 0.26 the core goes from (95,88,71) to (174,119,57) at
  double the alpha — red:green 1.46 against 1.08, which is to say from grey to
  orange. A small fire is still a fire.

`test/canvas-stub.ts` now records `addColorStop` instead of swallowing it. A
gradient IS the colour of the thing being drawn, and a stub that discards them
cannot tell a red flame from a grey one — which is why two rounds of render tests
passed over this defect.

**And the bound that was nearly got wrong.** The retune wanted `burnSpeed0` at
345, on the grounds that the corpus never parked faster than 342px/s. That is a
sample, and the quantity has a closed form: a settled capture is a circle at
radius >= `minR`, so its speed is `sqrt(GM/minR)`, largest around the smallest
body the generator makes — **345.8px/s**. A gate at 345 would have burned while
parked on any field containing that planet, reopening the exact faucet this
mechanic was designed around. The gate is 355 and `test/score.test.ts` now pins it
against the closed form rather than against a recording. Sample the physics, not
the recordings, wherever the physics can be solved.

Nothing under `src/sim/` changed: heat is read off `Capture` by an observer, the
gate stayed at exactly zero, and no golden was recaptured.

---

### 50 — The fire moved to the wall

`src/score/burn.ts` · **[CHANGED]** · "I only want the flames to show up when the
ship is along the left or right edge near the red dead zone... like they're
dragging through, barely hanging on to a distant planet to rescue them from
explosion"

Note 49's burn fired on a fast, low periapsis pass — an atmosphere model. It looked
right and fired at the wrong moment. The trigger is now three conditions at once:

1. inside the red band at the field's left or right edge
2. CAPTURED — hanging off a planet rather than drifting
3. not sheltered by an anomaly bubble

Each clause is half of the sentence being dramatised. Without (2) there is nothing
holding you: a ship drifting through the band is not barely hanging on, it is
simply about to die, and **11018 ticks** of the corpus are exactly that. (3) is
not in the brief and belongs anyway — a bubble SUSPENDS the side boundary, so
inside one there is no wall to be saved from, and burning there would promise a
danger the simulation has explicitly switched off (**3106 ticks**).

Heat is depth into the band, 0 at its inner edge and 1 at the lethal line, so the
flame tracks the red gradient the player can already see. `burnEdgeSpan` and
`RenderConfig.hazardZoneWidth` are the same 60px and `test/score.test.ts` pins
them together, because `src/score/` may not import `src/render/` and nothing else
could hold them in step.

**This is a far better fit than the old trigger, and the durations are why.**
Measured over 58 sessions: 147 drags, 2.5 per session, 4.7% of all captured time.
Median **0.42s**, p90 0.87s, longest 1.45s — four to ten times a periapsis flare,
which is what finally makes "the points roll up while the ship is burning" a thing
that can literally happen rather than a readout outliving a 0.17s flash.

**78% of them end in death, and that is the mechanic rather than a flaw.** A death
drops the whole banked flare (`endLife`), so a drag into the wall pays exactly
nothing: the fire on those is a warning. Only the 22% that pull out alive collect.
The drama is free; the rescue is what scores. No code was needed for this — it
falls out of the bank being cleared by a death — but it is the reason the burn is
the only award a death can cancel.

That split also decided the word thresholds. Calibrating peak depth over all 147
would be useless: the 114 that die all reach the line, so peak reads **1.00 at
every percentile from p10 up**. The axis only has spread inside the population
that can be praised — survivors run p25 0.27, p50 0.44, p70 0.57, p90 0.83 — so
the tiers are drawn from those 33 alone.

`burnRate` fell 1125 -> 425 for the same points band, which is just arithmetic: a
drag lasts several times longer than a flare, so the same payout needs far less
rate behind it.

**The reentry model is kept and unwired**, at the author's request ("very good
effect, like there's an atmosphere, I might want to use this in the future"). Its
constants moved out of `ScoreConfig` — every key there must change some session's
outcome, and an unwired weight cannot — and `test/score.test.ts` still exercises
the property that makes it worth having, so it cannot rot into something that no
longer works.

One fixture note, and it is the second time this file has recorded it: adding the
burn made `burnEdgeSpan` measure as inert, because no session in the scoring
battery ever took the ship into the band while captured. A knob can read as dead
because no scenario reaches the part of the run it governs — the same blind spot
that made `nerveBonus` look dead. Real play does this 2.5 times a session; the
battery did it never, until a scenario was added that does.

---

### 51 — Two red channels reverted, and the one word that kept its colour

`src/render/burn-tally.ts` · **[REVERTED]** · asked for as "I want the time spent
in the red zone, burning, to tally up a red text near the ship rolling upwards",
withdrawn one playtest later as "the way you had it before was better (rolling up
at the end)"

Recorded because the argument for it was good and it still lost, which is the kind
of thing that otherwise gets re-proposed every six months.

The case for counting live: every other award is settled before a number appears —
a grab pays at periapsis, a link at the release, and the popup reports something
already over. A drag is not like that. The ship is in the red band with a wall a
few pixels away and the question is live: hold on for more, or get out with what I
have. A number that only arrives afterwards cannot be part of that decision. It
had become buildable, too — a periapsis flare ran 0.17s, about four frames of a
changing number, where a drag runs 0.45s at the median and up to 1.47s.

What that argument missed is that the decision does not want help. Inches from a
wall, a number climbing in peripheral vision competes with the thing the player is
actually doing rather than informing it — and the fire is already saying
everything the tally would, on a channel that costs no reading. Afterwards there
is nothing left to decide and the number has the moment to itself.

So the roll is back where it was: the popup counts 0 to the total over 0.8s once
the drag is over, deliberately taking longer than the 0.45s drag it is summing so
that it reads as a tally rather than as a replay in real time.

Alongside it, and reverted with it, went a RED TEXT CHANNEL for the burn — its own
colour whether or not the drag earned a word, in three shades of fire taken from
the flame rather than from the band. Asked for as "all text should be shades of
deep orange or red or black, to match the singe of fire", withdrawn as "I even
preferred your original gray plus points".

Which leaves `accolade.ts`'s one rule unbroken after all: **colour means how good
it was**, the word says what, and the only thing red in this feature is the fire.
A burn under the word threshold is `ROUTINE` grey like any other routine award,
which is the commonest thing a burn is.

Worth recording what the red channel got wrong, because the argument for it looked
sound. It was defended as a STATE rather than a category — the ship is on fire, the
band is red, the number is red, and nobody has to learn the hue. That is true and
it is not the whole test. The band and the flame are already saying "you are
burning" in a way that costs no reading at all; a third instance of the same signal
adds nothing and spends the one channel the player uses to ask how good it was.
`SHOUT` earns its off-ladder colour because it pays no points and therefore has no
"how good" to report. A burn does.

The measurement that survives is the one that made it awkward: every fire shade
lands within dE 14-26 of some step of `FUEL_RAMP`, and nothing in the family does
better, because `FUEL_RAMP` IS a fire gradient. Any future attempt to give a
burning ship its own text colour runs into that and should expect to lose to it.

**What did survive, on the third pass, is the word and only the word.** SINGED,
SEARED, SCORCHED, BLAZING, INFERNO, METEOR now draw in a dark ember `#c04018`;
the NUMBER beside them stays on the rarity ladder, grey when the drag earned no
word and a ladder colour when it did.

That is the narrow version of the exception, and it survives where the wide one
did not because it does not spend the "how good" channel. The word is already
about fire — the vocabulary names a thing that has a colour — and ladder blue is
the one case where the ladder actively fights the word it is colouring. Nothing
has to be learned; the player is reading the word FIRE while the ship is on fire.

Two corrections came out of looking at it on a phone.

**Red, and lit — after two wrong turns in opposite directions.** `#c04018` read as
ketchup: G/R 0.33, but L* only 46, so it was dark AND brown. The fix lifted the
lightness and the orange together (`#d9601f`, G/R 0.44, L* 55) and overshot into
satsuma.

The two knobs are separable, and that is the lesson: ketchup is a LIGHTNESS problem
and orange is a HUE one. `#ee3f2c` takes the orange back out — G/R 0.26, redder
than the brick ever was — while keeping the lightness that stopped it being brick:
L* 54, contrast 5.4:1. A flame's own red, once it is not being drawn in mud.

**The number is grey, always.** It followed the rarity ladder at first, so a drag
that scored well turned the number BLUE next to an orange word: two hues on one
two-line popup, neither of them fire. A burn's colour now lives entirely in its
word, and size still climbs the rung, so how good it was is not lost.

**And the default text was quiet in the wrong way.** `ROUTINE` sat at 3.6:1
against the starfield — the least legible text in the game and the one shown most
often, which is the wrong way round. Lightening it ran straight into the ladder:
by `#838c9c` it was L* 58 against `good` at 66, and one more step would have closed
that to 5 when the rungs above are 11 and 10 apart. dE had already fallen 41 -> 34,
making it the closest pair in a table whose whole point was separation.

**Lightness was the wrong axis.** A near-white at 66% alpha —
`rgba(232,240,255,.66)`, effective (153,158,168) on black — is recessive because it
has NO HUE, which leaves lightness free to be whatever legibility wants: L* 65 and
7.8:1. Chroma is 5.8 against 42, 64 and 78 for the three rungs above it, so the
ladder still climbs monotonically, now in saturation, and climbs harder than it
ever did in light: 5.8 -> 42 is a bigger first step than 43 -> 66 was.

It never had to be ranked against `good` in isolation anyway. A ROUTINE popup
carries a number and NO WORD; the absence of the word is the signal, and the colour
only has to look unremarkable while staying readable.

The transparency is load-bearing rather than decorative: it is what stops a
near-white being the brightest thing on a dark screen, and it lets the starfield
through the strokes, which is what makes it read as a readout instead of a label
pasted over the scene. The rim came down with it — 3px at .55 alpha was sized for
a dark grey that needed forcing apart from a dark sky, and under pale text a heavy
black outline reads as a sticker. 2px at .38 now.

The general lesson, since it cost three passes: when a colour has to be quiet AND
legible, those pull against each other only if quiet is spelled "dark". Spelled
"colourless", they stop competing.

It costs one piece of awkwardness worth knowing about: the score band draws points,
multiplier and word as a single centred string, so a burn has to lay out two runs
from the left edge of the pair to keep them centred as a unit. `test/render.test.ts`
pins that, because if it drifts the band and the popup are back to answering the
same question in two different colours.

An industrial treatment for the word was tried on top of all this and reverted
immediately — 700-weight, an ember glow, and the same corner brackets the LOST box
uses, on the theory that the burn is the other moment the ship's computer would
have something to say. It was too much decoration on a word that is already the
loudest thing in the frame while a ship is on fire beside it. Plain text, fire
colour.

One thing from the attempt was kept, because it was a separate request that
happened to arrive in the same breath:

**It lights at the band's edge, not 6px inside it.** `burnMinHeat` was 0.10, which
put ignition 54px from the lethal line — and 7% of band entries grazed the outer
strip and left without ever lighting, which is the player visibly in the red with
nothing happening. The honest value is 0: heat is exactly zero outside the band or
while drifting, so `heat > 0` already brackets a drag and needs no threshold. It is
0.01 rather than 0 only because `test/score.test.ts` proves a weight is live by
trying it at 0, half and double — all of which are 0 when the value is 0, so a zero
weight reads as a dead one. 0.01 is 0.6px into a 60px band.

Lighting on the shallow grazes changed the population the weights are calibrated
against — 159 drags rather than 147, survivors 44 rather than 33 — so `burnRate`
went 425 -> 555 and the word tiers 0.57/0.83 -> 0.52/0.70. Same frequency targets,
re-measured quantity.

---

### 52 — The scar: the deadline was a wall phenomenon, but the death was not

`src/sim/rescue.ts` · `src/render/scar.ts` · **[NEW]** · asked for as "I'd love to
be able to show a faint red line ahead of the ship where, if I grab at or before
then, I'll be able to successfully capture a planet and rescue myself"

**The promise is turn-around, not survival, and not a settle.** Three candidates
were on the table. "A grab will be accepted here" is note 40 wearing a cue: the
grab at the left wall there WAS accepted, entered `clear` with periapsis ten
seconds away, and left the field at t=2.78s with the button still held — a line
drawn on that rule kills the player who believes it. "Reaches a settled orbit" is
the opposite error: a braked flyby that arcs back out is a rescue, and it is the
one the fire is lit for, so that rule would mark the game's best moment as death.
The author's own phrasing settled it — "I will eventually turn away from the dead
zone line before crashing into it" — and it is the only one of the three that
needs no constant. An earlier proposal, "did not die within T seconds", needed a T
that nobody could measure the right value of.

**It answers by simulating, because there is nothing else to ask.** Whether a
press saves you depends on which body `grabTarget` offers, the crash cone, the
outbound-flyby classification, the fuel left to brake with, and how much of that
fuel the drift will have regenerated by the time the ship arrives. All five are
already decided by `stepSim`. A closed form would be a second implementation of
each, which is the objection `drawOrbitCurve` records against recomputing the
settle easing. So the predictor clones the state and plays it: 0.3-0.5ms a call,
cached at 10Hz.

**The bubble needed no special case, and that is the argument for the approach.**
The fail test is "the run ended", not "x crossed the wall" — so a drift that
crosses inside an anomaly's bubble simply does not end there, and the projection
runs on to the real ending out the far side. A geometric test would have needed
its own copy of the exemption, and would have fallen out of step with it.

**What the measurement changed.** Replaying all 62 recordings, the population the
cue was imagined for barely exists:

```
  fatal drifting side-wall deaths          91
    seconds of drift before the death      median 0.85   p75 1.35   p90 1.68
    seconds the scar is on screen          median 0.85   p75 1.35   p90 1.68
    seconds with a live cross AHEAD        median 0.13   p75 0.40   p90 1.10
    deaths where a live cross never existed at all   36 of 91 (40%)
```

On-screen time equals drift length at every percentile — the scar lights the
instant the ship starts drifting and never misses a moment. It is the DRIFT that
is short. The typical wall death is decided at the release, and by the time the
ship is coasting there is a tenth of a second in which any press would have
worked. **As a death-preventer this cue cannot work, and no drawing would have
fixed that.**

It was built anyway, on what the same replay says about where the cross sits:

```
  across 640 committed approaches
    seconds between the cross and the wall   median 0.53   p75 0.77
    pixels from the cross to the lethal line median 90     p75 178
    inside the 60px red band                 262 of 640 (41%)
    distance to nearest body / grabRange     median 0.40
    live stretch NOT contiguous              370 of 640 (58%)
```

The deadline is a property of the wall, not of reach — at the cross the ship sits
at 40% of `grabRange`, nowhere near running out of planet. And `edgeHeat` pays
only for time spent captured inside that band, so the latest legal grab is also
the longest, hottest burn. **The cross marks the maximum of the curve the burn
already pays out on**, which makes it a risk dial rather than a warning, and that
is what it should be judged as.

**No score attaches to it, deliberately.** The incentive already exists in the
simulation — a later grab is a hotter burn — and paying again for hitting the mark
would be note 29 repeating itself. A praise word for cutting it fine is
attractive and premature: every recording in `diagnostics/` was flown blind, and a
threshold measured on play that could not see the line is measured on a different
game.

**Holes are the common case, not an edge case.** 58% of live stretches are
discontinuous, because `grabTarget` refuses inside the crash cone and offers a
different body as the ship travels. The arm is therefore drawn broken rather than
blanked: at that frequency, blanking would leave the ordinary approach looking
like several unrelated marks instead of one scar with gaps in it.

**Two corrections came out of flying it.**

The arm was clamped to 260px. Unclamped it is the whole projection, and the cross
sits a median 432px ahead and 1551px at p90 against a 390x844 viewport — so the
common case was a line twice the height of the screen describing a stretch with
nothing in it to decide. Clamped from the FRONT, so what survives is the part
nearest the mark.

The mark stopped being hard-cleared. Reported as "I can tap a bunch to extend my
burn through the red zone, and the re-drawn cross gets distracting" — and a tap IS
a capture, which makes the prediction null for as long as it lasts, so the mark
was blinking out and back. It ages out over `scarFadeOutSecs` instead, which
covers a tap and still lets a real answer expire. The fade-out outlasts the median
0.53s slack between the cross and the wall on purpose: the mark left behind is the
explanation of the death, and an explanation that finishes before the death is no
use.

**A follower was added in the same pass and it was the wrong mechanism.** It is
recorded because the reasoning looked sound and the measurement refuted it. The
theory was that the answer moves several times a second under tapping and the
position should be eased; the correction shipped as an ease inside `observe`,
where `dt` is the tenth of a second between recomputes, so `dt * scarSettleRate`
came out at 0.9 — 90% of any correction in a single step, then stillness for a
tenth of a second. A follower in name only, and still visibly a series of jumps.

Both halves of that were wrong, and the next report found them: *"in
2026-08-23T20-04-58 there was a last turn where the cross kind of jumped forward a
few times"*. Replayed — faithfully, 31 of 32 checkpoints bit-exact — the mark
moved 411px, then 41px, then 4px, in three steps a tenth of a second apart. It was
not tracking a moving answer at all. The scar had been ABSENT for 3.9s while the
ship was captured, and the cross that came back sat 456px from the one that went
away. The follower was dragging a mark between two unrelated situations.

**A mark that has been interrupted is replaced, not moved.** The old one is let go
where it stands and fades there; a new one is born where the answer now is, over
the same rate. Nothing traverses the field. The distinction is a FACT — this mark
has been interrupted — rather than a distance threshold a mark could drift across,
which is `nearestBody`'s argument about cones applied to a rendering decision. It
needs one ghost slot, because there is only ever one thing to let go of.

The measurement that would have prevented the first attempt, over the corpus:

```
  frames with a live mark            205310
    of which it slid at all              28   (max 3.13px, per frame)
  births (replaced, not dragged)        541
    median gap to the previous birth    5.10s
    under 0.4s apart                    2 of 483
```

**An acquired cross is stable.** The bisection resolves to the same world point on
every recompute, so the position term the follower was added for fires 28 times in
205,310 frames. It is kept — a genuine small correction should glide — but what
`scarSettleRate` mostly governs is the fade-in of a new mark, and what actually
answers both reports is the birth rule. The same numbers close out the risk the
birth rule introduces: rapid tapping does not produce a pulsing cluster of ghosts,
because births land a median 5.1s apart and only twice in 483 do they land closer
than 0.4s.

The follower also moved to `Scar.update`, called once per FRAME from `Scene`, so
the mark glides at display rate instead of stepping at the ten-times-a-second the
prediction is recomputed at. Feeding and smoothing run at different rates and only
one of them is about smoothness.

**Render-only, so the gate never moved.** No `SimConfig` key, no `ScoreConfig`
key, no `SIM_VERSION` bump — `rescueScar` lives under `src/sim/` because it is a
statement about the simulation, but `stepSim` never calls it and nothing in
`fingerprint()` changed. `test/rescue.test.ts` pins the promise by construction: a
press at the returned tick turns away, a press one tick later does not, and every
sample the path marks live really is live. It re-derives the answer from the same
simulation the player flies, so it cannot rot as the physics is tuned.

Filed rather than built: firing the boxed `LOST — OFF COURSE` treatment as an
early warning (playtest rec #4). It is the right answer for the 40% that never had
a cross, and it is a screen-level alarm rather than a diegetic instrument, so it
should be judged on its own. `docs/IDEAS.md`.

---

### 53 — The rescue pays for the decision, because the burn already pays for the depth

`src/score/score.ts` · `src/score/config.ts` · **[NEW]** · asked for as "I want to
reward the player for pressing/rescuing themselves, with more points for tighter,
last minute rescues"

**Timing, not margin, and that is the whole design.** How CLOSE to the wall a
rescue came is already paid, continuously and precisely: `burnBank` integrates
`edgeHeat` over the fire, so a later press is already worth more because it starts
deeper and burns longer. A margin bonus would be note 29 in points form — one act
collecting twice. What the score did not know is how much of the available window
the player CHOSE to spend, and the cross is what makes that quantity visible and
therefore aimable. So the award reads the press and nothing else.

**It is armed at the press and paid at the outcome.** The quality is a property of
the instant the button went down, and one tick later the drift it was measured
against no longer exists — `sc.lastDrift` is the state `beginCapture` actually
read, and is not interchangeable with the capture's own `rx`/`ry`, which
`stepCapture` has already advanced by a tick on that same tick. But the press
alone cannot tell a rescue from a death: a press past the cross looks identical
until the ship fails to come back. So the points settle when the ship's velocity
toward the wall reaches zero, which is exactly what `src/render/scar.ts` draws.
Being doomed and being lazy both pay nothing, for the same reason.

**Once per body per life**, the same shape as `claimed`. The rule is not
hypothetical: the author's own report of the scar was *"I can tap a bunch to
extend my burn through the red zone"*, and every one of those taps is a press with
almost no window left that does turn the ship away. Without the latch the tightest
possible rescue would also be the most repeatable one, several times a second —
the faucet `ScoreAward` already documents for tap-in-place grabs. Per BODY rather
than per press, so rescuing yourself onto a different planet still pays: that is a
new decision about a new body.

**The span is measured, and is provisional in a knowable direction.** Over the
507 presses in the corpus made while committed to a wall:

```
  window left at the press   p10 0.28s   median 1.30s   p75 2.37s   p90 3.90s
```

`rescueSpan` is 2.4 — that p75, chosen the way `closeSpan` was, to span real play.
Every press in that sample was made BLIND, though: the scar did not exist, so the
distribution describes players who could not see the line they are now scored
against. Presses will move later, the median quality will rise, and the span will
want to shrink. Re-measure rather than adjusting on feel.

What it comes to, replaying the corpus under the new rule:

```
  rescues paid            224 over 62 sessions   (3.6 a session, 15 sessions had none)
  points from rescues     8.7% of everything awarded, mean 435 each
  quality actually paid   p25 0.30   median 0.56   p75 0.78   p90 0.86
```

A rescue is worth about what a link is worth, which is the intended size: saving
the run at the last moment should rank with the thing the game is otherwise about,
not above it. The quality distribution is the number that matters — it sits across
the middle of its range rather than pinned at either end, so the scale is being
used rather than saturated.

**No praise word, deliberately, and this is the second time that call has been
made.** Every threshold in `praise.ts` is a measured percentile of real play, and
exactly one recording has ever been flown with the cross visible. A word gated on
blind play would be calibrated on a game where the line was invisible. The band
caption says `RESCUE · LATE 0.87`, which reads as praise the moment it is high and
needs no vocabulary behind it; the word waits for play to measure it on.

**Cost.** `armRescue` runs `rescueScar`, which forward-simulates — affordable only
because it runs once per capture and because 63% of presses take the predictor's
cheap refusal without ever reaching the projection. `test/score.test.ts` went 1.7s
to 2.8s for the whole file.

**A fixture blind spot, for the third time.** `rescueBonus` and `rescueSpan` both
measured as inert at first, because no session in the battery ever pressed while
committed to a side boundary — the same shape as the `nerveBonus` and
`burnEdgeSpan` gaps recorded beside their scenarios. Real play does it on 37% of
presses; the battery did it never. The new scenario drifts at the right wall from
400px out, which gives a 1.7s window, and pressing at tick 60 spends 0.71 of it.

---

### 54 — The mark grows with the fire, because brightness was already spoken for

`src/sim/rescue.ts` · `src/score/burn.ts` · `src/render/scar.ts` · **[NEW]** ·
asked for as "I wonder if we could predict how deep/long of a fire burn the
trajectory would have. If so, we could scale the intensify of the cross by the
possible points to get"

**Size, not intensity, and that was a correction to the request.** Alpha on the
mark already carries how close the deadline is: it ramps in with time-to-cross and
fades out once the mark is passed. A prize term on the same channel would make a
dim cross mean either "small fire" or "still far away", with no way to tell which
— note 51's lesson about spending one channel on two signals, applied to a world
object instead of to text. The mark scales between 0.62x and 1.42x of its
configured size instead, so a big fat scar is a big fire and a thin one is a
formality, while faint still means only one thing.

**The cost figure quoted below was later found to be misreported** — it was a mean
over calls that mostly return early, and a call that actually simulates costs about
seven times it. See note 57, which fixes the consequence.

**Layering is what shaped the implementation.** Pricing a trajectory needs
`burnRate` and `burnEdgeSpan`, which are `ScoreConfig`, and `src/sim/` may import
nothing outside itself — `pnpm portable` proves it. So `rescueScar` returns the
FLIGHT it simulated for the press at the cross, one world position a tick, and
`previewBurn` in `src/score/` runs the same integral `scoreTick` runs on the real
thing. The simulation hands over a trajectory; pricing it is somebody else's word.
Recording costs one extra capture flight against the dozens the search already
runs, and only for the winning press — much less than making every evaluation
carry an array it would throw away.

**There is more fire out there than expected.** Measured over 548 committed
approaches:

```
  predicted burn is zero        17 of 548  (3%)
  raw bank waiting at the cross  p25 280   median 402   p75 613   p90 857   max 2754
```

Only 3% of crosses offer no fire at all, which contradicts the guess that would
have been made from the band alone — 41% of crosses sit inside the 60px band, but
the flight AFTER the press carries the ship deeper than the cross itself, so nearly
every rescue burns. The scale is about how much, not whether. `scarPrizeFull` is
860, that p90: the mark saturates only on the top tenth, and the top of the
distribution is three times it, so a mark that tracked the maximum would be a
smear.

**IT IS NOT THE PAYOUT, and the measurement is the reason that is written in
capitals at the function.** The flight ends where `rescueScar`'s promise ends, at
the turn-away — but the fire does not. The ship is still deep in the band at that
moment and burns all the way back out through it:

```
  actual burn / promised   p10 1.94   p25 2.04   median 2.21   p75 2.51   p90 3.01
  within 25% of promised   5 of 513
```

A systematic 2.2x under-count, not noise. That is fine for the one thing it is
used for — sizing a mark, where what matters is that a bigger fire draws a bigger
scar and where `scarPrizeFull` is calibrated in these same units — and it is NOT
fine for showing the player a number or paying one. Anything that needs the real
total has to keep flying past the turn-away until the heat drops below the floor,
which is a longer flight than `rescueScar` has any reason to simulate for its own
purposes. The first draft of this note claimed the promise and the payout "cannot
describe different events"; they describe different INTERVALS of the same event,
and the measurement is what caught it.

**What pins it.** `test/score.test.ts` proves `previewBurn` is the burn's own
integral rather than a lookalike: doubling `burnRate` doubles it exactly, twice
the ticks at a constant depth is exactly twice the bank, it respects the same
ignition floor, and it promises nothing inside an anomaly's bubble where there is
no wall to burn against. `test/render.test.ts` proves the mark grows with the
prize and saturates past the span. The scene battery now prices its scar the way
`app/main.ts` does, so the sizing path is exercised by every frame of the
wall-drift scenario rather than only by the one test that looks at it.

---

### 55 — The skull: the trigger that was right beat the trigger that was useful

`src/render/doom.ts` · `src/score/score.ts` · **[NEW]** · asked for as "adding a
pulsing skull next to the ship if they grab and hold too late"

**"Too late" has two readings and they measure very differently.** Both were run
against all 251 deaths in the corpus:

```
  PRESS made past the cross     108 of 251 deaths (43%)   lead median 0.85s p90 1.72
                                fatal 94% of the time — ~7 of 115 such presses lived
  HOLDING from here ends the run 94 of 251 deaths (37%)   lead median 0.83s p90 2.18
                                true-then-recovered 141 times against 94 real deaths
```

The live one loses, and the reason is worth keeping: RELEASING is the escape, so
"holding kills you" is right about the hold and wrong about the fate. A
death's-head that is wrong more often than right teaches the player to ignore it.
The press test is an omen and is almost always correct; the hold test would make a
good "let go" cue, which is a different cue and should be built as one if it is
built.

The first version of that measurement was worthless and the mistake is easy to
repeat: it asked the hold question on EVERY tick, including drifting ones. A held
button does nothing while drifting — `stepSim` starts a capture on the pressed
edge alone — so the test was reporting "this drift ends badly", which is true of
every approach the player later presses out of, and it produced 754 false alarms
instead of 141.

**The scorer already knew, so the renderer does not ask again.** `armRescue` calls
`rescueScar` at the press for the rescue award; whether a cross existed is the
same question this needs, on the same tick. `ScoreState.doomed` carries it —
observability, like `burnHeat`, which the flame already reads. A second forward
simulation of the same press would be both waste and a second place for the answer
to live.

That reordering exposed something: the once-per-body rescue latch used to
short-circuit before the scar was computed, which would have hidden the omen on a
body already paid. Whether the run is lost is not a question about whether it has
already been paid, so the scar is asked first and the latch applies only to the
payout.

**It may stand rather than flash, and that is a departure from `fuel-warning.ts`**
— which argues, correctly, that a permanent badge beside the ship becomes part of
the ship's silhouette, having measured its own condition riding along for 4.7% of
a session. This one cannot: it lives a median 0.85s, p90 1.72s, appears about 1.7
times a session, and 94% of the time the thing that ends it is the run ending. It
is a countdown, not a status.

**On the side away from the wall**, so it never draws over the hazard gradient or
the receding scar — both red, both already in that space — and so the one thing on
screen that is not the wall sits where an escape would be. Below the ship was
taken by the fuel badge and above it is the lane the popups rise through.

**It hands over at the death rather than surviving it.** `endLife` clears the flag
on the ending tick and `drawDoom` refuses to draw during the ending hold, so the
skull stops exactly where the `LOST — OFF COURSE` notice starts. The scar's mark
does the opposite — it freezes and stays through the hold — and the difference is
deliberate: the mark is evidence of where the line was, the skull is a countdown,
and a countdown that continues after the thing it was counting to is noise.

**It is withdrawn when the prediction is beaten.** 6% of presses past the cross
turn away anyway, because the search is conservative by construction. When one
does, the omen clears on the same event that pays the rescue at the top of its
scale — the two are one moment, read two ways.

---

### 56 — SAFE, and the threshold that turned out not to be one

`src/render/verdict.ts` · `src/score/score.ts` · **[NEW]** · asked for as "can we
add a similar pulsing icon for when the player pressed really close to the last
second, indicating it was a tight rescue"

**The definition arrived after the design question and made it moot.** The
question put was where to set "really close", offered as a percentile of the
measured quality distribution — p90 at 0.86, about 0.36 firings a session, with
the honest caveat that all of it was blind play and would want re-measuring. The
answer was not a percentile: *"by 'tight' I mean that the player would've been in
the flames section of the side"*.

That is a FACT and not a threshold. `burnHeat` is already a quantity the scorer
keeps, and being alight is the definition rather than a percentile of one, so
`ScoreState.tight` is set at the moment a rescue pays if the ship is on fire then.
Nothing to calibrate, nothing to re-measure when play changes, and no
`ScoreConfig` key — a value that decides WHEN something is judged and never what
it costs is a constant next to its code, and this one is not even that.

The two readings very nearly agree on rarity, which is why the percentile looked
plausible:

```
  rescues paid                       224 over 62 sessions
    alight at the moment they paid    26  (12%)  -> 0.4 a session
  quality of the press
    alight     p25 0.53   median 0.81   p75 0.91
    cold       p25 0.24   median 0.54   p75 0.75
```

0.4 a session against the 0.36 the p90 would have given. The author's reading gets
there without a number, and it is about the thing the player actually felt rather
than about where they landed in a distribution.

Worth noting what the same table says about the ORDER of events: "alight when it
paid" and "the capture caught fire at all" are the same 26. A rescue capture that
burns is always burning at the turn-away, because the turn-away IS the deepest
point of the dive. So the badge cannot miss one by asking at the wrong moment.

**One slot, two verdicts.** `fuel-warning.ts` owns the space below the ship and
the popups own the lane above it, so there is one place left beside it, and both
marks answer the same question. They cannot collide: `doomed` clears on the very
tick `tight` is set, which is the 6% case where a press past the cross turns away
anyway — the slot changes its mind at the moment the ship does. `doom.ts` became
`verdict.ts` for that reason.

**It was a spark first, and the correction is the useful part of this note.** The
glyph was four tapered points borrowing the scar's own crossed spindles, on the
theory that the mark you aimed at should flash back at you. Reported on sight:
*"the spark isn't intuitive enough. I think it should say 'safe'"*.

The fix was not to caption the spark. `accolade.ts` already records the rule —
a vocabulary that needs a caption is a vocabulary that has not been chosen
carefully enough — and a spark that has to be labelled SAFE is a spark that was not
saying SAFE. The label became the whole mark.

So the pair now mixes a glyph and a word, which is worth defending rather than
tidying: a skull already means what it means, to everyone, with no game to learn it
in. There is no equivalent universal sign for "you got away with it", and the first
attempt is what discovered that. Do not replace SAFE with a symbol again without
finding one that needs no caption.

**Colourless, and that is the whole colour reasoning.** Every hue in the frame is
spoken for: red is the wall, `#ee3f2c` is fire, purple is an anomaly, and the
rarity ladder owns "how good" for text. Note 51 found the remaining channel the
hard way — a near-white is recessive because it has NO hue, which leaves lightness
free to be whatever legibility wants. Red would say danger and ember would say
burning; this says neither. Set in `600 ui-monospace` at `fuel-warning.ts`'s own
label size, because that is the other badge that speaks beside the ship and two
badges that speak should not be set in two typefaces.

**It flashes where the skull may stand.** Three pulses and gone, on
`fuel-warning.ts`'s reasoning about badges that become part of the ship's
silhouette. The skull is exempt because the wall ends it inside a median 0.85s;
SAFE has no such deadline, so it needs the count.

---

### 57 — The prediction was costing frames, and the mean was hiding it

`src/sim/rescue.ts` · `app/main.ts` · **[FIXED]** · reported as "I saw slowdown due
to rendering, slowing my ship and the animations down at times... I _think_ it was
more noticeable at the edges, possibly due to our new prediction code"

**The report was right, and the diagnosis was in the phrase "at the edges".**
`rescueScar` takes a cheap arithmetic refusal unless a wall is within reach, so
the edges are precisely where it stops being free and starts forward-simulating.

**Note 54 recorded the cost as "0.3-0.5ms a call" and that number was wrong** —
not measured wrong, reported wrong. It was the mean over ALL calls, 88% of which
take the refusal at 0.005ms. The statistic that matters for a dropped frame is
what a call costs when it does the work, and what the worst one costs:

```
  calls that actually simulate    median 2.25ms   p90 5.93   p99 12.02   max 45.73
  a phone is 3-5x slower          median 7-11ms   p90 18-30  max 137-229
  frame budget                    16.7ms at 60Hz, 8.3ms at 120Hz
```

Running that ten times a second at the edges is the reported stutter. A mean is
the wrong statistic for a spike, and this is the second time in these notes that
averaging hid a tail — see note 51 on `ROUTINE` being the least legible text in
the game and the one shown most often.

**Three fixes, in ascending order of how much they mattered.**

`captureBudget` 900 -> 360. Every evaluation that neither dies nor turns pays the
whole budget, and a winning flight runs a median 89 ticks and 223 at p90, so six
seconds is already far past anything real.

`maxSamples`, new, at 40. The stride now widens to fit the drift instead of being
fixed at 3 ticks, so a six-second approach is sampled coarsely rather than being
evaluated 121 times. Holes get blockier on long approaches; nothing else changes.

The state copies. `track` kept a full `cloneState` — bodies array included — at
every projected tick, 361 of them on a long approach, for the 40 that were ever
resumed from. The projection now walks the drift twice, once to find the ending
and once to evaluate, cloning only where it stops. Walking twice is far cheaper
than copying 360 times.

Together: worst call 45.7ms -> 20.5ms, median 2.25 -> 1.66.

**Then the fix that actually mattered, which is not an optimisation at all.**

A DRIFT TAKES NO INPUT. The projection a call produces stays true as the ship
flies along it: every sample is a world point with a fixed verdict, and the cross
is a place rather than a countdown. So recomputing ten times a second was not
expensive work, it was the SAME work, repeated. `advanceScar` carries a projection
forward by arithmetic — drop the samples now behind, subtract the elapsed time —
and `app/main.ts` runs the simulation only when the projection can no longer be
trusted: on a capture transition, on a respawn, and on a 30-tick backstop.

```
  per-tick cost of the whole path   median 0.000ms   p99 0.027   p99.9 3.72   max 18.85
```

From a 1.66ms median every sixth tick to a p99 of 0.027ms. The spike survives, but
it went from several times a second to roughly once every seventeen seconds.

**Why the backstop is 30 ticks and not 60.** A fresh call re-derives its stride
from the drift that is LEFT, so a shorter remaining approach is sampled more finely
and can find a live press inside a hole the coarser pass stepped over. Carried half
a second, 554 of 558 comparisons across the corpus agreed to the pixel and the 99th
percentile of the difference was zero; carried a full second the 99th was 15px. The
physics does not drift — the resolution does. Neither window ever disagreed about
whether a cross exists at all.

**Still open, and filed rather than built.** The remaining spike is one full
computation landing inside one tick. The structural answer is to evaluate a few
press-points per tick instead of all of them at once — sound for exactly the reason
`advanceScar` is sound, since a press-point's verdict does not depend on when it is
asked — so a full picture would assemble over ~10 ticks and no tick would ever do
more than a few captures. That is a redesign of the search rather than a tuning
pass, and it wants a performance harness in front of it, which the author has
scoped separately.

---

## Tuning vs. fidelity

`src/sim/config.ts` holds two parameter sets:

- **`PROTOTYPE_CONFIG`** — the prototype's values, frozen forever. The equality
  gate and the golden baseline both run against this, so the proof that the port
  reproduces `index.html` survives any amount of game tuning.
- **`DEFAULT_CONFIG`** — the live game. It starts from the prototype and diverges
  deliberately; every difference is listed at its declaration with the reason.

Without that split, the first balance change would have destroyed the fidelity
proof, and the gate would have become a tax rather than an asset.

## Status

```
port equality vs index.html   10/10 scenarios, divergence exactly 0
                              position · velocity · fuel · phase
phases exercised              drift, clear, flyby, settle, orbit, crash
scenario boundary guard       all 10 stay inside the playfield
golden baseline               golden/physics-v1.json

tests    port-equality 11 · invariants 32 · render 105 · camera 55
         diagnostics 25 · backtrack 15 · world 23 · tune 7 · clearance 14
         score 74 · input 8 · grab-target 8 · link-fuel 6
         boost-envelope 6 · flyby-fuel 14 · anomaly 19 · outbound-grab 6
         charged 26 · attract 13 · 467 total
```

What the gate proves, precisely: `src/sim` reproduces `index.html` under
PROTOTYPE_CONFIG and one documented substitution (note 16), to zero divergence.
It says nothing about DEFAULT_CONFIG, which has diverged deliberately — see
"Tuning vs. fidelity" above, and the reasons recorded at each value's declaration.
