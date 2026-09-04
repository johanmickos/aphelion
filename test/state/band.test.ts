/**
 * [M4.3](../../docs/plan/m4-the-economy.md) — the **band**, and the one place
 * spec [08](../../docs/spec/08-economy.md)'s fifth axiom and the author's own
 * ruling of 2026-09-01 cannot both hold.
 *
 * M4.3's acceptance is two claims:
 *
 * > *"Band is determined by where the orbit sat, and the motes that announced it
 * > were on screen."*
 *
 * The first is asserted below. **The second is measured and reported**, because
 * it is false on this build for a reason that is a ruling rather than a defect —
 * see the second block. [AGENTS.md](../../AGENTS.md) §5: a spec that has been
 * overtaken is said so and not quietly rewritten.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { FIRE_BAND, OUTER_BAND, SHOWS_BEYOND, bandAt } from '../../src/state/boundary.ts';
import { DESIGN_WIDTH } from '../../src/state/design.ts';
import { bandNow } from '../../src/state/ledger.ts';
import { DAILY } from '../../src/state/mode.ts';
import { fieldFor } from '../../src/sim/recipe.ts';
import { SCATTER_FIELD } from '../../src/sim/recipe.ts';
import { parseDispatch } from '../../tools/dispatch.ts';
import { pricedRun, shippedRecipe } from '../moments.ts';

describe('spec 07 §2, priced', () => {
  /** ×1 in the field, ×2 in the outer band, ×3 in the fire band. */
  it('steps where the boundary steps', () => {
    expect(bandAt(OUTER_BAND + 1)).toBe(1);
    expect(bandAt(OUTER_BAND)).toBe(2);
    expect(bandAt(FIRE_BAND + 1)).toBe(2);
    expect(bandAt(FIRE_BAND)).toBe(3);
    // Past the line is past the run, and the arithmetic stays finite through it.
    expect(bandAt(-100)).toBe(3);
  });

  /** A field with no line has no bands, and prices at ×1 (`pnpm portable`'s corridor). */
  it('prices a field with no line at one', () => {
    expect(bandNow({ boundary: [] } as never)).toBe(1);
  });

  /** The deeper of the two sides, because a craft is only ever near one wall. */
  it('reads the wall the craft is nearest', () => {
    const view = { boundary: [{ away: 5000 }, { away: FIRE_BAND / 2 }] } as never;
    expect(bandNow(view)).toBe(3);
  });
});

describe('spec 08 §3 · deepest-reached', () => {
  const RUN = pricedRun(shippedRecipe(), DAILY);

  /**
   * *"Band = the deepest band the craft occupied at any tick between grab and
   * release."* Derived in spec 08 §3 and flagged there as derived, so what is
   * asserted is that the build does what the spec says it derived — over every
   * held tick of a flown run.
   */
  it('never falls while a body is held', () => {
    for (let tick = 1; tick < RUN.views.length; tick++) {
      const before = RUN.economies[tick - 1]!.ledger!;
      const now = RUN.economies[tick]!.ledger!;
      // Only while the same engagement is running: it opens at the grab.
      if (before.mark === null || now.mark === null) continue;
      expect(now.band).toBeGreaterThanOrEqual(before.band);
    }
  });

  /**
   * And it is the swing's own answer rather than the last swing's: it opens at
   * the grab, so a swing flown entirely in the field prices at ×1 however deep
   * the swing before it went.
   */
  it('opens fresh at each grab', () => {
    let opened = 0;
    for (let tick = 1; tick < RUN.views.length; tick++) {
      const before = RUN.economies[tick - 1]!.ledger!;
      const now = RUN.economies[tick]!.ledger!;
      if (before.mark !== null || now.mark === null) continue;
      opened += 1;
      expect(now.band).toBe(bandNow(RUN.views[tick]!));
    }
    expect(opened).toBeGreaterThan(0);
  });

  /** The run reaches more than one band, or the two claims above are vacuous. */
  it('reaches more than one band', () => {
    const bands = new Set(RUN.economies.map((economy) => economy.ledger!.band));
    expect(bands.size).toBeGreaterThan(1);
  });
});

/**
 * ⚠ **The second half of M4.3's acceptance is false on this build, by a ruling.**
 *
 * Spec 08's axiom 5 gives the band two pixels — *"the motes, and the band's own
 * `×N` label in the world"* — and the author withdrew the second on 2026-09-01
 * (*"I don't want the 2x 3x text in the hot zone. Let the user discover that
 * themselves."*). So the motes are the whole of it. And the motes are gated on
 * [`presenceOf`](../../src/state/boundary.ts), which is the author's ruling of
 * the same day: *"the boundary SHOULD be off screen for majority of play."*
 *
 * Those two rulings put the price and the pixel in different places, and the gap
 * is geometry rather than tuning — it is asserted below so that it cannot move
 * without somebody noticing.
 */
describe('⚠ the band is priced before it is announced', () => {
  it('starts paying ×2 a third of a screen before the boundary is drawn', () => {
    const { field } = fieldFor(SCATTER_FIELD);
    const half = field.corridor.halfWidth;
    // Where the ×2 band starts, measured from the centreline.
    const paysFrom = half - OUTER_BAND;
    // Where the boundary starts coming up — the design space's own edge.
    const showsFrom = SHOWS_BEYOND;
    expect(paysFrom).toBeLessThan(showsFrom);
    expect(showsFrom - paysFrom).toBeCloseTo(DESIGN_WIDTH / 2 - (half - OUTER_BAND), 6);
    // 133.5 design units of the ×2 band, priced with nothing on screen.
    expect(showsFrom - paysFrom).toBeGreaterThan(100);
  });

  /**
   * And what that costs over the author's own play, which is the number this is
   * for: **27 of the 60 outer-band cashes in the corpus were priced by a
   * boundary that was never drawn during the swing** — 45%. The fire band's five
   * were all announced.
   *
   * Re-measured here rather than quoted, so the finding rots loudly.
   */
  it('measured over the corpus, prices 30–60% of ×2 swings unannounced', () => {
    let banded = 0;
    let unannounced = 0;
    for (const recipe of corpus()) {
      const run = pricedRun(recipe, DAILY);
      let announced = false;
      for (let tick = 1; tick < run.views.length; tick++) {
        const view = run.views[tick]!;
        const before = run.economies[tick - 1]!.ledger!;
        const now = run.economies[tick]!.ledger!;
        if (now.mark !== null && view.boundary.some((side) => side.presence > 0)) announced = true;
        if (now.bank > before.bank) {
          if (before.band > 1) {
            banded += 1;
            if (!announced) unannounced += 1;
          }
          announced = false;
        }
        if (before.mark !== null && now.mark === null) announced = false;
      }
    }
    expect(banded).toBeGreaterThan(20);
    const share = unannounced / banded;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.6);
  });
});

/** Every dispatch on disk this build still replays — 19 `fixture v1`, 7 `scatter v2`. */
function corpus(): ReturnType<typeof parseDispatch>['recipe'][] {
  const dir = fileURLToPath(new URL('../../diagnostics', import.meta.url));
  const recipes = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      recipes.push(parseDispatch(JSON.parse(readFileSync(join(dir, name), 'utf8'))).recipe);
    } catch {
      // Refused: a recipe flown under a simulation or a field this build no
      // longer is. That refusal is the point of the version (`recipe.ts`).
    }
  }
  return recipes;
}
