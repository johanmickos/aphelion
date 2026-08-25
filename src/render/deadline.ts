/**
 * The deadline: where the last press that still saves you would have to happen.
 *
 * A track lying along the ship's own projected path, thickening into a dot at the
 * point of no return. Drawn on the thing it describes, like the compass and the
 * orbit arc — the playtest of 2026-08-22 named that as the strongest UI in the
 * game and the bar the rest should be measured against.
 *
 * WHAT IT IS FOR, re-measured over all 64 recordings in `diagnostics/` on
 * 2026-08-25. A drifting ship is not being offered a rescue: of 196 out-of-bounds
 * deaths, only 63 ever had a live cross at all, so 68% of them were never in a
 * position for this cue to say anything. It is NOT a rescue prompt.
 *
 * It is a RISK DIAL. `edgeHeat` pays only for time spent CAPTURED inside the 60px
 * band, so the latest legal grab is also the longest, hottest burn. The cross
 * marks the maximum of the curve the burn already pays out on, and the whole
 * point is to be able to aim at it. The reward for aiming well is not paid here
 * and does not depend on this drawing: `burnBank` integrates depth over the run
 * and `awardBurn` pays it when the fire dies, whether or not a mark was ever on
 * screen. See `src/score/burn.ts`.
 *
 * WHY NOTHING IS LEFT BEHIND. This used to leave a fading mark — a "scar", which
 * is what the file was called — on the theory that a cross receding behind the
 * ship said "the release was the mistake". Two things killed it. The author's:
 * "I don't love the scars being left after all; they're cluttering the space."
 * And the measurement: the residue could only ever appear on the 32% of
 * out-of-bounds deaths that had a cross, so the arbitrary-death complaint it was
 * built to answer went unanswered in the majority case regardless. That lesson
 * moved to the debrief, which fires on all 196.
 *
 * WHAT IT COSTS TO BE BRIEF. Split by outcome over 640 cross episodes: 74% end
 * because the player PRESSED (median 0.50s on screen, 1.77s of lead), 24% because
 * the ship passed the cross, 1% in death, 1% evaporated. So the cue is short-lived
 * because it works, not because it flickers — and the confirm below is therefore
 * the most important thing it draws.
 *
 * WHY IT IS RED AND NOT THE FIRE'S RED. `HAZARD` is the hazard band's own colour,
 * and the deadline is a fact about that band. Note 51 spent three passes
 * establishing that `BURN` MEANS "this is about burning"; borrowing it here would
 * promise a fire that has not started. Both live in `palette.ts`. The deadline
 * separates from the wall by FORM instead — the wall is straight, dashed and
 * vertical, this lies along your own path — which is the channel that was free.
 */
import type { RescueDeadline, DeadlineSample } from '../sim/rescue.ts';
import { hypot } from '../sim/orbit.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import { HAZARD, withAlpha } from './palette.ts';

/** The mark, once it is a place in the world rather than a prediction. */
interface Mark {
  x: number;
  y: number;
  /** Unit heading the path had at the cross; the dot's core is oriented by it. */
  dx: number;
  dy: number;
  /** Seconds until the ship reaches it. Negative once it is behind. */
  lead: number;
  /** Seconds since this mark appeared, so nothing ever pops into existence. */
  born: number;
}

/**
 * The confirm: what is left on screen after a press, and nothing else is.
 *
 * Separate from `Mark` because it outlives one — the mark is dropped the instant
 * the question it asked is answered, and this is the answer.
 */
interface Confirm {
  x: number;
  y: number;
  /** Seconds since the press. */
  age: number;
  /**
   * How close to the cross the press was, 0..1.
   *
   * Frozen at the press, which is what makes this a reward rather than an
   * ambience: it says "you pressed THERE". A mark the ship merely drifted past
   * never produces a confirm at all.
   */
  strength: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return t * t * (3 - 2 * t);
}

/**
 * A variable-width ribbon through a polyline, one quad per segment.
 *
 * Per-segment rather than as a single polygon because each segment carries its
 * own alpha: over a stretch where a press would be refused the shape dims rather
 * than disappearing, so a holed approach still reads as one track.
 */
