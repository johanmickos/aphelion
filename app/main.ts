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
import { fieldBounds } from '../src/sim/world.ts';
import type { Input } from '../src/sim/types.ts';
import { createLoop } from '../src/app/loop.ts';
import { DEFAULT_RENDER_CONFIG } from '../src/render/config.ts';
import { centerCamera, createCamera, fitCamera, followCamera } from '../src/render/camera.ts';
import { Scene } from '../src/render/scene.ts';
import { captureSnapshot, lerpSnapshot } from '../src/render/snapshot.ts';
import { RunRecorder } from '../src/app/recorder.ts';
import { createScoreState, scoreTick } from '../src/score/index.ts';
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

const rcfg = DEFAULT_RENDER_CONFIG;
const cam = createCamera(rcfg);

// One seed per session, recorded so a reported frame can be reproduced.
const seed = (Date.now() ^ 0x9e3779b9) >>> 0;

/**
 * The live configuration.
 *
 * Editable only while armed. Once a run starts it is fixed, because a run is
 * `(config, seed, inputLog)` and a replay cannot reproduce a config that moved
 * underneath it.
 */
let sim: SimConfig = { ...DEFAULT_CONFIG };
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
  centerCamera(cam, p.x, p.y, field);
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
  if ((e.target as HTMLElement | null)?.closest('.ctl, #diag, #tune')) return;
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
    panelOpen: tuneEl.classList.contains('open') || diagEl.classList.contains('open'),
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
const inPanel = (t: EventTarget | null): boolean => !!(t as HTMLElement | null)?.closest?.('#diag');

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
}
addEventListener('resize', resize);
resize();

rearm();

const loop = createLoop(FIXED_DT, MAX_CATCHUP_STEPS, {
  step(dt) {
    if (paused || life.phase !== 'running') return;
    const input: Input = { held, pressed: pressedEdge, released: releasedEdge };
    recorder.recordInput(state.tick, pressedEdge, releasedEdge);
    pressedEdge = false;
    releasedEdge = false;

    stepSim(state, sim, input, dt);
    // Popups are raised here, on the tick the award lands, and read the ship's
    // position at that instant — after a release that is the point it let go
    // from, which is exactly the act being praised.
    const scored = scoreTick(score, state, sim);
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

    prev = curr;
    curr = captureSnapshot(state, held, sim);

    // Any respawn teleports the ship — after a crash, or out of bounds, which
    // sets no crash flag at all. Detecting the jump covers both, and any future
    // teleport (a wormhole) for free. Carrying the wake across looks like a smear.
    const jump = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (jump > TELEPORT_DISTANCE) {
      scene.trail.clear();
      centerCamera(cam, curr.x, curr.y, field);
    }

    // Sampled on the fixed tick so trail length never depends on frame rate.
    scene.trail.sample(curr.x, curr.y, Math.hypot(curr.vx, curr.vy));
    recorder.recordTick(state);
  },
  render(alpha, frameDt) {
    const snap = lerpSnapshot(prev, curr, alpha);
    followCamera(cam, rcfg, snap.x, snap.y, field, frameDt);
    scene.draw(ctx, cam, snap, {
      timeMs: performance.now(),
      paused,
      viewportW: innerWidth,
      viewportH: innerHeight,
      headerBottom,
      frameDt,
      score,
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
const diagBtn = document.getElementById('diagBtn') as HTMLButtonElement;
const diagEl = document.getElementById('diag') as HTMLDivElement;
const diagMeta = document.getElementById('diagMeta') as HTMLDivElement;
const diagNote = document.getElementById('diagNote') as HTMLTextAreaElement;
const diagOut = document.getElementById('diagOut') as HTMLTextAreaElement;
const diagCopy = document.getElementById('diagCopy') as HTMLButtonElement;
const diagSend = document.getElementById('diagSend') as HTMLButtonElement;
const diagBuild = document.getElementById('diagBuild') as HTMLDivElement;
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
const diagClose = document.getElementById('diagClose') as HTMLButtonElement;

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
    note: diagNote.value,
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
  diagMeta.textContent =
    `${s.seconds.toFixed(1)}s · ${report.ticks} ticks · ${s.grabs} grabs · ` +
    `${s.marks} flagged · ${report.checks.length} checkpoints\n` +
    `${(text.length / 1024).toFixed(1)} KB — paste this into the conversation`;
  diagOut.value = text;
  // Stale-bundle check: if this timestamp is older than your last edit, the page
  // needs RELOAD.
  diagBuild.textContent = `page loaded ${PAGE_LOADED} — press RELOAD if that predates your last edit`;
  return text;
}

diagBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  paused = true;
  refreshReport();
  diagEl.classList.add('open');
});

diagNote.addEventListener('input', refreshReport);

diagClose.addEventListener('click', (e) => {
  e.stopPropagation();
  diagEl.classList.remove('open');
  paused = document.hidden;
  loop.resetClock();
});

diagCopy.addEventListener('click', async (e) => {
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
    diagOut.focus();
    diagOut.setSelectionRange(0, diagOut.value.length);
  }
  diagCopy.textContent = ok ? 'COPIED ✓' : 'SELECTED — long-press to copy';
  setTimeout(() => (diagCopy.textContent = 'COPY REPORT'), 2200);
});

// Sending straight to the dev server is the short feedback loop: press it on the
// phone and the replay analysis appears in the laptop terminal immediately, with
// no copying, no pasting, and no clipboard-permission problems.
//
// Dev only. `import.meta.env.DEV` is a compile-time constant, so this whole block
// — and the button it reveals — is eliminated from a production build.
if (import.meta.env.DEV) {
  diagSend.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = refreshReport();
    diagSend.textContent = 'SENDING…';
    try {
      const res = await fetch('/__diag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: text,
      });
      const out = (await res.json()) as { ok: boolean; fidelity?: string; error?: string };
      if (!out.ok) throw new Error(out.error ?? 'rejected');
      diagSend.textContent = `SENT ✓ ${out.fidelity ?? ''}`.trim();
      recorder.clearMarkers();
      diagNote.value = '';
      flagBtn.textContent = '⚑';
    } catch (err) {
      diagSend.textContent = 'FAILED — use COPY';
      console.error('diagnostics send failed', err);
    }
    setTimeout(() => (diagSend.textContent = 'SEND'), 2600);
  });
} else {
  // Not merely hidden: the button should not exist in a shipped build.
  diagSend.remove();
}

// ------------------------------------------------------------------ lifecycle
const armedEl = document.getElementById('armed') as HTMLDivElement;

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
