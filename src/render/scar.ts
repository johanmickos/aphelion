/**
 * The scar: where the last press that still saves you would have to happen.
 *
 * A spindle lying along the ship's own projected path, crossed at the point of no
 * return, every tip tapering to nothing. Drawn on the thing it describes, like
 * the compass and the orbit arc — the playtest of 2026-08-22 named that as the
 * strongest UI in the game and the bar the rest should be measured against.
 *
 * WHAT IT IS FOR, measured before it was drawn. Over the 62 recordings, a
 * drifting ship that dies at a side wall has been drifting a median 0.85s, and a
 * live cross is ahead of it for a median 0.13s of that — 40% of those deaths
 * never had one at all. So this is NOT a rescue prompt: the fatal decision was
 * the release, and by the time the ship is drifting it is usually already made.
 *
 * It is a RISK DIAL. 41% of crosses sit inside the 60px red band and the median
 * one is 90px from the lethal line, while `edgeHeat` pays only for time spent
 * captured inside that band — so the latest legal grab is also the longest,
 * hottest burn. The cross marks the maximum of the curve the burn already pays
 * out on, and the whole point is to be able to aim at it.
 *
 * And on the deaths it cannot prevent, the mark that stays behind is the payoff.
 * The ship flies past its own last chance and the cross recedes, which says the
 * release was the mistake — a truer lesson than a warning could have given, and
 * an answer to the playtest's worst moment, where a run ended with full fuel and
 * two planets on screen and the failure read as arbitrary.
 *
 * WHY IT IS RED AND NOT THE FIRE'S RED. `rgba(255,70,90)` is the hazard band's
 * own colour, and the scar is a fact about that band. Note 51 spent three passes
 * establishing that `#ee3f2c` MEANS "this is about burning"; borrowing it here
 * would promise a fire that has not started. The scar separates from the wall by
 * FORM instead — the wall is straight, dashed and vertical, this is a lens lying
 * along your own path — which is the channel that was free.
 */
import type { RescueScar, ScarSample } from '../sim/rescue.ts';
import { hypot } from '../sim/orbit.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';

/** The mark, once it is a place in the world rather than a prediction. */
interface Mark {
  x: number;
  y: number;
  /** Unit heading the path had at the cross; the arm lies along it. */
  dx: number;
  dy: number;
  /** Seconds since the ship passed it. Negative while it is still ahead. */
  age: number;
  /** Seconds since this mark appeared, so nothing ever pops into existence. */
  born: number;
  /**
   * How big the mark draws, as a multiple of its configured size.
   *
   * Set from the fire waiting at the cross. Carried on the mark rather than
   * recomputed at draw time so a ghost keeps the size it had when it was
   * abandoned — it is a record of what was on offer then, not a live reading.
   */
  scale: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return t * t * (3 - 2 * t);
}

/**
 * Half-width of the arm at `u` of its LENGTH, peaking at `uc`.
 *
 * Parameterised by distance and not by time, deliberately: the stub past the
 * cross is a fixed number of pixels, so a time-based `u` would make the shape
 * change proportions with the ship's speed.
 *
 * The peak sits ON the cross rather than in the middle of the shape, so the
 * spindle thickens as it approaches the mark and the eye is carried to it. The
 * 0.6 exponent is what sharpens the ends into points instead of leaving them
 * rounded — a sine alone tapers too politely to read as a scar.
 */
function armWidth(u: number, uc: number, peak: number): number {
  const half =
    uc <= 0 ? 1 : uc >= 1 ? 0 : u <= uc ? (u / uc) * 0.5 : 0.5 + ((u - uc) / (1 - uc)) * 0.5;
  return peak * Math.pow(Math.sin(Math.PI * half), 0.6);
}

/**
 * A tapered spindle through a polyline, one quad per segment.
 *
 * Per-segment rather than as a single polygon because each segment carries its
 * own alpha: over a stretch where a press would be refused the shape dims rather
 * than disappearing, so a holed approach still reads as one scar.
 */