function ribbon(
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<{ x: number; y: number; w: number; a: number }>,
): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    let nx = q.y - p.y;
    let ny = -(q.x - p.x);
    const len = hypot(nx, ny);
    if (len < 1e-6) continue;
    nx /= len;
    ny /= len;
    const a = (p.a + q.a) / 2;
    if (a <= 0.004) continue;
    ctx.fillStyle = withAlpha(HAZARD, a);
    ctx.beginPath();
    ctx.moveTo(p.x + nx * p.w, p.y + ny * p.w);
    ctx.lineTo(q.x + nx * q.w, q.y + ny * q.w);
    ctx.lineTo(q.x - nx * q.w, q.y - ny * q.w);
    ctx.lineTo(p.x - nx * p.w, p.y - ny * p.w);
    ctx.closePath();
    ctx.fill();
  }
}

export class Deadline {
  /** Where the mark is DRAWN. Chases `target`, and is never the prediction itself. */
  private mark: Mark | null = null;

  /** Where the prediction currently says the cross is. */
  private target: { x: number; y: number; dx: number; dy: number } | null = null;

  /** The answer to the last mark, if it was answered by a press. */
  private confirm: Confirm | null = null;

  /** The path behind the current mark, ship-first. */
  private path: DeadlineSample[] = [];

  /**
   * Take the latest prediction.
   *
   * Called on the simulation tick and not every frame: the answer is a property
   * of a straight drift, so recomputing it faster than it can change buys nothing
   * but heat. `dt` is the time since the last call.
   *
   * `captured` is passed rather than inferred. A null `deadline` used to be read
   * as "the ship must have been captured, so a press happened", which is true
   * most of the time and silently wrong when a drift simply stops threatening a
   * wall — that case would have fired a confirm for a press nobody made.
   */
  observe(
    deadline: RescueDeadline | null,
    captured: boolean,
    rcfg: RenderConfig,
    dt: number,
  ): void {
    if (this.confirm) {
      this.confirm.age += dt;
      if (this.confirm.age >= rcfg.deadlineConfirmSecs) this.confirm = null;
    }

    if (deadline?.cross) {
      const c = deadline.cross;
      // Only as far as the cross. The heading comes from the end of THAT, not
      // from the end of the projection: the path continues to the wall, and the
      // mark must sit on the ship's heading where the cross is.
      const upto = deadline.path.filter((s) => s.t <= c.t);
      const n = upto.length;
      // Two DISTINCT samples, or the heading collapses to nothing. Taking
      // `upto[n-1]` and `upto[n-2]` reads well and is wrong at the one moment
      // that matters: when the cross is inside the first sample there is only one
      // entry, both ends resolve to it, and the heading comes out (0, 0).
      const prev = n > 1 ? upto[n - 2]! : deadline.path[0]!;
      const last = n > 1 ? upto[n - 1]! : deadline.path[Math.min(1, deadline.path.length - 1)]!;
      let dx = last.x - prev.x;
      let dy = last.y - prev.y;
      const len = hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;

      // THE BIRTH GATE. A cross that appears with less lead than a person can
      // react in cannot inform the press it is asking for, and with no residue it
      // now leaves nothing behind either — so it would be a red blink and nothing
      // else. Measured, the cohort this removes is real: the 24% of episodes the
      // ship sails through appear with a median 0.27s of lead, against p10 = 0.22s
      // over all episodes.
      //
      // A BIRTH gate and not a live one. Once a mark exists it stays through its
      // own arrival; re-testing every observation would blink it out at the
      // moment the player is closest to it.
      if (!this.mark && c.t < rcfg.deadlineMinLeadSecs) return;

      // A MARK THAT HAS BEEN PASSED IS NOT MOVED, IT IS REPLACED. Reported as
      // "the cross kind of jumped forward a few times". On the session that
      // reported it the cue was absent for 3.9s — a capture — and the cross that
      // came back sat 456px from the one that went away, which the follower then
      // dragged across the screen in three visible steps. There is nothing
      // continuous between those two situations.
      if (!this.mark || this.mark.lead <= 0) {
        this.mark = { x: c.x, y: c.y, dx, dy, lead: c.t, born: 0 };
      } else {
        this.mark.lead = c.t;
      }
      // Uninterrupted, the mark eases toward this in `update`, per frame. Setting
      // it here and moving there is what stops the mark stepping at the 10Hz the
      // prediction is recomputed at.
      this.target = { x: c.x, y: c.y, dx, dy };
      this.path = upto;
      return;
    }

    // Nothing to mark. Two cases, and they end very differently.
    if (this.mark) {
      if (captured) {
        // A press. This is the only thing that survives the mark, and it is
        // scaled by how close the press was to the cross — the reward for timing
        // it late, in the one channel that can still be read after the fact.
        this.confirm = {
          x: this.mark.x,
          y: this.mark.y,
          age: 0,
          strength: clamp01(
            1 - Math.max(0, this.mark.lead) / Math.max(1e-6, rcfg.deadlineFullSecs),
          ),
        };
      }
      // Either way the mark goes NOW. Nothing recedes, nothing fades in place:
      // the question is answered and the space belongs to the game again.
      this.mark = null;
    }
    this.target = null;
    this.path = [];
  }

