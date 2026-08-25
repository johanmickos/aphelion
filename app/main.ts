/**
 * The app shell: input, the fixed-timestep loop, and the run lifecycle.
 *
 * Everything here is presentation and plumbing. The simulation is driven from
 * `step` and never learns about pixels, the DOM, or wall-clock time.
 */
import { DEFAULT_CONFIG, FIXED_DT, MAX_CATCHUP_STEPS } from '../src/sim/config.ts';
import type { SimConfig } from '../src/sim/config.ts';
import { createLifecycle } from '../src/app/lifecycle.ts';
import { KNOBS } from '../src/app/tune.ts';
import { isGrabKey, keydownAction } from '../src/app/input.ts';
import { createInitialState, shipWorldPos, stepSim } from '../src/sim/step.ts';
import { COURSES, courseOf, withCourse } from '../src/sim/course.ts';
import { backtrackFloorY, fieldBounds } from '../src/sim/world.ts';
import { advanceDeadline, rescueDeadline } from '../src/sim/rescue.ts';
import type { Input } from '../src/sim/types.ts';
import { createLoop } from '../src/app/loop.ts';
import { anomalyFocus, barrierRelax, frozenOrbit, orbitLock } from '../src/render/camera.ts';
import { DEFAULT_RENDER_CONFIG } from '../src/render/config.ts';
import { centerCamera, createCamera, fitCamera, followCamera } from '../src/render/camera.ts';
import { Scene } from '../src/render/scene.ts';
import { createAttractLoop, drawAttractLoop } from '../src/render/attract.ts';
import { captureSnapshot, lerpSnapshot } from '../src/render/snapshot.ts';
import { RunRecorder } from '../src/app/recorder.ts';
import {
  DEFAULT_SCORE_CONFIG,
  createScoreState,
  previewBurn,
  scoreTick,
} from '../src/score/index.ts';
import { buildReport, serializeReport, summarize } from '../src/app/report.ts';

/**
 * When this page was loaded. Shown in the diagnostics panel so a stale bundle is
 * obvious: if the time predates your last edit, press RELOAD.
 *
 * A build-time constant would be more precise, but Vite's `define` is not applied
 * by the dev server, so the identifier survives into the served module and throws.
 * Load time answers the actual question anyway.
 */
const PAGE_LOADED_AT = new Date();
const PAGE_LOADED = PAGE_LOADED_AT.toTimeString().slice(0, 8);

/** A single-tick position change beyond this can only be a teleport, not motion. */
const TELEPORT_DISTANCE = 200;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

/**
 * The attract loop above the title.
 *
 * Its own canvas, its own coordinate space, and no camera: it is a closed-form
 * figure-8 rather than anything the simulation produces, so it cannot be
 * disturbed by — or disturb — the run behind it. See `src/render/attract.ts` for
 * why authoring it is faithful rather than a shortcut.
 *
 * Drawn from the existing render callback rather than a second requestAnimationFrame:
 * one clock, and it stops for free when the tab is backgrounded.
 */
const attractCanvas = document.getElementById('attract') as HTMLCanvasElement;
const attractCtx = attractCanvas.getContext('2d')!;
const attract = createAttractLoop(DEFAULT_CONFIG);
/**
 * A perpetual loop is exactly what this setting is for. Frozen mid-transfer, the
 * still frame still shows both planets and a ship between them, which is the
 * whole message.
 */
const stillOnly = matchMedia('(prefers-reduced-motion: reduce)').matches;
let attractT = stillOnly ? attract.stillT : 0;
let attractW = 0;
let attractH = 0;
// Driven from the figure's own bounding box rather than repeated in the
// stylesheet, so retuning a radius cannot leave the element the wrong shape and
// the drawing quietly letterboxed inside it.
attractCanvas.style.aspectRatio = String(attract.box.w / attract.box.h);

// Mutable so the camera toggle can take effect mid-run. Render config never
// reaches the simulation — `pnpm portable` enforces that src/sim imports nothing
// from src/render — so nothing here can change what a replay reproduces.
const rcfg = { ...DEFAULT_RENDER_CONFIG };
const cam = createCamera(rcfg);

// One seed per session, recorded so a reported frame can be reproduced.
const seed = (Date.now() ^ 0x9e3779b9) >>> 0;

/**
 * The live configuration.
 *
 * Editable only while armed. Once a run starts it is fixed, because a run is
 * `(config, seed, inputLog)` and a replay cannot reproduce a config that moved
 * underneath it.
 *
 * `anomalyAtSpawn` puts the first anomaly level with the opening body so the
 * charged window can be reached in seconds rather than after a minute of
 * climbing. Dev only: `import.meta.env.DEV` is a compile-time constant, so this
 * whole expression folds to `false` in a production bundle.
 *
 * Set HERE rather than inside world generation because `src/sim/` may not read
 * bundler syntax, and because a run is `(config, seed, inputLog)` — as a config
 * key it is recorded in the diagnostics report, so a dev session still replays
 * exactly. See the key's own note.
 */
