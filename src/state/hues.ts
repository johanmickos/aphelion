/**
 * The ranges spec [00 · §2](../../docs/spec/00-tokens.md) closes to identity
 * generation, and why each one is shut.
 *
 * A body's hue **is** its name, so a hue that could be mistaken for a token is a
 * body that could be mistaken for the boundary or for the finish. Spec 00 §1
 * makes two of those monopolies absolute — *"nothing else in the world glows
 * pink"*, *"nothing else in the world is green"* — and this is where that is
 * enforced, once, rather than checked at every place a hue is drawn.
 *
 * It is its own file so that [`identity.ts`](./identity.ts) reads as a generator
 * and this reads as a list of rulings, which is what each of them is.
 * **Spec 00 §2a's colour-vision sweep has authority over every number here**, is
 * flagged rather than scheduled, and will move them; the generator derives its
 * arcs from this list so that moving one is a change in one place.
 */

/** A closed stretch of hue, in oklch degrees. `from > to` wraps through zero. */
export interface HueRange {
  readonly from: number;
  readonly to: number;
  /** Which ruling shut it. */
  readonly why: string;
}

export const RESERVED_HUES: readonly HueRange[] = [
  // Spec 00 §2's four reserved tokens, each ±20° of its own hue. A body wearing
  // a quality colour would be a body claiming to be a grade.
  { from: 65.0, to: 105.0, why: 'SOLAR — quality, top' },
  { from: 137.1, to: 177.1, why: 'LUMEN — quality, and the finish system' },
  // Spec 00 §2's AURORA range, widened at both ends by two rulings the same
  // section carries: *"generated blues stop at H = 265°, short of AURORA"*, and
  // the plan's own summary of this rule as excluding **the violet–pink band**.
  // Read strictly, §2's four ranges leave 315.5 – 337.7 open — a magenta
  // shoulder on ION's range, in the one hue the world reserves for risk. It is
  // shut here and the reading is recorded rather than assumed: the sweep may
  // reopen it, and nothing is lost meanwhile but 22° of the least safe colour in
  // the palette.
  { from: 265.0, to: 337.7, why: 'AURORA and the violet–pink band, up to ION' },
  { from: 337.7, to: 17.7, why: 'ION — risk, and it wraps through zero' },
];
