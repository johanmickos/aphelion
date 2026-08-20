/**
 * Prints a scannable QR for the dev server's LAN address.
 *
 * Printing before launching Vite does not work: Vite clears the terminal on
 * startup, so the code is wiped before you can scan it. This hooks `printUrls`
 * instead, so the QR lands immediately after Vite's own banner — and it reads the
 * server's *resolved* network URL, so it is always correct even when Vite picks a
 * different port. That removes the need to hunt for a free port beforehand.
 *
 * Press `p` in the terminal to reprint it after HMR output has scrolled it away.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

const QR_SCRIPT = fileURLToPath(new URL('./qr.py', import.meta.url));

function renderQr(url: string, big: boolean): string | null {
  try {
    return execFileSync('python3', [QR_SCRIPT, ...(big ? ['--big'] : []), url], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

export function qrPlugin(): Plugin {
  let big = false;

  return {
    name: 'aphelion:qr',
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      const banner = (): void => {
        const url = server.resolvedUrls?.network?.[0];
        if (!url) {
          server.config.logger.warn(
            '  no LAN address — is Wi-Fi connected? (use --host to bind all interfaces)',
          );
          return;
        }

        const qr = renderQr(url, big);
        const out = server.config.logger.info;
        out('');
        if (qr) out(qr.replace(/\n$/, ''));
        else out('  (QR unavailable — python3 not found)');
        out('');
        out(`  \x1b[1mScan to play on your phone\x1b[0m  ${url}`);
        out(`  \x1b[2mpress p to reprint · P for a larger code · same Wi-Fi required\x1b[0m`);
        out('');
      };

      const printUrls = server.printUrls.bind(server);
      server.printUrls = (): void => {
        printUrls();
        banner();
      };

      const bind = server.bindCLIShortcuts.bind(server);
      server.bindCLIShortcuts = (opts) =>
        bind({
          ...opts,
          customShortcuts: [
            {
              key: 'p',
              description: 'print the phone QR code',
              action: () => {
                big = false;
                banner();
              },
            },
            {
              key: 'P',
              description: 'print a larger phone QR code',
              action: () => {
                big = true;
                banner();
                big = false;
              },
            },
            ...(opts?.customShortcuts ?? []),
          ],
        });
    },
  };
}
