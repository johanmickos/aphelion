# 13 · Fuel

**Board**: none. Authored from the direction in [M0.1](../plan/m0-foundations.md) and **ADR-0009**.
The deadline track's *appearance* is [Direction 03](../design/Aphelion%2003%20-%20HUD%20Five%20Pressures.dc.html)'s
and the burn's is [Direction 07](../design/Aphelion%2007%20-%20Boundary.dc.html)'s; what fuel *is*
has no board.

**Depends on**: [03 · HUD](./03-hud.md) §5, [07 · Boundary](./07-boundary.md) §5,
[06 · Awards](./06-awards.md) for tier.

---

> ## ⚠ Built, 2026-09-04 — the whole law, and **nothing spends it**
>
> §1's tank, §2's cost curve and lit fraction, §4's tier returns and §5's three warning energies are
> all built, and ADR-0009's law is asserted as the property §4 asks for: sweep carry, band, streak,
> chain and velocity, hold the tier, and find **one value per tier**. The strongest form of that is
> in the signature — `refuelled` takes a tank and a tier, and none of the five is in scope to be
> read.
>
> §2's `referenceClosing` had no value and now has a measured one: over the **2 137 ticks the
> deadline is up** across the 26 dispatches this build replays, the craft closes on the wall it is
> leaving through at p05 230, **p50 543**, p95 934, max 1 031. The median is the anchor because the
> table's numbers are about a *typical* press.
>
> **Then: nothing spends it.** A **save** is a press inside the deadline window, and on this build a
> save is an ordinary **grab** — spec [03 · §5](./03-hud.md)'s notice re-based the cue off §3's burn
> on the author's own instruction, *"a grab needs no fuel, so the instrument comes forward, and what
> M4.4 adds is the luminance and nothing else."* So `f` is **1.0 on every tick of every run**, and
> three things are built and unreachable in play:
>
> - §5's **LOW** and **EMPTY**, which need `f ≤ 0.25` and `f = 0`. They are asserted directly.
> - §2's coupling. At a full tank the fraction only falls below 1 above **1 450** design units a
>   second of closing, and the corpus maximum is 1 031 — so the window is fully lit, always.
> - §1's *"`f = 0` removes the ability to save"*, which is the one part **not built at all**:
>   refusing a press is a change to the simulation, and M4 may not move `SIM_VERSION`.
>
> All three land with §3's **burn**, which is spec [07 · §5](./07-boundary.md)'s. What is built is
> the law, so that when the burn arrives it charges rather than invents.
>
> **⚠ §5's *"the percentage number is the label"* is not built either.** It is a *readable* element
> riding the craft; spec 00 §7 forbids anything readable below the thumb line, and the camera holds
> the craft above it by measurement rather than by construction — 182 design units below centre
> against a 422 budget, over one run. Where it goes wants an author who can see fuel move.
>
> **The halo is the craft's own light with a level on it**, drawn inside the E2 bloom rather than
> beside it: spec 00 §3 makes bloom the game's one ordinal channel, so a second glow around the craft
> would be a second thing saying *more* about a different quantity. It does not turn with the dart —
> a gauge read from a datum that rotates every tick is a gauge nobody reads.

## 1 · What fuel is

**Fuel is what a save costs.** It is not a resource the player spends on movement, and there is no
throttle to spend it on. It does exactly one thing: it limits how much of the deadline window the
craft can afford.

It is **returned by flying well, never by collecting anything** (ADR-0009).

| Property | Value |
|---|---|
| Representation | A fraction of a tank, `f ∈ [0, 1]` |
| Start of run | `f = 1.0` |
| Display | The halo arc on the craft (spec [03](./03-hud.md)). Never a corner gauge |
| Passive drain | **None.** Fuel is not a clock |
| `f = 0` | Is not a death. It removes the ability to save; the craft flies on undimmed |

## 2 · Fuel and the deadline window

The deadline window is drawn at its **true physical size, always**. Fuel couples to it by
**luminance, never geometry**.

Let `p ∈ [0, 1]` be the normalised position along the window, `p = 0` at the earliest legal press
and `p = 1` at the dot — the last press that can still save the run.

```
cost(p) = (C_MIN + (C_MAX - C_MIN) * p) * speedFactor(closing)
```

- `cost` is **strictly increasing in `p`**. The latest legal save is the longest, hottest and most
  expensive one — and, per `VISION.md` pillar 4, the best-paid one. That is what makes the dot a
  dial the player aims at rather than a warning they obey.
- The **lit fraction** of the window is the largest `p` for which `cost(p) ≤ f`, lit from `p = 0`
  upward. Half a tank lights the early half; an empty tank shows the whole window in DUSK.
- **A moment exists, and you cannot buy it.** The window's geometry never shrinks.

Opening values, to be tuned on the phone:

| Constant | Value | Meaning |
|---|---|---|
| `C_MIN` | 0.15 | Cost of the earliest legal save, at reference closing speed |
| `C_MAX` | 0.60 | Cost of a save at the dot, at reference closing speed |
| `speedFactor` | `0.6 + 0.4 × (closing / referenceClosing)`, clamped to `[0.6, 1.8]` | A faster dive is a more expensive carve |

