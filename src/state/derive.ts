/**
 * Simulation in, presentation state out. Once per tick, and once only.
 *
 * This is the layer ADR-0006 warns will quietly grow a dependency on the
 * renderer. It cannot: `pnpm portable` reads this directory and fails if it
 * reaches outside `src/sim/`.
 *
 * It is also where the simulation's numbers become the renderer's: heading and
 * speed instead of a velocity, a state instead of an index, an energy step
 * instead of a phase, a hue instead of a place in a list. The renderer never
 * asks the simulation a question — everything it draws is already an answer,
 * which is what makes a frame a pure function of `(recipe, tick)`.
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
 * ## The one memory that is a record rather than a decay
 *
 * **SPENT.** A body that has been held and let go stays finished for the rest of
 * the run, wherever the craft goes next, and spec
 * [04 · §3](../../docs/spec/04-bodies.md) is explicit that this is the point:
 * *"a field of spent bodies behind the craft is the run's scoreboard, drawn in
 * the world."* It is the first thing in this layer that never converges, and
 * that is worth naming rather than smuggling.
 *
 * ADR-0015's third rule does not reach it, and the reason is the shape of the
 * failure the rule guards against. **An eased value is a feedback loop**: it is
 * computed from itself every tick, so a wrong tick feeds the next one and the
 * error is self-sustaining unless something pulls it back. A latched event flag
 * is not a loop — it is a log of a release that either happened or did not, it
 * is never an input to its own next value, and there is no path by which it
 * drifts. What it can be is *wrong from the start*, and that is the same
 * exposure the recipe itself has: a picture that disagreed about which bodies
 * are spent disagreed about the run, not about the picture.
 *
 * It is stored as `state === 'SPENT'` on the previous tick's body rather than in
 * a set beside them, so there is exactly one place a body's state lives and
 * nothing to keep in step with it.
 *
 * ## What it remembers, and what it re-reads
 *
 * Everything else is read fresh from the simulation every tick — every position,
 * every energy, every hue, every reach test — so a disagreement in it cannot
 * survive to the next one. The **events** that place the decays are read from
 * the previous picture rather than from a flag the simulation raises: a grab is
 * a body being held that was not, and a release is the reverse. That keeps
 * `SIM_VERSION` still, which is the point — spec 00 §3's flash and spec 02 §4's
 * stretch are things the picture does, and a simulation that recorded them for
 * the picture's benefit would have put the glow in the recipe.
 */
import { headingOf, speedOf } from '../sim/craft.ts';
import type { SimState } from '../sim/types.ts';
import { energyOf, stateOf, tideOf } from './body.ts';
import { followCamera, openCamera } from './camera.ts';
import { compassOf } from './compass.ts';
import { advance, fade, place } from './decay.ts';
import { relax, stretch, UNDEFORMED } from './deformation.ts';
import { bloomOf, E3_BLOOM, E3_TICKS } from './energy.ts';
import { hueOf } from './identity.ts';
import { sightingsOf } from './sighting.ts';
import type {
  BodyState,
  BodyView,
  CameraView,
  DeformationView,
  Energy,
  FlashView,
  PresentationState,
} from './types.ts';

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

/**
 * The craft's step, and it never moves.
 *
 * Spec 00 §3 makes E2 *"craft baseline"* and Direction 01 says why: *"the craft
 * is the brightest object on screen, always. It carries no identity hue — the
 * player is not a target."* What varies is the radius, through the chain, and
 * never the step.
 */
const CRAFT_ENERGY: Energy = 2;

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
 * Whether a body has already been spent — see the header.
 *
 * A body released on the previous tick was `HELD` on it, so both readings of
 * "finished" are the same test, and nothing has to notice the release itself.
 */
function wasSpent(previous: BodyView | undefined): boolean {
  return previous !== undefined && (previous.state === 'SPENT' || previous.state === 'HELD');
}

function bodiesOf(sim: SimState, previous: readonly BodyView[] | null): BodyView[] {
  return sim.field.bodies.map((body, address) => {
    const before = previous?.[address];
    const held = address === sim.heldBody;
    const state = stateOf(body, sim.craft, held, wasSpent(before));
    const energy = energyOf(state);
    return {
      x: body.x,
      y: body.y,
      radius: body.radius,
      held,
      state,
      hue: hueOf(address),
      energy,
      bloom: bloomOf(energy),
      tide: tideOf(before?.tide ?? null, body, sim.craft, state),
    };
  });
}

function present(
  sim: SimState,
  camera: CameraView,
  flash: FlashView | null,
  deformation: DeformationView,
  previousBodies: readonly BodyView[] | null,
): PresentationState {
  const bodies = bodiesOf(sim, previousBodies);
  const states: BodyState[] = bodies.map((body) => body.state);

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
    bodies,
    corridor: {
      centreline: sim.field.corridor.centreline,
      halfWidth: sim.field.corridor.halfWidth,
    },
    flash,
    sightings: sightingsOf(sim.field.bodies, states, sim.craft, camera),
    compass: compassOf(sim),
  };
}

/**
 * The presentation at the first tick of a run.
 *
 * Everything that eases is placed here rather than eased into place, so a run
 * never opens by gliding in from wherever the last one left off — and nothing is
 * mid-decay, because a run that opened with a flash already fading would be
 * showing the player an event that never happened. Nothing is spent either: a
 * run opens with its scoreboard empty, however the last one ended.
 */
export function createPresentation(sim: SimState): PresentationState {
  return present(sim, openCamera(sim), null, UNDEFORMED, null);
}

/** The presentation one tick on. Call once per tick, in the same loop as `stepSim`. */
export function derive(previous: PresentationState, sim: SimState): PresentationState {
  const event = eventOf(previous, sim);
  return present(
    sim,
    followCamera(previous.camera, sim),
    flashOf(previous.flash, sim, event),
    event === 'RELEASE' ? stretch() : relax(previous.craft.deformation),
    previous.bodies,
  );
}
