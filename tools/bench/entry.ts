/**
 * The gate's desktop bench: the repo's own simulation, with the open questions
 * on sliders.
 *
 * Everything below the controls is the real thing — `src/sim/`, `src/state/`
 * and `src/render/` exactly as they are on `main`, bundled for the browser. The
 * constants listed in [`patches.ts`](./patches.ts) have been made settable and
 * nothing else has been touched, so what this page answers is a question about
 * the game rather than about a model of it.
 *
 * ## Three cards, and the middle one is a layer boundary
 *
 * **Physics** changes what a run *is*, so moving one starts the run again:
 * otherwise the recipe underneath would describe a run nobody flew. **The
 * picture** and **light** change only what is drawn, and presentation state is a
 * convergent recurrence ([ADR-0015](../../docs/adr/0015-presentation-state-carries-what-decays.md)),
 * so they land live on the swing already in the air. The split is ADR-0006's
 * wall as something the author can feel with a mouse.
 */
import { bindPress, suppressBrowserGestures } from './app/input.ts';
import { createPress, isPressed } from './src/input/press.ts';
import { createClock, ticksDue } from './src/sim/clock.ts';
import { fixtureCraft, fixtureField } from './src/sim/fixture-field.ts';
import type { Recipe } from './src/sim/recipe.ts';
import { FIXTURE_FIELD, createRecorder, recipeOf, recordPress } from './src/sim/recipe.ts';
import { createInitialState, stepSim } from './src/sim/step.ts';
import type { SimState } from './src/sim/types.ts';
import * as units from './src/sim/units.ts';
import { SECONDS_PER_TICK } from './src/sim/units.ts';
import * as cameraKnobs from './src/state/camera.ts';
import * as curve from './src/state/decay.ts';
import * as shape from './src/state/deformation.ts';
import * as lamp from './src/state/body.ts';
import * as light from './src/state/energy.ts';
import * as mark from './src/state/sighting.ts';
import * as view from './src/render/index.ts';
import * as fit from './src/render/letterbox.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './src/state/design.ts';
import { SCALE } from './src/sim/units.ts';
import { createPresentation, derive } from './src/state/derive.ts';
import type { PresentationState } from './src/state/types.ts';
import { attachCanvas, sizeToDisplay } from './src/render/canvas.ts';
import { draw } from './src/render/index.ts';
import { interpolate } from './src/render/interpolate.ts';
import { buildDispatch } from './tools/dispatch.ts';
import { envelopeBand, walkRun } from './tools/trail.ts';

const SEED = 1;

interface Knob {
  readonly id: string;
  readonly label: string;
  readonly what: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The value on `main`, and what "at defaults" means. */
  readonly base: number;
  readonly apply: (value: number) => void;
  /** Physics knobs change what a run *is*, so the run starts again. */
  readonly restarts: boolean;
  /** Which card it sits under. Only the first of the three restarts a run. */
  readonly group: 'physics' | 'camera' | 'light' | 'bodies';
  readonly places: number;
}

