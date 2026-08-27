/**
 * Capture lifecycle: grab, freeze, release.
 *
 * Ported verbatim from the prototype's `beginCapture`, `freezeOrbit` and
 * `releaseHeld`. Behaviour and arithmetic are unchanged.
 *
 * WHY IT IS SHAPED THIS WAY
 *
 * The capture took 16+ failed attempts. The tension: gravity has to catch and
 * reel you in so it feels physical, let you whip around into an eccentric oval,
 * then optionally circularise — with the tightness of that final orbit
 * controllable, and without the motion ever looking rigid, snapping, or clipping
 * the surface.
 *
 * What finally worked was refusing to author any of it as one quantity. Three
 * separate concerns:
 *
 *   clearance  do not hit the surface — one minimal early nudge lifting periapsis
 *              to the minimum orbit radius, and nothing else
 *   shape      the oval, which is pure gravity. The dive is simulated and nothing
 *              authors it
 *   tightness  how tight the settled orbit ends up, applied at the SETTLE and
 *              never at the approach
 *
 * Nothing touches the approach. That decoupling is why `freezeOrbit` exists at
 * all: the dive is real, and only once it reaches periapsis does anything
 * authored take over.
 *
 * Rejected, and expensive to rediscover: rigid or snapped orbit insertion. That
 * was the entire 16-failure saga. Keep it simulated.
 *
 * Note that tightness therefore follows the DEPTH of the dive —
 * `(grabR - rPeri) / span` — not the quality of the aim. The prototype's design
 * document claimed the opposite; that mechanic was never implemented. See
 * docs/PORT_NOTES.md note 17.
 */
import type { SimConfig } from './config.ts';
import type { AuthoredOrbit, Body, Capture, GrabResult, SimState } from './types.ts';
import {
  circSpeed,
  clearanceDelta,
  clearanceDv,
  escapeSpeed,
  hypot,
  naturalPeriapsis,
  predictedCaptureOrbit,
} from './orbit.ts';
import { fieldBounds, runInBand } from './world.ts';

export type { GrabResult } from './types.ts';

/**
 * Is the ship inside the run-in carpet?
 *
 * Asked of the SHIP and not of a resolved world position, because a capture is
 * already running whenever the two differ and this is only ever consulted on a
 * press that is not already holding one.
 */
function inRunInCarpet(state: SimState, cfg: SimConfig): boolean {
  const band = runInBand(cfg, fieldBounds(cfg, state.bodies));
  return band !== null && state.ship.y >= band.top && state.ship.y <= band.bottom;
}

/**
 * Index of the body a press would take. Returns -1 if there are none.
 *
 * `lead` seconds of the ship's own velocity are added to its position before the
 * distances are compared, so the question asked is "which body am I arriving at"
 * rather than "which body am I beside". At lead 0 this is exactly nearest-body,
 * which is what the prototype did and what PROTOTYPE_CONFIG still asks for.
 *
 * The lead is deliberately not a cone, a heading test, or a closing-speed rule.
 * Those all need a threshold, and a threshold is a cliff the player falls off:
 * a body drifts from "behind me" to "ahead of me" through an arbitrary line.
 * Displacing the query point is continuous in both position and velocity, and it
 * costs nothing at rest — a ship that is not moving has no next planet, and gets
 * the nearest one.
 *
 * `skip` excludes exactly one body by index, which is the same reasoning wearing
 * different clothes: "the one I just let go of" is a fact, not a threshold, so it
 * cannot drift across a line. See `SimState.cameFrom`.
 */
