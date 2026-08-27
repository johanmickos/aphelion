# F10 · HUD grid

**Severity** COSTS · **Blocks** Direction 03 · **Depends on** F03, ideally F07

## Why

HUD layout is six modules of private constants with no owner: `GAUGE` and `SCORE`
in `hud.ts`, the badge position in `fuel-warning.ts`, the arrow ring in
`edge-markers.ts`, the panel in `sheet.ts`, the compass rings in
`render/config.ts`.

The codebase has already been bitten. `SCORE_BAND_BOTTOM` exists, with a comment
naming the 2026-08-22 playtest, purely because "nothing outside this file could
previously know" how far down the score reached — so planet labels were drawn
straight through it, producing `P21 84P20 57 51` across the multiplier.

That fix is one value passed between two modules that happened to collide.
Direction 03 moves **everything**:

| Element  | From               | To                                                        |
| -------- | ------------------ | --------------------------------------------------------- |
| Velocity | results sheet only | top-left masthead, largest type in the game               |
| Score    | top-centre band    | `BANK` chip, top-right, utility face, dims while coasting |
| Fuel     | bottom-left gauge  | halo arc **on the craft**                                 |
| Chain    | not shown live     | `×N` beside velocity + craft bloom radius                 |
| Awards   | top band           | world space, at the compass dot that earned them          |

The one-off fix does not generalise to a relayout.

## The shape

One module owning the design-space rectangles, in the 390×844 window:

```ts
/**
 * Where things sit, in design units.
 *
 * Direction 03: "the layout never changes between states; only the pressure
 * does." That is a claim about a fixed grid — cheap to honour with one, and
 * impossible to guarantee with six modules of private constants.
 */
export const HUD = {
  masthead: { ... },   // velocity + chain
  bank:     { ... },   // top-right chip
  thumb:    { ... },   // bottom third — NOTHING READABLE, EVER
  safe:     { ... },   // 4:5 frame the results sheet composes into (Dir 10)
} as const;
```

The thumb-zone rule is the reason this is worth doing beyond tidiness: _"nothing
readable lives there, ever"_ is checkable against such a module and unfalsifiable
without one.

## Steps

1. **Land F03.** Colour and layout move together in most of these files; doing
   them separately means editing `hud.ts` twice.
2. **Define `HUD` with today's numbers**, and re-point `GAUGE`, `SCORE`,
   `SCORE_BAND_BOTTOM` and the badge at it. No visual change.
3. **Move the fuel gauge onto the craft.** The largest single change, and it
   deletes `GAUGE`, `FUEL_RAMP` and most of `fuel-warning.ts` — Direction 03
   replaces the seven-step ramp with "ION at three energies," on the grounds that
   yellow would add a fourth meaning to hue.
4. **Promote velocity, demote score.** `readoutLines` currently builds the
   telemetry text; velocity comes out of it and into the masthead.
5. **Awards to world space.** Depends on F07 — the callout becomes a world layer
   anchored at the release point rather than a HUD element.

## Gates

Equality gate untouched; `src/render/` is outside it. `test/render.test.ts` green.

## Traps

- **`SCORE_BAND_BOTTOM` is consumed by `drawEdgeMarkers`** via
  `Math.max(opts.headerBottom, SCORE_BAND_BOTTOM)` — the arrows have to clear both
  the DOM header and the canvas band. When the band becomes a chip, that
  computation changes shape rather than disappearing.
- **VISION's open call on where the score lives is answered by Direction 03, not
  by this plan.** The measurement — "an OCR pass over one session returned 47
  clean readings out of 344" — is the evidence the move is needed, and it is worth
  re-running afterwards as the acceptance test.
- **Fuel has two cues that must agree.** `FUEL_LOW_FRAC` is "one number, two
  consumers: the gauge's flashing LOW state and the badge that flashes beside the
  ship." Collapsing both into the halo removes the disagreement risk — make sure
  it removes the second cue rather than leaving it orphaned.
- **The design face is contested.** Direction 03 argues for Anton over the
  incumbent Unbounded. Metrics drive the layout, so decide before step 4, not
  after.
