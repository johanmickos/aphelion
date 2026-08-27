/**
 * SPIKE — throwaway. Deleted when the M0.5 ADR lands.
 *
 * The M0.5 harness. It runs each rung of the ladder over the same scene, times
 * every frame, and posts the samples back to the dev server so the numbers end
 * up on the machine rather than on a phone screen being read aloud.
 *
 * Four decisions, all of which the obvious version of this gets wrong:
 *
 *   - **Time the draw, not the frame.** `requestAnimationFrame` intervals are
 *     pinned to the display's refresh, so a candidate with 4ms of headroom and
 *     one with 0.2ms both report 16.7ms and look identical. The number the
 *     budget is stated against is main-thread time inside `frame()`. Intervals
 *     are recorded too, but as a *second* signal: they are the only thing that
 *     catches a candidate that is cheap on the CPU and stalls on the GPU, which
 *     is exactly the failure mode rung (b) risks.
 *   - **Warm up, then measure.** The first frames of any candidate pay for
 *     shader compilation, texture allocation and JIT. Those are real costs and
 *     they are real once, so they are discarded rather than allowed to sit in
 *     the max.
 *   - **Measure the whole scene, every frame, with nothing culled.** See
 *     `scene.ts`.
 *   - **Report the drift.** A phone that is fast for four seconds and slow for
 *     the next six has not passed.
 *
 * The scene is advanced *outside* the timed region. Advancing it is presentation
 * state's job (ADR-0006) and the renderer's cost is what is on trial here.
 * Deforming the rungs is inside it, because that is drawing — a question worth
 * revisiting in M3, when there is a real `src/state/` to put it in.
 */
import type { DiagReport, DiagRun } from '../../tools/vite-plugin-diag.ts';
import { canvas2dBloom, sceneOnly } from './candidates/canvas2d.ts';
import { webglPost } from './candidates/webgl-post.ts';
import type { Backing, Candidate } from './candidates/types.ts';
import { DESIGN_H, DESIGN_W, advance, createScene } from './scene.ts';
import { dropped, drift, summarise } from './stats.ts';

/** M0.5's acceptance: p99 ≤ 8ms on the author's phone. */
const BUDGET_P99_MS = 8;
/**
 * A candidate can be cheap on the main thread and still miss frames, because
 * main-thread time does not include what the GPU is doing with the commands it
 * was handed. So a pass needs both: the budget on the CPU, and a run that
 * actually presented its frames. One per cent is roughly six frames in six
 * hundred — a stutter the author would notice, and the smallest number worth
 * calling a failure.
 */
const BUDGET_DROP_RATIO = 0.01;

function passes(r: DiagRun): boolean {
  return r.ok && r.cpu.p99 <= BUDGET_P99_MS && r.dropped <= r.frames * BUDGET_DROP_RATIO;
}
const WARMUP_FRAMES = 90;
const MEASURE_FRAMES = 600;

/**
 * The ladder, in the plan's order, with the bare scene first as the floor to
 * read the others against. (c) hand-rolled WebGL2 and (d) PixiJS are not here:
 * the plan says stop at the first rung that holds, and PixiJS in particular
 * would be the repo's first runtime dependency — not something to add
 * speculatively.
 */
const LADDER: readonly Candidate[] = [sceneOnly, canvas2dBloom, webglPost];

function need(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`spike: missing #${id}`);
  return el;
}

const stage = need('stage');
const panel = need('panel');

const scene = createScene();

function measureBacking(): Backing {
  // Design coordinates, letterboxed, identical on every device (ADR-0010).
  const fit = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.round(DESIGN_W * fit * dpr);
  const h = Math.round(DESIGN_H * fit * dpr);
  stage.style.width = `${DESIGN_W * fit}px`;
  stage.style.height = `${DESIGN_H * fit}px`;
  return { w, h, scale: w / DESIGN_W };
}

const backing = measureBacking();
const hasWebGL2 = (() => {
  const probe = document.createElement('canvas');
  return probe.getContext('webgl2') !== null;
})();

/** Runs one candidate to completion and resolves with its numbers. */
function run(candidate: Candidate, onProgress: (frac: number) => void): Promise<DiagRun> {
  return new Promise((resolve) => {
    let renderer;
    try {
      renderer = candidate.create(stage, scene, backing);
    } catch (err) {
      resolve({
        id: candidate.id,
        label: candidate.label,
        ok: false,
        note: err instanceof Error ? err.message : String(err),
        frames: 0,
        cpu: { p50: 0, p95: 0, p99: 0, max: 0 },
        interval: { p50: 0, p95: 0, p99: 0, max: 0 },
        dropped: 0,
        drift: { early: 0, late: 0 },
      });
      return;
    }

    const cpu: number[] = [];
    const intervals: number[] = [];
    const start = performance.now();
    let previous = start;
    let n = 0;

    const tick = (now: number): void => {
      const t = (now - start) / 1000;
      advance(scene, t);

      const a = performance.now();
      renderer.frame(t);
      const b = performance.now();

      if (n >= WARMUP_FRAMES) {
        cpu.push(b - a);
        intervals.push(now - previous);
      }
      previous = now;
      n++;

      if (n < WARMUP_FRAMES + MEASURE_FRAMES) {
        if (n % 30 === 0) onProgress(n / (WARMUP_FRAMES + MEASURE_FRAMES));
        requestAnimationFrame(tick);
        return;
      }

      renderer.dispose();
      resolve({
        id: candidate.id,
        label: candidate.label,
        ok: true,
        note: renderer.note,
        frames: cpu.length,
        cpu: summarise(cpu),
        interval: summarise(intervals),
        dropped: dropped(intervals),
        drift: drift(cpu),
      });
    };

    requestAnimationFrame(tick);
  });
}

