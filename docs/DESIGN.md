# Aphelion — Vision & Design Decisions

*A one-tap, momentum-driven space game. Handoff document for solo development.*

Last updated: 2026-08-20 · Prototype: `aphelion-phase.html` (single-file, ~1250 lines)

---

## 1. The Vision

Aphelion is a calm, one-tap mobile game about **momentum and orbital slingshots**. A ship drifts upward through a vertical field of planets. The player does exactly one thing: **press and hold** to let a planet's gravity capture the ship into orbit, then **release** to fling out along the tangent toward the next planet. Chaining these slingshots is how you climb.

The intended feel is **zen and flow-based**, not twitchy. Gravity should feel like it *catches* you and reels you in — simulated and physical, never rigid or snapped. The skill is reading momentum, committing to a capture at the right moment, and releasing at the right point in the orbit to sling toward your next target.

### The one hard problem

Everything in this game was easy *except the capture mechanic*. It went through 16+ failed attempts before the current approach worked. The core tension: gravity must **catch and reel you in** (feel physical), let you whip around one side making an eccentric **oval** first, then optionally **circularize** into a stable ring — and the tightness of that final orbit must be controllable, without the motion ever looking rigid, snapping, or clipping the planet surface.

**The insight that unlocked it** (after 16 failures): stop conflating three separate concerns into one authored quantity. Separate them:
- **Clearance** — don't hit the surface (a minimal early nudge to lift periapsis above the minimum orbit radius).
- **Shape** — the oval, which comes from *pure gravity* (the physical whip).
- **Tightness** — how tight the final settled orbit is, applied at the *settle*, not at the approach.

Aim never touches the approach. It authors a *settle radius* that the ship eases toward after the whip. This decoupling is the whole game.

---

## 2. The Core Architecture: Phase-Clock Settle

The capture is a small state machine. The key idea — the thing that makes it feel right — is **decoupling orbit *shape* from sweep *rate***. We call it the "phase clock."

The physical whip is real Newtonian gravity. But once the ship reaches periapsis, we **freeze** the orbit as a geometric ellipse and let a "phase clock" sweep the ship around that frozen curve at a controllable rate. This lets us do things pure physics can't — like circularize an orbit or run it at a chosen pace — while keeping the motion smooth and orbit-shaped.

### Phase state machine

| Phase | What happens |
|-------|--------------|
| `drift` | No gravity. Ship coasts in a straight line. |
| `clear` | On press: a brief clearance correction (eased over 5 frames) lifts the natural periapsis to the minimum orbit radius so the ship won't clip the surface. |
| `whip` | Real softened gravity — the physical dive and slingshot. Tracks peak orbital energy *before* any floor clamp. |
| `flyby` | Too-fast or already-outward grabs. Gravity bends the path; holding burns fuel to brake into a capture. |
| `settle` | At periapsis, `freezeOrbit()` anchors an ellipse at the ship's actual position. A phase clock sweeps it via conserved angular momentum (Kepler), scaled by `phaseRate`. `tighten` eases eccentricity toward a circle. |
| `orbit` | Settled. Stable orbit maintained by the phase clock. |
| `release` | Fling along the tangent, plus the boost. |

### Why the phase clock, concretely

