# F03 · Theme as a value

**Severity** BLOCKS · **Blocks** Direction 01 (tokens), regions, skins · **Depends on** nothing

> **Open call before step 3.** Is a theme picked once per run, or does it vary
> _within_ a run by altitude? Direction 05 wants the sky to warm toward an
> approaching anomaly ("weather on the horizon"), which is the second. That is a
> different interface — `themeAt(y)` rather than `theme` — and it is much cheaper
> to decide now than after 87 call sites have been converted.

## Why

`palette.ts` is the right idea, argued well, and about a third finished. Outside
it, `src/render/` holds **208 colour literals, 87 of them distinct**. Direction 01
specifies **eight** canonical values plus a generated identity band.

The gap is not tidiness, it is capability. Every draw function reaches into module
scope for its colour, so **there is no argument anywhere that could carry a
different one**. "Regions with a palette, a soundtrack and a signature hazard that
belong together" cannot be built by editing `palette.ts`, because `palette.ts` has
exactly one value per name for the life of the process.

The file's own header is the tell. It names four hazard reds and says plainly it
is "not known whether all four are deliberate." That question stays unanswerable
while the answer lives in 87 places.

## Where the literals are

```
hud.ts 25 · world.ts 18 · accolade.ts 18 · sheet.ts 9 · ship.ts 5
edge-markers.ts 4 · attract.ts 4 · starfield.ts 3 · capture.ts 3
scene.ts 2 · overlays.ts 2 · warnings.ts 1 · popups.ts 1
```

Reproduce with:

```
for f in src/render/*.ts; do [ "$f" = src/render/palette.ts ] && continue
  grep -ohE "rgba?\([0-9 .,]+\)|#[0-9a-fA-F]{3,8}\b" "$f"; done | sort -u | wc -l
```

## The shape

```ts
// src/render/theme.ts — new file

/**
 * The eight names, per Direction 01. A VALUE, not a module of exports.
 *
 * `palette.ts` DEFINES a colour and `accolade.ts` PICKS one — that split stays
 * exactly as it is, and this file does not touch it. What changes is that the
 * definitions are now a value a caller holds, so a region can hold a different
 * one. Moving the accolade's rarity→style mapping in here would undo the fix
 * `accolade.ts`'s header records.
 */
export interface Theme {
  void: RGB; // the sky. violet-black, never pure
  dusk: RGB; // structure at rest. never glows
  aurora: RGB; // strange: anomaly sky, black holes
  ion: RGB; // risk. if it's pink it can cost you the bank
  core: RGB; // the player. the brightest value in the game
  lumen: RGB; // quality mid tier + the finish system's monopoly
  solar: RGB; // quality top tier
  ink: RGB; // utility text at full strength

  /** Identity hue for body index `i`. Direction 01's generated band. */
  identity(i: number): RGB;

  /** Bloom for an emission tier. E0 structure … E3 flash. */
  emission: Readonly<Record<'E0' | 'E1' | 'E2' | 'E3', Emission>>;
}
```

The identity band is a **function, not a list**: `oklch(0.72 0.13 H)`, H stepped
≥50° between neighbours, excluding the violet–pink band (AURORA, ION) and the
quality bands (LUMEN, SOLAR). That is what makes it extend to "every region's new
bodies" without anyone picking a hex again.

## Threading it

Cheaper than it looks. Ten of the thirteen render modules already take a
`RenderConfig` parameter, so the signature shape exists. `Scene` holds a
`SceneDeps` record (`{ sim, render, bodies, field }`) — the theme joins it, and
`Scene.draw` passes it down the same way it already passes `render`.

Do **not** put the theme inside `RenderConfig`. That object is numeric tuning
that a dev panel edits; a theme is a palette a region selects. Two different
lifetimes, and merging them means a region swap looks like a tuning change in
every diagnostics header.

## Steps

### 1. Define `Theme` and one instance

Build `DEFAULT_THEME` from Direction 01's eight hexes. Nothing consumes it yet.

### 2. Re-point `palette.ts` at it

The existing exports (`HAZARD`, `BURN`, `LADDER_*`, `FINISH`, `DEBRIEF`,
`SUMMIT`) become derived from `DEFAULT_THEME` where the design maps them, and
stay literal where it does not. This is the step that answers the four-hazard-reds
question: three of the four map to `ion` at different emissions; the fourth has to
justify itself or go.

**Verify** `pnpm test` — `test/palette.test.ts` exists and will catch a value that
moved when it should not have.

### 3. Thread the theme, one module at a time

Thirteen commits, smallest first: `popups.ts`, `warnings.ts`, `overlays.ts`,
`scene.ts`, `capture.ts`, `starfield.ts`, `attract.ts`, `edge-markers.ts`,
`ship.ts`, `sheet.ts`, `accolade.ts`, `world.ts`, `hud.ts`.

Per module: add the parameter, replace literals with tokens, and **leave a literal
alone if it is genuinely a one-off gradient stop**. `palette.ts`'s header already
draws that line correctly — "a gradient stop inside one bloom… is a shade of
something already named, tuned by eye against the stop beside it" — and the test
for graduating one is whether a second file would ever need to agree with it.
Expect roughly 60 of the 87 to become tokens and the rest to stay.

### 4. Take the two colour tests out of `edge-markers.ts`

`edge-markers.ts:79` and `:131` are the last two `kind === 'anomaly'` tests after
F01, and they are both colour. They become `theme.identity(...)` or
`theme.aurora` by the body's own type. This is the commit that closes F01's
"done when".

### 5. Prove it with a second theme

A throwaway one — invert nothing, just shift the identity band's origin hue and
check that bodies, edge markers and compass rings all move together and nothing
else does. Delete it after; the point is the proof, not the content.

## Gates

| Gate          | Expected                                                          |
| ------------- | ----------------------------------------------------------------- |
| Equality gate | Untouched. `src/render/` is outside it entirely.                  |
| Golden        | Unchanged.                                                        |
| `pnpm test`   | `test/palette.test.ts` and `test/render.test.ts` must stay green. |

## Traps

- **Do not move the accolade mapping into the theme.** `AGENTS.md` states the
  rule and names the original defect: "`palette.ts` DEFINES a colour;
  `accolade.ts` PICKS one… Do not move the mapping into the palette — that was
  the original defect, where the band coloured by event and the popup by
  category."
- **The colour systems are not one system.** Awards are on the rarity ladder;
  edge markers are category-coded (blue planet, purple anomaly); the finish is
  green wherever it appears; a run ending is `DEBRIEF` indigo. `AGENTS.md` is
  explicit that this is deliberate. A theme with one `identity()` function must
  not quietly put award colours on it.
- **`FINISH` is deliberately not `LADDER_GREAT`.** The comment says why: "Sharing
  the value would make a later retune of the ladder silently move a navigation
  cue." Direction 12 gives LUMEN a world monopoly on the finish system, which is
  the same rule stated the other way round — keep them separate tokens.
- **Alpha strings are precision-sensitive.** `withAlpha` takes `number | string`
  because `ship.ts` builds its flame alpha with `.toFixed(3)` to stop a
  19-character float reaching the canvas every frame. Preserve that overload.

## Done when

Under 30 distinct colour literals remain outside `theme.ts` and `palette.ts`, each
one a gradient stop with a neighbour it was tuned against, and a second `Theme`
value visibly repaints the field without touching a draw function.