const KNOBS: Knob[] = [
  {
    id: 'mass',
    label: 'Mass-to-radius exponent',
    what: 'spec 01 §13.2 · 0 is the prototype, every body alike; 2 gives the largest body 2.7× the reach of the smallest',
    min: 0,
    max: 3,
    step: 0.25,
    base: units.MASS_EXPONENT,
    apply: units.set_MASS_EXPONENT,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'ecc',
    label: 'Eccentricity cap',
    what: 'spec 01 §13.5 · binds on all but the slowest dives — real play measured p25 0.58, p50 0.60, p75 0.60',
    min: 0,
    max: 0.95,
    step: 0.05,
    base: units.ECCENTRICITY_CAP,
    apply: units.set_ECCENTRICITY_CAP,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'grazeratio',
    label: 'Graze threshold',
    what: 'spec 01 §10 · how head-on a contact has to be before it kills. 0 kills nothing; 1 kills every touch',
    min: 0,
    max: 1,
    step: 0.02,
    base: units.GRAZE_RATIO,
    apply: units.set_GRAZE_RATIO,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'grazerest',
    label: 'Graze bounce',
    what: 'not in spec 01 — carried from the prototype. Costs up to 17° of heading at the lethal threshold; 0 lets the hull slide',
    min: 0,
    max: 1,
    step: 0.05,
    base: units.GRAZE_RESTITUTION,
    apply: units.set_GRAZE_RESTITUTION,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'bounce',
    label: 'Bounce off a neighbour',
    what: 'spec 01 §10 · a body you are NOT holding, and never lethal. Was 0.6, which flipped the craft over 90° sixteen times in 300 runs; below 0.2 it stops bouncing and starts skidding',
    min: 0,
    max: 1,
    step: 0.05,
    base: units.BOUNCE_RESTITUTION,
    apply: units.set_BOUNCE_RESTITUTION,
    restarts: true,
    group: 'physics',
    places: 2,
  },
  {
    id: 'rim',
    label: 'Rim, at rest',
    what: 'how brightly a body out of reach is drawn — spec 04 §3 answers it at 40%. Brightness is the only ordinal channel (spec 00 §3) and this moves the alpha `dim()` already sanctions',
    min: 0.1,
    max: 1,
    step: 0.05,
    base: view.RIM_AT_REST,
    apply: view.set_RIM_AT_REST,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'tidewidth',
    label: 'Tide weight',
    what: 'how heavy the bright limb is, in design units. Spec 04 §1 holds it constant whatever the body\u2019s radius, so a small body reads as a bright ring and a giant as a thin horizon',
    min: 3,
    max: 36,
    step: 1.5,
    base: view.TIDE_WIDTH,
    apply: view.set_TIDE_WIDTH,
    restarts: false,
    group: 'bodies',
    places: 1,
  },
  {
    id: 'tidefloor',
    label: 'Tide, at its faintest',
    what: 'spec 04 §2 rules a heavier body\u2019s tide is brighter and states neither end. This is the floor; the rest of the range is the body\u2019s own mass',
    min: 0,
    max: 1,
    step: 0.05,
    base: view.TIDE_FLOOR,
    apply: view.set_TIDE_FLOOR,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'tidearc',
    label: 'Tide reach',
    what: 'radians either side, for a body of unbounded mass. The median body gets half of it, which is spec 04 §2\u2019s ±0.3 rad — the law between them is an opening position',
    min: 0.1,
    max: 3,
    step: 0.05,
    base: lamp.TIDE_HALF_WIDTH_MAX,
    apply: lamp.set_TIDE_HALF_WIDTH_MAX,
    restarts: false,
    group: 'bodies',
    places: 2,
  },
  {
    id: 'tidelag',
    label: 'Tide tracking',
    what: 'per second, for a body of unbounded mass; the median gets half, which is spec 04 §2\u2019s k \u2248 6/s. The lag it leaves is the behaviour, not a defect',
    min: 1,
    max: 60,
    step: 1,
    base: lamp.TIDE_LAG_RATE_MAX,
    apply: lamp.set_TIDE_LAG_RATE_MAX,
    restarts: false,
    group: 'bodies',
    places: 0,
  },
  {
    id: 'sighting',
    label: 'Sighting dot',
    what: 'design units. Direction 03 draws a dot on the edge of the picture and states no size; it is inset by exactly this so it never straddles the edge (spec 00 §7)',
    min: 3,
    max: 48,
    step: 1,
    base: mark.SIGHTING_RADIUS,
    apply: mark.set_SIGHTING_RADIUS,
    restarts: false,
    group: 'bodies',
    places: 0,
  },
  {
    id: 'deadzone',
    label: 'Camera deadzone',
    what: 'design units either side before the view follows. Derived as the median body’s floor radius',
    min: 0,
    max: 600,
    step: 4,
    base: cameraKnobs.DEADZONE,
    apply: cameraKnobs.set_DEADZONE,
    restarts: false,
    group: 'camera',
    places: 0,
  },
  {
    id: 'follow',
    label: 'Camera follow rate',
    what: 'per second. Rounds the deadzone’s edges rather than trailing the craft',
    min: 1,
    max: 24,
    step: 0.5,
    base: cameraKnobs.FOLLOW_RATE,
    apply: cameraKnobs.set_FOLLOW_RATE,
    restarts: false,
    group: 'camera',
    places: 1,
  },
  {
    id: 'lockticks',
    label: 'Lock ramp',
    what: 'ticks the lock takes to arrive once the settle is over. 20 is a third of a second',
    min: 1,
    max: 90,
    step: 1,
    base: cameraKnobs.LOCK_TICKS,
    apply: cameraKnobs.set_LOCK_TICKS,
    restarts: false,
    group: 'camera',
    places: 0,
  },
  {
    id: 'release',
    label: 'Lock release rate',
    what: 'per second, how the displacement decays once there is no orbit holding it',
    min: 0.5,
    max: 20,
    step: 0.5,
    base: cameraKnobs.RELEASE_RATE,
    apply: cameraKnobs.set_RELEASE_RATE,
    restarts: false,
    group: 'camera',
    places: 1,
  },

  {
    id: 'e1',
    label: 'E1 · lit',
    what: 'spec 00 §3’s 6px, read into design units. Body rims, labels, a compass window at rest',
    min: 0,
    max: 120,
    step: 3,
    base: light.E1_BLOOM,
    apply: light.set_E1_BLOOM,
    restarts: false,
    group: 'light',
    places: 0,
  },
  {
    id: 'e2',
    label: 'E2 · hot',
    what: 'spec 00 §3’s 18px. The craft’s baseline and a held body — the craft is the brightest thing on screen, always',
    min: 0,
    max: 240,
    step: 3,
    base: light.E2_BLOOM,
    apply: light.set_E2_BLOOM,
    restarts: false,
    group: 'light',
    places: 0,
  },
  {
    id: 'e3',
    label: 'E3 · flash',
    what: 'spec 00 §3’s 48px, additive, and only ever one alive. Struck at every grab and every release',
    min: 0,
    max: 480,
    step: 6,
    base: light.E3_BLOOM,
    apply: light.set_E3_BLOOM,
    restarts: false,
    group: 'light',
    places: 0,
  },
  {
    id: 'e3ticks',
    label: 'E3 · how long',
    what: 'ticks. Spec 00 §3’s 400ms is 24 of them, and it is the only decay length the design states outright',
    min: 1,
    max: 90,
    step: 1,
    base: light.E3_TICKS,
    apply: light.set_E3_TICKS,
    restarts: false,
    group: 'light',
    places: 0,
  },
  {
    id: 'stretch',
    label: 'Release stretch',
    what: 'spec 02 §4 · how far the craft draws out along its velocity as it lets go. 1 is no stretch at all',
    min: 1,
    max: 3,
    step: 0.05,
    base: shape.STRETCH_ALONG,
    apply: shape.set_STRETCH_ALONG,
    restarts: false,
    group: 'light',
    places: 2,
  },
  {
    id: 'squash',
    label: 'Release squash',
    what: 'and how far it narrows across it, the same instant. 1 is none',
    min: 0.3,
    max: 1,
    step: 0.05,
    base: shape.STRETCH_ACROSS,
    apply: shape.set_STRETCH_ACROSS,
    restarts: false,
    group: 'light',
    places: 2,
  },
  {
    id: 'deformticks',
    label: 'Recovery',
    what: 'ticks the stretch takes to come home. Spec 02 §4’s 180ms is 11, dated from the release itself now that the hitstop is gone (ADR-0012)',
    min: 1,
    max: 60,
    step: 1,
    base: shape.DEFORM_TICKS,
    apply: shape.set_DEFORM_TICKS,
    restarts: false,
    group: 'light',
    places: 0,
  },
  {
    id: 'overshoot',
    label: 'Overshoot',
    what: 'how far through the return the value passes rest — 0.37 rebounds a tenth of the way past it, which is spec 02 §4’s own 0.95 against a 1.5 stretch. At 1 there is no overshoot at all',
    min: 0.05,
    max: 1,
    step: 0.01,
    base: curve.OVERSHOOT_FROM,
    apply: curve.set_OVERSHOOT_FROM,
    restarts: false,
    group: 'light',
    places: 2,
  },
];

