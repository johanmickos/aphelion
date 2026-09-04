/**
 * [M4.5](../../docs/plan/m4-the-economy.md)'s acceptance, which is spec
 * [03](../../docs/spec/03-hud.md)'s:
 *
 * > *"The layout is identical across all five pressure states; nothing readable
 * > enters the thumb zone; only one E3 is ever alive."*
 *
 * The first two are asserted here through a context that writes down every
 * string it was asked to draw and where. The third is spec 00 §3's and is
 * `test/state/presentation.test.ts`'s — nothing strikes an E3 at all today.
 *
 * The five pressures are spec 03 §3's: free flight, held, peak, boundary and
 * anomaly. They are built as **presentation states**, which is the only way a
 * renderer test is allowed to express one, and they differ from each other in
 * exactly the things the spec says differ.
 */
import { describe, expect, it } from 'vitest';
import { COASTING, HUD_BOTTOM, drawHud, spaced } from '../../src/render/hud.ts';
import { BAND_BOTTOM, BAND_TOP, DESIGN_WIDTH, THUMB_LINE } from '../../src/state/design.ts';
import { NO_CHAIN } from '../../src/state/chain.ts';
import type { ChainView } from '../../src/state/chain.ts';
import type { HudView } from '../../src/state/hud.ts';
import type { Ledger } from '../../src/state/ledger.ts';
import { openLedger } from '../../src/state/ledger.ts';
import { ION } from '../../src/render/palette.ts';

interface Said {
  readonly says: string;
  readonly x: number;
  readonly y: number;
  readonly align: string;
  readonly fill: string;
  readonly font: string;
}

function recorder(): { said: Said[]; context: CanvasRenderingContext2D } {
  const said: Said[] = [];
  const context = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
    save: () => {},
    restore: () => {},
    fillText(says: string, x: number, y: number) {
      said.push({
        says,
        x,
        y,
        align: String(context.textAlign),
        fill: String(context.fillStyle),
        font: String(context.font),
      });
    },
  };
  return { said, context: context as unknown as CanvasRenderingContext2D };
}

const HUD: HudView = { pop: null, rising: null, subline: 'PLAIN', engaged: false };
const LEDGER: Ledger = { ...openLedger(), bank: 12_450 };

function band(
  hud: Partial<HudView> = {},
  chain: ChainView = NO_CHAIN,
  ledger: Ledger | null = LEDGER,
  speed = 874,
): Said[] {
  const it = recorder();
  drawHud(it.context, { ...HUD, ...hud }, chain, speed, ledger);
  return it.said;
}

/** Where a thing was said, to the design unit — the layout, with the content taken out. */
const layoutOf = (said: Said[]): string[] => said.map((one) => `${one.align}@${one.x},${one.y}`);

const alphaOf = (colour: string): number => parseInt(colour.slice(7, 9), 16) / 255;
const tokenOf = (colour: string): string => colour.slice(0, 7).toUpperCase();

/**
 * Spec 03 §3's five pressures, as the top band sees them. Each differs from free
 * flight in exactly what the spec says differs and in nothing else.
 */
const PRESSURES: Record<string, () => Said[]> = {
  'free flight': () => band({ engaged: false }),
  held: () => band({ engaged: true }),
  peak: () => band({ engaged: true }, NO_CHAIN, { ...LEDGER, armed: 1634 }),
  boundary: () => band({ engaged: false, subline: 'TOWARD_EDGE' }),
  anomaly: () => band({ engaged: false }),
};

describe('one layout, five pressures', () => {
  /**
   * *"Nothing moves between states; only energy and content change."* So every
   * element the band draws is at the same coordinate in every state — and the one
   * state that draws an extra line draws it at a coordinate the others reserve
   * rather than at one that pushes anything.
   */
  it('says everything in the same place in every state', () => {
    const free = layoutOf(PRESSURES['free flight']!());
    for (const [name, pressure] of Object.entries(PRESSURES)) {
      const places = layoutOf(pressure());
      // Every place free flight uses is used, in the same order.
      expect(places.slice(0, free.length), name).toEqual(free);
    }
  });

  /** And the top band holds exactly two readables — spec 03 §1 — plus the armed line. */
  it('holds the masthead and the chip and nothing else', () => {
    const said = PRESSURES['free flight']!();
    const left = said.filter((one) => one.align === 'left');
    const right = said.filter((one) => one.align === 'right');
    // The masthead is one readable in three lines: the number, its subline and
    // the chain. The chip is one readable in one, or two while armed.
    expect(left.map((one) => one.says)).toEqual(['874', 'M/S', 'CHAIN ×0']);
    expect(right.map((one) => one.says)).toEqual(['BANK 12 450']);
    expect(PRESSURES.peak!().filter((one) => one.align === 'right')).toHaveLength(2);
  });

  /**
   * Spec 00 §7: *"nothing readable may live below the thumb line, ever. The
   * compass, the masthead and every award live above it."*
   */
  it('keeps every readable above the thumb line', () => {
    for (const [name, pressure] of Object.entries(PRESSURES)) {
      for (const one of pressure()) {
        expect(one.y, `${name}: ${one.says}`).toBeLessThan(THUMB_LINE);
      }
    }
    expect(HUD_BOTTOM).toBeLessThan(THUMB_LINE);
  });

  /**
   * ⚠ **And inside the guaranteed band, which is the half that was wrong.**
   *
   * Spec 00 §7: *"a guaranteed band... everything the player reads is composed
   * inside it."* The fit comes from the **width**, so any viewport shorter than
   * the design space crops it equally at both ends — 291 design units on the
   * author's own phone. Hung from the design space's top edge, the velocity
   * landed at 184 and the BANK chip at 170, and on the phone neither was on
   * screen at all: only `CHAIN ×N` survived the crop. This is that, asserted.
   */
  it('composes the whole band inside the height every device shows', () => {
    for (const [name, pressure] of Object.entries(PRESSURES)) {
      for (const one of pressure()) {
        expect(one.y, `${name}: ${one.says}`).toBeGreaterThan(BAND_TOP);
        expect(one.y, `${name}: ${one.says}`).toBeLessThan(BAND_BOTTOM);
      }
    }
  });

  /** And inside the design space, on both sides. */
  it('keeps every readable inside the design space', () => {
    for (const one of PRESSURES.peak!()) {
      expect(one.x).toBeGreaterThan(0);
      expect(one.x).toBeLessThan(DESIGN_WIDTH);
      expect(one.y).toBeGreaterThan(0);
    }
  });
});

