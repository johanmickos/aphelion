/**
 * The app shell: the clock that drives the three layers, and nothing else.
 *
 * This file is the one place the layers meet. It steps the simulation, derives
 * presentation state from it, and hands that to the renderer — which is the
 * whole of ADR-0006 expressed in a couple of dozen lines, and the reason it is
 * worth having before there is a game to put through it.
 *
 * It is also the only place in the repo that reads a wall clock. The simulation
 * cannot (`pnpm portable`), so the elapsed time is measured here and handed in;
 * [`ticksDue`](../src/sim/clock.ts) decides what it is worth in ticks, capped so
 * a slept phone cannot fast-forward the run it comes back to. What is left over
 * after that — time observed but not yet worth a tick — is how far between two
 * ticks the frame being drawn falls, and handing it to the renderer is what
 * makes a 120Hz phone show a swing rather than a stutter (ADR-0006).
 *
 * The field is a fixture and says so ([`fixture-field.ts`](../src/sim/fixture-field.ts)):
 * spec [17 · §3](../docs/spec/17-daily-field.md) rules that a day is generated
 * once as data before the first tick, and the generator is M3's. It is opened
 * through [`fieldFor`](../src/sim/recipe.ts) rather than built here, so the run
 * the author flies and the run a recipe replays come from one place and cannot
 * drift apart.
 *
 * **It also writes the run down.** Every tick's press goes into a recorder
 * before it goes into the simulation, so the session leaves a recipe behind
 * (ADR-0004) — which is what turns *"the grab feels late"* into a tick number
 * somebody else can fly. The recorder is fed here because this is where the
 * press and the tick are both in scope, and nowhere else in the game knows both.
 *
 * **And it times the frames**, for exactly the same reason and in the same
 * place. *"Some lag during some swings"* costs a cycle to reproduce and may not
 * reproduce at all; the same sentence with a distribution and a tick number
 * under it is a bug with an address. The clock is read here because this is the
 * only file allowed to read one, and what it hands the meter
 * ([`meter.ts`](../tools/meter.ts)) is three numbers a test can fabricate. The
 * meter itself is dev-only and `null` in a built game, so nothing below the
 * `import.meta.env.DEV` branches survives the build.
 */
import { createClock, ticksDue } from '../src/sim/clock.ts';
import {
  FIXTURE_FIELD,
  createRecorder,
  fieldFor,
  recipeOf,
  recordPress,
} from '../src/sim/recipe.ts';
import { createInitialState, stepSim } from '../src/sim/step.ts';
import { SECONDS_PER_TICK } from '../src/sim/units.ts';
import { createPress, isPressed } from '../src/input/press.ts';
import { createPresentation, derive } from '../src/state/derive.ts';
import { attachCanvas, sizeToDisplay } from '../src/render/canvas.ts';
import { interpolate } from '../src/render/interpolate.ts';
import { draw } from '../src/render/index.ts';
import { DIAG_ENDPOINT, buildDispatch } from '../tools/dispatch.ts';
import { createMeter, frameBegan, frameEnded, timingOf } from '../tools/meter.ts';
import { bindPress, suppressBrowserGestures, typing } from './input.ts';

/** Replaced at build time by Vite's `define`; `dev` when the dev server serves it. */
declare const __BUILD_STAMP__: string;

/**
 * The finest interval this browser's clock will admit to, in seconds.
 *
 * Spun for rather than declared: read `performance.now()` until it changes, a
 * few times over, and keep the smallest step seen. One probe can over-read — the
 * clock may tick immediately after the first sample — so the minimum of several
 * is the reading.
 *
 * Two guards, and both return **zero**, which `ticksDue` reads as *exact* and
 * which restores the arithmetic this game had before the probe existed. A clock
 * that will not advance inside a bounded spin is a clock this cannot measure,
 * and a grain coarser than half a tick is not a grain — it is a clock that
 * cannot pace this game at all, and rounding against it would round everything.
 */
function clockGrain(): number {
  const PROBES = 5;
  const PATIENCE = 2_000_000;
  let finest = Infinity;
  for (let probe = 0; probe < PROBES; probe++) {
    const from = performance.now();
    let to = from;
    let spins = 0;
    while (to === from && spins < PATIENCE) {
      to = performance.now();
      spins += 1;
    }
    if (to === from) return 0;
    finest = Math.min(finest, to - from);
  }
  const seconds = finest / 1000;
  return seconds > SECONDS_PER_TICK / 2 ? 0 : seconds;
}

const target = document.getElementById('app');
const readout = document.getElementById('readout');
const reset = document.getElementById('reset');
const dev = document.getElementById('dev');
const flag = document.getElementById('flag');
const send = document.getElementById('send');
const note = document.getElementById('note');

