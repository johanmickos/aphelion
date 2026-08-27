# 02 · The release — 400ms

**Board**: [Direction 02 — Release Storyboard](../design/Aphelion%2002%20-%20Release%20Storyboard.dc.html).

**Rulings applied**: the board's award words (DEADEYE / SHAVED / CLEAN) are retired — the
vocabulary is TRUE / SHARP / PERFECT plus an unnamed make (Direction 06 rev 2). The board's
`+445` is a stale illustration from a superseded scoring model and is carried nowhere. The award
word is set in **Archivo 800**, not the board's display face (Direction 06). The board's `P11`
chips are retired. The board's "NEXT, IN ORDER" footer uses obsolete numbering and is void.

**Depends on**: [00 · Tokens](./00-tokens.md) for energies and motion, [06 · Awards](./06-awards.md)
for what word is chosen, [08 · Economy](./08-economy.md) for what is cashed.

---

> ## ⚠ The hitstop is rejected — this file needs rebasing in M2
>
> **[ADR-0012](../adr/0012-the-punch-is-bought-with-speed-not-with-stopped-time.md) (2026-08-27)
> withdraws the 70ms hitstop.** It was built and flown in the prototype and read as buffering
> rather than as punch, at every length down to 30ms. What replaces it is **a kick on every
> release, scaled by the quality of the swing** — transient, so it can be large without touching
> the economy, and read from a number the simulation already produces.
>
> Everything below still stands *except* the freeze and the offsets dated from it. Concretely:
> rule 1 is withdrawn; every `T+70ms` in §2 and §3 becomes `T0`; the award word moves from
> `T+90ms` to `T+20ms`; §7's grab hitstop is withdrawn; and the acceptance criterion about
> hitstop advancing zero world state goes. The **exit-tangent rule, the award-lands-at-the-dot
> rule, and every duration measured from the start of its own element are untouched** — they were
> never the freeze.
>
> **Not rewritten here on purpose.** The timeline is [M2](../plan/m2-the-instrument.md)'s and
> rebasing it is a careful edit that wants the compass in front of it. Spec
> [01 · §7](./01-swing.md) already fixes the envelope the release kick's quality is read from.

## 1 · The three rules

1. **A 70ms hitstop where only the player's energy stays lit.** The pause is the punch.
2. **Every motion is strictly along the exit tangent** — the line the nose has been pointing down
   all orbit. Never radial, never a shake.
3. **The award word lands at the dot that earned it**, not in a band at the top of the screen.

## 2 · Timeline

`T0` is the tick on which the release input is registered. All times are **simulated** time; the
simulation applies hitstop as a time-scale, so wall-clock and simulated time diverge here
(ADR-0006).

| Element | Starts | Ends | Notes |
|---|---|---|---|
| Hitstop | T0 | T+70ms | Full world freeze. Time-scale 0 in the simulation, not a renderer pause |
| E3 flash | T+70ms | T+400ms | At the release point. Decays to zero |
| Craft deformation | T+70ms | T+250ms | See §4 |
| Camera kick | T+70ms | T+250ms | 6px along the exit tangent, home in 180ms with one overshoot |
| Farewell ring | T+70ms | T+400ms | The orbit detaches from the body and expands away, in AURORA |
| Award word | T+90ms | T+510ms | Pop, linger, then decay. See spec [06](./06-awards.md) |

Nothing from this sequence survives past **T+510ms** except the trail.

## 3 · Frame by frame

| Frame | What is true |
|---|---|
| **T−80 · MATCHED** | The hand lies on the dot; the window is E2. The player already knows the tier. Peak tension |
| **T0 · HITSTOP** | The world dims and freezes. Only the craft, the hand and the dot keep full energy. Every other element drops to ≤ 45% of its opacity |
| **T+70 · IMPULSE** | E3 flash at the release point. The craft leaves along its nose, deformed 1.5 / 0.7. The farewell ring detaches and expands. Camera kicks 6px |
| **T+160 · CONFIRM** | The word blooms at the dot that earned it. Unused rings die instantly; the taken window stays lit. Velocity digits pop to 120% and settle |
| **T+260 · RIDE** | The word decays in place on the dot while the craft runs. Deformation recovers with one overshoot. The trail is a solid luminous line — no breadcrumbs |
| **T+400 · SETTLED** | Quiet. The body is DUSK, the word is gone. The only permanent change is chain +1, so the craft's bloom is 4px wider than an orbit ago |

## 4 · Craft deformation

Stretch is always along the velocity vector. Never along a screen axis, never around a centre.

| Time | Scale (along velocity / across) |
|---|---|
| Rest | 1.0 / 1.0 |
| T+70 | 1.5 / 0.7 |
| T+220 | 0.95 / 1.06 (the overshoot) |
| T+250 | 1.0 / 1.0 |

The craft silhouette is a dart and is a stand-in. A signature craft shape is its own exploration,
queued behind the systems settling; nothing in the game may depend on the current outline.

## 5 · Camera

| Event | Displacement | Direction | Return |
|---|---|---|---|
| Release | 6px | Along the exit tangent | 180ms, one overshoot |
| Grab | 3px | Into the orbit (reversed) | 180ms, one overshoot |

Never rotational, never random. The kick states the direction of travel, so even the camera
distinguishes grabbing from letting go.

## 6 · What the release does to the world

- **Unused rings die instantly** at T+70ms — no fade.
- **The taken window stays lit** and decays behind the craft over 420ms.
- **The held body goes DUSK at release**, not at grab (spec [04](./04-bodies.md)).
- **The farewell ring** is the orbit itself, detaching and expanding away from the body, in
  AURORA — the only AURORA the baseline field ever wears.
- **The trail is a solid luminous line.** Its brightness is the carry (spec
  [08](./08-economy.md)). There are no sampled breadcrumbs.

## 7 · Grab

Grab is the release's mirror and shares its grammar, at lower amplitude:

| Element | Value |
|---|---|
| Hitstop | 70ms, identical |
| Camera kick | 3px, reversed |
| E3 | Yes, at the grab point |
| Award | None. Grabs are never graded; only releases are |

## Acceptance

- Presentation state at tick `n` is a pure function of `(recipe, n)` (ADR-0006). An agent with no
  canvas can assert that the camera is offset 6px along the tangent at a given tick.
- During hitstop the simulation advances zero world state; the tick counter still advances.
- No element of the release sequence is alive at T+511ms except the trail.
- Every motion vector in the sequence is parallel or antiparallel to the exit tangent. A test
  that projects each onto the tangent normal finds zero.
- Deleting the economy (ZEN, spec [08](./08-economy.md)) removes the points but leaves every
  timing in this file unchanged.
