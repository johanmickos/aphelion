/**
 * The palette obeys its own laws.
 *
 * WHAT THIS FILE USED TO DO, AND WHY IT STOPPED. It pinned 140 literals against
 * the tokens that replaced them — "a refactor that moves 140 literals is only safe
 * if every one still resolves to the same paint". That job is finished: the
 * extraction it guarded shipped, and Direction 01 then moved every value on
 * purpose. Re-pinning the new hexes would be the same transcription check against
 * a different transcript, and it would fail the moment a hue is retuned by a
 * decision nobody disagrees with.
 *
 * So it pins the LAWS instead, which is what Direction 01 actually asserts and
 * what a future region has to keep obeying:
 *
 *   hue is identity and never quality; luminance and chroma are quality
 *   quality colours (LUMEN, SOLAR) live only in type — never on world geometry
 *   identity hues clear every reserved band, and neighbours differ by >=50 deg
 *   the ladder stays ordinal for a player who cannot separate the hues
 *   palette.ts DEFINES a colour; accolade.ts PICKS one
 *
 * Every one of those is a property a wrong value breaks and a right one keeps,
 * which is the difference between a test and a copy of the source.
 */
import { describe, expect, it } from 'vitest';
import {
  BURN,
  DEBRIEF,
  FINISH,
  FLAME_HOT,
  HAZARD,
  IMPACT,
  LADDER_EXCEPTIONAL,
  LADDER_GOOD,
  LADDER_GREAT,
  SUMMIT,
  SUMMIT_RGB,
  withAlpha,
} from '../src/render/palette.ts';
import {
  DEFAULT_THEME,
  IDENTITY_HUES,
  IDENTITY_C,
  IDENTITY_L,
  hueGap,
  hueOf,
  oklch,
} from '../src/render/theme.ts';
import type { RGB } from '../src/render/theme.ts';
import { LEVEL } from '../src/render/accolade.ts';

const T = DEFAULT_THEME;

