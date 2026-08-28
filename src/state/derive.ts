/**
 * Simulation in, presentation state out. Once per tick, and once only.
 *
 * This is the layer ADR-0006 warns will quietly grow a dependency on the
 * renderer. It cannot: `pnpm portable` reads this directory and fails if it
 * reaches outside `src/sim/`.
 *
 * It is also where the simulation's numbers become the renderer's: heading and
 * speed instead of a velocity, a `held` flag instead of an index, an energy step
 * instead of a phase. The renderer never asks the simulation a question —
 * everything it draws is already an answer, which is what makes a frame a pure
 * function of `(recipe, tick)`.
 *
 * ## It is a recurrence, and that is deliberate
 *
 * [ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md):
 * almost everything the design puts in this layer decays — the release kick
 * homes over 180ms, an E3 over 400ms, the rungs' wake over 400ms — and a decay
 * is by definition a function of the current tick **and what was already on
 * screen**. So `derive` takes the previous tick's presentation and produces the
 * next one.
 *
 * **Three rules keep that honest, and each is a test rather than a convention.**
 * It is called exactly once per tick and never per frame, because ticks are the
 * only clock in the game and a decay advanced per frame would run at the
 * display's rate. A run opens with [`createPresentation`](#), which places
 * everything rather than easing toward it from wherever the last run ended.
 * And everything carried eases toward something the current tick determines, so
 * two presentations that disagree agree again within a bounded time — memory
 * that cannot be shed turns one bad tick into a permanently wrong picture.
 *
 * ## What it remembers, and what it re-reads
 *
 * The memory is four things and no more: where the camera is, how much of it is
 * held on a body, how far through its recovery the craft's stretch is, and how
 * far through its 400ms the one E3 is. Everything else — every position, every
 * energy, every held flag — is read fresh from the simulation every tick, so a
 * disagreement in it cannot survive to the next one.
 *
 * The **events** that place those memories are read from the previous picture
 * rather than from a flag the simulation raises: a grab is a body being held
 * that was not, and a release is the reverse. That keeps `SIM_VERSION` still,
 * which is the point — spec 00 §3's flash and spec 02 §4's stretch are things
 * the picture does, and a simulation that recorded them for the picture's
 * benefit would have put the glow in the recipe.
 */
import { headingOf, speedOf } from '../sim/craft.ts';
import type { SimState } from '../sim/types.ts';
import { followCamera, openCamera } from './camera.ts';
import { advance, fade, place } from './decay.ts';
import { relax, stretch, UNDEFORMED } from './deformation.ts';
import { bloomOf, E3_BLOOM, E3_TICKS } from './energy.ts';
import type { CameraView, DeformationView, Energy, FlashView, PresentationState } from './types.ts';

/**
 * How long the chain is, which is not a question anything can answer yet.
 *
 * Spec 00 §3 gives each chain link +4px of the craft's bloom and `CONTEXT.md`
 * defines the chain as *"consecutive engaged swings, broken by coasting past one
 * rung"* — so counting it needs rungs, which are spec 05's and M3's, and an
 * economy to spend it, which is spec 08's and M4's. Written as a named zero
 * rather than left out, because the term it multiplies is built and only its
 * value is missing.
 */
const CHAIN_UNBUILT = 0;

/** Which body the picture last showed as held, if any. */
function heldIn(view: PresentationState): number | null {
  const index = view.bodies.findIndex((body) => body.held);
  return index === -1 ? null : index;
}

/**
 * What the swing did between two ticks, as the picture can see it.
 *
 * Spec [00 · §3](../../docs/spec/00-tokens.md) gives an E3 to both a release and
 * a grab, and spec [02 · §7](../../docs/spec/02-release.md) makes the grab the
 * release's mirror *"at lower amplitude"* — so both are events here and only the
 * release deforms the craft.
 */
type Event = 'GRAB' | 'RELEASE' | null;

function eventOf(previous: PresentationState, sim: SimState): Event {
  const before = heldIn(previous);
  const now = sim.heldBody;
  if (before === now) return null;
  // A grab wins a tick that is somehow both, because it is the newer of the two
  // and spec 00 §3's replacement rule is that the newest E3 is the one alive.
  return now === null ? 'RELEASE' : 'GRAB';
}

/**
 * The one E3: struck fresh by an event, aged otherwise, and gone at 400ms.
 *
 * *"A new E3 replaces the old one; it does not stack"* — which here is a slot
 * being overwritten rather than a rule being applied, because there is only one
 * slot to overwrite.
 */
function flashOf(previous: FlashView | null, sim: SimState, event: Event): FlashView | null {
  if (event !== null) {
    return { x: sim.craft.x, y: sim.craft.y, radius: E3_BLOOM, decay: place(E3_TICKS) };
  }
  if (previous === null) return null;
  const decay = advance(previous.decay);
  if (decay === null) return null;
  return { x: previous.x, y: previous.y, radius: E3_BLOOM * fade(decay), decay };
}

/**
 * The craft's step, and it never moves.
 *
 * Spec 00 §3 makes E2 *"craft baseline"* and Direction 01 says why: *"the craft
 * is the brightest object on screen, always. It carries no identity hue — the
 * player is not a target."* What varies is the radius, through the chain, and
 * never the step.
 */
const CRAFT_ENERGY: Energy = 2;

function present(
  sim: SimState,
  camera: CameraView,
  flash: FlashView | null,
  deformation: DeformationView,
): PresentationState {
  return {
    tick: sim.tick,
    camera,
    craft: {
      x: sim.craft.x,
      y: sim.craft.y,
      heading: headingOf(sim.craft),
      speed: speedOf(sim.craft),
      energy: CRAFT_ENERGY,
      bloom: bloomOf(CRAFT_ENERGY, CHAIN_UNBUILT),
      deformation,
    },
    bodies: sim.field.bodies.map((body, index) => {
      const held = index === sim.heldBody;
      const energy: Energy = held ? 2 : 1;
      return { x: body.x, y: body.y, radius: body.radius, held, energy, bloom: bloomOf(energy) };
    }),
    corridor: {
      centreline: sim.field.corridor.centreline,
      halfWidth: sim.field.corridor.halfWidth,
    },
    flash,
  };
}

/**
 * The presentation at the first tick of a run.
 *
 * Everything that eases is placed here rather than eased into place, so a run
 * never opens by gliding in from wherever the last one left off — and nothing is
 * mid-decay, because a run that opened with a flash already fading would be
 * showing the player an event that never happened.
 */
export function createPresentation(sim: SimState): PresentationState {
  return present(sim, openCamera(sim), null, UNDEFORMED);
}

/** The presentation one tick on. Call once per tick, in the same loop as `stepSim`. */
export function derive(previous: PresentationState, sim: SimState): PresentationState {
  const event = eventOf(previous, sim);
  return present(
    sim,
    followCamera(previous.camera, sim),
    flashOf(previous.flash, sim, event),
    event === 'RELEASE' ? stretch() : relax(previous.craft.deformation),
  );
}
