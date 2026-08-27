import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config.ts';

/**
 * The scaffold's own regression test. Two of these settings are load-bearing
 * and silently wrong when broken — a site that 404s every asset still builds
 * green — so they are asserted rather than trusted.
 */
describe('the vite configuration', () => {
  const config = viteConfig({ command: 'build', mode: 'production' });

  it('serves from a relative base, because Pages mounts the site on a subpath', () => {
    expect(config.base).toBe('./');
  });

  it('roots the build at app/, so the game is what gets built', () => {
    expect(config.root).toBe('app');
  });
});