/**
 * Viewports to fit the design space into — spec 00 §7's open question needs a
 * *shape*, and the bench's own canvas is exactly design-shaped, which is the one
 * shape where both readings agree.
 *
 * The **width is held constant** across all of them, because that is what a phone
 * does: the screen is 393 points wide whatever happens, and the browser's chrome
 * eats the height.
 */
const VIEWPORTS: ReadonlyArray<{ id: string; label: string; w: number; h: number }> = [
  { id: 'browser', label: 'phone, in a browser — 393 × 651', w: 393, h: 651 },
  { id: 'screen', label: 'phone, whole screen — 393 × 852', w: 393, h: 852 },
  {
    id: 'design',
    label: 'the design space itself — 1170 × 2532',
    w: DESIGN_WIDTH,
    h: DESIGN_HEIGHT,
  },
  { id: 'squat', label: 'a squat window — 393 × 500', w: 393, h: 500 },
];

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = byId<HTMLDivElement>('stage');
const context = attachCanvas(stage);
const press = createPress();
bindPress(press, stage);
suppressBrowserGestures(stage);

let sim: SimState;
let current: PresentationState;
let previous: PresentationState;
let recorder = createRecorder(FIXTURE_FIELD, SEED);
let flagged: number[] = [];
const clock = createClock();
let observed = performance.now();

