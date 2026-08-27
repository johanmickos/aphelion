/**
 * The integrator. It runs during the dive and at no other time.
 *
 * `CONTEXT.md` — the **dive** is the part of a swing between the grab and the
 * craft's closest approach, *"real gravity and nothing else: the dive is
 * simulated, and no part of it is authored."* Spec
 * [01 · §5](../../docs/spec/01-swing.md) is emphatic that this is what took the
 * prototype sixteen failed attempts, and that all sixteen failed the same way —
 * rigid or snapped orbit insertion. **Keep the dive simulated.**
 *
 * After the freeze the craft leaves this file entirely for a closed-form phase
 * clock, which is M1.3's, and which therefore cannot accumulate integration
 * error however long a swing lasts.
 */
import type { Body } from './body.ts';
import type { Craft } from './craft.ts';
import { pullScale } from './gravity.ts';

/**
 * Advance the craft by `seconds` under one body's gravity, in `substeps` equal
 * steps.
 *
 * **Semi-implicit Euler**: velocity from acceleration, then position from the
 * *new* velocity. Measured from the prototype, and it is the choice that matters
 * here rather than an accident of it — plain Euler pumps energy into an orbit
 * and a craft on a fixed floor would climb off it, while semi-implicit Euler
 * conserves it to a bounded oscillation. A higher-order method would buy
 * accuracy the substep count already bought more cheaply.
 *
 * `substeps` is a parameter and not the constant it almost always is, because
 * spec 01 §12's tolerance is written as a *convergence* test — *"substep count
 * sufficient that halving it changes periapsis radius by < 0.5 units ... so the
 * rewrite can choose its own count and prove it."* A test that cannot vary the
 * count cannot run that check. The simulation's own choice is made once, in
 * [`step.ts`](./step.ts), from [`SUBSTEPS`](./units.ts).
 */
export function integrate(craft: Craft, body: Body, seconds: number, substeps: number): void {
  const dt = seconds / substeps;
  for (let i = 0; i < substeps; i++) {
    const dx = body.x - craft.x;
    const dy = body.y - craft.y;
    const scale = pullScale(body.mass, dx, dy);
    craft.vx += dx * scale * dt;
    craft.vy += dy * scale * dt;
    craft.x += craft.vx * dt;
    craft.y += craft.vy * dt;
  }
}

/**
 * Advance the craft with no force on it at all.
 *
 * One step, not `substeps` of them, and that is the point: spec 01 §9 requires a
 * coasting craft to travel *"an exact straight line at exactly constant speed"*,
 * measured as bit-identical velocity over 300 ticks. Velocity is not touched, so
 * speed and heading are exact by construction; and taking the whole tick in one
 * multiplication keeps the position on the line too, where six additions of
 * `v × dt/6` would round six times off it.
 *
 * *"This is not an approximation to be improved"* — the economy says coasting
 * earns nothing and costs nothing, and the physics agrees with it exactly rather
 * than approximately.
 */
export function coast(craft: Craft, seconds: number): void {
  craft.x += craft.vx * seconds;
  craft.y += craft.vy * seconds;
}
