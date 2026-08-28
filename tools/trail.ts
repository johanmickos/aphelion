/**
 * Walking a run: which tick a grab happened on, what the geometry was, and
 * where on the envelope a release fell.
 *
 * A recipe replays a run; this is what makes the replay something two people can
 * point at. The author says *"the grab feels late off the second body"* and this
 * says that the second body was grabbed on tick 812 at 412 units out, froze 21
 * ticks later and was let go of 55 ticks after that, on the plateau — so the
 * sentence and the run can be compared instead of remembered.
 *
 * **Everything here is read from outside the simulation.** `test/sim/swing.ts`
 * and `test/sim/run.ts` hold the same line and for the same reason
 * ([ADR-0013](../docs/adr/0013-carry-the-behaviour-re-derive-the-mechanism.md)):
 * a reading that requires reaching inside is the wrong reading, and a reader
 * welded to a field name forbids the refactor it should have survived. So the
 * geometry is measured from positions this file kept, the freeze's own clock is
 * counted here rather than read off the orbit, and the only questions asked of
 * the simulation are the two `swing.ts` and `run.ts` already allow themselves —
 * *is a body held* and *has the swing frozen* — which are questions about which
 * phase the swing is in rather than numbers out of a record.
 *
 * **The picture is walked beside the run**, which is the other half of the point.
 * ADR-0006 promises that a frame is a pure function of `(recipe, tick)`, and
 * since [ADR-0015](../docs/adr/0015-presentation-state-carries-what-decays.md)
 * presentation state is a recurrence — `derive(previous, sim)`, seeded by
 * `createPresentation` and evaluated exactly once per tick. So it is derived
 * here in the replay's own loop, from tick zero, and never on demand: arriving
 * at tick 412 is not the same as asking about it. That is what lets a trail say
 * where the camera was without a canvas ever having existed.
 */
import { createHash } from 'node:crypto';
import type { Dispatch } from './dispatch.ts';
import { floorRadius } from '../src/sim/body.ts';
import { speedOf } from '../src/sim/craft.ts';
import { distance, magnitude } from '../src/sim/math.ts';
import type { Recipe } from '../src/sim/recipe.ts';
import { pressAt } from '../src/sim/recipe.ts';
import { openRun, replayRun } from '../src/sim/replay.ts';
import { snapshot } from '../src/sim/snapshot.ts';
import type { Ending, SimState, Tick } from '../src/sim/types.ts';
import {
  BOOST_ARM_TICKS,
  BOOST_PLATEAU_TICKS,
  BOOST_ZERO_TICKS,
  SECONDS_PER_TICK,
} from '../src/sim/units.ts';
import { createPresentation, derive } from '../src/state/derive.ts';

/**
 * Where on the boost envelope a release fell — spec
 * [01 · §7](../docs/spec/01-swing.md)'s shape in words.
 *
 * Named rather than left as a tick count because the tick count means nothing
 * without the three thresholds beside it, and the whole reason to read a trail
 * is to compare it against a sentence somebody said out loud.
 */
export type EnvelopeBand = 'unarmed' | 'plateau' | 'decaying' | 'expired';

export function envelopeBand(sinceFreeze: number): EnvelopeBand {
  if (sinceFreeze < BOOST_ARM_TICKS) return 'unarmed';
  if (sinceFreeze <= BOOST_PLATEAU_TICKS) return 'plateau';
  if (sinceFreeze <= BOOST_ZERO_TICKS) return 'decaying';
  return 'expired';
}

/** One press and what came of it. */
export interface Swing {
  /** The tick the button went down. */
  readonly pressedAt: Tick;
  /**
   * The body it took, by `CONTEXT.md`'s **address** — its altitude number,
   * bottom to top — or `null` for a press nothing answered.
   */
  readonly address: number | null;
  /** How far from the body's centre the press happened. */
  readonly grabRadius: number;
  /** How fast the craft was going at it. */
  readonly approachSpeed: number;
  /** The tick the swing froze onto an orbit, or `null` if it never did. */
  readonly frozenAt: Tick | null;
  /** The closest the craft came to the body's centre. */
  readonly periapsis: number;
  /** That body's floor — the closest it was ever allowed to come. */
  readonly floor: number;
  /** How far the dive committed, from the grab toward the floor. */
  readonly depth: number;
  /** The tick the button came up, or `null` if the run ended still holding. */
  readonly releasedAt: Tick | null;
  /** Ticks between the freeze and the release — the envelope's own clock. */
  readonly sinceFreeze: number | null;
  readonly envelope: EnvelopeBand | null;
  /** How fast it left. */
  readonly exitSpeed: number | null;
}

