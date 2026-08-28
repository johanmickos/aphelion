/**
 * Contact: the craft meeting a body, and the one thing that happens when it
 * does.
 *
 * Spec [01 · §10](../../docs/spec/01-swing.md) writes three contacts and they
 * are the same operation at three sets of constants — put the craft on the
 * surface, and reflect however much of its velocity is pointed into it:
 *
 * | Where | Surface | Restitution | Lethal |
 * |---|---|---|---|
 * | The **held** body — the floor | `R + 12` | 0 | never |
 * | Any **other** body, while one is held | `R + 6` | 0.6 | never |
 * | Any body, while **coasting** | `R + 5` | 0.8 | **unless it is a graze** |
 *
 * They live here as one function and three call sites rather than three code
 * paths, which is the prototype's own hard-won consolidation: it resolved
 * contacts in three places with three hand-written rules that were the same
 * arithmetic, and they drifted.
 *
 * ## The asymmetry is the rule, not an oversight
 *
 * The same geometry is lethal coasting and safe held, and **a grab is a promise
 * that you will not be killed by the thing you grabbed** (spec 01 §10). The
 * floor is the sharpest form of that promise and it is [`dive.ts`](./dive.ts)'s,
 * because spec [01 · §4](../../docs/spec/01-swing.md) leans on it — *"where
 * turning alone still falls short, the floor catches the remainder"* — and it
 * calls [`bounce`](#bounce) below, so there is exactly one of it.
 *
 * ## The graze is what keeps the manoeuvre the game is about
 *
 * Lethal only when the approach is not near-parallel: `−(v · n̂) / |v| > 0.18`,
 * a ratio and therefore unscaled. Flinging tangentially past a body just left is
 * legitimate flying, and a bare distance test would kill it.
 *
 * **`R + 5` is the craft's own hull**, not a shell around the body — the dart is
 * five prototype units half-width, this number exactly — so a graze is the hull
 * *touching* the surface rather than passing near it. It is also why the two
 * thresholds never disagree: any straight line that would put the craft's centre
 * inside the disc arrives at more than 0.18 and is lethal, for every body under
 * 301 prototype units of radius, against a field whose largest is 56.
 *
 * **A graze still bounces, and spec 01 §10 does not say so.** It says what a
 * graze is not and stops, and something has to happen: a craft left alone with
 * its hull on the surface sinks into the disc it is touching. The lethality test
 * will not clean that up later either — along a straight line the fraction of
 * speed pointed at a body only ever *falls* past the entry point, so a contact
 * that arrived as a graze stays one however deep it goes. The prototype skips it
 * off at the same surface and that is what is carried (ADR-0013), at a measured
 * cost of up to 17° of heading at the lethal threshold, falling to nothing as the
 * pass becomes exactly tangential. The hole spec 01 leaves is recorded in the
 * plan rather than papered over.
 */
import type { Body } from './body.ts';
import type { Craft } from './craft.ts';
import { magnitude } from './math.ts';
import {
  BOUNCE_GAP,
  BOUNCE_RESTITUTION,
  GRAZE_RATIO,
  GRAZE_RESTITUTION,
  IMPACT_GAP,
} from './units.ts';
import type { Ending, Field } from './types.ts';

/**
 * How much of the craft's speed is pointed into this body, from −1 to 1.
 *
 * Spec 01 §10's `−(v · n̂) / |v|`, where `n̂` is the outward normal at the
 * craft's own bearing. One at dead head-on, zero flying exactly tangentially,
 * negative on the way out. Zero for a craft that is not moving or is exactly on
 * the body's centre, so neither can be a crash.
 */
export function closingFraction(craft: Craft, body: Body): number {
  const dx = craft.x - body.x;
  const dy = craft.y - body.y;
  const r = magnitude(dx, dy);
  const speed = magnitude(craft.vx, craft.vy);
  if (r === 0 || speed === 0) return 0;
  return -(craft.vx * dx + craft.vy * dy) / (r * speed);
}

/** Whether the craft is inside `body`'s surface plus `gap`. */
export function inContact(craft: Craft, body: Body, gap: number): boolean {
  const dx = craft.x - body.x;
  const dy = craft.y - body.y;
  return magnitude(dx, dy) < body.radius + gap;
}

/**
 * Put the craft on the surface `gap` above `body`, and reflect whatever part of
 * its velocity was pointed into it.
 *
 * `v -= (1 + restitution) × vₙ × n̂`, so restitution 0 removes the inward half
 * and leaves the tangential one — a craft that runs into the floor slides along
 * it rather than rebounding off it — and 0.6 sends six tenths of it back.
 *
 * The reposition happens whether or not the velocity is inward, because a craft
 * already on its way out is still inside a surface it may not be inside.
 */
export function bounce(craft: Craft, body: Body, gap: number, restitution: number): void {
  const dx = craft.x - body.x;
  const dy = craft.y - body.y;
  const r = magnitude(dx, dy);
  if (r === 0) return;

  const surface = body.radius + gap;
  const outX = dx / r;
  const outY = dy / r;
  craft.x = body.x + outX * surface;
  craft.y = body.y + outY * surface;

  const inward = craft.vx * outX + craft.vy * outY;
  if (inward >= 0) return;
  const reflect = 1 + restitution;
  craft.vx -= reflect * inward * outX;
  craft.vy -= reflect * inward * outY;
}

/**
 * Bounce off every body except the one being held — spec 01 §10's `R + 6` at
 * 0.6, which never kills.
 *
 * Called from the dive, where the craft's position is the integrator's and a
 * bounce therefore means something. **It is deliberately not called from the
 * frozen orbit**, where the position is authored by the phase clock
 * ([`orbit.ts`](./orbit.ts)) and would be rewritten on the next tick; the
 * prototype draws the same line in the same place, resolving these contacts only
 * in its integrated phases.
 */
export function bounceOffOthers(craft: Craft, field: Field, held: Body): void {
  for (const body of field.bodies) {
    if (body === held) continue;
    if (inContact(craft, body, BOUNCE_GAP)) bounce(craft, body, BOUNCE_GAP, BOUNCE_RESTITUTION);
  }
}

/**
 * Resolve a coasting craft's contact with the field, and say whether one of them
 * ended the run.
 *
 * The whole of *"planets are obstacles"* — the sentence the demo came back with,
 * and the reason M1.4 is in front of the gate. Returns `'IMPACT'` on the first
 * lethal contact and leaves the craft on the surface it hit, stopped, so the
 * ending has a place rather than a silent teleport.
 */
export function strikeField(craft: Craft, field: Field): Ending | null {
  for (const body of field.bodies) {
    if (!inContact(craft, body, IMPACT_GAP)) continue;

    if (closingFraction(craft, body) > GRAZE_RATIO) {
      bounce(craft, body, IMPACT_GAP, 0);
      craft.vx = 0;
      craft.vy = 0;
      return 'IMPACT';
    }
    bounce(craft, body, IMPACT_GAP, GRAZE_RESTITUTION);
  }
  return null;
}
