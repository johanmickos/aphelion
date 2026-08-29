/**
 * The frames between the ticks.
 *
 * ADR-0006 gives the renderer *"pixels and the interpolation between ticks"*,
 * and this is the second half. The simulation is 60Hz and fixed; a 120Hz phone
 * asks for two frames per tick and a 59.94Hz display asks for one that lands
 * between them. Drawing the last tick twice reads as a stutter, and **the thing
 * the M1 gate is judging is feel** — a swing seen through a stuttering picture
 * is a swing judged wrongly.
 *
 * It is a function from two presentation states to a third, so the renderer
 * downstream of it has one view to draw and never has to know a frame is not a
 * tick. Nothing is smoothed and nothing is predicted: `alpha` runs 0 to 1 across
 * the gap between two ticks that have both already happened, so no frame ever
 * shows a position the simulation did not reach.
 */
import type { DeformationView, FlashView, PresentationState } from '../state/types.ts';

const TWO_PI = Math.PI * 2;

function between(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

/**
 * The same, for an angle.
 *
 * Along the short way round, always. A heading that crosses from just under π to
 * just over −π has turned a hair; interpolated as plain numbers it spins the
 * craft the whole way back through zero, which happens once a revolution on
 * every orbit in the game.
 */
function betweenAngles(from: number, to: number, alpha: number): number {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return from + delta * alpha;
}

/**
 * Whether something was placed on the later of the two ticks.
 *
 * Spec [00 · §5](../../docs/spec/00-tokens.md)'s first motion rule is that
 * **things arrive; they do not fade in** — so a flash that did not exist a tick
 * ago, or a stretch that was just struck, is drawn at full size on the first
 * frame that shows it rather than eased up from whatever was there before. An
 * interpolated arrival is a 16ms fade-in, which is exactly what the rule forbids
 * and exactly what the eye reads as softness.
 */
function arriving(decay: { readonly age: number } | null): boolean {
  return decay !== null && decay.age === 0;
}

function flashBetween(
  previous: FlashView | null,
  current: FlashView | null,
  alpha: number,
): FlashView | null {
  if (current === null) return null;
  if (previous === null || arriving(current.decay)) return current;
  return { ...current, radius: between(previous.radius, current.radius, alpha) };
}

function deformationBetween(
  previous: DeformationView,
  current: DeformationView,
  alpha: number,
): DeformationView {
  if (arriving(current.recovery)) return current;
  return {
    along: between(previous.along, current.along, alpha),
    across: between(previous.across, current.across, alpha),
    recovery: current.recovery,
  };
}

/**
 * A view `alpha` of the way from one tick to the next.
 *
 * Bodies are taken from the later tick whole rather than interpolated: they do
 * not move, and interpolating a thing that cannot move would be a promise this
 * function should not make before spec [04](../../docs/spec/04-bodies.md)'s
 * moving bodies exist to test it. The tick number is the later one too — a frame
 * belongs to the tick it is drawn from, and half a tick is not a tick.
 *
 * The camera's carried state — its lock, and the body the lock is held on — is
 * taken from the later tick for a stronger reason: it is the *input* to the next
 * tick's derivation, and a frame is not a tick
 * ([ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)).
 * Only the two numbers the renderer actually draws with are interpolated, and
 * nothing this function returns is ever fed back in.
 */
export function interpolate(
  previous: PresentationState,
  current: PresentationState,
  alpha: number,
): PresentationState {
  return {
    tick: current.tick,
    camera: {
      ...current.camera,
      x: between(previous.camera.x, current.camera.x, alpha),
      y: between(previous.camera.y, current.camera.y, alpha),
    },
    craft: {
      x: between(previous.craft.x, current.craft.x, alpha),
      y: between(previous.craft.y, current.craft.y, alpha),
      heading: betweenAngles(previous.craft.heading, current.craft.heading, alpha),
      speed: between(previous.craft.speed, current.craft.speed, alpha),
      // The step never moves and the radius is a length, so one is taken and the
      // other is crossed — the same split the rest of this function makes.
      energy: current.craft.energy,
      bloom: between(previous.craft.bloom, current.craft.bloom, alpha),
      deformation: deformationBetween(previous.craft.deformation, current.craft.deformation, alpha),
    },
    bodies: current.bodies,
    flash: flashBetween(previous.flash, current.flash, alpha),
    // Sightings are taken from the later tick whole. They are pinned to the
    // design space's edge rather than to a world point, so there is nothing for
    // a fraction of a tick to move them along — and their memory, the tide's
    // bearing, is the next derivation's input rather than this frame's
    // (ADR-0015).
    sightings: current.sightings,
    // The corridor does not move, and taking it from the later tick is the same
    // promise `bodies` above makes: interpolating a thing that cannot change
    // would be a promise this function should not make before spec 17's
    // narrowing corridor exists to test it.
    corridor: current.corridor,
  };
}
