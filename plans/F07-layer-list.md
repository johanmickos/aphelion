# F07 · Draw layer list

**Severity** COSTS · **Blocks** Direction 02 (hitstop), Direction 05 (four new world layers) · **Depends on** F03a (landed)

> **THE ORDER CHANGED, 2026-08-27.** This plan used to say "land F03 first", on the
> grounds that a layer list whose members still reach into module scope for colour
> is half the refactor. That is an argument about VALUE, and the argument about
> COST points the other way: threading a `theme` parameter into ~40 draw functions
> and then removing it again when `Frame` arrives is the same work twice.
>
> F03 split in half on its own. **F03a landed** — `theme.ts` holds the eight
> tokens and `palette.ts` maps roles onto them, so the game is already repainted.
> **F03b is what remains**: the 87 literals in the other 13 modules, and making the
> theme an argument rather than a module-load constant.
>
> So F07 runs first and `Frame` carries `theme` from its first commit. F03b then
> becomes "convert the literals", with nowhere left to thread.

## Why

`Scene.draw` is ~180 lines of statements, and draw order here is genuinely
load-bearing. The comments prove it: the nebula sits under the starfield "so stars
parallax THROUGH the storm… which is what makes it read as a volume the ship is
inside of"; the chevrons under the chequers; popups "above the ship and its wake,
below the HUD."

All of that reasoning is correct and must survive. The problem is that the order
is expressed as statements, so it is only visible by reading the whole function —
and every layer reaches into module scope for its own colour and config.

Direction 05 adds four world layers (sky altitude ramp, dust, altitude rungs with
gravity bow and wake, boundary mote fields). Direction 02 adds a 70ms hitstop that
must freeze some layers and not others. Directions 09–11 park glass cards over a
still-animating field. Each is another block of statements in what is already the
longest function in the renderer.

## The current order, extracted

Twenty-two layers, in sequence. This list _is_ half the refactor:

```
1  letterbox bars (#05070d, outside the clip)
2  clip to window
3  black ground
4  nebula          — charged storm, under the stars deliberately
5  starfield
   -- receding translate begins (ceremony) --
6  hazard zones
7  backtrack floor
8  speed carpet    — chevrons
9  motes           — over the chevrons, under the line
10 finish line     — chequers
11 bodies
   -- receding translate ends --
12 orbit curve + anchor line + boost halo
13 deadline        — under the ship, "nothing should obscure the ship"
14 compass
15 ceremony wash   — over world, under ship
16 ship layer      — trail + hull + finish flash
17 popups          — above ship, below HUD
18 warnings
19 edge markers
20 ending notice + fuel gauge   (suppressed during ceremony)
21 score band      (cross-faded against the sheet)
22 readout         (suppressed during ceremony)
23 sheet           — over everything
   -- restore --
24 paused overlay  (outside the clip)
```

## The shape

```ts
interface Layer {
  name: string;
  /** Whether this layer draws at all this frame. */
  when?: (f: Frame) => boolean;
  /** Whether a hitstop freezes this layer's own animation. */
  freezes?: boolean;
  draw(f: Frame): void;
}

const LAYERS: readonly Layer[] = [ ... ];
```

`Frame` carries what `draw` currently destructures — ctx, cam, snap, config,
score, ceremony, timings — **plus `theme`, from the first commit**. The theme is
resolved once per frame and handed down as a value, which is what makes the
open question about regions cheap: whether a theme is fixed for a run or sampled
by altitude becomes a decision inside one resolver, not a property of 87 call
sites. Nothing Direction 05 asks for needs more than that — "the violet-black
warms almost imperceptibly toward AURORA as an anomaly approaches" is a per-frame
scalar, not a spatial gradient, and the anomaly's own aurora is already a layer.

Three things become expressible that are not today:

- **Order is readable in one screen**, with each comment sitting on the row it
  justifies rather than in a wall of statements.
- **The hitstop becomes a predicate the frame applies**, rather than a flag each
  of twenty-two layers has to remember to check. Direction 02 specifies "a full
  world freeze… only the craft, the hand, and the dot keep full energy" — that is
  literally a `freezes` column.
- **The `receding` translate becomes a group**, instead of a `ctx.save()` 200
  lines from its `restore()`.

## Steps

### 1. Nothing — F03a already landed

`DEFAULT_THEME` exists and `palette.ts` resolves from it. What F07 adds is the
place a _different_ theme could arrive: `Frame` carries one from the start, even
though every layer still reads the module constants until F03b converts them.

### 2. Extract `Frame`, change nothing else

Bundle `draw`'s locals into one record and pass it to the existing calls. Pure
mechanical; the function is the same length and the same order.

### 3. Convert to the list, one group at a time

World layers (6–11) first — they are the block with the clearest boundary and the
`receding` group already brackets them. Then the ship group (12–16), then the HUD
group (18–23).

**Verify** `pnpm test` — `test/render.test.ts` exists and exercises the composited
path — plus a visual check with `/run`. Draw-order bugs do not fail a test; they
look wrong.

### 4. Add the hitstop column

Only once the list exists. Direction 02's timing ruler is specific: hitstop 70ms,
E3 flash to 400ms, craft deform recovering at 180ms with one overshoot, award word
dying at 510ms.

Note the existing precedent to follow: `Scene.draw` already freezes popups, the
fuel warning and the burn follower when `opts.paused`, with the reason written
down — "a popup must not age out behind the overlay." A hitstop is the same idea
at a different duration, and should reuse the mechanism rather than invent one.

## Gates

| Gate          | Expected                                |
| ------------- | --------------------------------------- |
| Equality gate | Untouched. `src/render/` is outside it. |
| Golden        | Unchanged.                              |
| `pnpm test`   | `test/render.test.ts` green.            |

## Traps

- **Every order comment is a finding someone already paid for.** Move them onto
  their rows verbatim. The nebula-under-stars note, the "under the ship and its
  wake" note on the deadline, and the "over the chevrons and under the chequers"
  note on the motes each record a defect that was fixed once.
- **`drawSheetLayer` reads `score.lastRun`, never `score.run`.** `AGENTS.md`
  flags this as having caught two bugs that "looked correct and rendered zeroes."
  Preserve it exactly when the layer moves.
- **The score band's cross-fade is not a visibility toggle.** It fades against the
  sheet so "no flicker, and no moment where the score is nowhere." A naive `when`
  predicate would cut it.
- **`this.sheetAlpha` is published for the app to read**, so it can refuse a
  dismissing tap until there is something to dismiss. Whatever owns the sheet
  layer has to keep publishing it.
- **`ceremonyPhase` is computed once and shared** by the line and the arrow that
  points at it, "so the two can never disagree about where the finish is." It
  belongs on `Frame`, not inside a layer.

## Done when

`Scene.draw` is under 40 lines, `LAYERS` reads as the sequence above, and adding
Direction 05's rungs is inserting one row between `starfield` and `hazard zones`.