/** What one particular tick was doing — the answer to "what happened at 1420?" */
export interface Moment {
  readonly tick: Tick;
  readonly phase: 'coasting' | 'diving' | 'orbiting';
  /** The address of the body held, or `null` while coasting. */
  readonly address: number | null;
  readonly sinceGrab: number | null;
  readonly sinceFreeze: number | null;
  readonly envelope: EnvelopeBand | null;
  readonly x: number;
  readonly y: number;
  readonly speed: number;
  /** Where the picture was looking, derived beside the run from tick zero. */
  readonly camera: { readonly x: number; readonly y: number };
}

export interface Trail {
  readonly recipe: Recipe;
  /** Ticks actually flown, which is fewer than the recipe's if the run ended. */
  readonly ticks: Tick;
  readonly ending: Ending | null;
  readonly swings: readonly Swing[];
  /** Presses nothing answered — spec 01 §3 counts 8 of them in 278. */
  readonly refused: number;
  /** How much altitude the run kept, in design units. */
  readonly climbed: number;
  /** The moments asked about, in the order they were asked for. */
  readonly moments: readonly Moment[];
  readonly craft: { readonly x: number; readonly y: number; readonly speed: number };
  readonly camera: { readonly x: number; readonly y: number };
  /** The final state's bytes, digested — what two replays are compared on. */
  readonly fingerprint: string;
}

/** The whole simulation state as one short string, for saying whether two agree. */
export function fingerprint(state: SimState): string {
  return createHash('sha256').update(snapshot(state)).digest('hex').slice(0, 16);
}

interface OpenSwing {
  pressedAt: Tick;
  address: number;
  grabRadius: number;
  approachSpeed: number;
  frozenAt: Tick | null;
  periapsis: number;
  floor: number;
}

/**
 * Fly the recipe and report what could be seen from outside it.
 *
 * `describe` names ticks worth a sentence of their own — the ones the author
 * flagged while flying, or one an agent is asking about.
 */
