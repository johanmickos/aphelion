/**
 * Capture visuals: the frozen orbit curve, the anchor line, and the boost halo.
 */
import type { Body } from '../sim/types.ts';
import type { SimConfig } from '../sim/config.ts';
import { orbitRadius } from '../sim/orbit.ts';
import type { Camera } from './camera.ts';
import { toScreenX, toScreenY } from './camera.ts';
import type { RenderConfig } from './config.ts';
import type { RenderSnapshot } from './snapshot.ts';

/**
 * The frozen ellipse the phase clock is sweeping.
 *
 * Tighten comes from the simulation's own `settleProgress`. The prototype
 * recomputed the smootherstep from `settleT` here, duplicating a formula that
 * lives in the sim — two copies that could only ever drift apart.
 */
export function drawOrbitCurve(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  snap: RenderSnapshot,
  anchor: Body,
): void {
  const cap = snap.capture;
  if (!cap?.orbit) return;
  if (cap.phase !== 'settle' && cap.phase !== 'orbit') return;

  const tighten = sim.tightenFrac * cap.settleProgress;
  ctx.beginPath();
  for (let k = 0; k <= 90; k++) {
    const ang = (k / 90) * Math.PI * 2;
    const rr = orbitRadius(cap.orbit, cap.rPeri, ang, tighten);
    const x = toScreenX(cam, anchor.x + Math.cos(ang) * rr);
    const y = toScreenY(cam, anchor.y + Math.sin(ang) * rr);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(185,140,255,.35)';
  ctx.setLineDash([3 * cam.scale, 5 * cam.scale]);
  ctx.lineWidth = 1.2 * cam.scale;
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * The line to the body that has you. Anchored at the rim rather than the centre,
 * so it reads as "this one is pulling you" instead of a rope through the planet.
 *
 * It also answers a question players ask of it unprompted: can I actually pull
 * all the way in? Circularising costs `fuelPerSec` for the rest of the settle;
 * if the tank cannot cover that, the ship putters out with a weak, boostless
 * release. Amber has always meant flyby; a dashed red now means "this capture
 * will run dry before it rounds out", so the two failure modes are legible
 * before they happen rather than after.
 */
export function drawAnchorLine(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  snap: RenderSnapshot,
  anchor: Body,
): void {
  const cap = snap.capture;
  if (!cap) return;
  const dx = snap.x - anchor.x;
  const dy = snap.y - anchor.y;
  const d = Math.hypot(dx, dy) || 1;
  const rimX = anchor.x + (dx / d) * anchor.R;
  const rimY = anchor.y + (dy / d) * anchor.R;

  ctx.beginPath();
  ctx.moveTo(toScreenX(cam, rimX), toScreenY(cam, rimY));
  ctx.lineTo(toScreenX(cam, snap.x), toScreenY(cam, snap.y));
  // Solid in every state. Dashing read as a weaker or intermittent connection,
  // when in fact the pull is continuous — colour alone carries the meaning:
  // amber while braking a flyby, red when the tank cannot finish the job.
  if (cap.phase === 'flyby') {
    ctx.strokeStyle = 'rgba(255,176,32,.7)';
  } else if (!canAffordCircularise(sim, snap)) {
    ctx.strokeStyle = 'rgba(255,90,110,.6)';
  } else {
    ctx.strokeStyle = 'rgba(150,170,205,.32)';
  }
  ctx.lineWidth = Math.max(1, cam.scale);
  ctx.stroke();
}

/**
 * Boost halo.
 *
 * The boost is the skill window: it arms over `boostArmTime`, peaks, then decays.
 * The visual has to answer one question — "is now the moment?" — continuously,
 * without ever becoming a flash.
 *
 * A sustained glow does that work. It breathes at a steady rate that quickens
 * slightly as charge rises, grows with charge, and ramps in colour from amber
 * through rose to violet, so peak charge is unmistakable by hue alone rather
 * than by a momentary blink. Violet is the build's accent colour, so the best
 * moment reads as the game's own signature.
 *
 * Two defects this replaces, both from the prototype:
 *  - It normalised by `boostMax`, but a capture's achievable peak is
 *    `boostFull = boostMax x over`, usually well below it, so even a perfect
 *    capture never lit fully. Normalising by boostFull uses the whole range.
 *  - It showed magnitude only, so 60% rising and 60% falling looked identical.
 *    Rising now carries a contracting accent ring, falling an expanding one.
 */

/** Is there enough fuel left to finish rounding this orbit out? */
export function canAffordCircularise(sim: SimConfig, snap: RenderSnapshot): boolean {
  const cap = snap.capture;
  if (!cap || cap.phase !== 'settle') return true;
  const remaining = Math.max(0, sim.settleDur - cap.settleT);
  return snap.fuel >= remaining * sim.fuelPerSec;
}

/** Amber -> rose -> violet. A direct amber-to-violet lerp passes through mud. */
export function boostColor(charge: number): [number, number, number] {
  // Violet is reached at 0.72 rather than at the very peak: human reaction adds
  // its own delay, so the "release now" cue has to lead the actual peak slightly
  // or every release lands late.
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [255, 200, 90]],
    [0.42, [255, 150, 170]],
    [0.72, [185, 140, 255]],
    [1.0, [180, 150, 255]],
  ];
  const t = Math.max(0, Math.min(1, charge));
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i]!;
    const [p0, c0] = stops[i - 1]!;
    if (t <= p1) {
      const k = (t - p0) / (p1 - p0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return stops[stops.length - 1]![1];
}

export function drawBoostHalo(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  sim: SimConfig,
  rcfg: RenderConfig,
  snap: RenderSnapshot,
  timeMs: number,
): void {
  const cap = snap.capture;
  if (!cap || cap.boost <= 0.5 || cap.boostFull <= 0) return;

  const charge = Math.max(0, Math.min(1, cap.boost / cap.boostFull));
  const rising = cap.boostT < sim.boostArmTime;
  const x = toScreenX(cam, snap.x);
  const y = toScreenY(cam, snap.y);
  const s = cam.scale;

  // Steady breathing, quickening a little as the charge builds. Modest depth so
  // it reads as a held pulse rather than a blink.
  const period = rcfg.boostPulseSlow + (rcfg.boostPulseFast - rcfg.boostPulseSlow) * charge;
  const pulse = 0.5 + 0.5 * Math.sin((timeMs / period) * Math.PI * 2);
  const mod = 1 - rcfg.boostPulseDepth + rcfg.boostPulseDepth * pulse;

  const [r, g, b] = boostColor(charge);
  const radius = (rcfg.boostGlowMin + (rcfg.boostGlowMax - rcfg.boostGlowMin) * charge) * mod * s;
  const alpha = (0.14 + 0.52 * charge) * mod;

  // the glow itself
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, `rgba(${r},${g},${b},${(alpha * 0.9).toFixed(3)})`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},${(alpha * 0.4).toFixed(3)})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // core ring, so the charge has a crisp edge to read against
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${r},${g},${b},${(0.25 + 0.55 * charge).toFixed(3)})`;
  ctx.lineWidth = (1 + 1.6 * charge) * s;
  ctx.stroke();

  // directional accent: contracts while arming, expands while fading
  const phaseT = rising
    ? cap.boostT / Math.max(1e-6, sim.boostArmTime)
    : Math.min(1, (cap.boostT - sim.boostArmTime) / Math.max(1e-6, sim.boostDecayTime));
  const accentR = rising ? radius * (1.5 - 0.5 * phaseT) : radius * (1 + 0.9 * phaseT);
  const accentA = (rising ? 0.1 + 0.35 * phaseT : 0.3 * (1 - phaseT)) * (0.5 + 0.5 * charge);
  if (accentA > 0.02) {
    ctx.beginPath();
    ctx.arc(x, y, accentR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r},${g},${b},${accentA.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, s);
    ctx.stroke();
  }
}
