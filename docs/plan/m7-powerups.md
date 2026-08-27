# M7 · Powerups

The one system in this plan that appears in neither source. It exists because fuel needs more ways
back into the tank than skill alone, and because the field should occasionally be generous.

Spec `16-powerups`, written in M0.1 so that the economy and fuel systems were built with a slot for
it rather than having one cut into them here.

---

## The law, first

**Powerups pay fuel and time. Never points, never multipliers** (ADR-0009).

The constitution's second axiom is that skill only multiplies — accuracy, risk, consistency and
engagement price the metres, they never mint them. A powerup is something the **field** gives the
player, not something the player earned by flying well, so a powerup that touched the score would
mint points and repeal the axiom. Confining it to fuel and time gives the system a clean identity:
the economy is the player's wage, and powerups are the field's generosity. Two different sentences,
never mixed.

The fifth axiom applies too: every effect must have a pixel. A powerup that is doing something the
player cannot see is a bug.

---

## M7.1 · Spawn, pickup, lifetime

Where they appear in a day's recipe, how they read at distance, how they are collected — by flying
through, with no second verb, because a second verb is not a feature but a repeal — and what
happens when one is missed.

**Acceptance**: spawning is deterministic from the day's recipe; collection requires no input.
**Verify**: `pnpm test`.

---

## M7.2 · Fuel powerups

Two shapes, per the author: a flat return of N, and a trickle over a time window. The trickle is the
more interesting one, because it changes what the player does for its duration rather than what they
have.

**Acceptance**: both shapes are visible on the fuel halo while active; neither can push fuel past
full silently. **Verify**: `pnpm test` plus eyes.

---

## M7.3 · Time powerups

Whatever the spec settled — the constraint is that anything touching time must go through the
simulation's time-scale, the same mechanism hitstop uses (ADR-0006), so replays stay exact.

**Acceptance**: a recipe with time powerups replays bit-identically. **Verify**: `pnpm replay`.

---

## M7.4 · Presence

How an active powerup reads on the HUD without breaking Direction 03's rule that the layout never
changes between states — only the pressure does.

**Acceptance**: no new element enters the thumb zone; the masthead layout is unchanged.
**Verify**: screenshots against the M4.5 baseline.
