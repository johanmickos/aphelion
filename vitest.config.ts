import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `node`, not a DOM environment: the simulation and presentation state are
  // pure and headless by construction (ADR-0006), and a test that needs a
  // document is a test of the renderer, which owns nothing but pixels.
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