let sim: SimConfig = { ...DEFAULT_CONFIG, anomalyAtSpawn: import.meta.env.DEV };
let state = createInitialState(sim);
let field = fieldBounds(sim, state.bodies);
let scene = new Scene({ sim, render: rcfg, bodies: state.bodies, field }, seed);
const life = createLifecycle();

/**
 * The score.
 *
 * Advanced by `scoreTick` immediately after `stepSim` and never read by the
 * simulation, so it stays a pure function of (config, seed, inputLog) — which is
 * what lets `tools/replay.ts` reproduce the score a phone session showed.
 */
let score = createScoreState();

/** Rebuild the world from the current config. Only legal while armed. */
function rearm(): void {
  sim = { ...sim };
  state = createInitialState(sim);
  score = createScoreState();
  field = fieldBounds(sim, state.bodies);
  scene = new Scene({ sim, render: rcfg, bodies: state.bodies, field }, seed);
  const p = shipWorldPos(state);
  centerCamera(cam, p.x, p.y, field, backtrackFloorY(sim, state.highWaterY));
  prev = captureSnapshot(state, false, sim);
  curr = prev;
  scene.trail.clear();
  scene.trail.sample(p.x, p.y, 0);
}

const recorder = new RunRecorder();

// --- input: the simulation consumes edges, not levels
//
// Press and release is the whole vocabulary. Touch pressure was investigated as a
// second axis and declined: `Touch.force` and pointer `pressure` are unreliable
// across devices — iOS dropped 3D Touch, most Android reports a constant. If an
// intensity axis is ever wanted, hold duration or a small drag during the hold are
// the reliable alternatives.
let held = false;
let pressedEdge = false;
let releasedEdge = false;
canvas.addEventListener('pointerdown', (e) => {
  // Controls sit above the canvas; a tap on one must not also be a grab.
  if ((e.target as HTMLElement | null)?.closest('.ctl, #debug, #tune')) return;
  // Right and middle click raise pointerdown too, and the context menu is
  // suppressed over the canvas — so without this a right-click is a silent grab
  // with no way to see why. Touch contact reports button 0, so the phone is
  // unaffected.
  if (e.button !== 0) return;
  e.preventDefault();
  // The first tap starts the run rather than grabbing, so a run never begins
  // with an input the player did not mean as gameplay.
  if (life.phase === 'armed') {
    startRun();
    return;
  }
  // A tap that puts the sheet away is not a grab. Without this the same press
  // both dismisses the results and starts a capture on the tick after it, which
  // is a grab the player did not ask for at the worst possible moment.
  if (sheet) {
    dismissSheet();
    return;
  }
  held = true;
  pressedEdge = true;
});
const up = (): void => {
  if (!held) return;
  held = false;
  releasedEdge = true;
};
addEventListener('pointerup', up);
addEventListener('pointercancel', up);

/**
 * Keyboard input, so the game is playable on a machine without a touchscreen.
 *
 * Space feeds the same two edge booleans the pointer does and nothing
 * downstream can tell which device produced them. That is deliberate: a run is
 * `(config, seed, inputLog)`, so a desktop session replays through the same
 * tooling as a phone session, and a diagnostics report from a laptop is worth
 * exactly as much as one from a phone.
 *
 * Mouse needs nothing added — `pointerdown` already covers it.
 */
const isTypingTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT';
};

addEventListener('keydown', (e) => {
  const action = keydownAction({
    code: e.code,
    repeat: e.repeat,
    typing: isTypingTarget(e.target),
    panelOpen: tuneEl.classList.contains('open') || debugEl.classList.contains('open'),
    armed: life.phase === 'armed',
  });
  if (action === 'ignore') return;
  // Only once the key is known to be gameplay: space scrolls the page by
  // default, which would shift the canvas out from under the ship.
  e.preventDefault();
  if (action === 'start') {
    startRun();
    return;
  }
  if (sheet) {
    if (sheetReadable()) dismissSheet();
    return;
  }
  held = true;
  pressedEdge = true;
});

addEventListener('keyup', (e) => {
  if (!isGrabKey(e.code)) return;
  up();
});

// A hold that loses focus — alt-tab, a click on another window — never delivers
// its matching keyup or pointerup, and the ship would hold forever. Releasing on
// blur costs a held grab that the player has already stopped watching.
addEventListener('blur', up);