export function walkRun(recipe: Recipe, describe: readonly Tick[] = []): Trail {
  const wanted = new Set(describe);
  const opening = openRun(recipe);
  const bodies = opening.field.bodies;
  const spawn = opening.craft.y;

  let view = createPresentation(opening);
  // The craft as it was at the start of the tick being flown, so the geometry a
  // press is measured at is the geometry the press saw.
  let from = { x: opening.craft.x, y: opening.craft.y, vx: opening.craft.vx, vy: opening.craft.vy };
  let heldBefore: number | null = null;
  let pressedBefore = false;
  let highest = spawn;
  let refused = 0;
  let open: OpenSwing | null = null;
  const swings: Swing[] = [];
  const moments: Moment[] = [];

  const closeSwing = (
    swing: OpenSwing,
    releasedAt: Tick | null,
    exitSpeed: number | null,
  ): void => {
    const reach = swing.grabRadius - swing.floor;
    const sinceFreeze =
      swing.frozenAt === null || releasedAt === null ? null : releasedAt - swing.frozenAt;
    swings.push({
      pressedAt: swing.pressedAt,
      address: swing.address,
      grabRadius: swing.grabRadius,
      approachSpeed: swing.approachSpeed,
      frozenAt: swing.frozenAt,
      periapsis: swing.periapsis,
      floor: swing.floor,
      depth: reach > 0 ? Math.min(Math.max((swing.grabRadius - swing.periapsis) / reach, 0), 1) : 1,
      releasedAt,
      sinceFreeze,
      envelope: sinceFreeze === null ? null : envelopeBand(sinceFreeze),
      exitSpeed,
    });
  };

  const described = new Set<Tick>();
  const momentAt = (tick: Tick, state: SimState): Moment => {
    const held = state.heldBody;
    const sinceFreeze = open !== null && open.frozenAt !== null ? tick - open.frozenAt : null;
    return {
      tick,
      phase: held === null ? 'coasting' : state.orbit !== null ? 'orbiting' : 'diving',
      address: held === null ? null : held + 1,
      sinceGrab: open === null ? null : tick - open.pressedAt,
      sinceFreeze,
      envelope: sinceFreeze === null ? null : envelopeBand(sinceFreeze),
      x: state.craft.x,
      y: state.craft.y,
      speed: speedOf(state.craft),
      camera: { x: view.camera.x, y: view.camera.y },
    };
  };

  const final = replayRun(recipe, {
    onTick: (state, tick) => {
      // Once per tick, in the replay's own loop — ADR-0015's first rule, and the
      // reason the camera below is the camera the phone drew.
      view = derive(view, state);

      const pressed = pressAt(recipe.log, tick);
      if (pressed && !pressedBefore) {
        const took = state.heldBody;
        if (took === null) {
          // A press nothing answered. It stays spent: `stepSim` attempts a grab
          // on the edge only, so a refused press is a decision that missed
          // rather than a button that keeps trying.
          refused += 1;
        } else {
          const body = bodies[took]!;
          open = {
            pressedAt: tick,
            address: took + 1,
            grabRadius: distance(from.x, from.y, body.x, body.y),
            approachSpeed: magnitude(from.vx, from.vy),
            frozenAt: null,
            periapsis: Infinity,
            floor: floorRadius(body),
          };
        }
      }

      if (state.heldBody !== null && open !== null) {
        const body = bodies[state.heldBody]!;
        const radius = distance(state.craft.x, state.craft.y, body.x, body.y);
        if (radius < open.periapsis) open.periapsis = radius;
        if (state.orbit !== null && open.frozenAt === null) open.frozenAt = tick;
      }

      if (heldBefore !== null && state.heldBody === null && open !== null) {
        closeSwing(open, tick, speedOf(state.craft));
        open = null;
      }

      if (state.craft.y < highest) highest = state.craft.y;

      if (wanted.has(tick)) {
        moments.push(momentAt(tick, state));
        described.add(tick);
      }

      pressedBefore = pressed;
      heldBefore = state.heldBody;
      from = { x: state.craft.x, y: state.craft.y, vx: state.craft.vx, vy: state.craft.vy };
    },
  });

  // A run that ended while holding never let go, and the swing it died on is
  // still worth reporting: it is usually the one the author is talking about.
  if (open !== null) closeSwing(open, null, null);

  // **A flag on the death itself lands one tick past the last one flown**, and
  // it is the most natural thing in the world to flag: the loop above describes
  // ticks 0 to `final.tick - 1`, while the FLAG control stamps `sim.tick`, which
  // has already become `final.tick` by the time the run has an ending. So that
  // one is described from the state the run stopped in, rather than dropped for
  // an off-by-one nobody holding a phone could have known about.
  for (const tick of describe) {
    if (!described.has(tick) && tick === final.tick) moments.push(momentAt(tick, final));
  }

  return {
    recipe,
    ticks: final.tick,
    ending: final.ending,
    swings,
    refused,
    climbed: spawn - highest,
    moments,
    craft: { x: final.craft.x, y: final.craft.y, speed: speedOf(final.craft) },
    camera: { x: view.camera.x, y: view.camera.y },
    fingerprint: fingerprint(final),
  };
}

const seconds = (ticks: number): string => `${(ticks * SECONDS_PER_TICK).toFixed(1)}s`;
const num = (value: number, places = 0): string => value.toFixed(places);
const cell = (text: string, width: number): string => text.padStart(width);

/**
 * The trail as a table, in the shape `formatDiagReport` set: aligned, printed to
 * the terminal beside the file, and carrying no conclusion the numbers do not.
 */