function spindle(
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
    ctx.fillStyle = `rgba(255,70,90,${a})`;
    ctx.beginPath();
    ctx.moveTo(p.x + nx * p.w, p.y + ny * p.w);
    ctx.lineTo(q.x + nx * q.w, q.y + ny * q.w);
    ctx.lineTo(q.x - nx * q.w, q.y - ny * q.w);
    ctx.lineTo(p.x - nx * p.w, p.y - ny * p.w);
    ctx.closePath();
    ctx.fill();
  }
}

/** A straight spindle between two world points, tapering to a point at each end. */
function bar(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  peak: number,
  alpha: number,
): void {
  const N = 12;
  const pts: Array<{ x: number; y: number; w: number; a: number }> = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    pts.push({
      x: toScreenX(cam, x0 + (x1 - x0) * u),
      y: toScreenY(cam, y0 + (y1 - y0) * u),
      w: peak * cam.scale * Math.pow(Math.sin(Math.PI * u), 0.6),
      a: alpha,
    });
  }
  spindle(ctx, pts);
}

export class Scar {
  /**
   * Where the mark is DRAWN. Chases `target`, and is never the prediction itself.
   */
  private mark: Mark | null = null;

  /** Where the prediction currently says the cross is, and how big it is worth. */
  private target: { x: number; y: number; dx: number; dy: number; scale: number } | null = null;

  /**
   * A mark that has been abandoned, fading where it stood.
   *
   * One slot, because there is only ever one thing to let go of: the mark from
   * before the last interruption.
   */
  private ghost: Mark | null = null;

  /** The path behind the current mark, ship-first. Empty once the cross is passed. */
  private path: ScarSample[] = [];

  /** Seconds to the cross at the last observation, for the fade-in ramp. */
  private lead = Infinity;

  /**
   * Take the latest prediction.
   *
   * Called on the simulation tick and not every frame: the answer is a property
   * of a straight drift, so recomputing it faster than it can change buys
   * nothing but heat. `dt` is the time since the last call.
   */
  observe(scar: RescueScar | null, prize: number, rcfg: RenderConfig, dt: number): void {
    if (this.ghost) {
      this.ghost.age += dt;
      this.ghost.born += dt;
      if (this.ghost.age >= rcfg.scarFadeOutSecs) this.ghost = null;
    }

    if (scar?.cross) {
      const c = scar.cross;
      // Only as far as the cross. The heading comes from the end of THAT, not
      // from the end of the projection: the path continues to the wall, and the
      // arm must lie along the ship's heading where the mark is.
      const upto = scar.path.filter((s) => s.t <= c.t);
      const n = upto.length;
      const prev = n > 1 ? upto[n - 2]! : scar.path[0]!;
      const last = n > 0 ? upto[n - 1]! : scar.path[Math.min(1, scar.path.length - 1)]!;
      let dx = last.x - prev.x;
      let dy = last.y - prev.y;
      const len = hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;

      // A MARK THAT HAS STARTED AGEING IS NOT MOVED, IT IS REPLACED.
      //
      // Reported as "the cross kind of jumped forward a few times". On the
      // session that reported it the scar was absent for 3.9s — a capture — and
      // the cross that came back sat 456px from the one that went away, which the
      // follower then dragged across the screen in three visible steps.
      //
      // Those are two different situations and there is nothing continuous
      // between them, so the old mark is let go where it stands and a new one is
      // born where the answer now is. Nothing slides across the field, and the
      // distinction is a FACT — this mark has been interrupted — rather than a
      // distance threshold that a mark could drift across.
      // How much fire is waiting, mapped onto how big the mark draws. A prize
      // above `scarPrizeFull` saturates rather than growing without limit: the top
      // percentile of the measured distribution is three times its p90, and a mark
      // that tracked it would be a smear across the screen.
      const scale =
        rcfg.scarPrizeMin +
        (rcfg.scarPrizeMax - rcfg.scarPrizeMin) *
          clamp01(prize / Math.max(1e-6, rcfg.scarPrizeFull));

      if (!this.mark || this.mark.age >= 0) {
        if (this.mark) {
          this.mark.age = Math.max(0, this.mark.age);
          this.ghost = this.mark;
        }
        this.mark = { x: c.x, y: c.y, dx, dy, age: -c.t, born: 0, scale };
      } else {
        this.mark.age = -c.t;
      }
      // Uninterrupted, the mark eases toward this in `update`, per frame. Setting
      // it here and moving there is what stops the mark stepping at the 10Hz the
      // prediction is recomputed at. The size rides along for the same reason: the
      // prize changes as the ship moves, and a mark that resized in steps would
      // flicker exactly where a mark that moved in steps used to jump.
      this.target = { x: c.x, y: c.y, dx, dy, scale };
      this.lead = c.t;
      this.path = upto;
      return;
    }

    // Nothing to mark: the cross is behind us, or a grab has answered the
    // question. Either way the mark stays where it was and starts ageing out.
    //
    // Ageing rather than clearing, deliberately. A tap is a capture, and a
    // capture makes the prediction null for as long as it lasts — so a hard
    // clear here made a rapid tap blink the mark out and back.
    if (this.mark) {
      if (this.mark.age < 0) this.mark.age = 0;
      this.mark.age += dt;
      // The arm is dropped even though the mark is not: it is anchored to the
      // ship, and with no live cross ahead it would flip round to point backwards
      // at something the ship can no longer reach.
      this.path = [];
    }
    this.target = null;
    this.lead = 0;
  }