/**
 * Suppress iOS's text-selection gestures over the play area.
 *
 * A quick double tap otherwise raises the magnifier and the Look Up / Search
 * menu, which is unusable in a game whose entire input is tapping. CSS is not
 * sufficient on its own: `preventDefault()` on `pointerdown` does not suppress
 * the underlying touch default, so the gesture has to be cancelled on the touch
 * events themselves.
 *
 * These listeners only call preventDefault — gameplay still runs off pointer
 * events, which are unaffected by cancelling a touch default.
 *
 * The diagnostics panel is exempt throughout: selecting and copying the report is
 * the fallback when the clipboard API is unavailable, which is exactly the case
 * on a LAN dev server.
 */
const inPanel = (t: EventTarget | null): boolean =>
  !!(t as HTMLElement | null)?.closest?.('#debug');

const suppressGesture = (e: Event): void => {
  if (inPanel(e.target)) return;
  e.preventDefault();
};
canvas.addEventListener('touchstart', suppressGesture, { passive: false });
canvas.addEventListener('touchend', suppressGesture, { passive: false });
canvas.addEventListener('dblclick', suppressGesture);
document.addEventListener('selectstart', suppressGesture);
document.addEventListener('contextmenu', suppressGesture);

// Backgrounding is the only pause a phone player actually needs; a button would
// compete with the game's single input.
let paused = false;
addEventListener('visibilitychange', () => {
  const wasPaused = paused;
  paused = document.hidden;
  // Coming back from the background leaves a stale frame timestamp, so the
  // accumulator would otherwise cash in a burst of catch-up ticks and the ship
  // would visibly jump. Restart the clock instead of replaying lost time.
  if (wasPaused && !paused) loop.resetClock();
});

let prev = captureSnapshot(state, false, sim);
let curr = prev;

/**
 * How far down the header text reaches, in design units.
 *
 * Measured from the element rather than hard-coded, so the edge-marker arrows
 * keep clearing it through safe-area insets and any change to the label.
 */
let headerBottom = 0;