export function formatTrail(trail: Trail): string[] {
  const r = trail.recipe;
  const out: string[] = [
    '',
    `  \x1b[1m▼ run · ${r.field.generator} field v${r.field.version} · seed ${r.seed} · ` +
      `${trail.ticks} ticks (${seconds(trail.ticks)})\x1b[0m`,
    `  \x1b[2m${r.log.length} edges · ${trail.swings.length} swings · ${trail.refused} refused · ` +
      `climbed ${num(trail.climbed)} · state ${trail.fingerprint}\x1b[0m`,
    '',
  ];

  if (trail.swings.length) {
    out.push(
      '  swing  press  body     grab  approach    froze  periapsis  depth   let go  since  ' +
        'envelope    exit',
    );
    trail.swings.forEach((swing, index) => {
      const froze = swing.frozenAt === null ? '—' : `+${swing.frozenAt - swing.pressedAt}`;
      out.push(
        `  ${cell(String(index + 1), 5)}  ${cell(String(swing.pressedAt), 5)}  ` +
          `${cell(`#${swing.address}`, 4)}  ${cell(num(swing.grabRadius), 7)}  ` +
          `${cell(num(swing.approachSpeed), 8)}  ${cell(froze, 7)}  ` +
          `${cell(num(swing.periapsis), 9)}  ${cell(num(swing.depth, 2), 5)}  ` +
          `${cell(swing.releasedAt === null ? 'held' : String(swing.releasedAt), 7)}  ` +
          `${cell(swing.sinceFreeze === null ? '—' : `+${swing.sinceFreeze}`, 5)}  ` +
          `${swing.envelope === null ? '—' : swing.envelope}`.padEnd(12) +
          `${cell(swing.exitSpeed === null ? '—' : num(swing.exitSpeed), 4)}`,
      );
    });
    out.push('');
  }

  for (const moment of trail.moments) {
    const where =
      moment.phase === 'coasting'
        ? 'coasting'
        : moment.phase === 'diving'
          ? `diving at #${moment.address}, ${moment.sinceGrab} ticks in`
          : `orbiting #${moment.address}, +${moment.sinceFreeze} since the freeze (${moment.envelope})`;
    out.push(
      `  \x1b[1mtick ${moment.tick}\x1b[0m (${seconds(moment.tick)})  ${where}` +
        `  ·  ${num(moment.speed)}/s at ${num(moment.x)}, ${num(moment.y)}` +
        `  ·  camera ${num(moment.camera.x)}, ${num(moment.camera.y)}`,
    );
  }
  if (trail.moments.length) out.push('');

  out.push(
    `  \x1b[1m${trail.ending ?? 'still flying'}\x1b[0m at tick ${trail.ticks}, ` +
      `${num(trail.craft.x)}, ${num(trail.craft.y)}, doing ${num(trail.craft.speed)}/s`,
  );
  out.push(
    '  \x1b[2mLengths and speeds are design units; ticks are the only clock (ADR-0006).\x1b[0m',
  );
  return out;
}

/**
 * A dispatch as the terminal should read it: who flew it and what they said,
 * then the run underneath.
 *
 * The provenance goes first because it is what the trail has to be read
 * *against* — a note about a swing that felt late is a claim, and the table
 * below it is the evidence. `describe` adds ticks to the ones the author already
 * flagged, which is how an agent asks about one they were told about.
 */
export function formatDispatch(dispatch: Dispatch, describe: readonly Tick[] = []): string[] {
  const device = dispatch.device;
  const out: string[] = [
    '',
    device
      ? `  \x1b[2mflown ${dispatch.at} · ${device.css.w}×${device.css.h} css · dpr ${device.dpr}\x1b[0m`
      : `  \x1b[2mrecorded ${dispatch.at}, not on a device\x1b[0m`,
  ];
  if (device) out.push(`  \x1b[2m${device.ua}\x1b[0m`);
  if (dispatch.observed.note) out.push(`  \x1b[1m“${dispatch.observed.note}”\x1b[0m`);
  return [
    ...out,
    ...formatTrail(walkRun(dispatch.recipe, [...dispatch.observed.ticks, ...describe])),
  ];
}
