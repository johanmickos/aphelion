/**
 * The sky, and the ruling it is built against.
 *
 * Spec [05 · §2](../../docs/spec/05-field.md) refuses parallax star layers
 * entirely — *"depth cues are banned in all five layers"* — and the author
 * overturned it on 2026-08-30 having read it: *"I know we have a rule about this,
 * but I really think the depth/parallax helps convey speed."*
 *
 * So these tests are unusual in what they assert. Most of this repository's tests
 * check that a spec's number is honoured; the first one here checks that a spec's
 * number is **broken**, deliberately, in the one way the author asked for — and
 * it is written that way round so that anybody restoring spec 05's ruling has to
 * come here and delete a test that says why it was overturned, rather than
 * quietly finding the sky already still.
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../../src/state/design.ts';
import type { CameraView } from '../../src/state/types.ts';
import { CORE, DUSK, INK, mix } from '../../src/render/palette.ts';
import { drawStarfield, FIELD_HEIGHT, STAR_COUNT, starfield } from '../../src/render/starfield.ts';

const AT = (y: number): CameraView => ({ x: DESIGN_WIDTH / 2, y, lock: 0, offset: 0 });

/** A context that writes down every rectangle it is asked to fill. */
function recorder(): {
  context: CanvasRenderingContext2D;
  marks: { x: number; y: number; alpha: number; fill: string }[];
} {
  const marks: { x: number; y: number; alpha: number; fill: string }[] = [];
  const context = {
    globalAlpha: 1,
    fillStyle: '',
    save: () => {},
    restore: () => {},
    fillRect(x: number, y: number) {
      marks.push({ x, y, alpha: context.globalAlpha, fill: String(context.fillStyle) });
    },
  } as unknown as CanvasRenderingContext2D & { globalAlpha: number; fillStyle: string };
  return { context, marks };
}

const drawn = (sky: ReturnType<typeof starfield>, y: number) => {
  const { context, marks } = recorder();
  drawStarfield(context, sky, AT(y), 0, DESIGN_HEIGHT);
  return marks;
};

describe('the sky', () => {
  const sky = starfield(0x5eed);

  it('does not move at world speed, which is the whole of the ruling', () => {
    // Spec 05 §2: *"everything moves at world speed."* This does not, and that is
    // the author's instruction. Every tier moves by strictly less than the camera
    // did, and no two tiers move by the same amount — layers at different speeds
    // are exactly what §2 calls implied depth and refuses.
    const CLIMB = 100;
    const before = drawn(sky, 1000);
    const after = drawn(sky, 1000 - CLIMB);
    const moved = new Set<number>();
    for (let i = 0; i < before.length; i++) {
      const shift = after[i]!.y - before[i]!.y;
      // Only stars that did not wrap this frame say anything about the rate.
      if (Math.abs(shift) > FIELD_HEIGHT / 2) continue;
      moved.add(Math.round(shift * 1000) / 1000);
    }
    expect(moved.size).toBe(3);
    for (const shift of moved) {
      expect(shift).toBeGreaterThan(0);
      expect(shift).toBeLessThan(CLIMB);
    }
  });

  it('is the same sky every time it is asked for, from the same seed', () => {
    expect(drawn(starfield(0x5eed), 400)).toEqual(drawn(starfield(0x5eed), 400));
    expect(drawn(starfield(1), 400)).not.toEqual(drawn(starfield(2), 400));
  });

  /**
   * The prototype's most expensive lesson: it placed stars in raw viewport units,
   * so *"stars teleported on resize and density drifted with screen size."* Laid
   * out in design space, the sky is a property of the game and not of the device.
   */
  it('is laid out in design space, so nothing depends on the canvas', () => {
    expect(sky.reduce((n, tier) => n + tier.stars.length, 0)).toBe(STAR_COUNT);
    for (const tier of sky)
      for (const star of tier.stars) {
        expect(star.x).toBeGreaterThanOrEqual(0);
        expect(star.x).toBeLessThan(DESIGN_WIDTH);
        expect(star.y).toBeGreaterThanOrEqual(0);
        expect(star.y).toBeLessThan(FIELD_HEIGHT);
      }
  });

  it('wraps rather than running out, however far the world has climbed', () => {
    // The field is two screens tall, so about half of it is in view at once —
    // and the point of the test is that this does not *drift*. A sky that ran out
    // would thin toward zero as the run went on, and one that failed to wrap
    // would double up.
    const seen = [0, -50_000, 123_456, -1_000_000].map((y) => {
      const marks = drawn(sky, y);
      for (const mark of marks) {
        expect(mark.y).toBeGreaterThanOrEqual(0);
        expect(mark.y).toBeLessThanOrEqual(DESIGN_HEIGHT);
      }
      return marks.length;
    });
    for (const count of seen) {
      expect(count).toBeGreaterThan(STAR_COUNT * 0.3);
      expect(count).toBeLessThan(STAR_COUNT * 0.7);
    }
  });

  /**
   * Spec [00 · §1](../../docs/spec/00-tokens.md) gives CORE to the craft alone —
   * the player is always the brightest thing on screen. The ramp stops short of
   * it at both ends of the tier stack.
   */
  it('never reaches the craft, at either end of the ramp', () => {
    const shades = new Set(sky.map((tier) => tier.colour));
    expect(shades.size).toBe(3);
    for (const shade of shades) expect(shade).not.toBe(CORE);
    expect(sky.map((tier) => tier.alpha)).toEqual([...sky.map((t) => t.alpha)].sort());
    for (const tier of sky) expect(tier.alpha).toBeLessThan(1);
  });

  it('is one colour at three brightnesses, and not three colours', () => {
    // The prototype's own correction to itself: it picked three blue-greys by
    // eye, and a hue that shifts with distance is a second meaning on a channel
    // identity already owns.
    expect(sky.map((tier) => tier.colour)).toEqual([
      mix(DUSK, INK, 0.15),
      mix(DUSK, INK, 0.5),
      mix(DUSK, INK, 0.9),
    ]);
  });

  it('draws nothing outside the band it was given', () => {
    const { context, marks } = recorder();
    drawStarfield(context, sky, AT(0), 400, 900);
    for (const mark of marks) {
      expect(mark.y).toBeGreaterThanOrEqual(400);
      expect(mark.y).toBeLessThanOrEqual(900);
    }
  });
});
