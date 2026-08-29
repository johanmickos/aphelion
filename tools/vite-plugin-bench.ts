/**
 * Serves the bench from the dev server, at `/bench`.
 *
 * **The bench is a separate build and stays one.** `pnpm bench` copies `src/` to
 * a work tree, rewrites a listed handful of constants into settable bindings and
 * inlines the result into one self-contained page — because
 * [AGENTS.md](../AGENTS.md) §6 asks a knob for an argument about why the decision
 * cannot be made once inside, and *"so it can be flown"* is an argument for a
 * bench rather than for a setting. The constants stay `const` in the game.
 *
 * What this plugin fixes is only that the two lived at different addresses. The
 * game is at the dev server's URL and the bench was a file on the author's disk,
 * so *"where is the A/B slider? I don't see it on the dev server build"*
 * (2026-08-29) was the correct observation about a page that was never there.
 * Now the QR that puts the game on a phone puts the knobs on the same phone, one
 * path along.
 *
 * **Dev only** (`apply: 'serve'`), and it serves a file rather than building one:
 * if `pnpm bench` has not been run, or was run before the last change to `src/`,
 * it says so rather than serving a page that quietly disagrees with the game
 * beside it. A bench that lies is worse than no bench, which is the same reason
 * `test/bench.test.ts` exists.
 */
import { readFileSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = join(ROOT, 'bench', 'aphelion-bench.html');

/** The newest mtime under a directory — how stale the bench is measured against. */
function newestUnder(dir: string): number {
  let newest = 0;
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const path = join(dir, name);
    try {
      const at = statSync(path);
      if (at.isFile()) newest = Math.max(newest, at.mtimeMs);
    } catch {
      // A file that vanished between the listing and the stat is not staleness.
    }
  }
  return newest;
}

function complaint(message: string): string {
  return (
    '<!doctype html><meta charset="utf-8"><title>Aphelion Bench</title>' +
    '<body style="margin:0;background:#0A0814;color:#EDEAF7;font:16px/1.6 system-ui;padding:2rem">' +
    `<h1 style="color:#FFF4E0">The bench is not ready</h1><p>${message}</p>` +
    '<p style="color:#6C64A6">Run <code style="color:#EDEAF7">pnpm bench</code> and reload.</p>'
  );
}

export function benchPlugin(): Plugin {
  return {
    name: 'aphelion-bench',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '').split('?')[0];
        if (url !== '/bench' && url !== '/bench/') return next();

        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        // Never cached: the whole point is that a rebuild is one reload away.
        response.setHeader('Cache-Control', 'no-store');

        let built: number;
        try {
          built = statSync(PAGE).mtimeMs;
        } catch {
          response.statusCode = 404;
          response.end(complaint('It has never been built.'));
          return;
        }

        const changed = Math.max(
          newestUnder(join(ROOT, 'src')),
          newestUnder(join(ROOT, 'tools', 'bench')),
        );
        if (changed > built) {
          response.statusCode = 409;
          response.end(
            complaint(
              'The game has changed since it was built, so its sliders would be wired to an older ' +
                'copy of the simulation — and a bench that answers a question about a build nobody ' +
                'is flying answers it confidently and wrongly.',
            ),
          );
          return;
        }

        response.end(readFileSync(PAGE, 'utf8'));
      });
    },
  };
}
