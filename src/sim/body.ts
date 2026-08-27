/**
 * A body: the thing the craft is caught by, and the only thing that pulls.
 *
 * `CONTEXT.md` — *anything in the field with mass that the craft can be caught
 * by.* A planet is the common kind; black holes, pulsars and binaries are
 * others, and spec [17 · §3](../../docs/spec/17-daily-field.md) reserves the
 * `type` slot for them from the first commit. v1 generates only STANDARD.
 */
import { power } from './math.ts';
import { FLOOR_GAP, MASS_EXPONENT, MEDIAN_MASS, MEDIAN_RADIUS } from './units.ts';

/**
 * The one body kind v1 generates.
 *
 * A union of literals rather than an `enum`, which emits code that plain node
 * cannot run — `pnpm portable` bans them across all of `src/`.
 */
export type BodyType = 'STANDARD';

export interface Body {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /**
   * The gravitational parameter this body pulls with — μ in spec
   * [01 · §2](../../docs/spec/01-swing.md)'s `a(r) = μ / (r² + ε²)`, in design
   * units³ per second squared.
   *
   * Called mass because that is what spec [04 · §1](../../docs/spec/04-bodies.md)
   * rules the player is reading — *"mass is size; nothing else changes"* — and
   * what spec 17's day description already calls it. The number it holds is the
   * parameter, not a kilogram count; there is nothing in the game that needs
   * both, so there is one word.
   */
  readonly mass: number;
  readonly type: BodyType;
}

/**
 * The gravitational parameter of a body of radius `radius`.
 *
 * `μ(R) = MEDIAN_MASS × (R / MEDIAN_RADIUS)ⁿ`, normalised so that the median
 * body is unchanged at every exponent — which is what makes moving `n` a
 * question about *variation across the field* rather than about the whole
 * field's strength.
 *
 * `n` is [`MASS_EXPONENT`](./units.ts), deferred to the M1 gate by the author
 * (spec [01 · §13.2](../../docs/spec/01-swing.md)). At `n = 0` this returns
 * `MEDIAN_MASS` for every body, which is the prototype exactly.
 */
export function massForRadius(radius: number, exponent: number = MASS_EXPONENT): number {
  return MEDIAN_MASS * power(radius / MEDIAN_RADIUS, exponent);
}

/**
 * The closest a craft may orbit this body — `CONTEXT.md`'s **floor**.
 *
 * *"A hard limit that is never crossed, and the one guarantee a grab makes."*
 * The gap above the surface is a feel choice and is fixed; see
 * [`units.ts`](./units.ts).
 *
 * It lives on the body rather than on the grab because it is a property of the
 * body's own geometry — spec [04](../../docs/spec/04-bodies.md) draws the tide
 * against it, and M1.3's clearance and M1.4's bounce both read it.
 */
export function floorRadius(body: Body): number {
  return body.radius + FLOOR_GAP;
}

/**
 * A body, with its mass derived from its radius rather than supplied.
 *
 * There is deliberately no way to build a body with an arbitrary mass. Spec
 * 04's ruling is that mass *is* size, so a body whose mass disagreed with its
 * radius would draw a tide that describes a gravity the world does not have.
 */
export function createBody(
  x: number,
  y: number,
  radius: number,
  exponent: number = MASS_EXPONENT,
): Body {
  return { x, y, radius, mass: massForRadius(radius, exponent), type: 'STANDARD' };
}
