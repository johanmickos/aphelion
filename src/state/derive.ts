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
import { floorRadius } from '../sim/body.ts';
import { bodyOnOffer } from '../sim/grab.ts';
import { arrivedTight, struckHard } from '../sim/tier.ts';
import { closingOf, energyOf, gripOf, spendingOf, stateOf, tideOf } from './body.ts';
import { arrived, fadeArrival } from './arrival.ts';
import { fadeKnock, knocked } from './knock.ts';
import { linger, struck } from './callout.ts';
import { followCamera, openCamera } from './camera.ts';
import { compassOf, takenRing } from './compass.ts';
import { advance, fade } from './decay.ts';
import { relax, stretch, UNDEFORMED } from './deformation.ts';
import { bloomOf, E3_BLOOM } from './energy.ts';
import { hueOf } from './identity.ts';
import { sightingsOf } from './sighting.ts';
import { bowOf, wakeOf } from './rung.ts';
import { anomalyOf } from './anomaly.ts';
import type {
  ArrivalView,
  BodyState,
  BodyView,
  CalloutView,
  CameraView,
  CompassView,
  DeformationView,
  Energy,
  FlashView,
  KnockView,
  PresentationState,
  WakeView,
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
 *
 * **Two things spend it now**, since M3.3: the craft's bloom radius, and the
 * **dust**'s density — spec 05 §2's *"density rises gently with chain level, a
 * hot run flies through a livelier field."* So it goes onto the state as well as
 * into `bloomOf`, and M4 wires it in one place rather than in two.
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
 * The one E3, aged toward nothing — and **nothing strikes one.**
 *
 * Spec [00 · §3](../../docs/spec/00-tokens.md) lists four users: *"release,
 * grab, award, the checkered line"*. Three of them have now been taken off it by
 * the author, each after flying it.
 *
 * The **release** and the **grab** went on 2026-08-29: *"the white dot that is
 * emitted when I grab is too noisy and too much... let's let the PLANET speak
 * about our grab, not some ambient glowing orbs."* Spec
 * [04 · §3](../../docs/spec/04-bodies.md) already had a held body at E2 and
 * alive, so the flash was a second voice on the same beat.
 *
 * The **award** went the same evening, and for the same reason one element
 * further on. Spec [06 · §2](../../docs/spec/06-awards.md) gives PERFECT energy
 * E3, so M2.4 spent the slot there — at the dot, under the word. Flown: *"there's
 * a weird white-ish blur circle that appears when I get 'perfect', in addition to
 * the yellow one beneath the text. I don't like that white one, let's remove it.
 * The text plus its own blur/glow and pop-up effect should be enough."* The word
 * already blooms in its own tier colour (spec 06 §4's 12px at PERFECT), so a
 * CORE-white additive flash under a SOLAR word was two glows arguing about the
 * same instant — which is the exact shape of the grab's complaint.
 *
 * **The slot stays**, because spec 00 §3's fourth user is the checkered line at
 * the crossing, and that is spec [12](../../docs/spec/12-finish.md)'s and M6's.
 * The ageing below is what it will decay through, and the one-alive-at-a-time
 * rule stays a shape the layer cannot express a violation of rather than a check
 * someone has to remember.
 */
function flashOf(previous: FlashView | null): FlashView | null {
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
  // Which body a press would take, asked once for the whole field rather than
  // per body — it is a comparison between bodies, not a property of one.
  const onOffer = sim.heldBody === null ? bodyOnOffer(sim.field, sim.craft) : null;

  return sim.field.bodies.map((body, address) => {
    const before = previous?.[address];
    const held = address === sim.heldBody;
    const state = stateOf(body, sim.craft, held, wasSpent(before));
    const grip = gripOf(body, sim.craft);
    const spending = spendingOf(before, state);
    // **A body on its way out is still lit**, which is what makes the going-out
    // something to draw rather than a state it has already reached. It burns at
    // what it burned at until it is out; the renderer fades that, and
    // `spendingOf` is what ends it.
    const energy = spending === null ? energyOf(state, grip) : energyOf('HELD', grip);
    const offered = address === onOffer && state !== 'SPENT';
    return {
      x: body.x,
      y: body.y,
      radius: body.radius,
      held,
      state,
      offered,
      grip,
      closing: closingOf(body, sim.craft),
      spending,
      hue: hueOf(address),
      energy,
      bloom: bloomOf(energy),
      tide: tideOf(before?.tide ?? null, body, sim.craft, state, offered),
      bow: bowOf(body),
    };
  });
}

function present(
  sim: SimState,
  camera: CameraView,
  worldSpeed: number,
  flash: FlashView | null,
  deformation: DeformationView,
  previousBodies: readonly BodyView[] | null,
  previousCompass: CompassView | null,
  callout: CalloutView | null,
  arrival: ArrivalView | null,
  knock: KnockView | null,
  wake: readonly WakeView[],
): PresentationState {
  const bodies = bodiesOf(sim, previousBodies);
  const states: BodyState[] = bodies.map((body) => body.state);
  const offered: boolean[] = bodies.map((body) => body.offered);

  return {
    tick: sim.tick,
    camera,
    worldSpeed,
    chain: CHAIN_UNBUILT,
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
      foot: sim.field.corridor.foot,
    },
    flash,
    sightings: sightingsOf(sim.field.bodies, states, offered, sim.craft, camera),
    compass: compassOf(previousCompass, sim),
    callout,
    arrival,
    knock,
    wake,
    anomaly: anomalyOf(sim.field, sim.craft.y),
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
  // The wake opens **empty**, not seeded from where the craft is standing: a run
  // that began with the rungs already parted would be showing a passage that has
  // not happened. ADR-0015's second rule, and the same reason nothing here is
  // mid-decay.
  // And **world speed opens at zero**, for the same reason: a rate needs two
  // ticks and there has only been one, so the first picture shows a world that
  // has not moved yet rather than one already sliding.
  return present(sim, openCamera(sim), 0, null, UNDEFORMED, null, null, null, null, null, []);
}

/**
 * What the swing was worth on the tick the button came up.
 *
 * **Read off the previous picture, not off this one.** By the time `derive` runs,
 * [`release`](../sim/release.ts) has already cleared the orbit, so
 * [`qualityOf`](../sim/quality.ts) would answer zero for every release ever
 * made. The number that was actually paid is the one that stood at the end of the
 * previous tick, which is exactly what the compass carried — the same value the
 * flown arc was lighting a moment ago, so what the player was shown and what the
 * punch is scaled by are one number and not two.
 */
function qualityBehind(previous: PresentationState): number {
  return previous.compass?.envelope ?? 0;
}

/**
 * The word this release earned, or the one already in the air, one tick older.
 *
 * **One slot, and a new word takes it.** Spec 06 §4: *"queueing is structural:
 * one release, one word"* — so two can never fight over an instant, which is the
 * same argument and the same shape as the single E3. Its *"a new callout snaps
 * the previous one to its decay tail"* is the softer version of this and wants
 * the streaks it is written beside; those are spec 08's and M4's.
 *
 * A **miss** does not clear the word already in the air. Spec 06 §5 gives a miss
 * silence and ADR-0008 makes it *"a debt, not a loss"* — taking down the previous
 * release's word would be a punishment, which silence is precisely not.
 */
function calloutOf(
  previous: PresentationState,
  event: Event,
  camera: CameraView,
): CalloutView | null {
  if (event === 'RELEASE' && previous.compass !== null) {
    const word = struck(
      takenRing(previous.compass.rings),
      previous.compass.x,
      previous.compass.y,
      camera,
    );
    if (word !== null) return word;
  }
  return linger(previous.callout);
}

/**
 * The word a capture earned, or the one already in the air, one tick older.
 *
 * **Struck at the freeze**, because that is the tick the closest approach becomes
 * a fact: before it the dive is still falling, and after it the craft is on a
 * fixed orbit and cannot get nearer. The freeze is read from the simulation the
 * way every other event here is — a thing that is true this tick and was not last
 * tick — so nothing has to be recorded for the picture's benefit and
 * `SIM_VERSION` stays where it is.
 *
 * And placed **where the craft is on that tick**, which is the closest approach
 * itself: the place that earned it, exactly as a release's word is born at the
 * dot that earned it (spec 06 §4).
 */
function arrivalOf(previous: PresentationState, sim: SimState): ArrivalView | null {
  const orbit = sim.orbit;
  if (orbit !== null && orbit.ticksSinceFreeze === 0 && sim.heldBody !== null) {
    const body = sim.field.bodies[sim.heldBody]!;
    if (arrivedTight(orbit.periapsis, floorRadius(body), orbit.aim, orbit.entrySpeed))
      return arrived(sim.heldBody, sim.craft.x, sim.craft.y);
  }
  return fadeArrival(previous.arrival);
}

/**
 * The word a hard landing earned, or the one before it a tick older.
 *
 * **Struck while the dive is still flying**, which is the whole difference
 * between this and the arrival: an arrival is a verdict on a dive that has
 * finished, and a knock is a thing that is happening. The tick it is said on is
 * the tick the floor took the speed, so the word lands with the kink rather than
 * after it.
 *
 * Read off [`Dive.knock`](../sim/dive.ts), which the simulation writes fresh each
 * tick — so this is the same *true now and not last tick* reading every other
 * event in this file makes, and nothing is recorded for the picture's benefit.
 * Its **aim** and **entry speed** go with it, because a knock is a hard landing
 * *by a craft that was pointed at the body* and the share alone turned out not to
 * say that ([`struckHard`](../sim/tier.ts), 2026-09-01). All three are already on
 * the dive; none is recorded for this.
 *
 * Placed where the craft is, which is on the floor: the point of contact, and the
 * place that earned it.
 */
function knockOf(previous: PresentationState, sim: SimState): KnockView | null {
  const dive = sim.dive;
  if (dive !== null && struckHard(dive.knock, dive.aim, dive.entrySpeed)) {
    return knocked(sim.tick, sim.craft.x, sim.craft.y);
  }
  return fadeKnock(previous.knock);
}

/** The presentation one tick on. Call once per tick, in the same loop as `stepSim`. */
export function derive(previous: PresentationState, sim: SimState): PresentationState {
  const event = eventOf(previous, sim);
  // **The camera first**, because the word is held inside the design space and
  // the design space is wherever the camera is looking (spec 00 §7). Deriving it
  // from the *previous* camera would put the word a tick behind the picture it is
  // being kept inside, which is visible exactly where it matters — at the edge.
  const camera = followCamera(previous.camera, sim);
  const callout = calloutOf(previous, event, camera);
  return present(
    sim,
    camera,
    // **World speed is the camera's own step, not the craft's** — see
    // [`PresentationState.worldSpeed`](./types.ts), which carries the
    // measurement saying the two are a tenth of each other through an orbit.
    // Positive while climbing, because design `y` falls as altitude rises.
    previous.camera.y - camera.y,
    flashOf(previous.flash),
    // The **punch**, and it is the craft that carries it: quality decides how far
    // the stretch goes and how long it takes coming home. See
    // [`punch.ts`](./punch.ts) for why the camera's share of it was withdrawn.
    event === 'RELEASE' ? stretch(qualityBehind(previous)) : relax(previous.craft.deformation),
    previous.bodies,
    previous.compass,
    callout,
    arrivalOf(previous, sim),
    knockOf(previous, sim),
    wakeOf(previous.wake, sim),
  );
}
