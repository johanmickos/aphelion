/**
 * Prints a scannable QR for the dev server's LAN address.
 *
 * The author's judgement of feel is made on a phone (ADR-0010), so the distance
 * between "the code changed" and "the phone is showing it" is a tool that gets
 * used hundreds of times a day. Three details, each of which the obvious
 * implementation gets wrong:
 *
 *   - **Print from `printUrls`, not before starting Vite.** Vite clears the
 *     terminal on startup, so a code printed beforehand is wiped before anyone
 *     can scan it. Hooking `printUrls` lands it immediately after Vite's own
 *     banner.
 *   - **Read the server's *resolved* network URL.** Vite picks a different port
 *     when the configured one is busy, and a code built from the configured port
 *     sends the phone somewhere nothing is listening. Reading what the server
 *     actually bound removes the need to keep a port free.
 *   - **Offer a keypress to reprint.** HMR output scrolls the code away within a
 *     minute of real work, and re-running the dev server to see it again costs
 *     the state of whatever was being tested.
 */
import type { Plugin, ViteDevServer } from 'vite';
import { renderQr } from './qr.ts';

export function qrPlugin(): Plugin {
  return {
    name: 'aphelion:qr',
    // Dev only. There is no terminal to print to in a build, and the deployed
    // site is reached by its own URL.
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      const banner = async (small: boolean): Promise<void> => {
        const log = server.config.logger;
        const url = server.resolvedUrls?.network?.[0];

        if (!url) {
          log.warn(
            '\n  No LAN address to offer the phone — is Wi-Fi connected?' +
              '\n  (the dev server binds all interfaces; see `server.host` in vite.config.ts)\n',
          );
          return;
        }

        try {
          log.info(`\n${await renderQr(url, small)}\n`);
        } catch {
          // A missing QR is an inconvenience, not a reason to fail a dev server.
          log.info('\n  (QR unavailable)\n');
        }
        log.info(`  \x1b[1mScan to play on your phone\x1b[0m  ${url}`);
        log.info(
          '  \x1b[2mpress s to reprint · S for a larger code · same Wi-Fi required\x1b[0m\n',
        );
      };

      const printUrls = server.printUrls.bind(server);
      server.printUrls = (): void => {
        printUrls();
        // `printUrls` is synchronous and rendering is not, so the code lands a
        // tick after Vite's banner rather than inside it. That is the right
        // order anyway; it is only worth saying so that the missing `await` here
        // reads as deliberate.
        void banner(true);
      };

      // `s` for scan. Every obvious letter is taken: Vite itself binds
      // c, o, p, q, r and u — and `p` in particular, which is what the
      // prototype used, became the profiler toggle in Vite 8. Overriding a key
      // the tool already owns breaks it silently, so this checks rather than
      // assumes.
      const bindCLIShortcuts = server.bindCLIShortcuts.bind(server);
      server.bindCLIShortcuts = (options) =>
        bindCLIShortcuts({
          ...options,
          customShortcuts: [
            {
              key: 's',
              description: 'print the phone QR code',
              action: () => void banner(true),
            },
            {
              key: 'S',
              description: 'print a larger phone QR code',
              action: () => void banner(false),
            },
            ...(options?.customShortcuts ?? []),
          ],
        });
    },
  };
}
