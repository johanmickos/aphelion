/**
 * Stage 0 app shell.
 *
 * Deliberately primitive: this exists to prove the simulation, the fixed-timestep
 * accumulator and the letterboxed camera work in a real browser. It draws bodies
 * and the ship as bare primitives and nothing else — no HUD, no compass, no crash
 * cone, no trail. The renderer proper is Stage 1.
 */
import { DEFAULT_CONFIG, FIXED_DT, MAX_CATCHUP_STEPS } from '../src/sim/config.ts';
import { createInitialState, shipVelocity, shipWorldPos, stepSim } from '../src/sim/step.ts';
import { fieldBounds } from '../src/sim/world.ts';
import type { Input } from '../src/sim/types.ts';
import { createLoop } from '../src/app/loop.ts';
import {
  createCamera,
  fitCamera,
  followCamera,
  snapCamera,
  worldToScreenX,
  worldToScreenY,
} from '../src/render/camera.ts';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const cfg = DEFAULT_CONFIG;
const state = createInitialState(cfg);
const bounds = fieldBounds(cfg, state.bodies);
const cam = createCamera(bounds.width);
snapCamera(cam, shipWorldPos(state).y);

// --- input: edges are what the simulation consumes
let held = false;
let pressedEdge = false;
let releasedEdge = false;
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
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

// --- interpolation: keep the previous tick's position to lerp from
let prev = shipWorldPos(state);
let curr = prev;

function resize(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitCamera(cam, { w, h, dpr });
}
addEventListener('resize', resize);
resize();

const loop = createLoop(FIXED_DT, MAX_CATCHUP_STEPS, {
  step(dt) {
    const input: Input = { held, pressed: pressedEdge, released: releasedEdge };
    pressedEdge = false;
    releasedEdge = false;
    stepSim(state, cfg, input, dt);
    prev = curr;
    curr = shipWorldPos(state);
  },
  render(alpha, frameDt) {
    const x = prev.x + (curr.x - prev.x) * alpha;
    const y = prev.y + (curr.y - prev.y) * alpha;
    followCamera(cam, y, frameDt);
    draw(x, y);
  },
});
loop.start();

function draw(sx: number, sy: number): void {
  const w = innerWidth;
  const h = innerHeight;
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, w, h);

  // letterbox bars: everything outside the design window
  ctx.save();
  ctx.beginPath();
  ctx.rect(cam.offsetX, cam.offsetY, cam.designW * cam.scale, cam.designH * cam.scale);
  ctx.clip();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // field edges
  ctx.strokeStyle = 'rgba(255,70,90,.35)';
  ctx.lineWidth = 1;
  for (const edge of [bounds.left, bounds.right]) {
    const ex = worldToScreenX(cam, edge, bounds.left);
    ctx.beginPath();
    ctx.moveTo(ex, 0);
    ctx.lineTo(ex, h);
    ctx.stroke();
  }

  for (const b of state.bodies) {
    const bx = worldToScreenX(cam, b.x, bounds.left);
    const by = worldToScreenY(cam, b.y);
    const r = b.R * cam.scale;
    if (by < -r * 3 || by > h + r * 3) continue;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1e2740';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,175,215,.55)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, (b.R + cfg.minOrbitGap) * cam.scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(130,150,185,.25)';
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const px = worldToScreenX(cam, sx, bounds.left);
  const py = worldToScreenY(cam, sy);
  const v = shipVelocity(state);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(v.vy, v.vx));
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-6, 5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, -5);
  ctx.closePath();
  ctx.fillStyle = held ? '#fff' : '#cfdcf2';
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // fuel, as a bare bar — the real gauge is Stage 1
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(12, 12, 90, 4);
  ctx.fillStyle = '#54f39a';
  ctx.fillRect(12, 12, 90 * (state.fuel / cfg.fuelMax), 4);
}
