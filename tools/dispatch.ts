/**
 * A recipe with what the author saw beside it — `CONTEXT.md`'s **dispatch**, and
 * the shape of what crosses the wire from the phone to the machine that keeps
 * it.
 *
 * The author's judgement is the scarcest input this project has and it is made
 * on a phone (ADR-0004, ADR-0010). A session flown without a recorder produces
 * one sentence and no evidence — *"the grab feels late"* — which costs a whole
 * cycle to reproduce and may not be reproducible at all. With a recipe under it
 * the same sentence is a tick number, an agent can re-fly that exact dive under
 * a changed constant, and a disagreement about the swing stops being a
 * disagreement about two memories of it.
 *
 * **It is not a second name for a recipe.** A recipe is the run; a dispatch is
 * the run plus the testimony, and the testimony is the half a machine cannot
 * produce.
 *
 * ## Why it lives in `tools/` and not in `src/`
 *
 * Both of its ends are dev-only: `app/main.ts` builds one behind
 * `import.meta.env.DEV`, and `vite-plugin-diag.ts` — which is `apply: 'serve'`
 * and never exists in a production build — receives it. `src/` is the game, and
 * the three layers there are a wall worth keeping meaningful (ADR-0006); a
 * module that is neither simulation, presentation state nor renderer would be
 * the first thing in it that has no layer. What it must not become is two
 * shapes, one on each side of the wire, so it is one file that both ends import.
 *
 * ## What is validated, and why it is validated here
 *
 * The endpoint writes files on a server bound to every interface on the LAN, so
 * everything below arrives as attacker-shaped data. The recipe is the sharp
 * part — lengths, indices and a seed — and [`parseRecipe`](../src/sim/recipe.ts)
 * is the one door it comes in through, whether it arrives from a phone, from a
 * file or from the CLI. What this file adds is the envelope around it: bounded
 * strings, a bounded count of flagged ticks, and every one of those ticks inside
 * the run it claims to be about.
 */
import type { Recipe } from '../src/sim/recipe.ts';
import { parseRecipe } from '../src/sim/recipe.ts';
import type { Tick } from '../src/sim/types.ts';

/**
 * Where the phone posts, and it is one path.
 *
 * It lives beside the shape rather than inside the plugin because the shell
 * needs it too, and the shell cannot import the plugin: that file reaches
 * `node:fs`, and a browser bundle has no business resolving it even in a branch
 * that is dropped.
 */
export const DIAG_ENDPOINT = '/__diag';

export const DISPATCH_KIND = 'run-dispatch';

/**
 * The most a dispatch may weigh, and it is a **measurement rather than an
 * assumption**.
 *
 * Measured on this build: an 85-second run at spec
 * [01 · §3](../docs/spec/01-swing.md)'s recorded press rate — 278 presses in 474
 * seconds — is 50 presses, **100 edges and 564 bytes**; the whole of that
 * 474-second cohort as a single recipe is **3.2 KB**; an unbroken hour of play at
 * the same rate is **27 KB**. The timing reports already in `diagnostics/` are
 * 1.7 – 1.9 KB. So this is about twice the largest legitimate thing anyone can
 * produce, and eight times narrower than the 512 KB this endpoint used to accept.
 *
 * It is the first line of defence and not the last: the input log's length is
 * bounded only by the run's own length, so a pathological log inside a legal
 * tick count would be megabytes, and the byte cap is what refuses it before
 * `parseRecipe` ever sees it.
 */
export const MAX_DISPATCH_BYTES = 64 * 1024;

/** How much the author may write. Longer than any note anyone has ever left. */
export const MAX_NOTE_LENGTH = 2000;

/**
 * How many ticks the author may flag in one run.
 *
 * A flag is a tap, and a run is a couple of minutes; five hundred of them is
 * more than a thumb can produce and small enough to read.
 */
export const MAX_FLAGGED_TICKS = 500;

/** What the run was flown on. Absent when it was not flown on anything — see below. */
export interface DispatchDevice {
  readonly ua: string;
  readonly dpr: number;
  readonly css: { readonly w: number; readonly h: number };
}

/**
 * What the author observed, which is the half of a dispatch that is not
 * mechanical.
 *
 * Two shapes, because a phone can only produce one of them mid-flight. `ticks`
 * are flagged with a tap while the run is being flown, which costs no attention
 * and lands exactly where the feeling did; `note` is typed afterwards, when
 * there is a keyboard and a hand free. The prototype learned the same split and
 * calls its half *"the player flagging a moment that felt wrong"*.
 */