A real orbit sweeps angle *fast* at periapsis and *slow* at apoapsis (Kepler's second law). The phase clock respects this — it advances the true anomaly using conserved angular momentum, `dθ/dt = L/r²` — so motion always looks like a real orbit. But `phaseRate` scales that whole coherent sweep, and `tighten` reshapes the ellipse toward a circle *independently*. The two never fight because the sweep always matches whatever shape currently exists.

---

## 3. Physics Constants & Coordinate System

All capture math is done in **planet-relative Cartesian coordinates**, sub-stepped with semi-implicit Euler.

```
GM         = 5,500,000     gravitational parameter
soft       = 18            softening (a = -GM·r̂ / (r² + soft²))
SUB        = 6             physics substeps per frame
minOrbitGap= 16            minR = planet.R + 16
cruise     = 97            baseline drift speed
```

Softened gravity avoids the singularity at r→0 and keeps the sim stable. The softening also means escape velocity is slightly shallower than the textbook `√(2GM/r)` — worth knowing when tuning the flyby threshold.

**Per-sample deflection > 15° = a visible kink.** This is the single most important smoothness metric. The trace recorder flags kinks; any physics change should be validated against them.

---

## 4. Mechanics In Detail

### 4.1 Capture & the settle

On press near a planet, the ship enters `clear`, applies clearance if its natural periapsis would clip the surface, then whips under real gravity. At periapsis, `freezeOrbit()`:
- Anchors the ellipse at the ship's **actual current position** (this fixed an early bug where the orbit teleported).
- Sets eccentricity from the conserved pre-floor whip energy (capped at 0.6), so head-on dives still produce a visible oval instead of a flat circle.
- Hands off to the phase clock for the settle.

During the settle, `tighten` (0→1 over `settleDur`, smootherstep) eases the ellipse toward a circle at the periapsis radius **and** eases the angular momentum from the oval's value toward the circular value — so a fully tightened orbit runs at the *true circular speed*, not the periapsis speed. (Skipping the L-easing was a bug that made tight circles spin at 2× the correct speed forever.)

### 4.2 Flyby & "hold to capture"

A grab is a **flyby** when it's unbound (speed ≥ escape) or already moving outward with no periapsis ahead. Gravity still bends the path, but no orbit is forced. Per the design, holding a flyby **burns fuel to brake** it — actively shedding speed to pull the unbound hyperbola down into a bound, capturable orbit.

Key subtlety, discovered via trace: **brake strength is direction-dependent and speed-dependent.**
- **Inbound** (still diving): brake *hard* so it converts during the dive, capturing at the low point you can see — not limply on the way back out.
- **Outbound** (sailed past): brake *gently* (`flybyOutwardEase`) so the ship coasts wide and arcs back on a big graceful loop, rather than snapping into a tight U-turn. Bleed radial-out velocity preferentially, preserve tangential (`flybyRadialBias`) — tangential motion is what turns a reversal into an arc.
- **Low speed** (below `flybyBrakeMinSpeed`): brake **off entirely**. At low speed gravity itself swings the heading fast (little momentum to resist it), and braking makes it worse by shedding more speed — a vicious spin cycle. A slow grab is already bound; let gravity reel it in on its own gentle wide arc.

If fuel runs dry mid-brake, the ship stays a flyby and sails past.

### 4.3 The boost (slingshot reward)

A tight capture earns a **boost** cashed on release. Its design went through real iteration to reach the current feel:

- **Earned** only by a genuine capture (frozen orbit, past periapsis, not a flyby), scaled by *tightness* above `boostThreshold`.
- **Ramp-then-decay envelope**: after banking at periapsis, it ramps 0→peak over `boostArmTime`, then decays to 0 over `boostDecayTime`. A reflexive tap-through gets almost nothing; you must *hold a moment* to arm it, then release near the peak. This turned it from an always-loaded footgun into a skill window.
- **On release, it splits**: a small **permanent carry** (`boostPermFrac`, ~22%) baked into velocity, plus a **punchy transient burst** (`boostPunch`, 1.8×) that decays over `boostBurstDecay` during drift. So escape feels punchy up front, then settles to a modest lasting gain — instead of a permanent add that ratchets you faster and faster forever (which was a real bug).

### 4.4 Fuel economy

Fuel is the pacing pressure. **The whip and slingshot are always free** — you can grab, orbit, and fling between planets forever without spending. Fuel is spent only on:
- **Circularizing** (`fuelPerSec` × settle time).
- **Braking a flyby** (`flybyFuelPerSec` × brake time).

Fuel regenerates slowly (`fuelRegen`) when not spending. Current tuned values (`18 / 54 / 15` for circ / flyby / recovery) make a full circularization cost ~22 fuel and recover over a few seconds of drift — a deliberate but not punishing rhythm.

**Design rule learned the hard way:** never gate *entering an orbit* on fuel. The player must always be able to capture and slingshot even at low fuel — that's the core loop. Only *circularizing* costs. If fuel runs out mid-circularization, the ship "putters out": a weak, boostless, damped release (it keeps the orbit it had, just can't finish rounding it). Capture is blocked only at a **truly empty** tank.

### 4.5 Crash system

If the player is on a genuine collision course, a grab shouldn't be able to save them at the last second.

- **Crash cone** (visual + grab refusal): shown when the ship's heading **ray intersects the planet's circle** AND it's within a close range (`crashConeRange`) AND moving toward the planet. Drawn as a red wedge with its **tip at the ship**, fanning out to the planet, with a localized industrial "⚠ CRASHED" readout at the impact point. Grabs inside the cone are refused.
- **Crash death**: hitting a planet during free drift kills (freeze → flash → respawn after `crashPause`) unless it's a near-parallel graze (`crashGrazeDot`) — which preserves the legitimate case of flinging tangentially past a planet you just left.
- **The player can always capture *before* the cone** to recover. The cone only punishes waiting too long.

*Note (open issue): the cone uses a straight-line ray, but the actual path curves under gravity, so the cone can over-warn on a dive that's genuinely capturable. Making it gravity-aware is a known TODO — see §8.*

### 4.6 Discovery aids