const ms = (n: number): string => n.toFixed(2);

function renderResults(runs: readonly DiagRun[]): string {
  const rows = runs
    .map((r) => {
      if (!r.ok) return `<tr class="off"><td>${r.label}</td><td colspan="5">${r.note}</td></tr>`;
      const pass = passes(r);
      return (
        `<tr class="${pass ? 'pass' : 'fail'}"><td>${r.label}</td>` +
        `<td>${ms(r.cpu.p50)}</td><td>${ms(r.cpu.p95)}</td>` +
        `<td class="key">${ms(r.cpu.p99)}</td><td>${ms(r.cpu.max)}</td>` +
        `<td>${r.dropped}</td></tr>`
      );
    })
    .join('');
  return (
    '<table><thead><tr><th>candidate</th><th>p50</th><th>p95</th>' +
    '<th>p99</th><th>max</th><th>drop</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>` +
    `<p class="hint">pass = cpu p99 ≤ ${BUDGET_P99_MS}ms <b>and</b> dropped ≤ ` +
    `${BUDGET_DROP_RATIO * 100}% · ${MEASURE_FRAMES} frames each after ${WARMUP_FRAMES} ` +
    `discarded · dropped is the only signal that sees the GPU · no mean is computed</p>`
  );
}

function buildReport(runs: readonly DiagRun[]): DiagReport {
  return {
    kind: 'renderer-spike',
    at: new Date().toISOString(),
    device: {
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      css: { w: window.innerWidth, h: window.innerHeight },
      backing: { w: backing.w, h: backing.h },
      webgl2: hasWebGL2,
    },
    scene: scene.facts,
    runs,
  };
}

let latest: DiagReport | null = null;

async function send(status: HTMLElement): Promise<void> {
  if (!latest) return;
  status.textContent = 'sending…';
  try {
    const res = await fetch('/__diag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(latest),
    });
    const body: unknown = await res.json();
    const saved =
      typeof body === 'object' && body !== null && 'saved' in body
        ? String((body as { saved: unknown }).saved)
        : 'unknown';
    status.textContent = res.ok ? `saved to diagnostics/${saved}` : `refused: ${saved}`;
  } catch (err) {
    status.textContent = `send failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function paint(body: string, running = false): void {
  panel.innerHTML = body;
  panel.classList.toggle('running', running);
}

const facts = Object.entries(scene.facts)
  .map(([k, v]) => `<span><b>${v}</b> ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>`)
  .join('');

const intro =
  `<h1>M0.5 · renderer spike</h1>` +
  `<p class="hint">${backing.w}×${backing.h} backing · dpr ${window.devicePixelRatio} · ` +
  `webgl2 ${hasWebGL2 ? 'yes' : 'no'}</p>` +
  `<div class="facts">${facts}</div>` +
  `<button id="go">RUN</button>` +
  `<button id="go-rev" class="ghost">RUN REVERSED</button>` +
  `<p class="hint">Reversed runs the same ladder backwards. If the two disagree, the phone was ` +
  `throttling and neither order is the answer on its own.</p>`;

async function start(reversed: boolean): Promise<void> {
  const order = reversed ? [...LADDER].reverse() : LADDER;
  const runs: DiagRun[] = [];

  for (let i = 0; i < order.length; i++) {
    const candidate = order[i]!;
    paint(
      `<p class="progress">${i + 1}/${order.length} · ${candidate.label}<span id="pct"></span></p>`,
      true,
    );
    const pct = document.getElementById('pct');
    runs.push(
      await run(candidate, (f) => {
        if (pct) pct.textContent = ` · ${Math.round(f * 100)}%`;
      }),
    );
  }

  latest = buildReport(runs);
  paint(
    `<h1>${reversed ? 'reversed · ' : ''}results</h1>` +
      renderResults(runs) +
      (import.meta.env.DEV ? `<button id="send">SEND TO DEV SERVER</button>` : '') +
      `<p class="hint" id="status"></p>` +
      `<button id="again" class="ghost">RUN AGAIN</button>` +
      `<button id="again-rev" class="ghost">RUN REVERSED</button>`,
  );

  const status = document.getElementById('status');
  if (status) document.getElementById('send')?.addEventListener('click', () => void send(status));
  document.getElementById('again')?.addEventListener('click', () => void start(false));
  document.getElementById('again-rev')?.addEventListener('click', () => void start(true));
}

paint(intro);
document.getElementById('go')?.addEventListener('click', () => void start(false));
document.getElementById('go-rev')?.addEventListener('click', () => void start(true));
