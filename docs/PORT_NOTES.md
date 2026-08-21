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

`src/sim/serialize.ts`, `src/sim/trace.ts`

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

tests    port-equality 11 · invariants 32 · render 48 · camera 30
         diagnostics 13 · backtrack 11 · world 9 · tune 6 · clearance 6
         score 19
         191 total
```

What the gate proves, precisely: `src/sim` reproduces `index.html` under
PROTOTYPE_CONFIG and one documented substitution (note 16), to zero divergence.
It says nothing about DEFAULT_CONFIG, which has diverged deliberately — see
"Tuning vs. fidelity" above, and the reasons recorded at each value's declaration.
