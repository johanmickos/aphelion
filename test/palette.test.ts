/**
 * The palette changed no colour.
 *
 * A refactor that moves 140 literals is only safe if every one still resolves to
 * the same paint. These are the values that were written out by hand before
 * `palette.ts` existed, pinned against the tokens that replaced them — so a typo
 * in a triple fails here rather than shipping as a colour nobody looks at twice.
 *
 * They are written as literals ON PURPOSE, and must not be rewritten to reference
 * the tokens they check. A test that computed its expectation from the thing under
 * test would agree with any value at all.
 */
import { describe, expect, it } from 'vitest';
import {
  BOOST_AMBER,
  BURN,
  FINISH,
  FLAME_DEEP,
  FLAME_FADE,
  FLAME_HOT,
  FLAME_MID,
  HAZARD,
  HAZARD_BAND_FROM,
  HAZARD_BAND_TO,
  HAZARD_EDGE,
  HAZARD_FUEL,
  HAZARD_NOTICE,
  HAZARD_NOTICE_BORDER,
  HAZARD_NOTICE_FILL,
  HAZARD_WARN,
  IMPACT,
  IMPACT_NOTICE_BORDER,
  IMPACT_NOTICE_FILL,
  IMPACT_TEXT,
  LADDER_EXCEPTIONAL,
  LADDER_GOOD,
  LADDER_GREAT,
  SUMMIT,
  SUMMIT_RGB,
  solid,
  withAlpha,
} from '../src/render/palette.ts';
import { LEVEL, BURN_WORD } from '../src/render/accolade.ts';

describe('the palette resolves to what was there before', () => {
  it('keeps the hazard family at its four measured values', () => {
    expect(HAZARD).toEqual([255, 70, 90]);
    expect(HAZARD_WARN).toBe('#ff5566');
    expect(HAZARD_NOTICE).toBe('#ff9aa8');
    expect(HAZARD_FUEL).toEqual([255, 90, 110]);
  });

  it('keeps the fire and the crash apart', () => {
    expect(BURN).toBe('#ee3f2c');
    expect(FLAME_HOT).toEqual([255, 116, 26]);
    expect(FLAME_MID).toEqual([255, 104, 24]);
    expect(FLAME_DEEP).toEqual([228, 34, 14]);
    expect(FLAME_FADE).toEqual([210, 26, 10]);
    expect(IMPACT).toEqual([255, 205, 50]);
    expect(IMPACT_TEXT).toBe('#ffe27a');
    expect(BOOST_AMBER).toEqual([255, 176, 32]);
  });

  it('keeps the rarity ladder on its measured rungs', () => {
    expect(LADDER_GOOD).toBe('#3aa8e8');
    expect(LADDER_GREAT).toBe('#5cd67a');
    expect(LADDER_EXCEPTIONAL).toBe('#ffd633');
  });

  it('resolves the fixed combinations to the strings they replaced', () => {
    // CSS-equivalent to the originals, which wrote `.5` where these write `0.5`.
    expect(HAZARD_EDGE).toBe('rgba(255,70,90,0.5)');
    expect(HAZARD_BAND_FROM).toBe('rgba(255,70,90,0)');
    expect(HAZARD_BAND_TO).toBe('rgba(255,70,90,0.22)');
    expect(HAZARD_NOTICE_FILL).toBe('rgba(255,70,90,0.14)');
    expect(HAZARD_NOTICE_BORDER).toBe('rgba(255,70,90,0.9)');
    expect(IMPACT_NOTICE_FILL).toBe('rgba(255,205,50,0.12)');
    expect(IMPACT_NOTICE_BORDER).toBe('rgba(255,205,50,0.9)');
    expect(solid(HAZARD_FUEL)).toBe('rgb(255,90,110)');
  });

  it('passes a pre-formatted alpha through without round-tripping it', () => {
    // The flame fixes its own precision to stop 0.7200000000000001 reaching the
    // canvas every frame. A number-only signature would silently undo that.
    expect(withAlpha(FLAME_HOT, (0.72).toFixed(3))).toBe('rgba(255,116,26,0.720)');
    expect(withAlpha(HAZARD, 0.5)).toBe('rgba(255,70,90,0.5)');
  });

  it('leaves accolade.ts as the place a colour is PICKED', () => {
    // palette.ts says what the colour is; accolade.ts says which award gets it.
    // If this ever inverts, the score band and the popup can drift apart again —
    // the defect accolade.ts's header exists to record.
    expect(LEVEL.good.color).toBe(LADDER_GOOD);
    expect(LEVEL.great.color).toBe(LADDER_GREAT);
    expect(LEVEL.exceptional.color).toBe(LADDER_EXCEPTIONAL);
    expect(BURN_WORD.color).toBe(BURN);
  });

  it('keeps the finish green off the rarity ladder', () => {
    // Two colour systems that must never be merged: the finish cues are
    // category-coded — this is the finish — and the ladder answers "how good was
    // that". Sharing a value would make a ladder retune silently move a
    // navigation cue, and a finish retune silently restyle every great award.
    expect(FINISH).toEqual([92, 226, 140]);
    expect(solid(FINISH)).not.toBe(LADDER_GREAT);
  });

  it('puts the summit on the ladder’s top rung rather than beside it', () => {
    // The ceremony's gold is the ladder's gold, not a new colour that merely looks
    // like it. If these ever diverge, the game's rarest outcome stops being drawn
    // in the colour the player spent the run learning.
    expect(SUMMIT).toBe(LADDER_EXCEPTIONAL);
    expect(solid(SUMMIT_RGB)).toBe('rgb(255,214,51)');
    // ...and the triple really is #ffd633 decomposed, not an eyeballed neighbour.
    const hex = '#' + SUMMIT_RGB.map((n) => n.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(LADDER_EXCEPTIONAL);
  });
});