Because the next planet is often off-screen, two systems help:
- **Compass gauge** (during capture): a ring around the orbit with a colored marker for each of the ~3 nearest reachable planets, at the orbit angle whose tangent would fling you toward that planet (release-aware). A white "you are here" pip shows the ship's orbit angle; line it up with a marker to reach that planet. Anchored to the *final settled radius* so it doesn't shrink/pump distractingly (`gaugeFollow` controls how much live-orbit bob it shows).
- **Edge markers** (always on): arrows at the screen edge pointing to off-screen planets within `edgeMarkerRange`, labeled with name + distance. Gives spatial awareness during fast flybys when the gauge (which needs an orbit) can't help.

---

## 5. Current Config (source of truth)

These are the live, tuned values as of this handoff. Grouped by system. Several are exposed as live sliders in the in-game TUNE panel.

```js
const CONFIG = {
  // --- core physics ---
  GM: 5_500_000, soft: 18, SUB: 6, minOrbitGap: 16, cruise: 97,

  // --- aim scoring (feeds boost + tighten target) ---
  aimInwardW: 0.55, aimProxW: 0.25, aimSpeedW: 0.20, aimProxRef: 240,

  // --- phase-clock settle ---
  phaseRate: 1.0,      // sweep rate vs real speed (headline knob)
  tightenFrac: 1.0,    // final roundness: 1 = circle, lower = residual oval
  settleDur: 1.2,      // seconds to ease shape + phase rate
  phaseRamp: 0.5,      // how fast phase rate reaches target
  clearEaseFrames: 5,

  // --- flyby / hold-to-capture ---
  captureInboundMin: 0.30,   // below this + unbound = flyby
  flybyBrake: 320,           // speed shed/sec holding a flyby
  flybyFuelPerSec: 54,       // fuel/sec braking a flyby
  flybyRadialBias: 0.85,     // brake spent on radial-out vs tangential (higher = wider arc)
  flybyOutwardEase: 0.35,    // brake multiplier when sailing outward (lower = wider return)
  flybyBrakeRefSpeed: 200,   // brake reaches full strength here
  flybyBrakeMinSpeed: 120,   // below this, brake OFF (slow grabs coast on gravity)
  whipTimeout: 1.5,          // safety: no periapsis in this long => flyby

  // --- boost ---
  boostThreshold: 0.5, boostMax: 95, boostRetainOrbit: 0.5,
  boostArmTime: 0.45,   // ramp 0->full (must hold to arm)
  boostDecayTime: 1.4,  // fade to 0 after peak
  boostPermFrac: 0.22,  // fraction that permanently carries
  boostPunch: 1.8,      // transient burst multiplier (punchy escape)
  boostBurstDecay: 1.3, // burst fade time in drift
  releaseFlingBoost: 1.0,

  // --- fuel ---
  fuelMax: 100, fuelRegen: 15, fuelPerSec: 18,  // "18 54 15" tuned set

  // --- field & UI ---
  fieldWidthFrac: 1.20,  // field 20% wider than screen (safe margins)
  gaugeFollow: 0.25,     // compass ring live-orbit bob (0=still, 1=full pump)
  edgeMarkerRange: 1300, // off-screen marker cutoff distance

  // --- crash ---
  crashConeRange: 70,      // how close the crash cone reaches
  crashConeHalfAngle: 0.42,// drawn wedge half-angle (cosmetic)
  crashDepthFrac: 0.72,    // (legacy periapsis-based crash test, mostly superseded by ray test)
  crashPause: 0.7,         // freeze duration before respawn
  crashGrazeDot: 0.18,     // only near-parallel grazes survive; steeper kills
};
```

---

## 6. The Trace Recorder (your primary tool)

The prototype was built **without a browser** on the author's side — every physics change was verified by (a) headless Node simulation replaying exact grab conditions, and (b) an in-game **trace recorder** the player triggers, then pastes back for analysis.

Each capture records per-sample `t, r, speed, deflection, phase-multiplier, periapsis, apoapsis, fuel, phase`, plus a summary (max deflection, kink count, min/max radius, final state). The TRACE panel shows a table, a SMOOTH/KINK pill, and a COPY-FOR-CHAT button.

**Keep this.** It is the single most valuable debugging asset in the project. When you move to git + proper testing, the trace format is a natural basis for:
- **Regression fixtures**: snapshot a known-good trace for a given grab, assert future builds reproduce it within tolerance.
- **Smoothness assertions**: max deflection per sample stays under threshold (no kinks).
- **Physics invariants**: energy/angular-momentum conservation during the whip; settled orbit runs at circular speed; boost decays to the permanent carry; fuel never goes negative; etc.

---

## 7. Suggested Development Setup (git + testing)

