/**
 * DEV-ONLY endpoint that receives what a phone has to say and writes it to
 * `diagnostics/`.
 *
 * The author's judgement is made on a phone (ADR-0010) and so is the only
 * measurement that counts (M0.5). A number read off a phone screen and typed
 * back into a laptop is a number nobody can check later, so the phone posts its
 * samples here and the machine keeps the file.
 *
 * **Two things arrive here, and they are told apart by `kind`.** M0.5's timing
 * report is the first. The second is [M1.5](../docs/plan/m1-the-swing.md)'s
 * **dispatch** (`CONTEXT.md`) — a recipe with what the author saw beside it —
 * and it is the same argument one milestone on: a sentence about how a swing
 * felt, typed back into a laptop, is a sentence nobody can replay.
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
 *   - The body must parse as one of the two known shapes, or it is refused
 *     before anything touches the disk.
 *   - **The filename is generated here**, from a timestamp and from a suffix
 *     fixed per kind, and never taken from the request. A caller cannot choose a
 *     path, and cannot choose part of one either.
 *   - It writes into one fixed directory, resolved from this file's own URL.
 *
 * **The second kind arrived by extending the validator, never by loosening it**,
 * and the cap moved the other way: 512 KB was an assumption, and
 * [`MAX_DISPATCH_BYTES`](./dispatch.ts) is now a measurement — 64 KB, about
 * twice the largest legitimate thing anyone can post. A dispatch is also written
 * back out from what the validator built rather than echoed from the bytes that
 * arrived, so a key nobody checked cannot reach the disk inside an object that
 * looks checked.
 *
 * Do not carry this pattern into anything user-facing.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import {
  BUILD_STAMP_LENGTH,
  DIAG_ENDPOINT,
  DISPATCH_KIND,
  MAX_DISPATCH_BYTES,
  buildDispatch,
  parseDispatch,
} from './dispatch.ts';
import { formatDispatch } from './trail.ts';

const OUT_DIR = fileURLToPath(new URL('../diagnostics', import.meta.url));
const MAX_BYTES = MAX_DISPATCH_BYTES;

/**
 * The end of the filename, per kind, and it is a literal in this file.
 *
 * The whole name is generated here — a timestamp and one of these — so that
 * nothing a caller sends reaches a path, not even the part of it that says what
 * the file is.
 */
const SUFFIX = { spike: 'renderer-spike', dispatch: 'run-dispatch' } as const;

/** The directories whose contents decide what a run does and what it costs. */
const SOURCE_DIRS = ['../src', '../app'] as const;

/**
 * A short hash of the source this server is serving — the dispatch's
 * [`build`](./dispatch.ts#build).
 *
 * **Computed when a dispatch arrives rather than when the server started**, and
 * that is the whole of why it can be trusted: Vite full-reloads the page on any
 * change under `src/`, so a run begins after the last edit and the source here
 * now is the source the page loaded. A stamp fixed at start-up would name a build
 * that had been hot-replaced under it hours ago.
 *
 * Only `.ts` under `src/` and `app/`. Not `tools/`, which cannot reach a phone;
 * not `docs/`, which cannot reach anything; not the page's own HTML, which
 * changes what the shell looks like and not what a frame costs.
 *
 * It is an **identity and not a signature**. Reading files the author owns, on
 * the author's own machine, to label the author's own measurement — there is
 * nothing here to defend against and the hash is short for that reason.
 */
export function sourceStamp(): string {
  const digest = createHash('sha256');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) files.push(path);
    }
  };
  for (const dir of SOURCE_DIRS) walk(fileURLToPath(new URL(dir, import.meta.url)));
  for (const path of files.sort()) {
    // The path rides along with the contents, so moving a file is a change even
    // when nothing inside it moved.
    digest.update(path);
    digest.update(readFileSync(path));
  }
  return digest.digest('hex').slice(0, BUILD_STAMP_LENGTH);
}

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
    /**
     * Optional: absent from the first reports, which is the reason they exist.
     * `renderAt: 'design'` means the buffer was the full 1170×2532 regardless
     * of viewport; `fit` is the fraction of the design rect the viewport could
     * show. A report without them was measured at whatever size the phone's
     * browser chrome left over.
     */
    readonly fit?: number;
    readonly renderAt?: 'design' | 'viewport';
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
        reject(new Error(`body exceeds ${MAX_BYTES} bytes`));
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
    `  \x1b[1m▼ renderer spike · ${d.backing.w}×${d.backing.h} backing` +
      `${d.renderAt === 'design' ? ' (design size)' : ' \x1b[31m(viewport-sized — not the design size)\x1b[0m\x1b[1m'}` +
      ` · ${d.css.w}×${d.css.h} css · dpr ${d.dpr}\x1b[0m`,
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

/** One accepted body: what to call the file, what to write, and what to print. */
export interface Accepted {
  readonly suffix: string;
  readonly body: string;
  /**
   * The lines to print, produced **after** the file is written and separately
   * from validating it. A dispatch is read by replaying it, and a bug in the
   * reader must never be a reason the evidence was not kept.
   */
  readonly describe: () => string[];
}

/**
 * Decide which of the two things this is, and refuse it if it is neither.
 *
 * `kind` is asked first and matched against a literal, so a body that does not
 * claim to be a dispatch is held to the timing report's own validator exactly as
 * it was before this file learned a second shape.
 */
export function receive(body: string, build?: string): Accepted {
  const raw: unknown = JSON.parse(body);
  const kind =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).kind : undefined;
  if (kind === DISPATCH_KIND) {
    // **Stamped here and not read off the request.** The page does not know what
    // it was built from and could only be told, and a claim the sender makes about
    // its own build is the one thing a build stamp must not be. It goes on after
    // validation and through `buildDispatch`, so what reaches the disk is still
    // only what this file assembled.
    const dispatch = buildDispatch({
      ...parseDispatch(raw),
      ...(build === undefined ? {} : { build }),
    });
    return {
      suffix: SUFFIX.dispatch,
      body: JSON.stringify(dispatch),
      describe: () => formatDispatch(dispatch),
    };
  }
  const report = parseDiagReport(body);
  return { suffix: SUFFIX.spike, body, describe: () => formatDiagReport(report) };
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
            const accepted = receive(await readBody(req), sourceStamp());

            mkdirSync(OUT_DIR, { recursive: true });
            // Generated here, never taken from the request.
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const name = `${stamp}-${accepted.suffix}.json`;
            writeFileSync(join(OUT_DIR, name), accepted.body);

            const log = server.config.logger;
            // The file exists by now, so reading it is allowed to fail without
            // costing the thing that was sent. A dispatch is a run somebody flew
            // once, on a phone, and it does not come back.
            try {
              for (const line of accepted.describe()) log.info(line);
            } catch (err) {
              const why = err instanceof Error ? err.message : String(err);
              log.warn(`  saved, but could not be read back: ${why}`);
            }
            log.info(`  saved to diagnostics/${name}\n`);

            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, saved: name }));
          } catch (err) {
            const why = err instanceof Error ? err.message : String(err);
            server.config.logger.warn(`  refused: ${why}`);
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: why }));
          }
        })();
      });
    },
  };
}
