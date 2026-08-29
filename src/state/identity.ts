/**
 * A body's hue, which is its name.
 *
 * `CONTEXT.md`: *"Identity — what something is, expressed as hue. A body keeps
 * its hue forever."* Spec [04 · §5](../../docs/spec/04-bodies.md) makes that a
 * doctrine — *"in the run, a body's name is its colour; in the retelling, it is
 * its altitude"* — so this file is the naming ceremony, and it is a **pure
 * function of the address**. Nothing is stored, nothing is assigned, and a body
 * cannot drift off its own name because it was never told it.
 *
 * ## Why it is here and not in the field
 *
 * A hue is paint, and the simulation may not hold paint (ADR-0006). But it also
 * may not be the renderer's, because two bodies too close in hue is a *fact
 * about the field* that spec 04 §5 has a rule for, and a fact no test could
 * reach if it were computed inside a canvas. So it is derived, per tick, from
 * the one thing the simulation does carry — the body's place in the field, which
 * is spec [17](../../docs/spec/17-daily-field.md)'s **address**, assigned
 * bottom-to-top.
 *
 * ## The generator
 *
 * Spec [00 · §2](../../docs/spec/00-tokens.md) states the rule and not the
 * method: `oklch(0.72 0.13 H)` at fixed lightness and chroma so every identity
 * is equally loud, **H ≥ 50° between adjacent addresses**, and four reserved
 * ranges that generation may not enter. What is left is three arcs totalling
 * **167.3°** of the circle, and the question is how to walk them.
 *
 * **The step is the golden section of what is left**, which is the standard
 * answer to *place N points on a ring so that no two are close and the sequence
 * never repeats* — and it is the answer that survives its own inputs moving.
 * Measured over 200 addresses: neighbours are **63.9°** apart against a floor of
 * 50, addresses two apart are 39.5° and three apart 24.4°, and a 40-body day
 * produces **40 distinct hues**. A step tuned to this arc can beat that on
 * neighbours and does it by landing near a small rational fraction, which
 * collapses to a handful of repeating hues the moment §2a's colour-vision sweep
 * moves a range. The golden step has no such cliff, and §2a is flagged to move
 * exactly these numbers.
 */
import { RESERVED_HUES } from './hues.ts';

/** Spec 00 §2: fixed, so every identity is equally loud. */
export const IDENTITY_LIGHTNESS = 0.72;

/** The same, for chroma. */
export const IDENTITY_CHROMA = 0.13;

/** Spec 00 §2's separation floor between adjacent addresses, in degrees. */
export const HUE_SEPARATION = 50;

/** One stretch of hue generation is allowed to land in. */
interface Arc {
  readonly from: number;
  readonly span: number;
}

/**
 * What is left of the circle once spec 00 §2's reserved ranges are removed.
 *
 * Derived from the ranges rather than written out, so that the colour-vision
 * sweep moving one of them moves this — a hand-written arc list would keep
 * generating into a range the spec had closed, and every hue would still look
 * reasonable.
 */
export const ALLOWED: readonly Arc[] = allowedArcs();

/** How much hue there is to generate in, in degrees. */
export const ALLOWED_SPAN = ALLOWED.reduce((total, arc) => total + arc.span, 0);

/**
 * How far along the allowed arc each address steps.
 *
 * The golden section of what is left. `φ = (1 + √5) / 2` is written out because
 * it is the reason rather than a constant: no rational multiple of the arc
 * repeats as slowly, and a step that repeats is a field where address 1 and
 * address 6 are the same body to look at.
 */
export const HUE_STEP = ALLOWED_SPAN / ((1 + Math.sqrt(5)) / 2);

/**
 * The hue of the body at `address`, in oklch degrees.
 *
 * Addresses are 0-based here and 1-based in the retelling (spec 17); what
 * matters is that consecutive integers are consecutive bodies, which is what
 * the ≥50° rule is written about.
 */
export function hueOf(address: number): number {
  // Half a step in, so that address zero does not land on an arc's first
  // degree — which is a reserved range's own boundary, and spec 00 §2's windows
  // are closed. The offset shifts every hue by the same amount and so changes no
  // separation between any pair.
  let along = ((address + 0.5) * HUE_STEP) % ALLOWED_SPAN;
  if (along < 0) along += ALLOWED_SPAN;
  for (const arc of ALLOWED) {
    if (along < arc.span) return arc.from + along;
    along -= arc.span;
  }
  // Only reachable through floating-point drift at the very end of the last
  // arc, where the last arc's end is the honest answer.
  const last = ALLOWED[ALLOWED.length - 1]!;
  return last.from + last.span;
}

/** How far apart two hues are, the short way round the circle. */
export function hueApart(a: number, b: number): number {
  const gap = Math.abs(((a - b) % 360) + 360) % 360;
  return Math.min(gap, 360 - gap);
}

/** Whether a hue falls inside a range spec 00 §2 reserves. */
export function isReserved(hue: number): boolean {
  const at = ((hue % 360) + 360) % 360;
  return RESERVED_HUES.some((range) =>
    range.from <= range.to
      ? at >= range.from && at <= range.to
      : at >= range.from || at <= range.to,
  );
}

function allowedArcs(): Arc[] {
  const edges: number[] = [0, 360];
  for (const range of RESERVED_HUES) edges.push(range.from, range.to);
  edges.sort((a, b) => a - b);

  const arcs: Arc[] = [];
  for (let i = 1; i < edges.length; i++) {
    const from = edges[i - 1]!;
    const span = edges[i]! - from;
    // A sliver is not a slot: sample the middle rather than the ends, so a
    // range's own boundary does not open an arc one degree wide.
    if (span > 1 && !isReserved(from + span / 2)) arcs.push({ from, span });
  }
  return arcs;
}
