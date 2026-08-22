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

tests    port-equality 11 · invariants 32 · render 94 · camera 48
         diagnostics 25 · backtrack 15 · world 20 · tune 7 · clearance 10
         score 60 · input 8 · grab-target 8 · link-fuel 6
         boost-envelope 6 · flyby-fuel 10 · anomaly 14 · outbound-grab 6
         380 total
```

What the gate proves, precisely: `src/sim` reproduces `index.html` under
PROTOTYPE_CONFIG and one documented substitution (note 16), to zero divergence.
It says nothing about DEFAULT_CONFIG, which has diverged deliberately — see
"Tuning vs. fidelity" above, and the reasons recorded at each value's declaration.