## 3 · The burn

A press inside the window buys the burn (spec [07](./07-boundary.md) §5).

| Step | Rule |
|---|---|
| Charge | `cost(p)` is deducted **at the press**, in full |
| Drain | The halo drains **visibly and in real time** across the carve, not in one step — the deduction is committed, the animation is paced |
| Refund on survival | **`REFUND_FRACTION = 0.40` of the cost is returned** when the craft re-enters the field alive |
| Refund on death | None. There is nothing left to refund it to |

So a well-flown dive is nearly free and a panicked one is expensive (ADR-0009): the survivor pays
60% of a cost they chose, and the pilot who over-committed pays whatever the dot charged.

The burn is the only time the player's own light wears ION (spec [00](./00-tokens.md)).

## 4 · How fuel returns

### By release tier

Fuel is returned **in proportion to the tier of a release** — never in proportion to the points
cashed. Points scale with metres climbed, so paying fuel per point would refuel longest on the
longest orbits, rewarding exactly the slow, coasting-adjacent play the economy leaves unpaid
(ADR-0009).

Tier-proportional fuel says *you flew well*, which is the same sentence the compass says. The two
instruments agree.

| Release | Fuel returned |
|---|---|
| miss (outside the window) | **0** — not a graded release |
| make | +0.02 |
| TRUE | +0.05 |
| SHARP | +0.09 |
| PERFECT | +0.16 |

**Invariants, which hold whatever these values are tuned to:**

- Strictly increasing in tier.
- A function of **tier alone**. Independent of carry, cash, metres climbed, band, streak, chain,
  velocity and orbit duration. If any of those appear in the fuel path, the rule is wrong.
- `make > 0`, so a struggling run can still refuel and the game has no fuel death spiral.
- Clamped: `f = min(1, f + return)`.

### By anomaly

> ## ⚠ It moves onto the **body**, 2026-09-01
>
> The rule below trickles fuel for orbiting *anywhere inside* the anomaly's stretch, which was
> written when the anomaly was a stretch and nothing else. Spec [05 · §5](./05-field.md) now places a
> **body** at the foot of it, and that body is what refuels — which is what makes the trip out to it
> worth taking. Orbiting an ordinary body that happens to be inside the stretch pays nothing.
>
> **Holding the anomaly's authored orbit fills `f` toward 1.0.** The halo (spec
> [03](./03-hud.md)) is drawn in AURORA and breathes while it does, which is the filling made
> visible rather than a second signal.
>
> **And saves still cost while the craft is charged.** The author's first description was *"no fuel
> is burned during this period"*, and this spec's §1 makes that a no-op: *"passive drain: none. Fuel
> is not a clock."* Fuel does exactly one thing, which is limit the deadline window — so *no fuel
> burned* would have meant **free saves**, and free saves plus the charge's reel would leave the
> boundary unable to kill. Ruled the other way: the tank fills, and spending it is still a decision.
> The charge removes the risk in a **capture**; it does not remove the risk in the **line**.
>
> The trickle's own value is untouched below and is still an opening position; what changed is what
> it is paid for.

**Orbiting inside an anomaly trickles fuel** (ADR-0009). Per tick of engaged orbit inside an
anomaly:

```
f += ANOMALY_TRICKLE   // opening value: 0.02 per second of simulated engaged orbit
```

Coasting through an anomaly trickles nothing. The trickle is for *orbiting*, so the anomaly stays a
rest stop that must still be flown.

### By powerup

A powerup may pay fuel (spec [16](./16-powerups.md), ADR-0009). It may never pay points or
multipliers.

## 5 · Warnings

Severity is ordinal, so it rides the energy channel, not hue (spec [03](./03-hud.md) §4).

| State | Threshold | Presentation |
|---|---|---|
| Normal | `f > 0.25` | The halo arc in CORE, at E1 |
| LOW | `f ≤ 0.25` | The halo goes **ION**, breathing at **0.8Hz** with a soft outer ring. The percentage is the label — no icon, no banner |
| EMPTY | `f = 0` | The halo hollows to **DUSK** structure — spent, like a taken body — while an ION ring strobes at **2Hz** |

**The craft itself never dims.** The player is always the brightest thing alive.

## 6 · Fuel by mode

| Mode | Fuel |
|---|---|
| DAILY | As specified |
| DRIFT | As specified |
| **ZEN** | **No fuel, no deadline, no burn.** There is no death in ZEN, so there is nothing for a save to cost |

## Acceptance

- The deadline window's rendered geometry is byte-identical at `f = 0`, `f = 0.5` and `f = 1.0`;
  only its lit fraction differs.
- At `f = 0` no press anywhere on the projected line produces a save.
- A save at `p = 0.2` costs strictly less than a save at `p = 0.8` at the same closing speed.
- A survived burn returns exactly 40% of what was charged, and a fatal one returns nothing.
- Fuel returned by a release is unchanged when carry, band, streak, chain and velocity are varied
  and tier is held fixed. A property test over those five inputs finds one value per tier.
- A run that never releases at better than `make` still gains fuel, monotonically.
- ZEN's build contains no fuel state.