  /**
   * Advance the follower, once per FRAME.
   *
   * Separated from `observe` because the two run at different rates and only one
   * of them is about smoothness. The prediction is recomputed ten times a second;
   * easing there meant `dt * scarSettleRate` was 0.9, so the mark covered 90% of
   * any correction in a single step and then sat still for a tenth of a second —
   * a follower in name only, and visibly a series of jumps.
   */
  update(frameDt: number, rcfg: RenderConfig): void {
    const m = this.mark;
    if (m) m.born += frameDt;
    if (this.ghost) this.ghost.born += frameDt;
    if (!m || !this.target) return;
    const k = 1 - Math.exp(-rcfg.scarSettleRate * frameDt);
    m.x += (this.target.x - m.x) * k;
    m.y += (this.target.y - m.y) * k;
    m.dx += (this.target.dx - m.dx) * k;
    m.dy += (this.target.dy - m.dy) * k;
    m.scale += (this.target.scale - m.scale) * k;
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
    this.ghost = null;
    this.path = [];
    this.lead = Infinity;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, rcfg: RenderConfig): void {
    // The abandoned one first, so a live mark always draws over it.
    if (this.ghost) this.drawMark(ctx, cam, rcfg, this.ghost, null);
    if (this.mark) this.drawMark(ctx, cam, rcfg, this.mark, this.path);
  }

