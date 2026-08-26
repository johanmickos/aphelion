/**
 * World layer: hazard zones and bodies.
 */
import type { Body, Mote } from '../sim/types.ts';
import type { SimConfig } from '../sim/config.ts';
import type { FieldBounds } from '../sim/world.ts';
import { backtrackFloorY } from '../sim/world.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY, visibleWorldY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import { FINISH, withAlpha } from './palette.ts';
import { hypot } from '../sim/orbit.ts';
import { HAZARD_BAND_FROM, HAZARD_BAND_TO, HAZARD_EDGE } from './palette.ts';

/**
 * Danger gradient at the field edges.
 *
 * The prototype drew this OUTSIDE the boundary — but the run ends 4px past that
 * line, so ~93% of the red band was already fatal and the player could never see
 * themselves inside it. A warning you cannot occupy warns nothing.
 *
 * Here the gradient builds INWARD from the edge, so it reads as pressure while
 * there is still time to turn, and the hard dashed line marks the actual limit.
 *
 * TWO EDGES, AND THE TOP IS NOT ONE OF THEM.
 *
 * The ceiling briefly had a band here. It was added because the 2026-08-23
 * playtest flew into `field.top` through 2.7 seconds of unmarked empty starfield
 * and died — a real defect, correctly diagnosed, and fixed at the wrong layer.
 * `clearAtTop` then made that stretch the FINISH rather than a death, and the
 * band became a wall of hazard red painted across the line the player is meant to
 * fly through in triumph. Reported from the seat as "too aggressive and
 * threatening, especially since we want to transition to flying the ship through
 * it in warp speed", which is exactly right: the run does not end there any more,
 * it succeeds there.
 *
 * What replaced it is a marker rather than a barrier — a green FINISH arrow in
 * `edge-markers.ts`, in the same always-on cue system that already says where the
 * planets and anomalies are. A thing you are flying TOWARD is signposted, not
 * fenced off.
 *
 * `field.bottom` stays unmarked for its own reason. It is only reachable in the
 * opening seconds, before `highWaterY` has moved, and after that the trailing
 * floor — a `fell-behind` ending with its own band and its own burn — is always
 * the nearer of the two. A second red line under the first would be warning about
 * the wrong one.
 */
