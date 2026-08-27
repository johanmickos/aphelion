/**
 * Everything one frame is drawn from, in one value.
 *
 * WHY IT EXISTS. `Scene.draw` destructured six things and then threaded them
 * through twenty-odd calls, each with its own argument list — so adding anything
 * a layer needed meant editing every signature between here and there. The order
 * those calls happen in is load-bearing and heavily reasoned, and it was
 * expressed as statements, which made it readable only by reading all 180 lines.
 *
 * A frame is the argument a LAYER takes. One parameter, so a new layer never
 * changes a signature, and the order becomes a list that can be read at a glance.
 *
 * IT CARRIES THE THEME FROM THE START, before anything reads it. That is the
 * whole reason this landed before the rest of F03: the alternative was threading
 * a `theme` parameter into some forty draw functions and then removing it again
 * when this arrived. Resolved ONCE per frame and handed down as a value, which
 * also settles a question that looked expensive — whether a theme is fixed for a
 * run or sampled by altitude is now a decision inside one resolver rather than a
 * property of eighty-seven call sites. Nothing the designs ask for needs more:
 * the sky warming toward an approaching anomaly is a per-frame scalar, and the
 * anomaly's own aurora is already a layer of its own.
 *
 * DERIVED VALUES BELONG HERE TOO, and that is not a convenience. `finishY` is
 * read by the line, by the arrow that points at it and by the carpet, and
 * `world.ts` records at length what happens when one geometry is derived in more
 * than one place: "change the basis in the simulation and the line goes on being
 * PAINTED where it used to be, so the player crosses a finish that is no longer
 * there." Computed once per frame, it cannot disagree with itself.
 */
import type { SimConfig } from '../sim/config.ts';
import type { Body } from '../sim/types.ts';
import type { FieldBounds } from '../sim/world.ts';
import type { ScoreState } from '../score/types.ts';
import type { Camera } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { Ceremony } from './ceremony.ts';
import type { RenderSnapshot } from './snapshot.ts';
import type { Theme } from './theme.ts';

export interface Frame {
  ctx: CanvasRenderingContext2D;
  cam: Camera;
  snap: RenderSnapshot;

  sim: SimConfig;
  render: RenderConfig;
  theme: Theme;
  bodies: readonly Body[];
  field: FieldBounds;

  /**
   * The live score. Not on the snapshot: that is derived from `SimState`, and the
   * score deliberately is not part of it — see `src/score/score.ts`.
   */
  score: ScoreState;

  /** Null unless the field has just been cleared. Asked once per frame. */
  cer: Ceremony | null;
  /** Where the run ends as `cleared`, or null when the field cannot be cleared. */
  finishY: number | null;

  timeMs: number;
  /** Seconds since the last frame, for animation that is not tick-locked. */
  frameDt: number;
  /**
   * Nothing may age while this is set.
   *
   * A popup must not decay behind an overlay, a flame must not burn down, a
   * deadline mark must not slide to a new place. Layers that animate check it;
   * layers that only draw the current state do not care.
   */
  paused: boolean;
  viewportW: number;
  viewportH: number;
  /** Bottom of the header text, in design units. */
  headerBottom: number;

  /**
   * Fade of a DEATH sheet, 0..1, or null when none is up.
   *
   * Clocked by the app rather than derived here, because a worthy death has no
   * ceremony to hang a phase off — and it cannot borrow the simulation's hold
   * either: whether a death earned a sheet is a question about `ScoreState`,
   * which `src/sim/` must never be able to see. A CLEAR needs no such field; its
   * fade rides the ceremony, which the frame already has.
   */
  deathSheet: number | null;
  /** Seconds since a death sheet was raised, for its roll. */
  deathSheetT: number;
}
