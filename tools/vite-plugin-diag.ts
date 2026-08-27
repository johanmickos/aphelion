/**
 * DEV-ONLY endpoint that receives a measurement report from a phone and writes
 * it to `diagnostics/`.
 *
 * The author's judgement is made on a phone (ADR-0010) and so is the only
 * measurement that counts (M0.5). A number read off a phone screen and typed
 * back into a laptop is a number nobody can check later, so the phone posts its
 * samples here and the machine keeps the file.
 *
 * The prototype has a plugin with the same job. Its decisions are taken; its
 * code is not copied (ADR-0001). What is taken:
 *
 *   - **`apply: 'serve'`.** This never exists in a production build. The client
 *     half sits behind `import.meta.env.DEV` so its SEND button is dead-code
 *     eliminated too. Nothing here ships, and ADR-0003's "no backend" is intact
 *     because this is not one — it is a dev server writing a file on the
 *     author's own machine.
 *   - **Print the verdict to the terminal, not just to disk.** The point of the
 *     round trip is that the person holding the phone and the person reading the
 *     numbers are the same person, in front of the laptop, a second later.
 *
 * SECURITY: `server.host` is true so a phone can reach the dev server, which
 * means this endpoint is exposed to everything on the LAN, and it writes files.
 * It is deliberately narrow, and each of these is load-bearing:
 *
 *   - POST only.
 *   - A hard body cap, enforced while reading rather than after.
 *   - The body must parse as a report of the expected shape, or it is refused
 *     before anything touches the disk.
 *   - **The filename is generated here**, from a timestamp, and never taken from
 *     the request. A caller cannot choose a path.
 *   - It writes into one fixed directory, resolved from this file's own URL.
 *
 * Do not carry this pattern into anything user-facing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin, ViteDevServer } from 'vite';

const OUT_DIR = fileURLToPath(new URL('../diagnostics', import.meta.url));
const MAX_BYTES = 512 * 1024;
export const DIAG_ENDPOINT = '/__diag';

/** The timing summary for one candidate, in milliseconds. */
export interface DiagStats {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

/** One candidate's run: what it was, and what it cost. */
export interface DiagRun {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  readonly note: string;
  readonly frames: number;
  /** Time spent issuing the frame's draw calls on the main thread. */
  readonly cpu: DiagStats;
  /** Wall-clock interval between presented frames. */
  readonly interval: DiagStats;
  readonly dropped: number;
  /** cpu p99 over the first third of the run, and over the last third. */
  readonly drift: { readonly early: number; readonly late: number };
}

export interface DiagReport {
  readonly kind: 'renderer-spike';
  readonly at: string;
  readonly device: {
    readonly ua: string;
    readonly dpr: number;
    readonly css: { readonly w: number; readonly h: number };
    readonly backing: { readonly w: number; readonly h: number };
    readonly webgl2: boolean;
  };
  readonly scene: Record<string, number>;
  readonly runs: readonly DiagRun[];
}

function isStats(v: unknown): v is DiagStats {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (['p50', 'p95', 'p99', 'max'] as const).every((k) => typeof s[k] === 'number');
}

/**
 * Validates rather than casts. The endpoint is on an interface anything on the
 * network can reach, so "it arrived as JSON" is not the same as "it is a
 * report", and a file is written on the strength of this returning.
 */
export function parseDiagReport(body: string): DiagReport {
  const raw: unknown = JSON.parse(body);
  if (typeof raw !== 'object' || raw === null) throw new Error('not an object');
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'renderer-spike') throw new Error(`unknown report kind ${String(r.kind)}`);
  if (typeof r.at !== 'string') throw new Error('missing timestamp');
  if (typeof r.device !== 'object' || r.device === null) throw new Error('missing device');
  if (typeof r.scene !== 'object' || r.scene === null) throw new Error('missing scene');
  if (!Array.isArray(r.runs) || r.runs.length === 0) throw new Error('no runs');
  for (const run of r.runs as unknown[]) {
    if (typeof run !== 'object' || run === null) throw new Error('malformed run');
    const x = run as Record<string, unknown>;
    if (typeof x.id !== 'string') throw new Error('run without an id');
    if (!isStats(x.cpu) || !isStats(x.interval)) throw new Error(`run ${x.id} has no timings`);
  }
  return raw as DiagReport;
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BYTES) {
        reject(new Error(`report exceeds ${MAX_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const ms = (n: number): string => n.toFixed(2).padStart(7);

/**
 * The budget M0.5 is measured against: p99 of the main-thread frame cost, on the
 * author's phone. Restated here rather than imported from the client so the
 * terminal can call a pass a pass without the phone being trusted to have done
 * the arithmetic — the report carries samples, not conclusions.
 *
 * Dropped frames are the second half of the test. Main-thread time does not see
 * the GPU, so a candidate can be cheap here and still miss its frames.
 */
const BUDGET_P99_MS = 8;
const BUDGET_DROP_RATIO = 0.01;

const passes = (r: DiagRun): boolean =>
  r.ok && r.cpu.p99 <= BUDGET_P99_MS && r.dropped <= r.frames * BUDGET_DROP_RATIO;

export function formatDiagReport(report: DiagReport): string[] {
  const d = report.device;
  const out: string[] = [
    '',
    `  \x1b[1m▼ renderer spike · ${d.css.w}×${d.css.h} css · ${d.backing.w}×${d.backing.h} backing · dpr ${d.dpr}\x1b[0m`,
    `  \x1b[2m${d.ua}\x1b[0m`,
    '',
    '  candidate                        cpu p50  cpu p95  \x1b[1mcpu p99\x1b[0m  cpu max   frame p99  dropped  drift',
  ];
  for (const run of report.runs) {
    const verdict = !run.ok ? '\x1b[2m' : passes(run) ? '\x1b[32m' : '\x1b[31m';
    const drift = `${run.drift.early.toFixed(1)}→${run.drift.late.toFixed(1)}`;
    out.push(
      `  ${verdict}${run.label.padEnd(30)}\x1b[0m ${ms(run.cpu.p50)}  ${ms(run.cpu.p95)}  ` +
        `${verdict}${ms(run.cpu.p99)}\x1b[0m  ${ms(run.cpu.max)}   ${ms(run.interval.p99)}  ` +
        `${String(run.dropped).padStart(7)}  ${drift}`,
    );
    if (run.note) out.push(`    \x1b[2m${run.note}\x1b[0m`);
  }
  out.push('');
  out.push(
    `  \x1b[2mpass = cpu p99 ≤ ${BUDGET_P99_MS}ms and dropped ≤ ${BUDGET_DROP_RATIO * 100}% of ` +
      'frames. No mean is reported, deliberately.\x1b[0m',
  );
  return out;
}

export function diagPlugin(): Plugin {
  return {
    name: 'aphelion:diag',
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      server.middlewares.use(DIAG_ENDPOINT, (req, res) => {
        void (async () => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('POST only');
            return;
          }
          try {
            const body = await readBody(req);
            const report = parseDiagReport(body);

            mkdirSync(OUT_DIR, { recursive: true });
            // Generated here, never taken from the request.
            const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-renderer-spike.json`;
            writeFileSync(join(OUT_DIR, name), body);

            const log = server.config.logger;
            for (const line of formatDiagReport(report)) log.info(line);
            log.info(`  saved to diagnostics/${name}\n`);

            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, saved: name }));
          } catch (err) {
            const why = err instanceof Error ? err.message : String(err);
            server.config.logger.warn(`  diagnostics report rejected: ${why}`);
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: why }));
          }
        })();
      });
    },
  };
}