if (target) {
  const context = attachCanvas(target);
  const press = createPress();
  bindPress(press, target);
  suppressBrowserGestures(target);

  // The seed is fixed rather than drawn from anything. A run is described by its
  // seed and its input log (ADR-0004), and one the author can say out loud is
  // worth more than a random one until there is a day to derive it from — spec
  // [17 · §2](../docs/spec/17-daily-field.md) makes that the date's job, in M3.
  const SEED = 1;
  const start = (): ReturnType<typeof createInitialState> => {
    const { field, craft } = fieldFor(FIXTURE_FIELD);
    return createInitialState(field, craft, SEED);
  };

  let sim = start();
  let current = createPresentation(sim);
  let previous = current;
  // Opened beside the run and thrown away with it. What it holds is the run's
  // own description, so it is as long-lived as the run and no longer.
  let recorder = createRecorder(FIXTURE_FIELD, SEED);
  let flagged: number[] = [];
  let sent = '';
  const clock = createClock();
  let observed = performance.now();
  // **What this clock can actually resolve**, probed rather than assumed.
  //
  // WebKit clamps `performance.now()` to a whole millisecond for privacy, so the
  // phone cannot report 16.667ms and the leftover accumulates until a frame runs
  // two ticks and the craft jumps (`clock.ts`). `ticksDue` can read past that,
  // but only if it is told how coarse the reading is — and the shell is the only
  // thing that can find out, because it is the only thing allowed a clock.
  //
  // Probed rather than hardcoded so that a machine with a fine clock gets its
  // real jitter respected instead of a phone's fact applied to it: at a grain of
  // a few hundred nanoseconds the rounding never fires and the arithmetic is the
  // one this game always had.
  const grainSeconds = clockGrain();
  // Dev-only, like the dispatch it rides in: `import.meta.env.DEV` is replaced
  // by `false` when the build is made, so the meter and its module go with it.
  let meter = import.meta.env.DEV ? createMeter() : null;

  // **Coming back from the background is not elapsed time.** A phone that slept,
  // a tab switched away from and a screen locked all leave `observed` at the
  // moment the page stopped being drawn, so the first frame after it hands
  // `ticksDue` a duration worth minutes. The clamp bounds what that buys at
  // three ticks rather than thousands (`clock.ts`), which is what stops a death
  // spiral — but three ticks is still a visible jump, in a game whose whole
  // input is a moment, and it lands the instant the player looks back at it.
  //
  // So the gap is not measured at all: the clock restarts from the moment the
  // page becomes visible again, and the run resumes where it was. The prototype
  // has the same handler and reached it the same way. There is nothing to save
  // and nothing to catch up on — the simulation only advances when it is
  // watched, which is what ADR-0006's *the tick is the only clock* already says.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') observed = performance.now();
  });

  // Developer chrome, and the only thing in the build that is not the one verb.
  //
  // **It is a restart and never a retry.** ADR-0007 rules DAILY as one run, no
  // retry and no lives, and now that a run can end that distinction is real
  // rather than academic: what this does is throw the run away and open a new
  // one from tick zero, which is what an author or an agent needs in order to
  // fly the same field again. It stays obviously chrome — a DOM button beside
  // the readout, outside the design space — because the moment it looks like
  // part of the game it is a retry, and the run is meant to be the wager.
  const restart = (): void => {
    sim = start();
    current = createPresentation(sim);
    previous = current;
    // A new run is a new recipe. Nothing is carried across, for the same reason
    // `createPresentation` places rather than eases (ADR-0015): a recorder that
    // survived a restart would describe a run nobody flew.
    recorder = createRecorder(FIXTURE_FIELD, SEED);
    // And a new meter, for the same reason and a sharper one: every frame it
    // names carries the tick it happened on, and a tick number from a run that
    // has been thrown away points at a moment in a different flight. The
    // dispatch's own validator refuses those, which is the right answer to a
    // question that should never have been asked.
    meter = import.meta.env.DEV ? createMeter() : null;
    flagged = [];
    sent = '';
  };
  reset?.addEventListener('click', restart);
  window.addEventListener('keydown', (event) => {
    // Not while the author is typing a note: `R` is in most sentences, and
    // restarting throws the run and its recipe away.
    if (event.code === 'KeyR' && !typing(event.target)) restart();
  });

  const frame = (now: number): void => {
    // `now` is the display's timestamp for this frame — a vsync — so it is what
    // a frame *period* is measured between. The cost of this function is
    // measured from the clock as it is right now, which is a later moment, and
    // keeping the two apart keeps the browser's own scheduling delay out of a
    // number that is supposed to be ours.
    if (meter) frameBegan(meter, now, performance.now());

    const elapsedSeconds = (now - observed) / 1000;
    observed = now;

    // Presentation state is a recurrence and this loop is the whole of
    // [ADR-0015](../docs/adr/0015-presentation-state-carries-what-decays.md)'s
    // first rule: **once per tick, never per frame.** A frame that derived would
    // advance every decay in the game at the display's rate, so a 120Hz phone
    // would home the camera in half the time a 60Hz one does and no two
    // recordings of the same recipe would agree. `interpolate` below reads the
    // two states this produces and its result is never fed back in.
    const ticks = ticksDue(clock, elapsedSeconds, grainSeconds);
    // What the clock bought, and what the run actually spent — which are the
    // same number until the run ends and then never again. `stepSim` does
    // nothing once there is an ending, so a frame after one advances no
    // simulation however many ticks it was handed. Counting those as ticks told
    // the meter that a tick was cheaper than it is (a run whose author kept
    // watching after the death diluted the fit with free ones) and stamped every
    // one of them with the tick the run stopped on. The meter is given the ticks
    // that happened.
    let ran = 0;
    for (let i = 0; i < ticks; i++) {
      previous = current;
      const pressed = isPressed(press);
      // Written down before it is flown, and stamped with the tick it is the
      // input *for* — so the log is what the button did rather than a
      // reconstruction of it, and a replay reproduces the identical sequence by
      // construction. A run that has ended is not recorded past its ending: it
      // has stopped meaning anything, which is what `stepSim` returning
      // immediately already says.
      if (sim.ending === null) {
        recordPress(recorder, sim.tick, pressed);
        ran += 1;
      }
      stepSim(sim, { pressed });
      current = derive(previous, sim);
    }

    sizeToDisplay(context);
    draw(interpolate(previous, current, clock.unspentSeconds / SECONDS_PER_TICK), context);

    if (readout) {
      // The ending is read off the simulation rather than off presentation
      // state, because M1.4 puts nothing about death into the picture — spec
      // 07 §6's unravelling craft and debrief card are M3's and M6's. This is
      // the shell saying what the run did, beside the tick counter; when the
      // death sequence is built it becomes a field on `PresentationState` and
      // this line goes away.
      readout.textContent =
        `APHELION · ${__BUILD_STAMP__} · tick ${current.tick} · ` +
        `${current.craft.speed.toFixed(0)}/s` +
        (sim.ending === null ? '' : ` · ${sim.ending.replace(/_/g, ' ')}`) +
        (flagged.length === 0 ? '' : ` · ${flagged.length} flagged`) +
        sent;
    }

    if (meter) frameEnded(meter, performance.now(), current.tick, ran);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // The recorder's own controls, and they exist only in a dev build: there is
  // nothing to post to in a production one, because the endpoint is the dev
  // server and ADR-0003 rules that there is no backend. `import.meta.env.DEV` is
  // replaced by `false` when the build is made, so everything below — and the
  // dispatch module it reaches — leaves the bundle with it.
  if (import.meta.env.DEV) {
    dev?.removeAttribute('hidden');

    // A flag is a tap and nothing else. It costs no attention, it needs no
    // keyboard, and it lands on the tick the feeling did — which is the half of
    // an observation a phone can produce while the run is still being flown.
    flag?.addEventListener('click', () => {
      flagged.push(sim.tick);
      sent = '';
    });

    send?.addEventListener('click', () => {
      const dispatch = buildDispatch({
        at: new Date().toISOString(),
        recipe: recipeOf(recorder),
        observed: {
          ticks: flagged,
          note: note instanceof HTMLInputElement ? note.value : '',
        },
        device: {
          ua: navigator.userAgent,
          dpr: window.devicePixelRatio,
          css: { w: window.innerWidth, h: window.innerHeight },
        },
        timing: meter && timingOf(meter),
      });
      // The verdict lands in the terminal in front of the laptop, which is where
      // the person holding the phone is about to be. What comes back here is
      // only whether it arrived, and it stays on screen until the next run —
      // a toast that faded would be a toast the author missed while flying.
      void fetch(DIAG_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(dispatch),
      })
        .then(async (response) => {
          const body = (await response.json()) as { ok?: boolean; error?: string };
          sent = body.ok === true ? ' · SENT' : ` · REFUSED ${body.error ?? response.status}`;
        })
        .catch((err: unknown) => {
          sent = ` · UNSENT ${err instanceof Error ? err.message : String(err)}`;
        });
    });
  }
}