/** Counted here rather than read out of the simulation, exactly as the trail is. */
let sinceGrab = 0;
let sinceFreeze: number | null = null;
let heldBefore: number | null = null;

function start(): void {
  sim = createInitialState(fixtureField(), fixtureCraft(), SEED);
  current = createPresentation(sim);
  previous = current;
  recorder = createRecorder(FIXTURE_FIELD, SEED);
  flagged = [];
  sinceGrab = 0;
  sinceFreeze = null;
  heldBefore = null;
  clock.unspentSeconds = 0;
  redrawTrail();
}

function recipe(): Recipe {
  return recipeOf(recorder);
}

const fmt = (value: number, places = 0): string => value.toFixed(places);

function redrawTrail(): void {
  const trail = walkRun(recipe(), flagged);
  const rows = trail.swings
    .map((swing, index) => {
      const froze = swing.frozenAt === null ? '—' : `+${swing.frozenAt - swing.pressedAt}`;
      const cells = [
        String(index + 1),
        String(swing.pressedAt),
        `#${swing.address}`,
        fmt(swing.grabRadius),
        fmt(swing.approachSpeed),
        froze,
        fmt(swing.periapsis),
        fmt(swing.depth, 2),
        swing.releasedAt === null ? 'held' : String(swing.releasedAt),
        swing.sinceFreeze === null ? '—' : `+${swing.sinceFreeze}`,
        swing.envelope ?? '—',
        swing.exitSpeed === null ? '—' : fmt(swing.exitSpeed),
      ];
      const band = swing.envelope === null ? '' : ` class="e-${swing.envelope}"`;
      return `<tr${band}>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    .reverse()
    .join('');
  byId('swings').innerHTML =
    rows || '<tr><td colspan="12" class="empty">no swings yet — press to be caught</td></tr>';

  byId('summary').textContent =
    `${trail.ticks} ticks · ${fmt(trail.ticks / 60, 1)}s · ${trail.swings.length} swings · ` +
    `${trail.refused} refused · climbed ${fmt(trail.climbed)}`;

  byId('flags').innerHTML =
    trail.moments
      .map((moment) => {
        const where =
          moment.phase === 'coasting'
            ? 'coasting'
            : moment.phase === 'diving'
              ? `diving at #${moment.address}, ${moment.sinceGrab} ticks in`
              : `orbiting #${moment.address}, +${moment.sinceFreeze} since the freeze (${moment.envelope})`;
        return `<li><b>tick ${moment.tick}</b> · ${where} · ${fmt(moment.speed)}/s</li>`;
      })
      .join('') || '<li class="empty">nothing flagged</li>';

  byId<HTMLTextAreaElement>('dispatch').value = JSON.stringify(
    buildDispatch({
      at: new Date().toISOString(),
      recipe: recipe(),
      observed: { ticks: flagged, note: noteFor() },
    }),
  );
}

/**
 * What the knobs say, so a run flown off the defaults cannot be read as one that
 * was not — and so `pnpm replay` cannot silently fly it at the repo's values.
 */
function offDefaults(): string[] {
  const off = KNOBS.filter((knob) => value(knob) !== knob.base).map(
    (knob) => `${knob.label} ${fmt(value(knob), knob.places)} (was ${fmt(knob.base, knob.places)})`,
  );
  if (!cameraKnobs.LOCK_ON) off.push('camera lock OFF');
  if (fit.FIT_WIDTH) off.push('fitted to the width rather than whole');
  return off;
}