function resize(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitCamera(cam, { w, h, dpr });

  const note = document.getElementById('note');
  const rect = note?.getBoundingClientRect();
  headerBottom = rect && rect.height > 0 ? Math.max(0, (rect.bottom - cam.offsetY) / cam.scale) : 0;

  // The attract canvas is laid out by CSS, so its size is read back rather than
  // computed. Zero once the run starts and #armed goes display:none — guarded,
  // because a zero-sized backing store throws on some engines.
  const aw = attractCanvas.clientWidth;
  const ah = attractCanvas.clientHeight;
  if (aw > 0 && ah > 0) {
    attractW = aw;
    attractH = ah;
    attractCanvas.width = Math.round(aw * dpr);
    attractCanvas.height = Math.round(ah * dpr);
    attractCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
addEventListener('resize', resize);
resize();

rearm();

/**
 * Ticks between refreshes of the point of no return, and between full recomputes.
 *
 * A drift takes no input, so a computed projection stays true as the ship flies
 * along it — see `advanceDeadline`. The refresh is therefore arithmetic and the full
 * simulation runs only when the projection can no longer be trusted: on every
 * capture transition, on a respawn, and on this timer as a backstop for anything
 * neither of those catches.
 *
 * Measured, a full call runs a median 1.4ms and up to 19ms here, three to five
 * times that on a phone. Running one ten times a second was what the author saw
 * as slowdown at the edges.
 *
 * The backstop is 30 ticks and not 60 because of what a fresh call does
 * differently: it re-derives its sampling stride from the drift that is LEFT, so a
 * shorter remaining approach is sampled more finely and can find a live press
 * inside a hole the coarser pass stepped over. Carried half a second, 554 of 558
 * comparisons across the corpus agreed to the pixel and the 99th percentile of the
 * difference was zero; carried a full second the 99th was 15px. The physics does
 * not drift — the resolution does.
 */
const DEADLINE_EVERY = 6;
const DEADLINE_RECOMPUTE = 30;
let deadlineSkip = DEADLINE_EVERY;
let deadlineAge = DEADLINE_RECOMPUTE;
let deadlineCache: ReturnType<typeof rescueDeadline> = null;
let deadlineWasCaptured = false;
/** Tick the running capture began on, for the tap test. */
let captureStart = 0;

/**
 * A results sheet is up and the run is waiting on a tap.
 *
 * TWO KINDS, HELD TWO DIFFERENT WAYS, and the asymmetry is forced rather than
 * chosen. A CLEAR is held by the simulation: `stepSim` never respawns a `cleared`
 * ending, so the loop keeps stepping and the ceremony animates off `ending.t`. A
 * worthy DEATH cannot be held there, because whether a death earned a sheet is a
 * question about `ScoreState` — how far up the field it got — and `src/sim/` is
 * not allowed to see the score. Teaching it would collapse the observer boundary
 * that makes a score a pure function of (config, seed, inputLog).
 *
 * So the app holds that one itself, by not stepping, and runs the fade clock.
 */
let sheet: { kind: 'cleared' | 'death'; t: number } | null = null;

/**
 * This ending has already been offered a sheet.
 *
 * WITHOUT IT, DISMISSING A DEATH SHEET PUTS IT STRAIGHT BACK UP. The hold freezes
 * `crashPause` rather than skipping it, so `ending.active` is still true on the
 * tick after the tap — and the test that raises a sheet would fire again
 * immediately, every time, forever. Reported as the modal being "removed and then
 * brought up again", and only on a death: a clear never reaches the test again
 * because it leaves for the armed screen and stops stepping.
 *
 * Keyed to the ending rather than to the sheet, and cleared when the run
 * respawns, so the next death gets its own.
 */
let sheetOfferedForEnding = false;

/** Seconds a death sheet takes to fade in, once the ending notice has had its beat. */
const DEATH_SHEET_DELAY = 0.55;
const DEATH_SHEET_FADE = 0.4;

/** 0 until the notice has been read, then rising. Always 0 for a clear. */
function deathSheetAlpha(): number | null {
  if (sheet?.kind !== 'death') return null;
  const u = (sheet.t - DEATH_SHEET_DELAY) / DEATH_SHEET_FADE;
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
}

/**
 * Has the sheet finished arriving?
 *
 * The tap that dismisses it is the same gesture as the tap that flies, and a
 * player whose run just ended is usually mid-press. Without this the results are
 * gone before they have finished fading in — dismissed by an input aimed at
 * something else entirely.
 */
function sheetReadable(): boolean {
  return sheet !== null && scene.sheetAlpha > 0.6;
}

/**
 * Put the sheet away and get back to flying.
 *
 * A CLEAR ENDS THE SESSION, because a session IS a field: `respawn` keeps the
 * world, so every life this session was an attempt at the same sixty planets,
 * and there is nothing left in them once the top has been reached. Back to armed
 * with a fresh seed, which is also where the tuning and the course picker live.
 *
 * A DEATH just resumes. Clearing the flag lets the loop step again, and the hold
 * the simulation had already started finishes on its own — `crashPause` was
 * frozen along with everything else, not skipped.
 */
function dismissSheet(): void {
  if (!sheet) return;
  const wasCleared = sheet.kind === 'cleared';
  sheet = null;
  if (!wasCleared) return;
  sim.worldSeed = (Math.random() * 2 ** 32) >>> 0;
  life.phase = 'armed';
  rearm();
  showSeed();
  showArmed();
}

const loop = createLoop(FIXED_DT, MAX_CATCHUP_STEPS, {
  step(dt) {
    if (paused || life.phase !== 'running') return;
    if (sheet) {
      sheet.t += dt;
      // A death sheet freezes the run beneath it; a clear keeps stepping, because
      // its ceremony is animated from `ending.t` and the simulation is the thing
      // advancing that.
      if (sheet.kind === 'death') return;
    }
    // ---- the controls go dead between a run ending and the next one starting
    //
    // Not because the simulation would misbehave — its ending branch ignores
    // input, and `respawn` sets `holdConsumed` so a button still down cannot grab
    // on the first tick back. It is because a player who is mashing during a
    // death should not have those presses SILENTLY EATEN and then have one of
    // them turn out to matter. Dropping the edges here makes the dead period a
    // stated rule with one owner, rather than an emergent property of two guards
    // in different files that both happen to hold today.
    //
    // Recorded as dropped, too. The log has to be what the simulation was fed or
    // a replay stops reproducing the run.
    if (state.ending.active) {
      held = false;
      pressedEdge = false;
      releasedEdge = false;
    }
    const input: Input = { held, pressed: pressedEdge, released: releasedEdge };
    recorder.recordInput(state.tick, pressedEdge, releasedEdge);
    pressedEdge = false;
    releasedEdge = false;

    const wasCaptured = state.capture !== null;
    stepSim(state, sim, input, dt);
    // How long this capture has run, for the tap test below.
    if (!wasCaptured && state.capture) captureStart = state.tick;
    // A press too brief to have been a decision leaves no mark behind. Before the
    // deadline is next observed, so the mark is taken away rather than handed to the
    // ghost slot to fade — see `RenderConfig.deadlineTapSecs`.
    if (wasCaptured && !state.capture && (state.tick - captureStart) * dt <= rcfg.deadlineTapSecs) {
      scene.deadline.dropMark();
    }
    // A new capture begins, so the previous one's receipt is finished and the
    // awards raised below open a fresh one. Before `scoreTick`, deliberately: a
    // grab landing on this very tick belongs to the capture that just started.
    if (!wasCaptured && state.capture) scene.popups.settleReceipt();
    // Popups are raised here, on the tick the award lands, and read the ship's
    // position at that instant — after a release that is the point it let go
    // from, which is exactly the act being praised.
    const scored = scoreTick(score, state, sim, dt);

    // ---- has this run earned a sheet?
    //
    // Asked here rather than inside `stepSim` for the reason `sheet` records: the
    // answer depends on the score, and the simulation must not be able to see it.
    // On the tick a run ends, `scoreTick` has already sealed `lastRun`, so the
    // question can be asked immediately and the sheet raised without a frame of
    // the world carrying on underneath a finished run.
    if (!state.ending.active) sheetOfferedForEnding = false;
    else if (!sheetOfferedForEnding) {
      sheetOfferedForEnding = true;
      // EVERY ENDING GETS A SHEET, short runs included.
      //
      // A worthiness gate lived here — a measured field fraction below which a
      // death reported nothing, so that `src/app/lifecycle.ts`'s "failure stays
      // cheap" survived. It is gone by decision: one screen, always, is simpler
      // to learn than a screen that sometimes appears, and a player cannot form a
      // habit around a report they only sometimes get.
      //
      // What keeps failure cheap instead is the dismissal. The sheet goes as soon
      // as it is readable and one tap takes it away, so the cost of a bad run is a
      // beat rather than a wait.
      sheet = { kind: state.ending.reason === 'cleared' ? 'cleared' : 'death', t: 0 };
    }
    // Recorded as well as shown. A replay recomputes these, but only while it is
    // still reproducing the run — and past a divergence it recomputes a different
    // session's. These are what the player was actually paid.
    recorder.recordAwards(scored.awards);
    for (const award of scored.awards) {
      const at = shipWorldPos(state);
      scene.popups.spawn(award, at.x, at.y);
    }
    // The shouts land where the ship was thrown around, mid-capture, rather than
    // at a release — that moment IS the thing being reacted to.
    for (const shout of scored.shouts) {
      const at = shipWorldPos(state);
      scene.popups.shout(shout, at.x, at.y);
    }
    // The window's closing tally. Display only — every point in it was banked as
    // its hop landed, so this restates rather than pays. See `Tally`.
    if (scored.tally) {
      const at = shipWorldPos(state);
      scene.popups.tally(scored.tally.points, at.x, at.y);
    }

    prev = curr;
    curr = captureSnapshot(state, held, sim);

    // Any respawn teleports the ship — after a crash, or out of bounds, which
    // sets no crash flag at all. Detecting the jump covers both, and any future
    // teleport (a wormhole) for free. Carrying the wake across looks like a smear.
    const jump = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (jump > TELEPORT_DISTANCE) {
      scene.trail.clear();
      // A full tank came with the new ship; a warning about the old one's is a
      // message about a run that is over.
      scene.fuelWarning.clear();
      scene.popups.settleReceipt();
      // Same for the deadline: it is a world-space mark against a wall this ship has
      // never approached, and the projection behind it describes a dead run.
      scene.deadline.clear();
      deadlineCache = null;
      deadlineAge = DEADLINE_RECOMPUTE;
      centerCamera(cam, curr.x, curr.y, field, backtrackFloorY(sim, curr.highWaterY));
    }

    // The point of no return, recomputed a few times a second rather than every
    // tick. It costs a forward simulation of a few thousand ticks — the only
    // honest way to answer "would a grab here still save me", see
    // `src/sim/rescue.ts` — and it is a property of a straight drift, so asking
    // faster than it can change buys nothing but heat.
    //
    // Skipped entirely during the ending hold, which freezes the mark where it
    // was: the receding cross is the explanation of the death being shown, and
    // an explanation must not fade out behind the notice it belongs to.
    // A capture starting or ending is the one thing that invalidates a projection,
    // because it is the one thing that changes the ship's velocity.
    const capturedNow = state.capture !== null;
    if (capturedNow !== deadlineWasCaptured) {
      deadlineCache = null;
      deadlineAge = DEADLINE_RECOMPUTE;
      deadlineWasCaptured = capturedNow;
    }

    deadlineSkip++;
    deadlineAge++;
    if (!state.ending.active && deadlineSkip >= DEADLINE_EVERY) {
      const elapsed = dt * deadlineSkip;
      const stale = deadlineAge >= DEADLINE_RECOMPUTE;
      const carried = deadlineCache && !stale ? advanceDeadline(deadlineCache, elapsed) : null;
      if (carried) {
        deadlineCache = carried;
      } else {
        deadlineCache = rescueDeadline(state, sim, dt);
        deadlineAge = 0;
      }
      const deadline = deadlineCache;
      // How much fire the ship would fly into if the press were made at the
      // cross. The predictor hands back the flight and the scorer prices it,
      // because `src/sim/` may not know what a point is. Deliberately NOT the
      // payout — it runs out at the turn-away and the real burn is a median 2.21x
      // it — and it is never shown as a number, only as how big the mark draws.
      // See `previewBurn`.
      const prize = deadline
        ? previewBurn(deadline.flight, field, state.bodies, DEFAULT_SCORE_CONFIG, dt)
        : 0;
      scene.deadline.observe(deadline, prize, rcfg, elapsed);
      deadlineSkip = 0;
    }

    // Sampled on the fixed tick so trail length never depends on frame rate.
    scene.trail.sample(curr.x, curr.y, Math.hypot(curr.vx, curr.vy));
    // Fed on the tick for the same reason: a dip below the low line and back can
    // fit entirely between two frames, and that dip is the whole warning.
    scene.fuelWarning.observe(curr, sim);
    recorder.recordTick(state);
  },
  render(alpha, frameDt) {
    const snap = lerpSnapshot(prev, curr, alpha);
    // A settled orbit is watched around its anchor; everything else is flown.
    const cap = snap.capture;
    const body = cap ? state.bodies[cap.planet] : null;
    // A capture supplies its own subject; drifting inside a bubble, the anomaly
    // is one anyway — the view leans toward it so it is on screen before the ship
    // arrives rather than with it. One continuous movement across the press.
    const focus =
      cap && body
        ? {
            x: body.x,
            y: body.y,
            lock: orbitLock(cap.phase, cap.settleProgress, body.kind === 'anomaly'),
            id: cap.planet,
          }
        : anomalyFocus(state.bodies, snap.x, snap.y, rcfg, snap.vx, snap.vy);
    followCamera(
      cam,
      rcfg,
      snap.x,
      snap.y,
      field,
      backtrackFloorY(sim, snap.highWaterY),
      frameDt,
      focus,
      snap.vx,
      frozenOrbit(cap?.phase),
      barrierRelax(state.bodies, snap.x, snap.y, rcfg),
    );
    // The armed screen's animation. Skipped once a run starts, and while a
    // full-screen panel is covering it — there is nothing to draw to.
    if (
      life.phase === 'armed' &&
      !tuneEl.classList.contains('open') &&
      !debugEl.classList.contains('open')
    ) {
      if (!stillOnly) attractT = (attractT + frameDt) % attract.period;
      drawAttractLoop(attractCtx, attract, attractT, attractW, attractH);
    }

    scene.draw(ctx, cam, snap, {
      timeMs: performance.now(),
      paused,
      viewportW: innerWidth,
      viewportH: innerHeight,
      headerBottom,
      frameDt,
      score,
      deathSheet: deathSheetAlpha(),
      deathSheetT: sheet?.kind === 'death' ? Math.max(0, sheet.t - DEATH_SHEET_DELAY) : 0,
    });
  },
});
loop.start();

// ---------------------------------------------------------------- diagnostics
//
// The flag button stamps the current tick without interrupting play — you press
// it the moment something feels wrong and keep going. The panel then produces a
// report that replays the whole session elsewhere, exactly.
const flagBtn = document.getElementById('flag') as HTMLButtonElement;
const debugBtn = document.getElementById('debugBtn') as HTMLButtonElement;
const debugEl = document.getElementById('debug') as HTMLDivElement;
const debugMeta = document.getElementById('debugMeta') as HTMLDivElement;
const debugNote = document.getElementById('debugNote') as HTMLTextAreaElement;
const debugOut = document.getElementById('debugOut') as HTMLTextAreaElement;
const debugCopy = document.getElementById('debugCopy') as HTMLButtonElement;
const debugSend = document.getElementById('debugSend') as HTMLButtonElement;
const debugBuild = document.getElementById('debugBuild') as HTMLDivElement;
const resetBtn = document.getElementById('reset') as HTMLButtonElement;

/**
 * RESET reloads the page.
 *
 * It lives on the main view because the game swallows touch (touch-action: none,
 * plus preventDefault on the canvas), so pull-to-refresh does not work on a phone
 * and there would otherwise be no way to escape a stale bundle short of closing
 * the tab. Reloading also picks up code changes, which is why it is worth one tap
 * rather than three.
 *
 * A reload discards the diagnostics recording. That is invisible and free in the
 * normal case, but throwing away moments you flagged and never sent would be a
 * real loss, so when there are unsent flags it asks first.
 */
let resetArmed = false;
let resetTimer: ReturnType<typeof setTimeout> | undefined;
resetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const unsent = recorder.markers.length;
  if (unsent > 0 && !resetArmed) {
    resetArmed = true;
    resetBtn.classList.add('armed');
    resetBtn.textContent = `DISCARD ${unsent}?`;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetArmed = false;
      resetBtn.classList.remove('armed');
      resetBtn.textContent = 'RESET';
    }, 3000);
    return;
  }
  location.reload();
});
const debugClose = document.getElementById('debugClose') as HTMLButtonElement;

flagBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  recorder.mark(state.tick);
  flagBtn.classList.add('hit');
  flagBtn.textContent = `⚑ ${recorder.markers.length}`;
  setTimeout(() => flagBtn.classList.remove('hit'), 400);
});

function refreshReport(): string {
  const report = buildReport({
    recorder,
    config: sim,
    seed,
    ticks: state.tick,
    note: debugNote.value,
    // Carried so a replay can tell a session played on this build from one
    // played on the bundle that was open ten minutes ago.
    loadedAt: PAGE_LOADED_AT.toISOString(),
    device: {
      w: innerWidth,
      h: innerHeight,
      dpr: Math.min(devicePixelRatio || 1, 2),
      ua: navigator.userAgent,
    },
  });
  const text = serializeReport(report);
  const s = summarize(report);
  debugMeta.textContent =
    `${s.seconds.toFixed(1)}s · ${report.ticks} ticks · ${s.grabs} grabs · ` +
    `${s.marks} flagged · ${report.checks.length} checkpoints\n` +
    `${(text.length / 1024).toFixed(1)} KB — paste this into the conversation`;
  debugOut.value = text;
  // Stale-bundle check: if this timestamp is older than your last edit, the page
  // needs RELOAD.
  debugBuild.textContent = `page loaded ${PAGE_LOADED} — press RELOAD if that predates your last edit`;
  return text;
}

debugBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  paused = true;
  refreshReport();
  debugEl.classList.add('open');
});

debugNote.addEventListener('input', refreshReport);

debugClose.addEventListener('click', (e) => {
  e.stopPropagation();
  debugEl.classList.remove('open');
  paused = document.hidden;
  loop.resetClock();
});

debugCopy.addEventListener('click', async (e) => {
  e.stopPropagation();
  const text = refreshReport();
  let ok = false;
  try {
    // Only available in a secure context; a LAN dev server over http is not one,
    // which is exactly where this gets used. Selecting the text is the fallback
    // that always works: long-press gives the native Copy.
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = false;
  }
  if (!ok) {
    debugOut.focus();
    debugOut.setSelectionRange(0, debugOut.value.length);
  }
  debugCopy.textContent = ok ? 'COPIED ✓' : 'SELECTED — long-press to copy';
  setTimeout(() => (debugCopy.textContent = 'COPY REPORT'), 2200);
});

// Sending straight to the dev server is the short feedback loop: press it on the
// phone and the replay analysis appears in the laptop terminal immediately, with
// no copying, no pasting, and no clipboard-permission problems.
//
// Dev only. `import.meta.env.DEV` is a compile-time constant, so this whole block
// — and the button it reveals — is eliminated from a production build.
if (import.meta.env.DEV) {
  debugSend.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = refreshReport();
    debugSend.textContent = 'SENDING…';
    try {
      const res = await fetch('/__diag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: text,
      });
      const out = (await res.json()) as { ok: boolean; fidelity?: string; error?: string };
      if (!out.ok) throw new Error(out.error ?? 'rejected');
      debugSend.textContent = `SENT ✓ ${out.fidelity ?? ''}`.trim();
      recorder.clearMarkers();
      debugNote.value = '';
      flagBtn.textContent = '⚑';
    } catch (err) {
      debugSend.textContent = 'FAILED — use COPY';
      console.error('diagnostics send failed', err);
    }
    setTimeout(() => (debugSend.textContent = 'SEND'), 2600);
  });
} else {
  // Not merely hidden: the button should not exist in a shipped build.
  debugSend.remove();
}

