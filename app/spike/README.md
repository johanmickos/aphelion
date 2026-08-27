# SPIKE — M0.5, the renderer verdict

**This whole directory is throwaway.** It is deleted when the ADR it exists to produce
lands. Nothing here is imported by the game, nothing here is built into the bundle, and
nothing here may be treated as a starting point for `src/render/` — it is a measuring
instrument, not a design.

What it measures, per [M0.5](../../docs/plan/m0-foundations.md#m05--the-renderer-spike):
~120 rungs deforming toward 3 bodies, 40 glowing elements at mixed energies, and a
full-screen grade — **p99 and max frame time, never mean**.

## Running it

```
pnpm dev          # then press x for the spike's QR code
```

Scan it. Tap **RUN**, wait about 35 seconds, tap **SEND TO DEV SERVER**. The report
lands in `diagnostics/` and the terminal prints the table.

**RUN REVERSED** runs the same ladder backwards. If the two orders disagree, the phone
was throttling and neither is the verdict on its own.

## What lives here

| File                       |                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene.ts`                 | The scene, and its Canvas2D drawing. Every candidate calls these same functions, so a difference between candidates is a difference in post-processing and nothing else |
| `grade.ts`                 | Every knob of the retro grade in one place (spec 14 §4)                                                                                                                 |
| `stats.ts`                 | Percentiles. No mean is computed anywhere, so none can be quoted                                                                                                        |
| `candidates/canvas2d.ts`   | The bare scene (the floor), and rung **(a)**                                                                                                                            |
| `candidates/webgl-post.ts` | Rung **(b)**                                                                                                                                                            |
| `main.ts`                  | The harness: warm up, measure, report                                                                                                                                   |

Rungs **(c)** hand-rolled WebGL2 and **(d)** PixiJS are deliberately not built. The plan
says stop at the first rung that holds, and (d) would be the repo's first runtime
dependency — a decision for the author, not something to add speculatively.