function noteFor(): string {
  const off = offDefaults();
  const typed = byId<HTMLInputElement>('note').value.trim();
  if (off.length === 0) return typed;
  return `${typed ? typed + ' — ' : ''}FLOWN OFF DEFAULTS: ${off.join('; ')}`;
}

function value(knob: Knob): number {
  return Number(byId<HTMLInputElement>(`k-${knob.id}`).value);
}

/** Shape the stage to the chosen viewport, holding its width still. */
function shapeStage(): void {
  const chosen =
    VIEWPORTS.find((v) => v.id === byId<HTMLSelectElement>('viewport').value) ?? VIEWPORTS[0]!;
  stage.style.aspectRatio = `${chosen.w} / ${chosen.h}`;
}

/**
 * What this fit costs, in the two numbers that decide spec 00 §7.
 *
 * Both are pure geometry of the fit and independent of how large the bench
 * happens to draw it: how much of the width the composition occupies, and how
 * much world height the device gets to show.
 */
function sayFit(): void {
  const canvas = context.canvas;
  if (!canvas.width || !canvas.height) return;
  const { scale } = fit.letterbox(canvas.width, canvas.height);
  const across = ((DESIGN_WIDTH * scale) / canvas.width) * 100;
  const worldHigh = canvas.height / scale;
  const cut = Math.max(0, (DESIGN_HEIGHT - worldHigh) / 2);
  byId('fit-cost').innerHTML =
    `the composition fills <b>${across.toFixed(0)}%</b> of the width · ` +
    `you see <b>${(worldHigh / SCALE).toFixed(0)}</b> prototype units of height` +
    (cut > 0.5
      ? ` · <b class="cut">${cut.toFixed(0)} design units are cut off the top and the bottom</b>`
      : '');
}

function hud(): void {
  const held = sim.heldBody;
  const phase = held === null ? 'coasting' : sim.orbit !== null ? 'orbiting' : 'diving';
  const band = sinceFreeze === null ? '' : ` · ${envelopeBand(sinceFreeze)}`;
  byId('hud').textContent =
    `tick ${current.tick} · ${fmt(current.craft.speed)}/s · ${phase}` +
    (held === null ? '' : ` #${held + 1} · +${sinceGrab} in`) +
    (sinceFreeze === null ? '' : ` · +${sinceFreeze} since freeze${band}`);

  const ending = byId('ending');
  ending.textContent = sim.ending === null ? '' : sim.ending.replace(/_/g, ' ');
  ending.className =
    sim.ending === null ? 'ending' : `ending over${sim.ending === 'CLEARED' ? ' cleared' : ''}`;
}

function frame(now: number): void {
  const elapsedSeconds = (now - observed) / 1000;
  observed = now;

  let released = false;
  const ticks = ticksDue(clock, elapsedSeconds);
  for (let i = 0; i < ticks; i++) {
    previous = current;
    const pressed = isPressed(press);
    if (sim.ending === null) recordPress(recorder, sim.tick, pressed);
    const wasEnding = sim.ending;
    stepSim(sim, { pressed });
    current = derive(previous, sim);

    // Counted here, exactly as the trail counts them: the freeze's own clock is
    // never read off the orbit (ADR-0013).
    const held = sim.heldBody;
    if (held === null) {
      if (heldBefore !== null) released = true;
      sinceGrab = 0;
      sinceFreeze = null;
    } else if (heldBefore === null) {
      sinceGrab = 0;
      sinceFreeze = sim.orbit === null ? null : 0;
    } else {
      sinceGrab += 1;
      if (sim.orbit !== null) sinceFreeze = sinceFreeze === null ? 0 : sinceFreeze + 1;
    }
    heldBefore = held;
    if (wasEnding === null && sim.ending !== null) released = true;
  }

  sizeToDisplay(context);
  draw(interpolate(previous, current, clock.unspentSeconds / SECONDS_PER_TICK), context);
  hud();
  sayFit();
  if (released) redrawTrail();
  requestAnimationFrame(frame);
}

// ---- the controls -------------------------------------------------------