export interface Observed {
  readonly ticks: readonly Tick[];
  readonly note: string;
}

export interface Dispatch {
  readonly kind: typeof DISPATCH_KIND;
  /**
   * When it was flown, ISO, from the phone's own clock.
   *
   * Evidence about the *session* and never about the *run*: nothing inside a
   * recipe is measured in wall-clock time, because the same session on a
   * stuttering phone and a smooth one produces the same ticks and different
   * milliseconds. This is here to answer "which build was that" and nothing else.
   */
  readonly at: string;
  readonly recipe: Recipe;
  readonly observed: Observed;
  /**
   * Optional, and its absence is meaningful: a dispatch with no device was not
   * flown by a person. The headless pilot in `test/sim/run.ts` produces recipes
   * too, and the one `pnpm replay` ships with is one of them.
   */
  readonly device?: DispatchDevice;
}

/** Stamp a dispatch, trimming what the author wrote to what may be sent. */
export function buildDispatch(args: {
  at: string;
  recipe: Recipe;
  observed: Observed;
  device?: DispatchDevice;
}): Dispatch {
  return {
    kind: DISPATCH_KIND,
    at: args.at,
    recipe: args.recipe,
    observed: {
      ticks: args.observed.ticks.slice(0, MAX_FLAGGED_TICKS),
      note: args.observed.note.slice(0, MAX_NOTE_LENGTH),
    },
    ...(args.device ? { device: args.device } : {}),
  };
}

function boundedString(value: unknown, what: string, most: number): string {
  if (typeof value !== 'string') throw new Error(`${what} is not a string`);
  if (value.length > most) throw new Error(`${what} is longer than ${most} characters`);
  return value;
}

function finite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${what} is not a number`);
  }
  return value;
}

function parseDevice(raw: unknown): DispatchDevice {
  if (typeof raw !== 'object' || raw === null) throw new Error('device is not an object');
  const d = raw as Record<string, unknown>;
  const css = d.css;
  if (typeof css !== 'object' || css === null) throw new Error('device has no css size');
  const size = css as Record<string, unknown>;
  return {
    ua: boundedString(d.ua, 'user agent', 400),
    dpr: finite(d.dpr, 'device pixel ratio'),
    css: { w: finite(size.w, 'css width'), h: finite(size.h, 'css height') },
  };
}

function parseObserved(raw: unknown, ticks: Tick): Observed {
  if (typeof raw !== 'object' || raw === null) throw new Error('dispatch observed nothing');
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.ticks)) throw new Error('flagged ticks are not an array');
  const flagged = o.ticks as unknown[];
  if (flagged.length > MAX_FLAGGED_TICKS) {
    throw new Error(`more than ${MAX_FLAGGED_TICKS} flagged ticks`);
  }
  const out: Tick[] = [];
  for (const entry of flagged) {
    // Inside the run it claims to be about: a flag at a tick the run never
    // reached is a flag on nothing, and the reader would draw it anyway.
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0 || entry > ticks) {
      throw new Error(`flagged tick ${String(entry)} is not inside a run of ${ticks} ticks`);
    }
    out.push(entry);
  }
  return { ticks: out, note: boundedString(o.note, 'note', MAX_NOTE_LENGTH) };
}

/**
 * Validate rather than cast, and rebuild the dispatch out of what survived.
 *
 * What comes back shares nothing with what went in, which is what lets the
 * endpoint write *this* to disk rather than the bytes it was handed: a key
 * nobody validated cannot ride along inside an object that looks validated.
 */
export function parseDispatch(raw: unknown): Dispatch {
  if (typeof raw !== 'object' || raw === null) throw new Error('dispatch is not an object');
  const d = raw as Record<string, unknown>;
  if (d.kind !== DISPATCH_KIND) throw new Error(`not a dispatch: kind ${String(d.kind)}`);
  const recipe = parseRecipe(d.recipe);
  return {
    kind: DISPATCH_KIND,
    at: boundedString(d.at, 'timestamp', 40),
    recipe,
    observed: parseObserved(d.observed, recipe.ticks),
    ...(d.device === undefined ? {} : { device: parseDevice(d.device) }),
  };
}