// ------------------------------------------------------------------ lifecycle
const armedEl = document.getElementById('armed') as HTMLDivElement;
const newMapBtn = document.getElementById('newMap') as HTMLButtonElement;
const armedSeedEl = document.getElementById('armedSeed') as HTMLDivElement;

// The overlay copy is written for a phone, and "tap" is the one word a desktop
// player cannot act on. Keyed off a fine pointer rather than screen width: a
// small window on a laptop is still a mouse, and a large tablet is still a tap.
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const hint = document.getElementById('armedHint');
  const sub = document.getElementById('armedSub');
  if (hint) hint.textContent = 'click or press space to start';
  if (sub) sub.textContent = 'hold near a planet to be caught by it';
}
const tuneBtn = document.getElementById('tuneBtn') as HTMLButtonElement;
const tuneEl = document.getElementById('tune') as HTMLDivElement;
const tuneRows = document.getElementById('tuneRows') as HTMLDivElement;
const tuneReset = document.getElementById('tuneReset') as HTMLButtonElement;
const tuneClose = document.getElementById('tuneClose') as HTMLButtonElement;

function showArmed(): void {
  armedEl.classList.toggle('hidden', life.phase !== 'armed');
  tuneBtn.disabled = life.phase !== 'armed';
  tuneBtn.style.opacity = life.phase === 'armed' ? '1' : '0.35';
}