function renderKnobs(): void {
  const markup = (knobs: Knob[]): string =>
    knobs
      .map(
        (knob) => `
      <label class="knob" for="k-${knob.id}">
        <span class="knob-head"><span class="knob-name">${knob.label}</span>
        <output id="v-${knob.id}"></output></span>
        <input type="range" id="k-${knob.id}" min="${knob.min}" max="${knob.max}"
               step="${knob.step}" value="${knob.base}" />
        <span class="knob-what">${knob.what}</span>
      </label>`,
      )
      .join('');

  // Grouped by what a change costs, which is ADR-0006's layer boundary made
  // visible: a physics constant changes what a run *is*, so the run starts
  // again and the recipe still describes it; everything below it changes only
  // the picture, and presentation state converges (ADR-0015), so it lands live
  // on the swing already in the air.
  for (const group of ['physics', 'camera', 'light', 'bodies'] as const) {
    byId(`knobs-${group}`).innerHTML = markup(KNOBS.filter((knob) => knob.group === group));
  }

  for (const knob of KNOBS) {
    const input = byId<HTMLInputElement>(`k-${knob.id}`);
    input.addEventListener('input', () => {
      knob.apply(value(knob));
      showKnob(knob);
      if (knob.restarts) start();
      else redrawTrail();
      showDefaults();
    });
    showKnob(knob);
  }
}

function showKnob(knob: Knob): void {
  const at = value(knob);
  const out = byId(`v-${knob.id}`);
  out.textContent = fmt(at, knob.places);
  out.className = at === knob.base ? '' : 'moved';
}

function showDefaults(): void {
  const off = offDefaults().length;
  const line = byId('defaults-state');
  line.textContent =
    off === 0
      ? 'every constant is where main has it'
      : `${off} ${off === 1 ? 'constant is' : 'constants are'} off default — the dispatch says so, and pnpm replay will fly this at main's values instead`;
  line.className = off === 0 ? 'state' : 'state moved';
}

renderKnobs();
byId<HTMLSelectElement>('viewport').innerHTML = VIEWPORTS.map(
  (v) => `<option value="${v.id}">${v.label}</option>`,
).join('');
shapeStage();
start();

byId('reset').addEventListener('click', (event) => {
  start();
  (event.currentTarget as HTMLElement).blur();
});
byId('flag').addEventListener('click', (event) => {
  flagged.push(sim.tick);
  redrawTrail();
  (event.currentTarget as HTMLElement).blur();
});
byId('defaults').addEventListener('click', (event) => {
  for (const knob of KNOBS) {
    byId<HTMLInputElement>(`k-${knob.id}`).value = String(knob.base);
    knob.apply(knob.base);
    showKnob(knob);
  }
  byId<HTMLInputElement>('lock').checked = true;
  cameraKnobs.set_LOCK_ON(true);
  byId<HTMLInputElement>('fitwidth').checked = false;
  fit.set_FIT_WIDTH(false);
  showDefaults();
  start();
  (event.currentTarget as HTMLElement).blur();
});
byId<HTMLSelectElement>('viewport').addEventListener('change', () => shapeStage());
byId<HTMLInputElement>('fitwidth').addEventListener('change', (event) => {
  fit.set_FIT_WIDTH((event.currentTarget as HTMLInputElement).checked);
  showDefaults();
  // So the dispatch says which reading the run was flown under: the fit changes
  // nothing about the run and everything about what the author could see of it.
  redrawTrail();
});
byId<HTMLInputElement>('lock').addEventListener('change', (event) => {
  cameraKnobs.set_LOCK_ON((event.currentTarget as HTMLInputElement).checked);
  showDefaults();
  redrawTrail();
});
byId<HTMLInputElement>('note').addEventListener('input', () => redrawTrail());
byId('copy').addEventListener('click', (event) => {
  const box = byId<HTMLTextAreaElement>('dispatch');
  box.select();
  void navigator.clipboard?.writeText(box.value).catch(() => undefined);
  const button = event.currentTarget as HTMLElement;
  button.textContent = 'COPIED';
  setTimeout(() => (button.textContent = 'COPY'), 1200);
  button.blur();
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyR' && !(event.target instanceof HTMLInputElement)) start();
});

showDefaults();
requestAnimationFrame(frame);
