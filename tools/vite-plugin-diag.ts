/**
 * DEV-ONLY endpoint that receives diagnostics reports from a phone.
 *
 * `apply: 'serve'` means this never exists in a production build, and the client
 * half is behind `import.meta.env.DEV`, so the SEND button is dead-code
 * eliminated too. Nothing here ships.
 *
 * SECURITY: the dev server already binds all interfaces so a phone can reach it,
 * and this adds an endpoint that writes files. It is deliberately narrow — POST
 * only, hard body cap, must parse as a report of the expected schema, and the
 * filename is generated here rather than taken from the request, so a caller
 * cannot choose a path. Do not carry this pattern into anything user-facing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { parseReport } from '../src/app/report.ts';
import { formatAnalysis, replayReport } from './replay-core.ts';

const OUT_DIR = fileURLToPath(new URL('../diagnostics', import.meta.url));
const MAX_BYTES = 512 * 1024;
export const DIAG_ENDPOINT = '/__diag';

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
            const report = parseReport(body);

            mkdirSync(OUT_DIR, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const name = `${stamp}.json`;
            writeFileSync(join(OUT_DIR, name), body);

            const analysis = replayReport(report);
            const log = server.config.logger.info;
            log('');
            log(`\x1b[1m  ▼ report received from ${report.device.w}x${report.device.h}\x1b[0m`);
            for (const line of formatAnalysis(report, analysis)) log(line);
            log(`  saved to diagnostics/${name}`);
            log('');

            res.setHeader('content-type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                saved: name,
                fidelity: analysis.fidelity,
                findings: analysis.findings,
              }),
            );
          } catch (err) {
            server.config.logger.warn(
              `  diagnostics report rejected: ${err instanceof Error ? err.message : String(err)}`,
            );
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        })();
      });
    },
  };
}