export function nearestBody(
  state: SimState,
  lead = 0,
  skip = -1,
  allow: ((i: number) => boolean) | null = null,
): number {
  const x = state.ship.x + state.ship.vx * lead;
  const y = state.ship.y + state.ship.vy * lead;
  let best = -1;
  let bd = 1e9;
  for (let i = 0; i < state.bodies.length; i++) {
    if (i === skip) continue;
    if (allow && !allow(i)) continue;
    const p = state.bodies[i]!;
    const d = hypot(x - p.x, y - p.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * Crash-cone severity in 0..1: the ship's heading ray intersects the body's
 * circle, and it is close enough that recovery is no longer offered.
 *
 * NOTE: the ray is a straight line but the real path curves under gravity, so
 * this over-warns on dives that would capture cleanly. Reproduced faithfully;
 * making it gravity-aware is PORT_NOTES note 1.
 *
 * The severity this returns only reaches the refusal threshold below
 * `crashConeSeverityFloor`; the prototype's floor of 0.4 sits above it and so
 * suppresses the distance term entirely. See the note on that key in config.ts
 * for what that measured out to.
 */
export function crashCone(cfg: SimConfig, state: SimState, body: Body): number {
  const { ship } = state;
  const rx = ship.x - body.x;
  const ry = ship.y - body.y;
  const d = hypot(rx, ry);
  if (d > body.R + cfg.crashConeRange) return 0;
  const spd = hypot(ship.vx, ship.vy);
  if (spd < 1) return 0;
  const hx = ship.vx / spd;
  const hy = ship.vy / spd;
  const b = rx * hx + ry * hy;
  const c = rx * rx + ry * ry - body.R * body.R;
  const disc = b * b - c;
  if (disc < 0) return 0;
  const t = -b - Math.sqrt(disc);
  if (t <= 0) return 0;
  const closeF = 1 - (d - body.R) / Math.max(1, cfg.crashConeRange);
  return Math.max(0, Math.min(1, Math.max(cfg.crashConeSeverityFloor, closeF)));
}

export function inCrashCone(cfg: SimConfig, state: SimState, body: Body): boolean {
  return crashCone(cfg, state, body) > 0.35;
}

/**
 * The body a grab would take right now, and why it would be refused if it would.
 *
 * Factored out of `beginCapture` so that "a grab was on offer" has exactly one
 * definition — a second copy of these four tests would drift from this one the
 * first time either moved. It was written for the scorer, which used to ask on
 * every drifting tick because coasting past a planet cost points; that penalty
 * is gone, and this is now the grab path's own answer.
 *
 * Note the targeting rule is part of the answer, not an implementation detail: a
 * press takes ONE body, so a reachable planet that is not that one was never
 * actually on offer.
 */
export function grabTarget(state: SimState, cfg: SimConfig): { index: number; result: GrabResult } {
  // ---- above the last planet the button stops meaning grab
  //
  // FIRST, BEFORE THE TANK IS EVEN CHECKED, because this is not a refusal and does
  // not want to queue behind one. A carve costs no fuel and asks for no body.
  //
  // IT HAD TO BE A RULE RATHER THAN AN EMERGENCE, and the measurement is the
  // argument. `grabRange` and `finishFunnelDepth` are both 560, so the last planet
  // is within reach from EVERY point of the carpet — a press anywhere in the
  // run-in took it, which meant the carve could never fire once in ordinary play.
  // The two keys are independent and their agreeing is a coincidence, but the
  // shape of the problem is not: the carpet begins at the crest, so the only body
  // it can ever offer is the one already behind you.
  //
  // And grabbing backwards at the finish is not a manoeuvre anyone wants. The
  // approach to the last planet is untouched — it happens BELOW the crest, outside
  // this band — so what is given up is a slingshot off a planet you have already
  // passed, and what is bought is a stretch where the one button you have does the
  // one thing left to do.
  if (cfg.carpetCarve > 0 && inRunInCarpet(state, cfg)) {
    return { index: -1, result: 'carved' };
  }
  if (state.fuel <= 0.5) return { index: -1, result: 'refused-no-fuel' };
  const pi = state.chargedT > 0 ? chargedTarget(state, cfg) : nearestBody(state, cfg.grabLeadTime);
  if (pi < 0) return { index: -1, result: 'refused-no-body' };
  const p = state.bodies[pi]!;
  if (cfg.grabRange > 0) {
    const reach = hypot(state.ship.x - p.x, state.ship.y - p.y);
    if (reach > cfg.grabRange) return { index: -1, result: 'refused-out-of-range' };
  }
  if (inCrashCone(cfg, state, p)) return { index: -1, result: 'refused-crash-cone' };
  return { index: pi, result: 'captured' };
}

/**
 * Targeting inside a charged window: throw the web FORWARD.
 *
 * Reported as "when we have our anomaly charged, it should never grab the same
 * planet that the player is coming from — it should really feel like Spider-Man
 * sending sticky web forward and pulling us ahead."
 *
 * Excluding the body just released from is necessary and was not sufficient.
 * Measured on the session that reported it: of five presses in one window, three
 * zipped straight back onto the planet just left. Excluding it fixed one of the
 * three and the ship then walked DOWN the field instead — P17, P18, P19, P18,
 * P17 — because after a release the neighbour behind is routinely the nearest
 * thing there is. On both of those backward grabs there were two bodies above and
 * within range, so preferring upward would have redirected them and refused
 * nothing.
 *
 * A PREFERENCE, NOT A GATE, and that distinction is the whole design. `nearestBody`
 * records why a heading cone was refused: a threshold is a cliff the player falls
 * off. Here nothing is ever forbidden — if there is no takeable body ahead, the
 * ordinary nearest one is still offered, minus the one you came from. So the rule
 * can never waste a press or make a window run out on a refusal; it only decides
 * WHICH body a press takes when there is a genuine choice.
 *
 * "Forward" is up, which is not an arbitrary axis in this game: the field is a
 * vertical climb, the score pays for altitude, and falling behind the trailing
 * floor is what ends a run.
 */
function chargedTarget(state: SimState, cfg: SimConfig): number {
  const from = state.cameFrom;
  // Only bodies that would actually be taken if chosen — range and the crash cone
  // included. Without that a preferred body sitting just out of reach would refuse
  // the press while a perfectly good one behind it went unoffered.
  const takeable = (i: number): boolean => {
    const b = state.bodies[i]!;
    if (cfg.grabRange > 0 && hypot(state.ship.x - b.x, state.ship.y - b.y) > cfg.grabRange) {
      return false;
    }
    return !inCrashCone(cfg, state, b);
  };
  const ahead = nearestBody(
    state,
    cfg.grabLeadTime,
    from,
    (i) => state.bodies[i]!.y < state.ship.y && takeable(i),
  );
  if (ahead >= 0) return ahead;
  // Nothing ahead worth taking. Fall back to the ordinary rule, still without the
  // body just released from — a backward grab is a poor outcome, a zip straight
  // back where you started is a wasted one.
  return nearestBody(state, cfg.grabLeadTime, from);
}

/**
 * Attempt a grab.
 *
 * A grab is blocked only when the tank is truly empty: entering an orbit and
 * slingshotting off must always be possible, because that is the core loop.
 * Only circularizing costs fuel.
 *
 * Still open: a near-stationary grab from a distance is still reeled in. That is
 * physically correct but can feel like the ship crawled over to the planet rather
 * than being caught by it. A minimum-approach-energy gate would let genuinely
 * dead grabs drift past instead.
 */
export function beginCapture(state: SimState, cfg: SimConfig): GrabResult {
  const { index: pi, result } = grabTarget(state, cfg);
  if (pi < 0) return result;
  const p = state.bodies[pi]!;

  const { ship } = state;
  const rx = ship.x - p.x;
  const ry = ship.y - p.y;
  const vx = ship.vx;
  const vy = ship.vy;
  const minR = p.R + cfg.minOrbitGap;
  const grabR = hypot(rx, ry);
  const r = grabR;
  const spd = hypot(vx, vy);
  const rhx = rx / r;
  const rhy = ry / r;
  const vrad = vx * rhx + vy * rhy;
  const inb = Math.max(0, -vrad / Math.max(spd, 1));

  // A flyby is an unbound grab (at or above escape speed, so gravity cannot hold
  // it) or one already moving outward with no periapsis ahead. Gravity still
  // bends the path; holding burns fuel to brake it into a capture.
  const vEsc = escapeSpeed(cfg, r);
  const bound = spd < vEsc * 0.98;
  const movingOutward = vrad > 0;
  // A bound ship is coming back whatever direction it happens to be pointing —
  // but "coming back" can mean ten seconds and half a field away, and a capture
  // that cannot reach its own periapsis before the wall is not a capture. Above
  // `outboundFlybyFrac` of escape speed an outbound grab is a flyby, so holding
  // brakes it round instead of coasting free and silent. See the key's own note.
  const unreachable = movingOutward && spd > cfg.outboundFlybyFrac * vEsc;
  const isFlyby = cfg.boundGrabsCapture
    ? !bound || unreachable
    : !bound || (movingOutward && inb < 0.02);

  const cap: Capture = {
    phase: isFlyby ? 'flyby' : 'clear',
    planet: pi,
    rx,
    ry,
    vx,
    vy,
    grabR,
    minR,
    prevR: grabR,
    prevDR: 0,
    passedPeri: false,
    brakeSpent: 0,
    settleSweep: 0,
    refuel: 0,
    settleDur: 0,
    approachR0: 0,
    approachVR: 0,
    periR: grabR,
    apoR: grabR,
    clearFramesLeft: 0,
    clearDvx: 0,
    clearDvy: 0,
    whipE: undefined,
    orbit: null,
    theta: 0,
    phaseSpeed: 0,
    phaseSpeedReal: 0,
    phaseMul: 1,
    Lfrozen: undefined,
    rPeri: 0,
    settleT: 0,
    settleProgress: 0,
    tightness: 0,
    boostFull: 0,
    boost: 0,
    boostT: 0,
    zipped: false,
    puttered: false,
    fuelSpent: 0,
    fuelBack: 0,
    escapeSide: 0,
    escaped: false,
    // Seeded from the VELOCITY angle, which is what updateDefl compares against.
    // index.html seeded it from the position angle, so the first sample of every
    // capture reported the angle between position and velocity — ~160° on a
    // typical grab — and the SMOOTH/KINK pill read "1 KINK" on every run
    // including perfectly clean ones. PORT_NOTES note 6. Telemetry only, so the
    // equality gate (position · velocity · fuel · phase) does not observe it.
    lastAngle: Math.atan2(vy, vx),
    defl: 0,
  };

  // An anomaly catches you where you are.
  //
  // There is no dive to fly and no flyby to brake: the press IS the arrival, and
  // the authored approach carries the ship onto the circle from whatever it
  // happened to be doing. Everything that used to sit between the press and the
  // parked orbit was waiting, and it was most of the wall clock — measured on two
  // phone sessions, 2.47s and 4.55s from press to parked, of which the settle the
  // anomaly authors is 0.45. The rest was 1.9-2.1s of braking (60+ fuel) and up to
  // 2.0s of falling. Reported both times as taking too long to be enjoyable, and
  // the second report named the target: about half a second.
  //
  // Nothing here grades the approach, which is the same reason `freezeOrbit` hands
  // an anomaly full tightness: the hard part was aiming the release that got the
  // ship inside the barrier, and that has already been paid for.
  //
  // `isFlyby` is computed above and then deliberately ignored here, including the
  // `unreachable` carve-out that note 40 added. That rule exists because a bound
  // grab already climbing away cannot reach its own periapsis before the wall
  // does, and a capture is only real once it converts at periapsis. An anomaly has
  // no periapsis to reach — the press is the conversion — so the failure it
  // guards against cannot happen here, at any speed or heading. It still governs
  // every planet, which is every body the rule was measured on.
  // An authored arrival: the anomaly's own, or one a `zip` charge buys.
  //
  // The charge is spent here and nowhere else, so every future source of one —
  // a pickup, a streak reward — gets this behaviour for free. An anomaly does not
  // spend a charge: it authors its own arrival and always has.
  const authored: AuthoredOrbit | null = p.traits.authored ?? zipOrbit(state, cfg, cap, p);
  if (authored) {
    freezeOrbit(cap, cfg, authored);
    // Zipped means the arrival was BOUGHT rather than authored by the body. A body
    // that authors its own orbit was always going to glide you in; a charge is what
    // buys that glide anywhere else, and only the second is a hop.
    cap.zipped = p.traits.authored === null;
    cap.phase = 'settle';
    // The swing has happened, as far as anything downstream is concerned: the
    // grab award is owed, and a release from here is a release from a real orbit.
    // Also what stops the periapsis detector — which never runs now — from ever
    // freezing this capture a second time.
    cap.passedPeri = true;
  } else if (!isFlyby || cfg.clearanceOnFlyby) {
    // A flyby gets this too, and the reason is the floor pin: `applyClearance`
    // exists to stop a dive reaching the minimum-orbit floor, and gating it on
    // conversion gated it behind the very thing a stalled flyby cannot do. It is
    // a no-op unless the natural periapsis is already inside the floor, so the
    // flybys that would have sailed clear anyway do not notice. See
    // `clearanceOnFlyby`.
    applyClearance(cap, cfg);
  }

  state.capture = cap;
  return 'captured';
}

/**
 * The orbit a spent `zip` charge glides onto, or null if there is no charge.
 *
 * Not authored by anything: it is the orbit the DIVE would have reached, which is
 * the curve the compass already previews while diving. So a zip is a shortcut to
 * where the ship was going rather than a different destination — aim still decides
 * how tight the orbit is, and the end state is the one an ordinary capture
 * converges to anyway.
 *
 * The period is the true circular one at that radius, so what the ship is left in
 * is a physically correct orbit and not an authored pace. `settleSweep` then
 * carries exactly what `stepPhase` would have eased toward on its own.
 *
 * Gated on the charged window rather than on a resource. There is nothing to
 * spend and nothing to run out of: inside the window every grab zips, and how
 * many you get is a question about how fast you fly, not about a counter.
 */
function zipOrbit(state: SimState, cfg: SimConfig, cap: Capture, body: Body): AuthoredOrbit | null {
  if (cfg.zipDur <= 0 || state.chargedT <= 0) return null;
  // One orbit for every hop, whatever the approach was.
  //
  // It used to be the orbit the dive WOULD have reached —
  // `max(minR, predictedCaptureOrbit().periapsis)` — on the reasoning in note 47
  // that aim should still decide where the ship ends up. Measured across 108,000
  // approach geometries that is not a gradient, it is a lottery: 43% pin exactly
  // at `minR` and the top quartile sits 3.1x to 8.1x above it, a spread of 0 to
  // 330px. Reported as "I sometimes got high orbits and sometimes low".
  //
  // A frenzy is a rhythm, and a rhythm needs every beat to be the same. Absolute
  // rather than a multiple of `minR`, so height AND period are literally
  // identical on every body — which is how an anomaly already authors its own
  // rest stop (the anomaly's authored `orbitR`), and the reason that reads as a place rather than
  // as a result.
  //
  // Clamped above `minR` because a body big enough would otherwise put this orbit
  // underground: bodies run R 34-56, so `minR` reaches 68 against this 90, and a
  // future larger body must not silently start orbiting inside itself.
  const r =
    cfg.chargedOrbitR > 0
      ? Math.max(cap.minR, cfg.chargedOrbitR)
      : Math.max(
          cap.minR,
          predictedCaptureOrbit(cfg, cap.rx, cap.ry, cap.vx, cap.vy, cap.minR).periapsis,
        );
  if (!Number.isFinite(r) || r <= 0) return null;
  void body;
  return {
    orbitR: r,
    orbitPeriod: (Math.PI * 2 * r) / Math.max(1e-6, circSpeed(cfg, r)),
    refuel: 0,
    settleDur: cfg.zipDur,
  };
}

/**
 * The clearance impulse: the minimum tangential nudge that lifts the natural
 * periapsis clear of the surface, spread over `clearEaseFrames` so it never reads
 * as a snap.
 *
 * Separated out because a capture can begin two ways — directly, or by a flyby
 * being braked into one — and both need it. Only the first had it.
 */
export function applyClearance(cap: Capture, cfg: SimConfig): void {
  if (naturalPeriapsis(cfg, cap.rx, cap.ry, cap.vx, cap.vy) >= cap.minR) return;
  // The cap matches the test that decided this was a capture in the first place.
  // A nudge that pushes the ship back over that line has undone the classification
  // it was invoked to serve.
  const dv = cfg.clearanceEnergyNeutral
    ? clearanceDelta(
        cfg,
        cap.rx,
        cap.ry,
        cap.vx,
        cap.vy,
        cap.minR,
        escapeSpeed(cfg, hypot(cap.rx, cap.ry)) * 0.98,
      )
    : clearanceDv(cfg, cap.rx, cap.ry, cap.vx, cap.vy, cap.minR);
  cap.clearDvx = dv.dvx / cfg.clearEaseFrames;
  cap.clearDvy = dv.dvy / cfg.clearEaseFrames;
  cap.clearFramesLeft = cfg.clearEaseFrames;
}

/**
 * Freeze the orbit at periapsis and hand the ship to the phase clock.
 *
 * The frozen ellipse must pass through the ship's actual position and treat that
 * position as periapsis (velocity there is purely tangential, so this radius is
 * the low point). Eccentricity comes from the dive's conserved energy rather than
 * instantaneous speed, because a floor clamp on a head-on dive craters the latter
 * and would flatten the oval into a circle.
 */
export function freezeOrbit(cap: Capture, cfg: SimConfig, authored?: AuthoredOrbit | null): void {
  const { rx, ry, vx, vy } = cap;
  const r = hypot(rx, ry);
  const spd = hypot(vx, vy);
  const L = rx * vy - ry * vx;
  const dir = Math.sign(L) || 1;
  const posAng = Math.atan2(ry, rx);

  const rPeri = r;
  const vc = circSpeed(cfg, rPeri);
  let vPeriTrue =
    cap.whipE !== undefined ? Math.sqrt(Math.max(0, 2 * (cap.whipE + cfg.GM / rPeri))) : spd;
  vPeriTrue = Math.max(vPeriTrue, spd);
  let e = Math.max(0, (vPeriTrue * vPeriTrue) / (vc * vc) - 1);
  e = Math.min(e, 0.6);
  const a = rPeri / (1 - e);

  cap.orbit = { a, e, argp: posAng, dir };
  cap.theta = posAng;
  cap.rPeri = rPeri;

  // Seam continuity: seed the sweep rate from the true periapsis speed the dive
  // earned, so a floor-clamped velocity does not start the settle too slow.
  cap.phaseSpeedReal = vPeriTrue / rPeri;
  cap.phaseSpeed = cap.phaseSpeedReal;
  cap.phaseMul = 1;
  cap.settleT = 0;

  const span = Math.max(1, cap.grabR - cap.minR);
  cap.tightness = Math.max(0, Math.min(1, (cap.grabR - cap.rPeri) / span));

  // A body may author the orbit a capture settles into, instead of inheriting it
  // from the dive. `rPeri` is the circle the settle tightens toward — which is
  // what the compass, the release solver and the renderer all already read it as
  // — so overriding it here authors the radius everywhere at once, with no second
  // quantity to keep in step. The ellipse itself is left honest, still passing
  // through the ship's real position, so the handover has nothing to jump.
  //
  // `Lfrozen` is the exception: it is the only consumer that wants `rPeri` as a
  // PHYSICAL periapsis. Computed here from the true radius rather than lazily
  // from the overridden one.
  cap.Lfrozen = cap.phaseSpeedReal * rPeri * rPeri;
  cap.settleDur = cfg.settleDur;
  if (authored) {
    // Nothing computed above survives an authored orbit, and that is the point.
    //
    // The ellipse existed to carry the shape the dive earned, and this capture
    // has no dive: it froze at the press, where the ship is usually still falling
    // and `vPeriTrue`'s whole premise — that the velocity here is tangential — is
    // false. So the state at the press becomes the near boundary of a glide, and
    // the authored circle the far one. See `stepPhase`.
    //
    // The seam is continuous in position AND velocity by construction: at u=0 the
    // glide is at this radius closing at this rate, and the sweep starts at the
    // angular rate the ship arrived with. Before this the settle began at
    // `vPeriTrue` however fast the ship really was, which is what a phone capture
    // reported as "snapping" — 179px/s arriving, 335 on the next tick.
    const vrad = (rx * vx + ry * vy) / r;
    const angRate = Math.abs(L) / (r * r);
    cap.approachR0 = r;
    cap.approachVR = vrad;
    cap.phaseSpeedReal = angRate;
    cap.phaseSpeed = angRate;
    cap.Lfrozen = Math.abs(L);
    cap.rPeri = authored.orbitR;
    // The drawn curve is the DESTINATION from the press onward. A ship spiralling
    // in has no ellipse to preview, and the circle it is heading for is both the
    // useful thing to show and true within half a second. `orbit` is read for a
    // curve to draw and for the release solver's target — never for the ship's
    // own path, which `stepPhase` computes.
    cap.orbit = { a: authored.orbitR, e: 0, argp: posAng, dir };
    cap.settleSweep = (Math.PI * 2) / Math.max(0.01, authored.orbitPeriod);
    cap.refuel = authored.refuel;
    cap.settleDur = authored.settleDur;
    // Full credit, always. Measured, an arrival four ticks late took `tightness`
    // from 1.00 to 0.20 and `boostFull` from 60 to 0 — the whole payoff of the
    // hardest commitment in the game decided by a lottery at the end of a blind
    // four-second coast. A rest stop does not grade the approach.
    cap.tightness = 1;
  }

  const over = Math.max(0, (cap.tightness - cfg.boostThreshold) / (1 - cfg.boostThreshold));
  cap.boostFull = cfg.boostMax * over;
  cap.boost = 0;
  cap.boostT = 0;
}

/** What a release handed back to the world, for telemetry. */
export interface ReleaseOutcome {
  boostApplied: number;
  weak: boolean;
}

/**
 * Release: hand a real velocity vector back to the world.
 *
 * The boost splits into a small permanent carry baked into velocity plus a
 * punchy transient burst that decays during drift — so escape feels sharp up
 * front then settles to a modest lasting gain, rather than a permanent add that
 * ratchets the ship faster forever.
 *
 * A weak release (puttered out of fuel mid-circularization) earns no boost and
 * is damped: the ship gives up and drifts off unenthusiastically.
 *
 * An ESCAPE fling rides alongside the boost and is paid on different terms — see
 * `SimConfig.escapeFling`. It is what a rescue out of the dead zone is worth in
 * speed, and it survives both a weak release and a flyby, neither of which earns
 * a boost.
 */
export function releaseCapture(state: SimState, cfg: SimConfig, weak: boolean): ReleaseOutcome {
  const cap = state.capture;
  if (!cap) return { boostApplied: 0, weak };
  const body = state.bodies[cap.planet]!;

  // Where the ship is leaving from, so a charged press cannot reel it straight
  // back. Recorded on EVERY release, weak ones included: a putter-out leaves you
  // beside the body just as surely as a good release does.
  state.cameFrom = cap.planet;

  const earned = !weak && cap.orbit !== null && cap.passedPeri && cap.phase !== 'flyby';
  const add = earned ? cap.boost || 0 : 0;

  // Fuel back for capturing well. Read the envelope fraction BEFORE the capture
  // is torn down below, and pay only on `earned` — the same test the boost
  // itself is gated on, so a putter-out, a flyby and a tap that never reached
  // periapsis all refund nothing, exactly as they earn no boost.
  if (earned && cfg.linkFuelReward > 0 && cap.boostFull > 0) {
    const peakFrac = Math.max(0, Math.min(1, cap.boost / cap.boostFull));
    state.fuel = Math.min(cfg.fuelMax, state.fuel + cfg.linkFuelReward * peakFrac);
  }
  // Leaving a rest stop leaves you charged.
  //
  // Opened at the RELEASE, not at the grab: converting the flyby, settling and
  // waiting for a release angle costs 1.5-2s that would otherwise burn a third of
  // the window inside an orbit going nowhere — and would mean holding a tighter,
  // better orbit actively cost you window. Starting here makes `chargedSecs` the
  // number the player experiences.
  //
  // Opened even on a weak release. A player who fumbles the exit of the hardest
  // thing in the game has already been punished by the link they did not get.
  if (cfg.chargedSecs > 0 && body.traits.charges) state.chargedT = cfg.chargedSecs;

  // ---- how well this release was flown, on the one axis it has
  //
  // A converted capture is graded on WHEN it let go: `boost` is the envelope's
  // value at this instant and `boostFull` its peak, so the fraction is how close
  // to the top of the arc the button came up. A flyby never froze an orbit and has
  // neither, but it has `defl` — how hard the body is bending the heading right
  // now — and releasing at the top of the turn is the same skill wearing different
  // clothes.
  //
  // ONE NUMBER FOR BOTH, deliberately. It prices the swing below and stretches the
  // burst's decay, and a second definition of "how good was that" is exactly the
  // kind of pair that agrees until it quietly does not.
  const quality = earned
    ? cap.boostFull > 0
      ? Math.max(0, Math.min(1, cap.boost / cap.boostFull))
      : 0
    : cfg.flybyKickSpan > 0
      ? Math.max(0, Math.min(1, cap.defl / cfg.flybyKickSpan))
      : 0;

  // The swing: what a release that never converted is worth.
  //
  // Measured, 54% of releases earned no kick at all and only 31 of 366 flew badly
  // — the rest were flybys and dives that never reached periapsis, which are
  // manoeuvres that were flown and did not pay. See `SimConfig.flybyKick`.
  const swing = earned ? 0 : cfg.flybyKick * quality;

  const spd = hypot(cap.vx, cap.vy) || 1;
  const bx = cap.vx / spd;
  const by = cap.vy / spd;
  const flingScale = weak ? 0.35 : cfg.releaseFlingBoost;

  const { ship } = state;
  ship.x = body.x + cap.rx;
  ship.y = body.y + cap.ry;

  // The escape fling: paid for getting out of the dead zone alive, and split by
  // the same two knobs as the boost so it arrives as a punchy transient plus a
  // smaller permanent carry, without inventing either.
  //
  // NOT gated on `earned`. 81% of escapes are released while still a flyby, and a
  // flyby earns no boost at all, so gating this the same way would pay nothing to
  // four escapes in five — which is most of the mechanic.
  const escape = cap.escaped ? cfg.escapeFling : 0;

  const permAdd = (add + escape + swing) * cfg.boostPermFrac;
  const burstAdd = add * (1 - cfg.boostPermFrac) * cfg.boostPunch;
  const escapeBurst = escape * (1 - cfg.boostPermFrac) * cfg.boostPunch;
  const swingBurst = swing * (1 - cfg.boostPermFrac) * cfg.boostPunch;
  ship.vx = (cap.vx + bx * permAdd) * flingScale;
  ship.vy = (cap.vy + by * permAdd) * flingScale;
  ship.burstX = bx * burstAdd;
  ship.burstY = by * burstAdd;
  ship.burstT = 0;
  // How long the kick carries. The second channel quality rides, and the gentler
  // one — see `SimConfig.kickHold` for why it is not the same size as the first.
  ship.burstDecay = cfg.boostBurstDecay * (1 + cfg.kickHold * quality);

  state.capture = null;

  if (weak) {
    ship.burstX = 0;
    ship.burstY = 0;
  }
  // Added after the weak damping, deliberately: a ship that ran dry on the way
  // out of the fire still got out of the fire, and this was earned by the escape
  // rather than by the exit.
  //
  // The swing is added here for the same reason. A putter-out is a release like
  // any other and the body was still bending it; the tank running dry is already
  // paid for by the link that did not happen, and taking the kick away as well
  // would be confiscating rather than withholding.
  ship.burstX += bx * (escapeBurst + swingBurst);
  ship.burstY += by * (escapeBurst + swingBurst);
  return { boostApplied: add, weak };
}