/**
 * NEW MAP — a new field, on demand.
 *
 * "Map" is the player's word for it and "field" is the code's; the seed builds a
 * field, and the button offers a map.
 *
 * The seed is a config key, so this is the same act as moving a tune slider: it
 * is legal only while armed, it goes through `rearm()`, and it is therefore
 * fixed before the first tick and carried in the diagnostics report like every
 * other config value. A replay of a randomised session reconstructs its field
 * from the report alone.
 *
 * Session-scoped deliberately. RESET reloads the page, and a reload comes back
 * on the default field — which keeps the fixed seed the game's canonical climb,
 * the one the praise thresholds and the scenarios are calibrated against.
 *
 * `Math.random` is fine HERE and banned two directories away: the seed is chosen
 * outside the simulation and then becomes part of its input. Nothing under
 * `src/sim/` ever reaches for entropy.
 */
function showSeed(): void {
  armedSeedEl.textContent = `seed ${sim.worldSeed.toString(16).padStart(8, '0')}`;
}

newMapBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (life.phase !== 'armed') return;
  sim.worldSeed = (Math.random() * 2 ** 32) >>> 0;
  rearm();
  showSeed();
});

/**
 * The course picker: how much field there is to fly.
 *
 * Armed-only like every other world control, and for the harder of the two
 * reasons `rearm` is. Changing it mid-run would not merely be odd — it would
 * rebuild the bodies under a ship already flying between them, and it would break
 * the promise a run is `(config, seed, inputLog)`, since the config would no
 * longer be one thing for the whole log.
 *
 * It exists because the ending is unreachable otherwise. Clearing sixty bodies
 * takes about eighty-five seconds of good play, which is a slow way to look at a
 * ceremony twenty times; twelve is about seventeen.
 */
const courseBtn = document.getElementById('course') as HTMLButtonElement;

function showCourse(): void {
  courseBtn.textContent = `COURSE: ${COURSES[courseOf(sim)].label}`;
}

courseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (life.phase !== 'armed') return;
  sim = withCourse(sim, courseOf(sim) === 'full' ? 'short' : 'full');
  rearm();
  showCourse();
});

function startRun(): void {
  life.phase = 'running';
  life.startedAtTick = state.tick;
  loop.resetClock();
  showArmed();
}

// ----------------------------------------------------------------- tune panel
//
// Editing is only possible while armed, which is what makes a run reproducible:
// the config is fixed before the first tick, so (config, seed, inputLog) really
// does describe everything that happened.
function buildTuneRows(): void {
  tuneRows.innerHTML = '';
  let group = '';
  for (const knob of KNOBS) {
    if (knob.group !== group) {
      group = knob.group;
      const h = document.createElement('div');
      h.className = 'tuneGroup';
      h.textContent = group;
      tuneRows.appendChild(h);
    }
    const row = document.createElement('div');
    row.className = 'tuneRow';

    const label = document.createElement('span');
    label.className = 'tl';
    label.textContent = knob.label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(knob.min);
    input.max = String(knob.max);
    input.step = String(knob.step);
    input.value = String(sim[knob.key]);

    const value = document.createElement('span');
    value.className = 'tv';
    const show = (): void => {
      value.textContent = (sim[knob.key] as number).toFixed(knob.dp);
    };
    show();

    input.addEventListener('input', () => {
      (sim as unknown as Record<string, number>)[knob.key] = Number(input.value);
      show();
      // Rebuilding on every change means the armed screen is a live preview:
      // move SPACING and the field behind the panel is already the new one.
      rearm();
    });

    row.append(label, input, value);
    tuneRows.appendChild(row);

    const hint = document.createElement('div');
    hint.className = 'tuneHint';
    hint.textContent = knob.hint;
    tuneRows.appendChild(hint);
  }
}

tuneBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (life.phase !== 'armed') return;
  buildTuneRows();
  tuneEl.classList.add('open');
});

/**
 * Camera lock, on a toggle because it changes how the game FEELS and the only way
 * to judge that is to flip it mid-flight and fly the same field both ways.
 *
 * Two positions, not a slider: the question is whether a settled orbit should
 * hold still, and a half-locked orbit answers neither side of it.
 */
const tuneCam = document.getElementById('tuneCam') as HTMLButtonElement;
function paintCam(): void {
  tuneCam.textContent = rcfg.cameraOrbitLock > 0 ? 'CAM: ORBIT-LOCK' : 'CAM: FOLLOW SHIP';
}
paintCam();
tuneCam.addEventListener('click', (e) => {
  e.preventDefault();
  rcfg.cameraOrbitLock = rcfg.cameraOrbitLock > 0 ? 0 : DEFAULT_RENDER_CONFIG.cameraOrbitLock;
  paintCam();
});

tuneClose.addEventListener('click', (e) => {
  e.stopPropagation();
  tuneEl.classList.remove('open');
});

tuneReset.addEventListener('click', (e) => {
  e.stopPropagation();
  for (const knob of KNOBS) {
    (sim as unknown as Record<string, number>)[knob.key] = DEFAULT_CONFIG[knob.key] as number;
  }
  rearm();
  buildTuneRows();
});

showArmed();
showSeed();
showCourse();