  private drawMark(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    rcfg: RenderConfig,
    m: Mark,
    path: ScarSample[] | null,
  ): void {
    // Fading out behind the ship, or ramping in ahead of it. Never both.
    //
    // Times a birth ramp, so a mark that is BORN close to the ship — where the
    // lead ramp is already at full strength — arrives rather than appears. Same
    // rate as the follower, because both answer "how fast does the scar react to
    // a change": one for where it is, one for whether it is there at all.
    const born = 1 - Math.exp(-rcfg.scarSettleRate * m.born);
    const alpha =
      born *
      (m.age >= 0
        ? rcfg.scarAlpha * (1 - smoothstep(m.age / Math.max(1e-6, rcfg.scarFadeOutSecs)))
        : rcfg.scarAlpha *
          (1 -
            smoothstep(
              (this.lead - rcfg.scarFullSecs) /
                Math.max(1e-6, rcfg.scarFadeInSecs - rcfg.scarFullSecs),
            )));
    if (alpha <= 0.004) return;

    // Every length in the glyph moves together, so the mark grows as one thing
    // rather than becoming a differently-proportioned mark.
    const stub = rcfg.scarStubHalf * m.scale;

    ctx.save();

    // ---- the long arm, from the ship along its own projected path
    if (path && path.length > 1) {
      // Cumulative distance along the path, so the taper is a property of the
      // shape rather than of how fast the ship happens to be going.
      const run: number[] = [0];
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        run.push(run[i - 1]! + hypot(b.x - a.x, b.y - a.y));
      }

      // CLAMPED. Reported as "if the projected line is really long, we should
      // clamp it — there's no danger of going out of bounds yet". Measured, the
      // complaint is well founded: the cross sits a median 432px ahead and 1551px
      // at p90, against a 390x844 design viewport, so an unclamped arm is
      // routinely twice the height of the screen. Past a certain length it stops
      // being a lead-in to a mark and becomes a line across the map.
      //
      // Clamped from the FRONT, so what survives is the stretch nearest the
      // cross: the far end is the part with nothing to decide in it.
      const first = (() => {
        const total = run[run.length - 1]!;
        if (total <= rcfg.scarArmMaxPx) return 0;
        let i = 0;
        while (i < run.length - 1 && total - run[i]! > rcfg.scarArmMaxPx) i++;
        return i;
      })();

      const pts: Array<{ x: number; y: number; w: number; a: number }> = [];
      const base = run[first]!;
      const total = run[run.length - 1]! - base;
      // The mark is the peak, and the arm runs a stub past it so the shape reads
      // as a cross rather than as a sword hilt.
      const span = total + stub;
      const uc = span > 0 ? total / span : 1;
      for (let i = first; i < path.length; i++) {
        const s = path[i]!;
        pts.push({
          x: toScreenX(cam, s.x),
          y: toScreenY(cam, s.y),
          w: armWidth(
            span > 0 ? (run[i]! - base) / span : 0,
            uc,
            rcfg.scarArmWidth * cam.scale * m.scale,
          ),
          a: alpha * (s.live ? 1 : rcfg.scarDeadFrac),
        });
      }
      // The path was computed against the cross the follower is still easing
      // toward, so its far end and the mark can be a few pixels apart mid-glide.
      // Land the arm ON the mark, so the crossbar never sits off the end of it.
      const tip = pts[pts.length - 1]!;
      tip.x = toScreenX(cam, m.x);
      tip.y = toScreenY(cam, m.y);
      // The overshoot: past the cross nothing is live, so it is drawn at the dead
      // strength and dies to a point. Faintness IS the statement.
      const N = 5;
      for (let i = 1; i <= N; i++) {
        const u = i / N;
        pts.push({
          x: toScreenX(cam, m.x + m.dx * stub * u),
          y: toScreenY(cam, m.y + m.dy * stub * u),
          w: armWidth(uc + (1 - uc) * u, uc, rcfg.scarArmWidth * cam.scale * m.scale),
          a: alpha * rcfg.scarDeadFrac,
        });
      }
      spindle(ctx, pts);
    } else {
      // Passed: a short stub through the mark, so it stays a four-tipped cross
      // once the ship is no longer attached to it.
      bar(
        ctx,
        cam,
        m.x - m.dx * stub,
        m.y - m.dy * stub,
        m.x + m.dx * stub,
        m.y + m.dy * stub,
        rcfg.scarArmWidth * m.scale,
        alpha,
      );
    }

    // ---- the crossbar
    const px = -m.dy;
    const py = m.dx;
    const barHalf = rcfg.scarBarHalf * m.scale;
    bar(
      ctx,
      cam,
      m.x - px * barHalf,
      m.y - py * barHalf,
      m.x + px * barHalf,
      m.y + py * barHalf,
      rcfg.scarBarWidth * m.scale,
      alpha,
    );

    ctx.restore();
  }
}
