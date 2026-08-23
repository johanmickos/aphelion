/**
 * The running total of a dead-zone drag, counting up beside the ship.
 *
 * Every other award in the game is settled before the player sees a number: a
 * grab pays at periapsis, a link at the release, and the popup reports something
 * that already happened. This one is different because the act is still happening
 * — the ship is inside the red band with a wall a few pixels away, and the
 * question in front of the player is whether to hold on for more or get out with
 * what they have. A number that only appeared afterwards could not be part of that
 * decision, which is the whole reason to draw it live.
 *
 * It could not have existed a week ago. A periapsis flare ran 0.17s, which is
 * about four frames of a number changing — unreadable, and the reason the first
 * version settled for a popup that rolled up AFTER the fact. A drag runs 0.42s at
 * the median and up to 1.45s, which is long enough to watch a total climb and
 * decide something about it.
 *
 * WHERE IT SITS
 *
 * Inboard, on the opposite side of the ship from the wall it is hugging.
 *
 * Both vertical lanes were already taken — popups rise above the ship from
 * `SPAWN_LIFT`, the fuel badge sits 26 below — and a third channel stacked into
 * either one would collide at exactly the busiest moment the game has. The
 * horizontal choice is not a leftover, though: a burning ship is by definition
 * pressed against the left or right edge of the field, so the inboard side is
 * both the empty half of the screen and the half the player's eye is already on,
 * looking at where they have to get back to.
 */
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { FieldBounds } from '../sim/world.ts';
import { BURN } from './accolade.ts';

/** Design units from the ship centre to the number's near edge. */
const GAP = 15;

/**
 * How hard the number punches when it grows, and how fast that settles.
 *
 * Small on purpose. The number is already the largest thing in `accolade.ts` and
 * it is changing every tick; a pop big enough to notice per increment would read
 * as a vibration rather than as progress.
 */
const PULSE = 0.14;
const PULSE_HZ = 9;

/**
 * Draw the live tally, or nothing when the ship is not burning.
 *
 * Stateless: the number comes from `ScoreState.burnPoints`, which is the exact
 * value the award will pay, and the only animation is a function of `timeMs`. A
 * drag that ends in the wall simply stops being drawn, which is correct — the
 * points are gone with the life, and a tally that lingered would be reporting a
 * total nobody was paid.
 */
export function drawBurnTally(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  field: FieldBounds,
  shipX: number,
  shipY: number,
  points: number,
  heat: number,
  timeMs: number,
): void {
  if (points <= 0 || heat <= 0) return;

  // Away from the nearer wall. Computed from the ship rather than passed in, so
  // it cannot disagree with which side is actually burning.
  const inboard = shipX < (field.left + field.right) / 2 ? 1 : -1;
  const s = cam.scale;
  const x = toScreenX(cam, shipX + inboard * GAP);
  const y = toScreenY(cam, shipY);

  // Grows with the heat, so the number swells as the ship goes deeper — the same
  // signal the flame is giving, on the channel the player is reading anyway.
  const pulse = 1 + PULSE * heat * (0.5 + 0.5 * Math.sin(timeMs * 0.001 * PULSE_HZ * Math.PI * 2));
  const size = BURN.size * pulse * s;

  ctx.save();
  ctx.textAlign = inboard > 0 ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${size}px ui-monospace, monospace`;

  const text = `+${points.toLocaleString('en-US')}`;
  // A dark rim rather than a plate: this is drawn over planets, stars and a red
  // hazard gradient, and a box that size would punch a hole in the scene.
  ctx.lineWidth = 3.5 * s;
  ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = BURN.color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
