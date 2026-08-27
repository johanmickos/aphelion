/**
 * SPIKE — throwaway. Deleted with `app/spike/` when the M0.5 ADR lands.
 *
 * Puts the spike's own page one scan away, exactly as `vite-plugin-qr.ts` does
 * for the game. The harness is useless if the phone cannot get to it, and
 * typing a path into a phone keyboard is the kind of friction that turns "run it
 * again on a cold device" into "we already have a number".
 *
 * This is a separate plugin from `vite-plugin-diag.ts` on purpose. The
 * diagnostics endpoint is apparatus worth keeping past M0.5; this shortcut is
 * not, and separating them means deleting the spike does not require editing
 * something that stays.
 */
import type { Plugin, ViteDevServer } from 'vite';
import { renderQr } from './qr.ts';

export const SPIKE_PATH = '/spike/';

export function spikePlugin(): Plugin {
  return {
    name: 'aphelion:spike',
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      const banner = async (): Promise<void> => {
        const log = server.config.logger;
        const base = server.resolvedUrls?.network?.[0];
        if (!base) {
          log.warn('\n  No LAN address for the spike — is Wi-Fi connected?\n');
          return;
        }
        const url = new URL(SPIKE_PATH, base).href;
        try {
          log.info(`\n${await renderQr(url, true)}\n`);
        } catch {
          log.info('\n  (QR unavailable)\n');
        }
        log.info(`  \x1b[1mM0.5 renderer spike\x1b[0m  ${url}`);
        log.info('  \x1b[2mtap RUN, wait ~35s, tap SEND TO DEV SERVER\x1b[0m\n');
      };

      const bindCLIShortcuts = server.bindCLIShortcuts.bind(server);
      server.bindCLIShortcuts = (options) =>
        bindCLIShortcuts({
          ...options,
          customShortcuts: [
            {
              key: 'x',
              description: 'print the M0.5 renderer spike QR code',
              action: () => void banner(),
            },
            ...(options?.customShortcuts ?? []),
          ],
        });
    },
  };
}
