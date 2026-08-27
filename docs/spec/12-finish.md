# 12 · The finish line

**Board**: [Direction 12 — The Finish Line](../design/Aphelion%2012%20-%20The%20Finish%20Line.dc.html).

**Rulings applied**: **carpet dots pay flat and unmultiplied.** This violates the scoring
constitution's axioms and is a **deliberate, argued exception** — recorded here as an exception so
that nobody later "fixes" it. **LUMEN's world monopoly** is the finish system: carpet, chevrons,
checkered line and carpet dots, and nothing else in the world may wear green.

**Depends on**: [00 · Tokens](./00-tokens.md), [08 · Economy](./08-economy.md),
[10 · Results](./10-results.md).

---

## 1 · The idea

**The carpet takes you home.**

The finish is the boundary's mirror: same grammar — band, line, gradient — opposite verdict. The
pink boundary is the end that kills; the green line is the end that saves. The game's most dangerous
instrument gets a twin that only ever says yes.

Half a screen below the checkered line begins the **carpet**. Cross into it and the run is
mathematically over: gravity lets go, the lift blends the craft's velocity into its own, opens the
throttle halfway up, and throws the craft past the top of the screen.

## 2 · Geometry

| Element | Extent |
|---|---|
| Carpet | From the carpet edge up to the checkered line — **half a screen height** of world space |
| Checkered line | A two-row checker of **20 × 20** design-px squares, full width, at the top of the carpet |
| Chevron mat | Full-width rows of thick chevrons inside the carpet, in strict parallel. Row pitch ~54 design px |
| Gradient | LUMEN, α 0 at the carpet edge rising to α 0.12 at the line |

The checker is **the game's only pattern fill**. Everything else is line and glow. The checkered
flag is the one universal racing glyph; spending the game's single texture on it makes the finish
unmistakable at any speed.

## 3 · The sequence — ~2.2s from carpet edge to gone

### Carpet edge

Gravity lets go — **the last swing does not**. The trajectory and velocity of the final release
carry into the carpet. Swing dead straight and the craft rides the centre; release hard left and it
travels far left while the lift gently trues it up to a left-side finish.

**The carpet corrects; it never erases.** The finish position is the last release's signature.

The compass and every gauge **die instantly** — there is nothing left to decide. The velocity
readout stays, for the show.

### The lift · 0–50%

| Property | Value |
|---|---|
| Vertical blend | Vertical speed blends toward carpet speed over **~400ms**, first-order, coefficient ~5 /s. A smooth catch, never a jerk |
| Lateral correction | Lateral velocity decays toward zero, first-order, coefficient ~1.1 /s — much slower than the vertical blend, which is why the lane survives |
| Mat | Chevron rows brighten row by row under the craft: α 0.22 at rest, up to 0.77 with a 10px LUMEN bloom directly under the craft |

### The surge · 50%

At the halfway point the lift **opens the throttle** — early enough that most of the ride is the
fast part.

| Property | Value |
|---|---|
| Target speed | Ramps linearly from carpet speed to **~2.6 × carpet speed** between 50% and 100% of the carpet |
| Velocity readout | Climbs with it |
| Dust | Streaks stretch (spec [05](./05-field.md)) |
| Mat | Blurs |

The game spends its speed vocabulary on the player one last time.

### The crossing

| Property | Value |
|---|---|
| Hitstop | **None.** The finish never interrupts momentum; that grammar belongs to decisions, and there is nothing left to decide |
| Checker | Flashes once — **E3, the only green E3 in the game** |
| Callout | `FINISH!` bubbles up at the crossing point, wherever the lane ended up. Archivo 800, 24px, LUMEN, same pop-and-linger as any callout (spec [06](./06-awards.md)) |
| Craft | Leaves the top of the screen at full song |

### The empty sky

**The camera does not follow.** It holds on the checkered line cooling and the trail fading for
**~800ms** — the same "let it go" the release taught — then the results sheet snaps in over the
empty field (spec [10](./10-results.md)).

**Victory is the screen the craft is no longer on.**

## 4 · Carpet dots

Loose points scattered across the carpet, swept up by whatever line the finish happens to take.

| Property | Value |
|---|---|
| Value | **+150 flat, each** |
| Tier | None |
| Band | None |
| Streak | None |
| Chain | None |
| Aiming | None — the run is over; there is no input |
| Colour | LUMEN, r 5.5, 8px bloom |
| Placement | Scattered across the carpet by the day's seed, visible on approach |
| Pickup | Proximity, on the craft's actual path |
| Feedback | `+150` in LUMEN, Archivo 600, 12px, pops 22px over 120ms and fades over 900ms |

> **This is a deliberate, argued exception to the scoring constitution** (spec
> [08](./08-economy.md)). Axiom 1 says progress is the only base currency; axiom 2 says skill only
> multiplies; axiom 5 says every multiplier has a pixel. Carpet dots mint points that were not
> earned by flying well, and take no multiplier at all.
>
> The argument for the exception: **pocket change outside the wager.** Found money, not earned
> money — and it is *marked* as such by being flat, untiered and unmultiplied, in the one place in
> the game where the player has no input left. It does not repeal the constitution because it does
> not pretend to be a wage.
>
> **Do not "fix" this.** It is the exception the design named on purpose.

## 5 · The no-input zone

**The carpet is the game's only no-input zone.** One input, honoured by removing it: the run ended
when the player earned the carpet, and the lift is the bow, not a level.

Presses inside the carpet are ignored. They are still recorded in the input log, because the log is
the run's record and must not be filtered (ADR-0004).

## 6 · The colour law amendment

LUMEN gains one world monopoly: **the finish system**. Carpet, chevrons, checkered line and carpet
dots — nothing else in the world may wear green, exactly as nothing but risk wears pink.

**Why it does not collide with SHARP**: the two greens agree. Green means good news, in type and in
terrain. Confusion needs contradiction, and there is none.

## Acceptance

- Three runs crossing the carpet edge with lateral velocities of −150, 0 and +165 design units/s
  finish in three visibly different lanes; the lane ordering matches the release ordering.
- No press inside the carpet changes any simulation state other than the input log.
- The crossing produces no hitstop; a tick-by-tick trace shows the world time-scale never leaves 1.
- Carpet-dot pickups sum linearly with count and are unaffected by tier, band, streak or chain. A
  test that varies all four while collecting the same dots yields the same dot total.
- The checker flash is the only LUMEN E3 in the game, and the only green thing in the world outside
  the finish system.
- The camera's position is unchanged from the crossing until the results card arrives.