The prototype is a single self-contained HTML file. To develop it seriously:

### Structure
```
/src
  physics.js      // pure sim: gravity, whip, freeze, phase clock, flyby brake
  capture.js      // the phase state machine
  boost.js        // envelope + burst/carry split
  fuel.js         // economy
  crash.js        // cone detection + collision
  render.js       // canvas draw (gauge, compass, edge markers, trail, cone)
  config.js       // the CONFIG object above (single source of truth)
  trace.js        // recorder + export
  main.js         // loop, input, camera, bounds
/test
  physics.test.js // headless sim assertions (see below)
  fixtures/       // recorded traces as regression baselines
index.html        // thin shell that mounts the canvas + UI
```

### Extract physics as pure functions first
The highest-value refactor: make the sim **pure and headless-runnable** (no canvas, no DOM). The prototype already effectively does this — the physics never touches rendering. Pull `stepPhysical`, `freezeOrbit`, `stepPhase`, `naturalPeriapsis`, the flyby brake, and the boost envelope into `/src/physics.js` with no side effects, so tests can drive them directly. This is what made headless verification possible during prototyping.

### Testing approach (proven during prototyping)
1. **Deterministic sim harness** — seed a grab (`r`, `speed`, `angle`, `fuel`), run N frames, assert on the resulting trajectory.
2. **Kink assertion** — `maxDeflectionPerSample < 15°` across the settle.
3. **Physics invariants** — settled circle speed ≈ circular speed for its radius; L conserved during whip; boost total decays to `boostPermFrac × boostMax`; fuel monotonic given no spend; ship never inside `planet.R`.
4. **Golden traces** — store real recorded traces in `/test/fixtures`, replay the same grab, diff within tolerance. Regression-proofs the "feel."
5. **Scenario matrix** — slow/fast/tangential/head-on/sailed-past grabs, each with an expected phase outcome (capture vs flyby vs crash).

### Recommended stack
- Vanilla JS + Vite (keeps the zero-dependency spirit; instant reload).
- Vitest or node:test for the headless physics suite.
- No framework needed — it's a canvas game; the UI is drawn, not DOM.
- Keep everything in one `CONFIG` object; consider hot-reloading it.

---

## 8. Open Issues & Deferred Ideas

**Known bugs / rough edges**
- **Crash cone is straight-line, path is curved.** The cone uses a ray-circle test, but gravity bends the actual path, so the cone can over-warn on a dive that would capture cleanly, and the instantaneous ray at grab-time can disagree with what the cone showed a frame earlier. *Fix:* make the cone gravity-aware — integrate the natural path forward a short horizon and test whether it actually enters the surface — and reconcile the grab-refusal gate with the visual so they never disagree.
- **Periapsis floor bounce.** A slow dive that reaches the minimum-orbit floor can have one sharp deflection at the bottom as the settle kicks in. Softening this transition is the next smoothness pass.

**Deferred feature ideas**
- **Earlier gauge / release timing during the whip.** The compass needs a frozen orbit, so it only appears once settling. Projecting release angles against the *whip ellipse* would give release timing during fast slingshots (natural follow-up to the edge markers).
- **"Too slow / too far" capture feel.** A near-stationary slow grab still gets reeled in — physically correct but can feel wrong ("crawled over to the planet"). Possible: a minimum-approach-energy gate so genuinely dead grabs drift past instead of being magically pulled in.
- **Touch pressure.** Investigated and declined: `Touch.force` / pointer `pressure` are unreliable across devices (iOS dropped 3D Touch; most Android report constant). Not worth leaning on. Reliable alternative if an intensity axis is wanted: hold-duration or a small drag-distance during the hold.

**Explicitly rejected (don't redo these)**
- Making the boost a permanent velocity add (ratchets speed forever).
- Gating capture on having enough fuel to circularize (breaks the free-slingshot core loop).
- Rigid/snapped orbit insertion (the whole 16-failure saga — keep it simulated).
- Instant full boost at periapsis (footgun; the ramp fixed it).

---

## 9. Quick Reference: What Feels Right

The north star for any tuning decision:

- Gravity **catches and reels** — physical, never snapped.
- Fast whip → eccentric **oval** first → optional **circle** if held.
- Aim sets tightness *monotonically* — precise = tight/fast, lazy = wide.
- Never settle wider than the grab radius. Never clip the surface.
- Slow approaches fall *inward*, gently — not a sharp spin.
- Release flings along the tangent. Boost is punchy then fades.
- The slingshot is **free**; circularizing **costs**.
- Too-fast = bend the path; **hold to capture** with more fuel.
- You can always recover **before** the crash cone; too late inside it.

Everything in the current build serves these. When in doubt, record a trace and check the deflection column.
