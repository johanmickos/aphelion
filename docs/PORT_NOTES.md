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

### 2 — Periapsis floor bounce

`src/sim/step.ts` · the `minR` clamp in `stepPhysical`

A dive that reaches the minimum-orbit floor takes one sharp deflection as the
clamp zeroes its inward radial velocity and the settle engages.

Now measured rather than asserted: the `tangential grab` scenario reaches the
floor exactly (`r / minR = 1.0000`) and produces a single **46.4°** deflection in
`settle`. Every other scenario stays under 15°, the kink threshold. This is pinned
in `test/invariants.test.ts` so that fixing it fails there specifically.

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

This matters because `docs/DESIGN.md` §2 documents `whip` as a distinct state with
its own row and description. **Anyone porting from the document rather than the
code would have built a state machine the prototype does not have.** The
`whipE` / `whipVmax` energy tracking is live; only the label is fiction.

`CapturePhase` therefore has four members, not five.

### 6 — Every capture reports one spurious kink

`src/sim/step.ts` · `updateDefl`, seeded by `beginCapture`

`beginCapture` seeds `lastAngle` from the **position** angle
(`Math.atan2(ry, rx)`), but `updateDefl` compares **velocity** angles. The first
sample of every capture therefore reports the angle between the position and
velocity vectors rather than a turn — measured at ~160° on a typical grab.

Consequence: the prototype's SMOOTH/KINK pill reads "1 KINK" for _every_ capture,
including perfectly clean ones. The metric `DESIGN.md` §3 calls "the single most
important smoothness metric" has a false positive on every run.

Reproduced because it is pure telemetry and never feeds back into physics. The
invariant tests skip the first sample of each capture explicitly.

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

---

## Status

```
port equality vs index.html   10/10 scenarios, divergence exactly 0
                              position · velocity · fuel · phase
phases exercised              drift, clear, flyby, settle, orbit, crash
invariants                    31 tests
golden baseline               golden/physics-v1.json, 2060 ticks
```