describe('the BANK chip', () => {
  /**
   * Spec 03's acceptance: *"the BANK chip's opacity is a pure function of
   * engagement; toggling coasting toggles it and nothing else."*
   */
  it('dims to 55% while coasting, and moves nothing else', () => {
    const coasting = band({ engaged: false });
    const held = band({ engaged: true });
    const chip = (said: Said[]): Said => said.find((one) => one.says.startsWith('BANK'))!;
    expect(alphaOf(chip(coasting).fill)).toBeCloseTo(alphaOf(chip(held).fill) * COASTING, 2);
    // Nothing else about the band answers to it.
    const others = (said: Said[]): string[] =>
      said.filter((one) => !one.says.startsWith('BANK')).map((one) => `${one.says}|${one.fill}`);
    expect(others(coasting)).toEqual(others(held));
  });

  /** *"While a graded release is armed it states the armed cash value."* And not otherwise. */
  it('states the armed cash only while a release is armed', () => {
    expect(band().some((one) => one.says.startsWith('+'))).toBe(false);
    const armed = band({}, NO_CHAIN, { ...LEDGER, armed: 1634 });
    expect(armed.find((one) => one.says.startsWith('+'))!.says).toBe('+1 634');
  });

  /** ZEN has no ledger, so it has no chip — and the masthead is untouched. */
  it('is absent with no ledger, and takes nothing with it', () => {
    const zen = band({}, NO_CHAIN, null);
    expect(zen.some((one) => one.align === 'right')).toBe(false);
    expect(zen.map((one) => one.says)).toEqual(['874', 'M/S', 'CHAIN ×0']);
  });
});

describe('the subline', () => {
  /** Spec 03 §2's three, and ION on the one that is about the boundary. */
  it('says the fact, and wears ION only for the edge', () => {
    const at = (subline: HudView['subline']): Said =>
      band({ subline }).find((one) => one.says.startsWith('M/S'))!;
    expect(at('PLAIN').says).toBe('M/S');
    expect(at('RISING').says).toBe('M/S · RISING');
    expect(at('TOWARD_EDGE').says).toBe('M/S · TOWARD EDGE');
    expect(tokenOf(at('TOWARD_EDGE').fill)).toBe(ION.toUpperCase());
    expect(tokenOf(at('PLAIN').fill)).not.toBe(ION.toUpperCase());
  });
});

describe('the chain line', () => {
  /** Spec 03 §2's `CHAIN ×N`, drawn at every length including zero. */
  it('is drawn at every length', () => {
    for (const links of [0, 1, 7]) {
      const said = band({}, { links, since: null, milestone: null });
      expect(said.some((one) => one.says === `CHAIN ×${links}`)).toBe(true);
    }
  });

  /** Spec 06 §6: a milestone pulses the masthead. No word, and nothing moves. */
  it('brightens on a milestone and stays where it is', () => {
    const quiet = band({}, { links: 5, since: null, milestone: null });
    const pulsed = band({}, { links: 5, since: null, milestone: { age: 0, span: 25 } });
    const line = (said: Said[]): Said => said.find((one) => one.says.startsWith('CHAIN'))!;
    expect(alphaOf(line(pulsed).fill)).toBeGreaterThan(alphaOf(line(quiet).fill));
    expect(line(pulsed).x).toBe(line(quiet).x);
    expect(line(pulsed).y).toBe(line(quiet).y);
  });
});

describe('the figures', () => {
  /** The board's own `12 450` and `1 634` — a space, never a comma or a point. */
  it('space their thousands', () => {
    expect(spaced(0)).toBe('0');
    expect(spaced(874)).toBe('874');
    expect(spaced(1634)).toBe('1 634');
    expect(spaced(12_450)).toBe('12 450');
    expect(spaced(1_234_567)).toBe('1 234 567');
  });
});
