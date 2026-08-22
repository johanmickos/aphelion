import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Several tests here replay thousands of sim ticks, and a shared CI runner
    // is ~3x slower per core than the machine this is usually written on — four
    // cores against twelve, with test files in parallel workers. Under vitest's
    // 5s default that put the two slowest render scenes at ~70% of budget and
    // timed out the scoring-weight sweep outright, a failure that said nothing
    // about the code. A slow test still wants making faster; this is only so
    // the clock is not what decides.
    testTimeout: 20000,
  },
});
