/**
 * SPIKE — throwaway. Deleted when the M0.5 ADR lands.
 *
 * Every knob in the retro grade, in one place, because spec 14 §4 says a tuning
 * session should be a single file's worth of numbers. The spike does not tune
 * them — it measures what they cost — but the shape of the file is the shape the
 * real one wants, and both candidates read from here so neither can quietly be
 * measured doing less work than the other.
 *
 * Order is spec 14 §2: bloom, grade, dither, grain, scanlines.
 */
export const GRADE = {
  bloom: {
    /** Weight per level of the blur chain, widest last. */
    weights: [0.6, 0.45, 0.3] as const,
    /**
     * Low, and deliberately. Spec 00 §3 makes E1 a *lit* step — 6px at 35% — so
     * a threshold above an E1 element's luminance would cut the bottom rung off
     * the ordinal channel entirely and leave three energy steps where the spec
     * asks for four.
     */
    threshold: 0.28,
    knee: 0.3,
    intensity: 1.2,
  },
  /**
   * Spec 14 §2: lift the blacks toward VOID's violet rather than to neutral
   * grey, and leave CORE at 1.0 so the craft stays the brightest value.
   */
  lift: [0.016, 0.012, 0.03] as const,
  gamma: [1.0, 1.02, 0.98] as const,
  gain: [1.03, 1.0, 1.06] as const,
  /** Spec 14 §2: ordered 4×4 Bayer, ~1/255 amplitude, over the whole frame. */
  dither: 1 / 255,
  /** Spec 14 §2: ≤ 3% luminance, resampled per frame. */
  grain: 0.03,
  /**
   * Spec 14 §2: ≤ 6% at a 2-design-px pitch, and **off by default** until the
   * phone says otherwise. The spike measures it **on**, deliberately: the number
   * that matters is the ceiling, and a stage measured off is a stage whose cost
   * is discovered the first time somebody turns it on.
   */
  scanlines: { strength: 0.06, pitch: 2 },
} as const;

/** Spec 14 §2's 4×4 ordered Bayer matrix, as thresholds in 0..1. */
export const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
