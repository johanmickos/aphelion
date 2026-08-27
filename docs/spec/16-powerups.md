# 16 · Powerups

**Board**: none. Authored from the direction in [M0.1](../plan/m0-foundations.md) and **ADR-0009**.

**Depends on**: [13 · Fuel](./13-fuel.md), [08 · Economy](./08-economy.md),
[17 · Daily field](./17-daily-field.md).

---

## 1 · The law

**A powerup pays fuel and time. Never points, and never multipliers.** (ADR-0009.)

A powerup is something the **field gives** the craft, not something the player earned by flying
well. Any powerup that touched the score would mint points and repeal the constitution's second
axiom — *skill only multiplies* (spec [08](./08-economy.md)).

Fuel-and-time keeps them a clean, separable system: **the field's generosity, as against the
economy's wage.**

The forbidden list is absolute. A powerup may not, by any route:

- add to bank or carry;
- change tier, band, streak or chain;
- change how a swing is graded;
- change the boost envelope, the grab range, the orbit, or anything else in spec
  [01](./01-swing.md).

If a proposed powerup needs any of those, it is not a powerup — it is a change to the game.

## 2 · What v1 ships

**Time is not a currency in v1.** CORRIDORS, the mode whose currency is time, is designed for and
not built (ADR-0005). So v1 has exactly one payer:

| Kind | Pays | v1 |
|---|---|---|
| **CELL** | Fuel | **Ships** |
| CLOCK | Time | designed for, not built — the type exists in the day recipe; nothing spawns it |

The powerup **kind** is a field in the day recipe from the start, so adding CLOCK for CORRIDORS is
a data change (spec [17](./17-daily-field.md)).

## 3 · The cell

| Property | Value |
|---|---|
| Pays | `+0.20` fuel, clamped at `f = 1.0` |
| Duration | **Instant.** There is no timed effect and no buff state |
| Geometry | A small ring, r 9 design px, with a filled core |
| Colour | **ION** — it pays fuel, and fuel is ION's (spec [00](./00-tokens.md)). It is not decoration; it is a fact about the risk budget |
| Energy | E1 at rest; E2 within grab range of the craft, so it wakes like a body does |
| Pickup | Proximity: the craft's collision radius plus 12 design px |
| Label, before pickup | `+20% FUEL` in ION, Archivo 700, 9px, tracked 0.1em, sitting beside the cell in world space. **A boost says what it pays, before it pays it** (author ruling, 2026-08-27 — in-world boost labels are in) |
| Pickup feedback | An E3 flash at the cell, the same `+20% FUEL` text popping and lingering at the pickup point (Archivo 600, 12px, same pop-and-linger as a callout), and the halo arc visibly filling |
| Pickup sound | Spec [15](./15-audio.md) — a bed voice, not a graded one. A powerup is never praised |
| On a full tank | It is still collected, still flashes, and pays nothing. **It never becomes points.** |

## 4 · Spawning

Powerups are **placed by the day's seed**, not spawned at runtime. A day is a recipe (spec
[17](./17-daily-field.md)), and every player flying today's field meets the same cells in the same
places.

| Rule | Value |
|---|---|
| Placement | In the day recipe, as `(altitude, lateral, kind)` |
| Density | ~1 per 6 bodies, so a 40-body field carries **6–7** cells |
| Distribution | Weighted **toward the field**, away from the boundary bands. A cell in the fire band would pay the player for taking a risk, and the risk is already paid by the band multiplier |
| Never | Inside the carpet (spec [12](./12-finish.md)), inside a body, or within 40 m of the field's top |
| Lifetime | **Permanent.** A cell sits where the recipe put it until collected or the run ends. Nothing in this game expires on a clock |
| Respawn | None |

## 5 · HUD presence

**None.**

There is no powerup slot, no inventory, no icon, no timer bar. A cell is a thing in the world that
pays into the halo already drawn on the craft. Its entire HUD presence is **the fuel halo getting
fuller** (spec [03](./03-hud.md)) — everything else it has to say, it says in the world, at itself.

That is the whole reason ADR-0009 restricted powerups to fuel and time: both are already
instrumented, so a powerup needs no new instrument.

## 6 · By mode

| Mode | Powerups |
|---|---|
| DAILY | As specified |
| DRIFT | As specified, placed by the run's random seed |
| **ZEN** | **None.** ZEN has no fuel, so there is nothing for a cell to pay |

## Acceptance

- The powerup module can read fuel and write fuel, and imports nothing from the economy. A
  boundary check proves it cannot reach bank, carry, tier, band, streak or chain.
- A run that collects every cell and a run that collects none produce the same score for the same
  input log up to the runs' divergence — the cells themselves contribute zero points.
- Collecting a cell at `f = 1.0` changes no state except the input log and the flash.
- Two players flying the same day meet cells at identical positions.
- No cell is placed in the carpet, inside a body, or in a boundary band.
- Removing the powerup module leaves a playable game with a slightly tighter fuel budget and no
  missing UI.
- A cell's label states its exact payout, and a cell that would pay nothing (full tank) still shows
  it — the label describes the cell, not the player's state.
