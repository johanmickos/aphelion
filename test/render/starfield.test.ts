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

const AT = (y: number): CameraView => ({ x: DESIGN_WIDTH / 2, y, lock: 0, offset: 0, leading: 0 });

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
    // the author's instruction. Every star moves by strictly less than the camera
    // did — layers at different speeds are exactly what §2 calls implied depth
    // and refuses.
    const CLIMB = 100;
    const before = drawn(sky, 1000);
    const after = drawn(sky, 1000 - CLIMB);
    const shifts: number[] = [];
    for (let i = 0; i < before.length; i++) {
      const shift = after[i]!.y - before[i]!.y;
      // Only stars that did not wrap this frame say anything about the rate.
      if (Math.abs(shift) > FIELD_HEIGHT / 2) continue;
      shifts.push(shift);
      expect(shift).toBeGreaterThan(0);
      expect(shift).toBeLessThan(CLIMB);
    }
    expect(shifts.length).toBeGreaterThan(20);
  });

  /**
   * **The depth is continuous, and that is the point of it.** The first build gave
   * each of the three tiers one speed and one size, and three rates read as three
   * flat planes sliding over each other rather than as space. Every star now
   * carries its own depth and takes its speed and its size from it — *"more depth
   * with more varied star sizes"* (author, 2026-08-30).
   */
  it('gives nearly every star its own speed, not one per tier', () => {
    const CLIMB = 100;
    const before = drawn(sky, 1000);
    const after = drawn(sky, 1000 - CLIMB);
    const rates = new Set<number>();
    for (let i = 0; i < before.length; i++) {
      const shift = after[i]!.y - before[i]!.y;
      if (Math.abs(shift) > FIELD_HEIGHT / 2) continue;
      rates.add(Math.round(shift * 1e6));
    }
    expect(rates.size).toBeGreaterThan(20);
  });

  it('spreads its sizes on a curve, so the near ones pull away from the pack', () => {
    const sizes = sky.flatMap((tier) => tier.stars.map((star) => star.size)).sort((a, b) => a - b);
    expect(sizes.length).toBe(STAR_COUNT);
    // A real spread rather than the 1.8x the prototype's three fixed sizes give.
    expect(sizes.at(-1)! / sizes[0]!).toBeGreaterThan(2.5);
    // And squared rather than even: the median sits well below the midpoint of
    // the range, which is what leaves the near stars room to stand out.
    const middle = (sizes[0]! + sizes.at(-1)!) / 2;
    expect(sizes[Math.floor(sizes.length / 2)]!).toBeLessThan(middle);
  });

  /**
   * **The regression that made the author report the sky as wrong**, and it is a
   * unit error rather than a taste one. The prototype sizes its stars in *device
   * pixels* after its own scale — `max(1, tier.size * cam.scale)`, which on the
   * phone it was tuned on is 3 to 5.4 — and this draws in *design units*, which
   * the letterbox puts on device pixels one-for-one on that same phone. Carrying
   * the numbers without the scale gave 0.7-to-2.7, and a sub-pixel rectangle is
   * not a small star: it is an antialiased smear of the background. Reported as
   * *"tiny specks of white with little to no variation."*
   */
  it('is drawn at the prototype\u2019s apparent size, not its raw numbers', () => {
    const sizes = sky.flatMap((tier) => tier.stars.map((star) => star.size));
    // Nothing sub-pixel, and the range spans the prototype's 3 – 5.4 at both ends.
    expect(Math.min(...sizes)).toBeGreaterThan(2);
    expect(Math.min(...sizes)).toBeLessThan(3);
    expect(Math.max(...sizes)).toBeGreaterThan(5.4);
  });

  /** And at its density: 160 per screen, over a field two screens tall. */
  it('is as dense as the sky it was carried from', () => {
    expect(STAR_COUNT / (FIELD_HEIGHT / DESIGN_HEIGHT)).toBe(160);
  });

  it('makes a nearer star both faster and bigger, always', () => {
    const all = sky.flatMap((tier) => tier.stars);
    for (const star of all)
      for (const other of all) {
        if (star.z <= other.z) continue;
        expect(star.parallax).toBeGreaterThan(other.parallax);
        expect(star.size).toBeGreaterThan(other.size);
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

  /**
   * Brightness stays quantised where size and speed are continuous, and that is
   * deliberate: `fillStyle` and `globalAlpha` are context state, so a per-star
   * value would cost a state change per star where a per-star size costs nothing.
   */
  it('still draws the whole sky in three batches', () => {
    const { context, marks } = recorder();
    drawStarfield(context, sky, AT(0), 0, DESIGN_HEIGHT);
    expect(new Set(marks.map((mark) => `${mark.fill}@${mark.alpha}`)).size).toBeLessThanOrEqual(3);
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