  /**
   * Advance the follower, once per FRAME.
   *
   * Separated from `observe` because the two run at different rates and only one
   * of them is about smoothness. The prediction is recomputed ten times a second;
   * easing there meant `dt * deadlineSettleRate` was 0.9, so the mark covered 90%
   * of any correction in a single step and then sat still for a tenth of a second
   * — a follower in name only, and visibly a series of jumps.
   */
  update(frameDt: number, rcfg: RenderConfig): void {
    if (this.confirm) this.confirm.age += frameDt;
    const m = this.mark;
    if (!m) return;
    m.born += frameDt;
    if (!this.target) return;
    const k = 1 - Math.exp(-rcfg.deadlineSettleRate * frameDt);
    m.x += (this.target.x - m.x) * k;
    m.y += (this.target.y - m.y) * k;
    m.dx += (this.target.dx - m.dx) * k;
    m.dy += (this.target.dy - m.dy) * k;
    const dl = hypot(m.dx, m.dy) || 1;
    m.dx /= dl;
    m.dy /= dl;
  }

  /**
   * Forget everything. Called on a respawn: a new run is a new world, and a mark
   * pinned to a wall that is no longer there is a lie in world coordinates.
   */
  clear(): void {
    this.mark = null;
    this.target = null;
    this.confirm = null;
    this.path = [];
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, rcfg: RenderConfig): void {
    if (this.confirm) this.drawConfirm(ctx, cam, rcfg, this.confirm);
    if (this.mark) this.drawMark(ctx, cam, rcfg, this.mark);
  }

  /**
   * The dot, and only the dot.
   *
   * No track: the track described a decision that is now made, and redrawing it
   * would say the deadline is still ahead. No width term either — the shipped
   * glow moved alpha AND width together, which was tuned for a mark that then sat
   * fading for 1.6 seconds. At a quarter of a second that same peak lands as a
   * blink, reported as "REALLY visually loud". Shortening the duration means the
   * peak comes down, not stays put.
   */
  private drawConfirm(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    rcfg: RenderConfig,
    c: Confirm,
  ): void {
    const u = clamp01(c.age / Math.max(1e-6, rcfg.deadlineConfirmSecs));
    const lift = (rcfg.deadlineConfirmAlpha - rcfg.deadlineAlpha) * c.strength;
    const alpha = (rcfg.deadlineAlpha + lift) * (1 - smoothstep(u));
    if (alpha <= 0.004) return;
    this.dot(ctx, cam, rcfg, c.x, c.y, alpha);
  }