/** OKLCH lightness of an sRGB colour. */
function lightnessOf(c: RGB): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const r = lin(c[0] / 255);
  const g = lin(c[1] / 255);
  const b = lin(c[2] / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** OKLCH chroma of an sRGB colour. */
function chromaOf(c: RGB): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const r = lin(c[0] / 255);
  const g = lin(c[1] / 255);
  const b = lin(c[2] / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.sqrt(A * A + B * B);
}

describe('the identity band', () => {
  it('keeps every identity equally loud', () => {
    // "Fixed lightness and chroma keep every identity equally loud; the rule
    // extends to every region's new bodies." A hue picked by eye in sRGB would
    // have one planet that shouts and one that vanishes.
    for (let i = 0; i < IDENTITY_HUES.length; i++) {
      const c = T.identity(i);
      expect(lightnessOf(c), `identity ${i} lightness`).toBeCloseTo(IDENTITY_L, 2);
      expect(chromaOf(c), `identity ${i} chroma`).toBeCloseTo(IDENTITY_C, 2);
    }
  });

  it('separates neighbours by at least 50 degrees', () => {
    // The rule is about bodies met one after another, so it constrains
    // CONSECUTIVE entries of the list, not the set. Direction 01's own exemplar
    // ordering fails this — teal 170 to azure 215 is 45 — which is why the list
    // is reordered rather than transcribed.
    for (let i = 0; i < IDENTITY_HUES.length; i++) {
      const a = IDENTITY_HUES[i]!;
      const b = IDENTITY_HUES[(i + 1) % IDENTITY_HUES.length]!;
      expect(hueGap(a, b), `${a}deg -> ${b}deg`).toBeGreaterThanOrEqual(50);
    }
  });

  it('clears every reserved band', () => {
    // Measured from the tokens themselves rather than assumed, because the
    // design's stated clearance did not hold: it says greens sit ">=20 degrees
    // clear of LUMEN", and LUMEN is at 157.1, so the stated teal of 170 clears it
    // by 12.9.
    const reserved: ReadonlyArray<[string, RGB, number]> = [
      ['AURORA', T.aurora, 20],
      ['ION', T.ion, 20],
      ['LUMEN', T.lumen, 20],
      ['SOLAR', T.solar, 20],
    ];
    for (const h of IDENTITY_HUES) {
      for (const [name, token, clearance] of reserved) {
        expect(hueGap(h, hueOf(token)), `identity ${h}deg vs ${name}`).toBeGreaterThanOrEqual(
          clearance,
        );
      }
    }
  });

  it('wraps rather than running off the end of the list', () => {
    // The field is longer than the band, so `identity` has to cycle — and it is
    // called with a body index, which is never negative today but costs nothing
    // to make safe.
    expect(T.identity(0)).toEqual(T.identity(IDENTITY_HUES.length));
    expect(T.identity(-1)).toEqual(T.identity(IDENTITY_HUES.length - 1));
  });

  it('converts OKLCH to sRGB correctly', () => {
    // Two anchors that do not depend on the band: pure black and pure white.
    expect(oklch(0, 0, 0)).toEqual([0, 0, 0]);
    expect(oklch(1, 0, 0)).toEqual([255, 255, 255]);
    // And a round trip through the hue reader, which the band tests rely on.
    //
    // Within a degree and a half, not exactly: `oklch` quantises to 8 bits per
    // channel on the way out, and at C 0.13 one step of blue is worth close to a
    // degree of hue. The band's clearances are 20 degrees and its separations 50,
    // so a bounded error two orders below either is not worth chasing — but it is
    // worth stating, because a tolerance with no reason behind it is the kind that
    // gets widened later to make a real failure go away.
    for (const h of [0, 55, 120, 200, 285, 359]) {
      const back = hueOf(oklch(IDENTITY_L, IDENTITY_C, h));
      expect(hueGap(back, h), `round trip at ${h}deg`).toBeLessThan(1.5);
    }
  });
});

describe('hue means identity, energy means quality', () => {
  it('keeps quality colours out of the world', () => {
    // "Quality colours live only in type — no planet, ring or gauge ever wears
    // them." The one exception is granted below.
    for (let i = 0; i < IDENTITY_HUES.length; i++) {
      expect(solidHex(T.identity(i))).not.toBe(LADDER_GREAT);
      expect(solidHex(T.identity(i))).not.toBe(LADDER_EXCEPTIONAL);
    }
  });

  it('grants LUMEN exactly one world monopoly, and it is the finish', () => {
    // Direction 12: the carpet, chevrons and chequered line are the only geometry
    // allowed to wear a quality colour, because "the two greens agree — green
    // means good news, in type and in terrain".
    expect(FINISH).toEqual(T.lumen);
    expect(solidHex(FINISH)).toBe(LADDER_GREAT);
  });

  it('keeps the ladder ordinal without relying on hue', () => {
    // The old ramp climbed in lightness; this one climbs in chroma. Either way a
    // player who cannot separate the hues still reads the order.
    const good = chromaOf(T.core);
    const great = chromaOf(T.lumen);
    const exceptional = chromaOf(T.solar);
    expect(great).toBeGreaterThan(good);
    expect(exceptional).toBeGreaterThan(great);
  });

  it('spends the hue channel once per meaning', () => {
    // Everything that can end the run is ION and nothing else is. The crash
    // yellow is gone because it was a fourth meaning on a channel that already
    // had three, and severity is ordinal — it belongs on the energy channel.
    expect(HAZARD).toEqual(T.ion);
    expect(IMPACT).toEqual(T.ion);
    expect(BURN).toBe(solidHex(T.ion));
    // ...which leaves gold meaning exactly one thing.
    expect(LADDER_EXCEPTIONAL).toBe(solidHex(T.solar));
  });

  it('never lets anything reach the player', () => {
    // "CORE is the brightest value in the game — nothing else may reach it."
    const player = lightnessOf(T.core);
    for (const c of [T.dusk, T.aurora, T.ion, T.lumen, T.solar] as const) {
      expect(lightnessOf(c), 'a world colour is as bright as the craft').toBeLessThan(player);
    }
  });

  it('starts the flame at the craft and ends it at the risk', () => {
    // Direction 07: the craft's white core dissolves into ION embers. The ramp is
    // built from the two tokens, so it cannot drift away from either end.
    expect(lightnessOf(FLAME_HOT)).toBeGreaterThan(lightnessOf(T.ion));
    expect(lightnessOf(FLAME_HOT)).toBeLessThan(lightnessOf(T.core));
  });
});

describe('defining a colour and picking one stay different jobs', () => {
  it('leaves accolade.ts as the place a colour is PICKED', () => {
    // If this ever inverts, the score band and the popup can drift apart again —
    // the defect accolade.ts's header exists to record.
    expect(LEVEL.good.color).toBe(LADDER_GOOD);
    expect(LEVEL.great.color).toBe(LADDER_GREAT);
    expect(LEVEL.exceptional.color).toBe(LADDER_EXCEPTIONAL);
  });

  it('puts the summit on the ladder’s top rung rather than beside it', () => {
    expect(SUMMIT).toBe(LADDER_EXCEPTIONAL);
    expect(SUMMIT_RGB).toEqual(T.solar);
  });

  it('renders a run that ended in the colour of a spent body', () => {
    // Direction 09 renders what the field kept "in DUSK — spent, like a taken
    // planet", which is the word the palette already uses for the unlit state.
    expect(DEBRIEF).toEqual(T.dusk);
  });

  it('passes a pre-formatted alpha through without round-tripping it', () => {
    // The flame fixes its own precision to stop 0.7200000000000001 reaching the
    // canvas every frame. A number-only signature would silently undo that.
    expect(withAlpha(T.ion, (0.72).toFixed(3))).toBe(
      `rgba(${T.ion[0]},${T.ion[1]},${T.ion[2]},0.720)`,
    );
  });
});

function solidHex(c: RGB): string {
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
