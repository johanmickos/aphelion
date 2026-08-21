# Feel

What the capture is supposed to feel like, why it is built the way it is, and
what has already been tried and rejected.

Mechanism lives in the code — `src/sim/step.ts` explains the phase clock,
`boost.ts` the release window, `fuel.ts` the economy. This file holds the things
that belong to no single module: the reason the architecture has the shape it
does, the bar any tuning change has to clear, and the dead ends.

Salvaged from the prototype's design document, which had drifted badly from the
code — thirteen config keys it listed no longer existed, three values had changed,
and it described two mechanics the code does not have. Everything in it that was
mechanism now lives next to the mechanism; this is what was left.

---

## The one hard problem

Everything in this game was easy **except the capture**. It went through 16+
failed attempts before the current approach worked.

The tension: gravity must **catch and reel you in** so it feels physical, let you
whip around one side into an eccentric **oval**, then optionally **circularise**
into a stable ring — and the tightness of that final orbit has to be controllable,
without the motion ever looking rigid, snapping, or clipping the surface.

**The insight that unlocked it:** stop conflating three separate concerns into one
authored quantity. Separate them.

| Concern | Where it is handled |
|---|---|
| **Clearance** — do not hit the surface | a minimal early nudge lifting periapsis to the minimum orbit radius |
| **Shape** — the oval | pure gravity. The dive is real physics and nothing authors it |
| **Tightness** — how tight the settled orbit is | applied at the *settle*, never at the approach |

Nothing touches the approach. That decoupling is the whole game, and it is why
`freezeOrbit` exists at all: the dive is simulated, and only once it reaches
periapsis does anything authored take over.

Corollary worth stating because it is easy to lose: **tightness follows the dive.**
It is derived from how deep you committed — `(grabR − rPeri) / span` — not from
how well the grab was aimed. The design document claimed the opposite — "aim sets
tightness monotonically" — but that mechanic was never implemented, and the code
that pretended to compute it has been removed. See PORT_NOTES 17.

---

## What feels right

The bar for any tuning decision.

- Gravity **catches and reels** — physical, never snapped.
- Fast whip → eccentric **oval** first → optional **circle** if held.
- Tightness follows the depth of the dive: commit harder, hold tighter.
- Never settle wider than the grab radius. Never clip the surface.
- Slow approaches fall *inward*, gently — not a sharp spin.
- Release flings along the tangent. Boost is punchy, then fades.
- The slingshot is **free**; circularising **costs**.
- Too fast means bend the path — **hold to capture**, and pay fuel for it.
- You can always recover **before** the crash cone. Inside it, too late.

**Per-sample deflection above 15° is a visible kink.** That is the single most
important smoothness metric, and any physics change should be checked against it.
`tools/replay.ts` reports kinks on every recorded session.

---

## Rejected — do not redo these

Each cost real time to discover.

- **A permanent velocity add for the boost.** Ratchets the ship faster forever.
  Split into a small permanent carry and a transient burst instead.
- **Gating capture on having fuel to circularise.** Breaks the free-slingshot core
  loop. Only circularising costs; entering an orbit never does.
- **Rigid or snapped orbit insertion.** This was the entire 16-failure saga. Keep
  it simulated.
- **Instant full boost at periapsis.** A footgun — a reflexive tap-through earned
  the maximum. The arm-then-decay ramp fixed it.
- **Touch pressure as an input axis.** Investigated and declined: `Touch.force`
  and pointer `pressure` are unreliable across devices (iOS dropped 3D Touch, most
  Android reports a constant). If an intensity axis is ever wanted, hold duration
  or a small drag distance during the hold are the reliable alternatives.

---

## Still open

- **"Too slow, too far" grabs.** A near-stationary grab from a distance still gets
  reeled in. Physically correct, but it can feel like the ship crawled over to the
  planet rather than being caught by it. A minimum-approach-energy gate would let
  genuinely dead grabs drift past instead.
- **The known port notes.** The crash cone tests a straight ray against a curved
  path, and the periapsis floor produces one sharp deflection. Both are reproduced
  deliberately and documented as PORT_NOTES 1 and 2.
- **Scoring.** There is still no score, goal or progression. `VISION.md` had
  momentum scoring, multipliers and named trick shots; the prototype dropped all
  of it. What scoring rewards will determine what a pickup should do, so it is
  worth settling before Stage 3.