export function drawHazardZones(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cfg: RenderConfig,
  field: FieldBounds,
): void {
  const zone = cfg.hazardZoneWidth;
  const top = cam.offsetY;
  const height = cam.viewH * cam.scale;

  ctx.save();
  ctx.strokeStyle = HAZARD_EDGE;
  ctx.lineWidth = Math.max(1, 1.5 * cam.scale);

  for (const side of [-1, 1] as const) {
    const edge = side < 0 ? field.left : field.right;
    const inner = edge - side * zone;
    const xEdge = toScreenX(cam, edge);
    const xInner = toScreenX(cam, inner);
    const x0 = Math.min(xEdge, xInner);
    const w = Math.abs(xEdge - xInner);
    if (w < 0.5) continue;

    const g = ctx.createLinearGradient(xInner, 0, xEdge, 0);
    g.addColorStop(0, HAZARD_BAND_FROM);
    g.addColorStop(1, HAZARD_BAND_TO);
    ctx.fillStyle = g;
    ctx.fillRect(x0, top, w, height);

    ctx.setLineDash([6 * cam.scale, 6 * cam.scale]);
    ctx.beginPath();
    ctx.moveTo(xEdge, top);
    ctx.lineTo(xEdge, top + height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

/**
 * The finish line: a chequered band across the field at the clear line.
 *
 * A LINE YOU CROSS, not a pointer to one. The arrow in `edge-markers.ts` says the
 * finish is coming while it is still off screen; this is the thing itself, and it
 * exists because "you cleared the field" was otherwise an event with no place —
 * the run simply stopped somewhere in empty sky and a notice appeared. Crossing
 * something makes it a moment.
 *
 * CHEQUERS RATHER THAN A GRADIENT, deliberately. Every other line drawn across
 * this field is a hazard — the walls, the trailing floor — and they all share one
 * grammar: a wash that deepens toward a dashed limit, meaning "do not go past
 * this". Reusing that grammar in green would still read as a barrier, because the
 * shape is the part the eye learned. Chequers belong to a different idea
 * entirely, one nobody has to be taught: this is the end of a race, and you are
 * meant to go through it.
 *
 * Two offset rows, so it reads as a chequer at a glance rather than as a dashed
 * line — one row of alternating squares is a dash, and a dash is what the hazard
 * limits already are.
 */
export function drawFinishLine(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  field: FieldBounds,
  finishY: number | null,
): void {
  if (finishY === null) return;
  const view = visibleWorldY(cam);
  const cell = 13;
  if (finishY - cell * 2 > view.bottom || finishY + cell * 2 < view.top) return;

  const s = cam.scale;
  const y = toScreenY(cam, finishY);
  const h = cell * s;
  const left = toScreenX(cam, field.left);
  const right = toScreenX(cam, field.right);
  const cols = Math.max(1, Math.round((field.right - field.left) / cell));
  const w = (right - left) / cols;

  ctx.save();
  // A soft glow under it, so the band sits in the world rather than on top of it —
  // the same reason the anomaly blooms instead of being outlined.
  const glow = ctx.createLinearGradient(0, y - h * 3, 0, y + h * 3);
  glow.addColorStop(0, withAlpha(FINISH, 0));
  glow.addColorStop(0.5, withAlpha(FINISH, 0.16));
  glow.addColorStop(1, withAlpha(FINISH, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(left, y - h * 3, right - left, h * 6);

  // ONE PATH, ONE FILL, ONE BLUR. The band is about fifty cells across at the
  // default field width, so shadowing each cell separately would be fifty blur
  // operations a frame — on the device that already reported "slowdown due to
  // rendering... more noticeable at the edges". Accumulating the cells into a
  // single path and filling once costs exactly one, and looks identical: the glow
  // is around the shape, and the shape is the whole chequer.
  ctx.beginPath();
  for (let row = 0; row < 2; row++) {
    const ry = y - h + row * h;
    for (let i = 0; i < cols; i++) {
      if ((i + row) % 2 !== 0) continue;
      ctx.rect(left + i * w, ry, w, h);
    }
  }
  ctx.shadowColor = withAlpha(FINISH, 0.75);
  ctx.shadowBlur = 9 * s;
  ctx.fillStyle = withAlpha(FINISH, 0.85);
  ctx.fill();
  // A second pass through the same path, so the glow reads as light coming off
  // the cells rather than as a soft edge on them. Cheap: the path is already
  // built, and the blur is the only cost either pass pays.
  ctx.shadowBlur = 20 * s;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

/**
 * One chevron: a filled `^` with square-cut ends and a notch under the apex.
 *
 * A FILLED POLYGON AND NOT A THICK STROKE, which is the whole difference between
 * this and what it replaced. A stroked V is a line with a corner in it: its ends
 * are caps — round or square to the line's own direction — and its apex is a
 * join, so it reads as a bent ribbon. The icon shape has ENDS CUT HORIZONTALLY
 * and a V notched out of the underside, and neither of those is something a
 * stroke can be asked for.
 *
 * `weight` IS THE THICKNESS YOU SEE — measured across the arm, perpendicular to
 * it — and that distinction is why this shape kept coming out thin. The polygon
 * is built by translating the outer edge straight DOWN, so the natural parameter
 * is a vertical offset; but a vertical offset foreshortens into the arm by
 * `w / hypot(w, arm)`, which on a steep chevron is under a half. Asking for 8
 * bought 3.6px of visible arm, and every attempt to fix it by raising the number
 * was fighting the wrong variable. The conversion happens here instead, once, so
 * the caller can ask for the weight it actually wants.
 *
 * Where the inner edge crosses the bottom cut is then `w * (1 - drop / arm)` —
 * the similar-triangles result, derived rather than eyeballed so the shape holds
 * at every size the runway scales it to.
 */
function chevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  arm: number,
  weight: number,
): void {
  const drop = (weight * hypot(w, arm)) / w;
  const inner = w * Math.max(0, 1 - drop / arm);
  ctx.moveTo(x - w, y);
  ctx.lineTo(x, y - arm);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + inner, y);
  ctx.lineTo(x, y - arm + drop);
  ctx.lineTo(x - inner, y);
  ctx.closePath();
}

/**
 * The run-in to the finish: chevrons rolling up toward the line.
 *
 * The last stretch of the field was empty, and empty is the wrong feeling for the
 * approach to a finish — the ceremony that follows is about speed and the run-up
 * to it read as a lull. This is the runway.
 *
 * SHORT ON PURPOSE. It covers roughly the last two rows of the field, so it
 * arrives as the final planets do rather than announcing itself from a third of
 * the climb away. A long runway makes the finish feel distant; a short one makes
 * it feel imminent, which is the job.
 *
 * ON THE RENDER CLOCK, WHICH IS ONLY LEGAL BECAUSE OF WHERE THIS LIVES. Nothing
 * here is simulated and nothing here is recorded, so two players crossing the
 * same line with the same input log see the chevrons at different phases and the
 * runs stay identical. `src/sim/` may never read a wall clock; this is not it.
 *
 * THE HASH IS KEYED TO THE WORLD ROW, NOT THE SCREEN ROW, and that distinction is
 * the whole difference between a surface and a mess. Keyed to the loop index, the
 * arrangement is stable only until the scroll phase wraps — at which point row `i`
 * inherits the position row `i-1` had while keeping its own jitter, and the entire
 * pattern snaps to a different layout once per cycle. Reported as "jump around",
 * and it is not a fade problem: it is the same twelve chevrons teleporting. Adding
 * the absolute scroll count to the index gives each row an identity that travels
 * with it, so a row keeps its offset for as long as it is on screen.
 *
 * EVERY ROW FADES IN AND OUT over the runway rather than popping at its ends, and
 * the count per row is FIXED for the same reason — varying it with distance made
 * chevrons wink in and out mid-flight as their row drifted across a rounding
 * boundary. Density changes are carried by size and opacity, which can be
 * interpolated; a count cannot.
 */
export function drawSpeedCarpet(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  field: FieldBounds,
  finishY: number | null,
  /**
   * `SimConfig.finishFunnelDepth` — the band the ship is actually being pulled
   * through, not a number of this file's own choosing.
   *
   * THE PICTURE MUST NOT OUTLINE THE PHYSICS. The chevrons are the visible half
   * of a real force; drawing them over a different span than the funnel acts on
   * would show a runway that starts before the pull does, or keeps going after it
   * stops. Same number, one owner.
   */
  runway: number,
  timeMs: number,
): void {
  if (finishY === null || runway <= 0) return;

  const view = visibleWorldY(cam);
  if (finishY > view.bottom || finishY + runway < view.top) return;

  const s = cam.scale;
  const gap = 84;
  const perRow = 3;
  const rows = Math.ceil(runway / gap);
  // Absolute scroll, in rows. The integer part names the world row; the fraction
  // is where between two rows the surface currently sits.
  const scroll = (timeMs * 0.00135 * 60) / gap;
  const phase = (scroll % 1) * gap;
  const left = field.left;
  const span = field.right - field.left;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i <= rows; i++) {
    const wy = finishY + runway - i * gap + phase;
    if (wy < view.top - gap || wy > view.bottom + gap) continue;

    // 0 at the back of the runway, 1 at the line.
    const t = Math.max(0, Math.min(1, 1 - (wy - finishY) / runway));
    // In and out, so a chevron is never drawn at an alpha it did not arrive at.
    // It dissolves INTO the line rather than reaching it at full strength — the
    // chequers are what the eye should land on there.
    const fade = Math.sin(Math.PI * t);
    if (fade <= 0.01) continue;

    // TALLER THAN WIDE. At a shallow pitch the shape reads as a tent rather than
    // a chevron — the eye takes a wide, short `^` as a roof over something, and a
    // steep one as a direction. The icon this is modelled on is roughly as tall as
    // it is broad, so the arm outruns the half-width at every size.
    const w = (14 + 6 * t) * s;
    const arm = (25 + 10 * t) * s;
    // Perpendicular arm weight, which is what the eye calls thickness.
    const weight = (7.5 + 3 * t) * s;

    ctx.beginPath();
    for (let j = 0; j < perRow; j++) {
      // Keyed to the WORLD row, so the arrangement travels with the surface.
      const k = i + Math.floor(scroll);
      const hash = Math.sin(k * 12.9898 + j * 78.233) * 43758.5453;
      const jitter = hash - Math.floor(hash);
      const wx = left + span * ((j + 0.5) / perRow + (jitter - 0.5) * 0.22);
      const x = toScreenX(cam, wx);
      const y = toScreenY(cam, wy) + arm * 0.5;
      chevron(ctx, x, y, w, arm, weight);
    }
    ctx.fillStyle = withAlpha(FINISH, 0.34 * fade);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The dots scattered up the carpet.
 *
 * THE FINISH GREEN, like the chevrons they sit among and the chequers they lead
 * to. They belong to that cue system — the one that colours by category and always
 * has — rather than to the rarity ladder; see `DOT` in `accolade.ts` for the full
 * argument, which is the same one.
 *
 * A taken dot is not removed. It leaves a hollow ring where it was, because the
 * carpet is a thing the player is trying to complete and a set with holes in it
 * says how you are doing in a way a shrinking set cannot. It also means the
 * signature has something to be drawn against at the end.
 *
 * The pulse is driven by `timeMs` and by the dot's own position, so the row does
 * not breathe in unison — a synchronised blink reads as a UI element, and these
 * are meant to read as objects in the world. Render may take a wall clock; the
 * simulation may not.
 */
export function drawMotes(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  motes: readonly Mote[],
  timeMs: number,
): void {
  if (motes.length === 0) return;
  const view = visibleWorldY(cam);
  const s = cam.scale;

  for (const m of motes) {
    if (m.y < view.top - 40 || m.y > view.bottom + 40) continue;
    const x = toScreenX(cam, m.x);
    const y = toScreenY(cam, m.y);

    if (m.taken) {
      // A hollow ring: this one is spent, and the gap in the row is the score.
      ctx.beginPath();
      ctx.arc(x, y, 5 * s, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(FINISH, 0.22);
      ctx.lineWidth = Math.max(1, 1.2 * s);
      ctx.stroke();
      continue;
    }

    const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.004 + m.y * 0.02);
    const r = (4.2 + 1.1 * pulse) * s;
    // A bloom under the core, so the dot has presence against the chevrons behind
    // it without the core itself having to be large enough to look like a planet.
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
    g.addColorStop(0, withAlpha(FINISH, 0.34 + 0.16 * pulse));
    g.addColorStop(1, withAlpha(FINISH, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(FINISH, 0.92);
    ctx.fill();
  }
}

/**
 * The floor that trails the climb.
 *
 * Drawn like the side boundaries and for the same reason: the gradient builds
 * toward the lethal line so it reads as pressure while there is still time to
 * turn, rather than decorating a region you can never occupy and survive.
 *
 * It hangs below the highest point reached, so at your best height it is just off
 * the bottom of the screen and only appears once you start losing ground.
 */
export function drawBacktrackFloor(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  rcfg: RenderConfig,
  highWaterY: number,
): void {
  const floorY = backtrackFloorY(sim, highWaterY);
  if (floorY === null) return;
  const view = visibleWorldY(cam);
  const band = rcfg.hazardZoneWidth;
  if (floorY - band > view.bottom) return; // still well below the screen

  const yEdge = toScreenY(cam, floorY);
  const yInner = toScreenY(cam, floorY - band);
  const left = cam.offsetX;
  const width = cam.designW * cam.scale;

  const g = ctx.createLinearGradient(0, yInner, 0, yEdge);
  g.addColorStop(0, HAZARD_BAND_FROM);
  g.addColorStop(1, HAZARD_BAND_TO);
  ctx.fillStyle = g;
  ctx.fillRect(left, yInner, width, yEdge - yInner);

  ctx.strokeStyle = HAZARD_EDGE;
  ctx.setLineDash([6 * cam.scale, 6 * cam.scale]);
  ctx.lineWidth = Math.max(1, 1.5 * cam.scale);
  ctx.beginPath();
  ctx.moveTo(left, yEdge);
  ctx.lineTo(left + width, yEdge);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Bodies. Dispatches on `kind`, so adding a black hole makes tsc name this site.
 * Gradients are cached: the world is frozen, so they never need rebuilding.
 */
export class BodyRenderer {
  /** Gradients are drawn in translated space, so only radius and scale matter. */
  private cache = new Map<number, CanvasGradient>();
  private cacheScale = -1;

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    sim: SimConfig,
    bodies: readonly Body[],
    /** Index of the body currently holding the ship, if any. */
    anchorIndex = -1,
    /** Wall clock, for the anomaly pulse only. Nothing here feeds the sim. */
    timeMs = 0,
  ): void {
    if (cam.scale !== this.cacheScale) {
      this.cache = new Map();
      this.cacheScale = cam.scale;
    }
    const view = visibleWorldY(cam);
    const pad = 120;

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]!;
      if (b.y + b.R < view.top - pad || b.y - b.R > view.bottom + pad) continue;
      switch (b.kind) {
        case 'planet':
          this.drawPlanet(ctx, cam, sim, b, i === anchorIndex);
          break;
        case 'anomaly':
          drawAnomaly(ctx, cam, sim, b, i === anchorIndex, timeMs);
          break;
      }
    }
  }

  private drawPlanet(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    sim: SimConfig,
    p: Extract<Body, { kind: 'planet' }>,
    /** This is the body that currently has the ship. */
    held: boolean,
  ): void {
    const x = toScreenX(cam, p.x);
    const y = toScreenY(cam, p.y);
    const r = p.R * cam.scale;

    // Minimum-orbit ring. Solid: it is a hard limit the simulation clamps to,
    // not a suggestion, and dashing made it read as advisory. Alpha is pulled
    // down a little because a solid line at the old opacity reads much heavier.
    ctx.beginPath();
    ctx.arc(x, y, (p.R + sim.minOrbitGap) * cam.scale, 0, Math.PI * 2);
    ctx.strokeStyle = held ? 'rgba(185,170,235,.5)' : 'rgba(130,150,185,.24)';
    ctx.lineWidth = Math.max(1, cam.scale) * (held ? 1.4 : 1);
    ctx.stroke();

    // lit sphere; light from the upper left, consistent across the field
    let g = this.cache.get(p.R);
    if (!g) {
      g = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.15, 0, 0, r);
      g.addColorStop(0, '#4a5b82');
      g.addColorStop(0.7, '#1e2740');
      g.addColorStop(1, '#0a0f1a');
      this.cache.set(p.R, g);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // Held: the rim lifts and a soft halo sits just outside it. Deliberately
    // slight — enough to answer "which one has me?" without competing with the
    // boost glow or the compass rings for attention.
    if (held) {
      const halo = ctx.createRadialGradient(0, 0, r, 0, 0, r + 14 * cam.scale);
      halo.addColorStop(0, 'rgba(185,170,235,.22)');
      halo.addColorStop(1, 'rgba(185,170,235,0)');
      ctx.beginPath();
      ctx.arc(0, 0, r + 14 * cam.scale, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();
    }
    ctx.strokeStyle = held ? 'rgba(214,205,245,.85)' : 'rgba(150,175,215,.55)';
    ctx.lineWidth = (held ? 1.8 : 1.2) * cam.scale;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(190,205,235,.65)';
    ctx.font = `${10 * cam.scale}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name, x, y);
    ctx.textBaseline = 'alphabetic';
  }
}

/**
 * An anomaly and the bubble it projects.
 *
 * The bubble is drawn because it is a BOUNDARY, and the same lesson applies that
 * `drawHazardZones` records: a limit the player cannot see is a limit they cannot
 * play against. Its edge is where the side barrier resumes and the run ends, so
 * it gets a hard line exactly like the red one does.
 *
 * The gradient runs the other way round from the hazard band, though, and
 * deliberately: there the danger is OUTSIDE a line you approach, so the warning
 * builds toward it. Here the safety is INSIDE, so the fill is densest at the
 * anomaly and fades to nothing at the rim — it reads as a pocket of shelter you
 * are inside of rather than a wall you are heading for.
 */
function drawAnomaly(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  a: Extract<Body, { kind: 'anomaly' }>,
  held: boolean,
  timeMs: number,
): void {
  const x = toScreenX(cam, a.x);
  const y = toScreenY(cam, a.y);
  const s = cam.scale;
  const bubble = a.bubble * s;

  ctx.save();

  // The shelter, densest at the centre and gone by the rim.
  const g = ctx.createRadialGradient(x, y, 0, x, y, bubble);
  g.addColorStop(0, 'rgba(168,92,255,.20)');
  g.addColorStop(0.55, 'rgba(140,70,230,.09)');
  g.addColorStop(1, 'rgba(120,60,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, bubble, 0, Math.PI * 2);
  ctx.fill();

  // The rim: the exact line the run ends at, drawn like the barrier it replaces.
  ctx.setLineDash([6 * s, 6 * s]);
  ctx.strokeStyle = 'rgba(190,120,255,.42)';
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.beginPath();
  ctx.arc(x, y, bubble, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Minimum-orbit ring, same as a planet's — it is captured by the same code and
  // clamped to the same limit, so it must advertise the same limit.
  ctx.beginPath();
  ctx.arc(x, y, (a.R + sim.minOrbitGap) * s, 0, Math.PI * 2);
  ctx.strokeStyle = held ? 'rgba(225,180,255,.55)' : 'rgba(180,130,235,.28)';
  ctx.lineWidth = Math.max(1, s) * (held ? 1.4 : 1);
  ctx.stroke();

  // The body. A slow breath so it reads as alive rather than as scenery, and
  // slow enough not to compete with the boost halo's pulse.
  const pulse = 0.5 + 0.5 * Math.sin(timeMs / 620);
  const r = a.R * s;
  const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  body.addColorStop(0, `rgba(226,178,255,${0.95 - 0.12 * pulse})`);
  body.addColorStop(0.6, 'rgba(150,70,220,.95)');
  body.addColorStop(1, 'rgba(74,26,120,.95)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Corona, breathing opposite the surface so the whole thing never goes flat.
  ctx.strokeStyle = `rgba(206,150,255,${0.25 + 0.3 * pulse})`;
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.beginPath();
  ctx.arc(x, y, r + 5 * s, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
