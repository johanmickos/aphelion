/**
 * The callout as one unit — spec [06 · §4](../../docs/spec/06-awards.md)'s
 * *"the word, its points and its colour arrive as one unit at the release
 * point"*, and the `×N` spec 06 §3 counts it with.
 *
 * ⚠ **This is the sequencing gap spec 06's own notice records, closed.** *"A make
 * is specified to speak, in numbers. It is silent today because the economy is
 * spec 08's and arrives in M4"* — and *"until M4, the most common successful
 * release in the game says nothing."* It says a number now.
 */
import { describe, expect, it } from 'vitest';
import { draw } from '../../src/render/index.ts';
import { CORE, LUMEN, SOLAR } from '../../src/render/palette.ts';
import { POINTS_SIZE } from '../../src/state/callout.ts';
import type { CalloutView, PresentationState } from '../../src/state/types.ts';
import { NO_ECONOMY } from '../../src/state/economy.ts';
import type { Economy } from '../../src/state/economy.ts';
import { openLedger } from '../../src/state/ledger.ts';
import { pricedRun, shippedRecipe } from '../moments.ts';

interface Said {
  readonly says: string;
  readonly x: number;
  readonly y: number;
  readonly fill: string;
  readonly font: string;
}

/** A context that writes down every string it is asked to fill. */
function recorder(): { said: Said[]; context: CanvasRenderingContext2D } {
  const said: Said[] = [];
  const context = new Proxy(
    {
      canvas: { width: 1170, height: 2532 },
      fillStyle: '',
      strokeStyle: '',
      font: '',
      lineWidth: 0,
      globalAlpha: 1,
      textAlign: 'left',
      textBaseline: 'alphabetic',
      letterSpacing: '0px',
      lineCap: 'butt',
      lineJoin: 'miter',
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillText(says: string, x: number, y: number) {
        said.push({
          says,
          x,
          y,
          fill: String((context as { fillStyle: unknown }).fillStyle),
          font: String((context as { font: unknown }).font),
        });
      },
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 0 }),
    } as Record<string, unknown>,
    {
      get(target, key) {
        if (key in target) return target[key as string];
        // Everything else the renderer asks a canvas for is a no-op: this file is
        // about the strings and about nothing else.
        return () => {};
      },
      set(target, key, value) {
        target[key as string] = value;
        return true;
      },
    },
  );
  return { said, context: context as unknown as CanvasRenderingContext2D };
}

const RUN = pricedRun(shippedRecipe());

/** The picture on the tick a release struck a word, with the ledger that priced it. */
function firstWord(): { view: PresentationState; economy: Economy } {
  for (const [at, view] of RUN.views.entries()) {
    if (view.callout !== null && view.callout.life.age === 0) {
      return { view, economy: RUN.economies[at]! };
    }
  }
  throw new Error('the shipped run grades no release, which is a different bug');
}

function said(view: PresentationState, economy: Economy): Said[] {
  const it = recorder();
  draw(view, it.context, {}, economy);
  return it.said;
}

/** The same picture with the callout replaced, so a tier can be asked for directly. */
function withCallout(over: Partial<CalloutView>): PresentationState {
  const { view } = firstWord();
  return { ...view, callout: { ...view.callout!, ...over } };
}

describe('the word and its points', () => {
  it('says the word over the number, centred on the same mark', () => {
    const { view, economy } = firstWord();
    const cashed = economy.ledger!.cashed!;
    expect(cashed).toBeGreaterThan(0);
    const words = said(view, economy).filter((one) => one.says.startsWith('+'));
    expect(words).toHaveLength(1);
    expect(words[0]!.says).toBe(`+${cashed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`);
    expect(words[0]!.x).toBe(view.callout!.x);
    expect(words[0]!.y).toBeGreaterThan(view.callout!.y);
    expect(words[0]!.font).toContain(`${POINTS_SIZE}px`);
  });

  /**
   * Spec 06 §2's colour ladder — white → green → gold — and the number wears the
   * tier's own colour because it arrives as part of the same unit.
   */
  it('pays in the tier’s own colour', () => {
    for (const [tier, token] of [
      ['MAKE', CORE],
      ['TRUE', CORE],
      ['SHARP', LUMEN],
      ['PERFECT', SOLAR],
    ] as const) {
      const view = withCallout({ tier });
      const economy = { ...firstWord().economy, ledger: { ...openLedger(), cashed: 445 } };
      const number = said(view, economy).find((one) => one.says.startsWith('+'))!;
      expect(number.fill.slice(0, 7).toUpperCase()).toBe(token.toUpperCase());
    }
  });

  /**
   * Spec 06 §1: *"points for the make, words for the mastery."* A make draws its
   * number and no word — which is what the spec has specified since it was
   * written and what the build could not do until the economy existed.
   */
  it('gives a make its number and no word', () => {
    const view = withCallout({ tier: 'MAKE' });
    const economy = { ...firstWord().economy, ledger: { ...openLedger(), cashed: 445 } };
    const drawn = said(view, economy).map((one) => one.says);
    expect(drawn).toContain('+445');
    expect(drawn).not.toContain('MAKE');
  });

  /**
   * Spec 06 §3: the `×N` appears at the **second** occurrence and is the same
   * word with a numeral after it — *"streaks escalate by counting, never by
   * inventing a synonym."*
   */
  it('counts the streak after the word, from the second', () => {
    const economy = { ...firstWord().economy, ledger: { ...openLedger(), cashed: 445 } };
    const says = (streak: number): string[] =>
      said(withCallout({ tier: 'PERFECT', streak }), economy).map((one) => one.says);
    expect(says(1)).toContain('PERFECT');
    expect(says(2)).toContain('PERFECT ×2');
    expect(says(7)).toContain('PERFECT ×7');
  });

  /**
   * ZEN keeps the word and loses the number — spec 08 §7's *"words and `×N`
   * remain: they are feedback, not price"*, which is the whole reason ZEN is
   * built (ADR-0005).
   */
  it('says the word and no number with no ledger', () => {
    const { view } = firstWord();
    const drawn = said(view, NO_ECONOMY).map((one) => one.says);
    expect(drawn.some((one) => one.startsWith('+'))).toBe(false);
    expect(drawn).toContain(view.callout!.tier);
  });
});