  private dot(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    rcfg: RenderConfig,
    x: number,
    y: number,
    alpha: number,
  ): void {
    const sx = toScreenX(cam, x);
    const sy = toScreenY(cam, y);
    const s = cam.scale;
    ctx.beginPath();
    ctx.arc(sx, sy, rcfg.deadlineMarkerCoreR * s, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(HAZARD, alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, rcfg.deadlineMarkerR * s, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(HAZARD, alpha * 0.55);
    ctx.lineWidth = Math.max(1, rcfg.deadlineMarkerRing * s);
    ctx.stroke();
  }

  private drawMark(ctx: CanvasRenderingContext2D, cam: Camera, rcfg: RenderConfig, m: Mark): void {
    // Ramping in ahead of the ship, times a birth ramp so a mark BORN close to
    // the ship — where the lead ramp is already at full strength — arrives rather
    // than appears. Same rate as the follower, because both answer "how fast does
    // this react to a change": one for where it is, one for whether it is there.
    const born = 1 - Math.exp(-rcfg.deadlineSettleRate * m.born);
    const ramp =
      m.lead <= rcfg.deadlineFullSecs
        ? 1
        : 1 -
          smoothstep(
            (m.lead - rcfg.deadlineFullSecs) /
              Math.max(1e-6, rcfg.deadlineFadeInSecs - rcfg.deadlineFullSecs),
          );
    const base = rcfg.deadlineAlpha * born * ramp;
    if (base <= 0.004) return;

    ctx.save();

    // ---- the track, from the ship along its own projected path
    //
    // FULL LENGTH, TAPERED, rather than clamped to a floating stub. The clamp it
    // replaces was asked for as "if the projected line is really long, we should
    // clamp it — there's no danger of going out of bounds yet", which is sound,
    // but measured it did something else: the cross first appears a median 375px
    // away and 772px at p75, so a 150px clamp drew a segment sitting a quarter of
    // a screen ahead of the ship, touching nothing. It only genuinely emerged from
    // the ship in the bottom quartile — which is the `passed` cohort, the episodes
    // that arrive too late to matter.
    //
    // So the track always reaches the ship, and `deadlineArmMaxPx` now says where
    // it stops being a hairline instead of where it stops existing. The far end
    // carries the connection and nothing else; the weight is all in the stretch
    // with a decision in it.
    if (this.path.length > 1) {
      // Distance to the cross, per sample, so the profile is a property of the
      // shape rather than of how fast the ship happens to be going.
      const n = this.path.length;
      const toCross: number[] = new Array<number>(n);
      toCross[n - 1] = 0;
      for (let i = n - 2; i >= 0; i--) {
        const a = this.path[i]!;
        const b = this.path[i + 1]!;
        toCross[i] = toCross[i + 1]! + hypot(b.x - a.x, b.y - a.y);
      }

      const lead = rcfg.deadlineLeadLenPx;
      const arm = Math.max(rcfg.deadlineArmMaxPx, lead + 1e-6);
      const pts: Array<{ x: number; y: number; w: number; a: number }> = [];
      for (let i = 0; i < n; i++) {
        const s = this.path[i]!;
        const d = toCross[i]!;
        // hairline -> track, over the stretch between the two lengths
        const h = smoothstep((arm - d) / (arm - lead));
        const body = rcfg.deadlineHairFrac + (1 - rcfg.deadlineHairFrac) * h;
        // track -> lead-in, over the final stretch
        const g = d < lead ? 1 - d / lead : 0;
        pts.push({
          x: toScreenX(cam, s.x),
          y: toScreenY(cam, s.y),
          w: (rcfg.deadlineTrackWidth + rcfg.deadlineLeadWidth * g) * cam.scale * body,
          a:
            base *
            (rcfg.deadlineTrackAlpha + (rcfg.deadlineLeadAlpha - rcfg.deadlineTrackAlpha) * g) *
            body *
            (s.live ? 1 : rcfg.deadlineDeadFrac),
        });
      }
      // The path was computed against the cross the follower is still easing
      // toward, so its far end and the mark can be a few pixels apart mid-glide.
      // Land the track ON the mark, so the dot never sits off the end of it.
      const tip = pts[pts.length - 1]!;
      tip.x = toScreenX(cam, m.x);
      tip.y = toScreenY(cam, m.y);
      ribbon(ctx, pts);
    }

    this.dot(ctx, cam, rcfg, m.x, m.y, base * rcfg.deadlineLeadAlpha);

    ctx.restore();
  }
}
