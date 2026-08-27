/**
 * Tests the thing that keeps the layers apart, because a boundary checker that
 * has quietly stopped catching anything is worse than no checker: it reports
 * success, and the architecture it was protecting drifts behind the green tick.
 *
 * Each case is a directory under `fixtures/portability/` shaped like `src/` and
 * containing one deliberate violation. Fixtures rather than files written into
 * the real `src/` during the test: a crashed test that leaves a violation behind
 * in `src/sim/` would break every later run for reasons that have nothing to do
 * with the change being made.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CHECKER = fileURLToPath(new URL('../tools/check-portability.ts', import.meta.url));

interface Result {
  code: number;
  output: string;
}

function check(fixture?: string): Result {
  const args = [CHECKER];
  if (fixture)
    args.push(fileURLToPath(new URL(`./fixtures/portability/${fixture}`, import.meta.url)));
  try {
    return { code: 0, output: execFileSync('node', args, { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, output: e.stdout + e.stderr };
  }
}

describe('the real src/', () => {
  it('is portable, and proves it by running under plain node', () => {
    const { code, output } = check();
    expect(output).toContain('under plain node');
    expect(code).toBe(0);
  });
});

describe('the checker fails loudly when', () => {
  // The two cases M0.3 names as its acceptance criteria.
  it('a DOM global is added to the simulation', () => {
    const { code, output } = check('dom-in-sim');
    expect(code).toBe(1);
    expect(output).toContain('sim/step.ts:6');
    expect(output).toContain('document — DOM global');
    expect(output).toContain('not attempting to load the simulation');
  });

  it('presentation state imports the renderer', () => {
    const { code, output } = check('state-imports-render');
    expect(code).toBe(1);
    expect(output).toContain('src/state may reach src/sim, not src/render');
  });

  // Everything else the boundary is worth having for.
  it('the simulation imports a package', () => {
    const { code, output } = check('package-in-sim');
    expect(code).toBe(1);
    expect(output).toContain('must be dependency-free');
  });

  it('the simulation reaches for unseeded randomness', () => {
    const { code, output } = check('random-in-sim');
    expect(code).toBe(1);
    expect(output).toContain('Math.random');
    expect(output).toContain('ADR-0004');
  });

  /**
   * ADR-0014's half of the rule. `Math.hypot` was already banned because the
   * prototype was bitten by it; the rest of the implementation-approximated
   * family is banned for exactly the same reason, measured — V8 and
   * JavaScriptCore disagree on `Math.atan2` for 17.9% of arguments.
   */
  it('the simulation reaches for an implementation-approximated Math function', () => {
    const { code, output } = check('approximated-math-in-sim');
    expect(code).toBe(1);
    expect(output).toContain('Math.sin');
    expect(output).toContain('Math.atan2');
    expect(output).toContain('ADR-0014');
  });

  it('the simulation uses ** , which carries the same latitude as Math.pow', () => {
    const { code, output } = check('exponent-operator-in-sim');
    expect(code).toBe(1);
    expect(output).toContain('**');
    expect(output).toContain('power()');
  });

  it('a file uses TypeScript that plain node cannot strip', () => {
    const { code, output } = check('unerasable');
    expect(code).toBe(1);
    expect(output).toContain('enum');
  });
});

describe('the checker stays quiet when', () => {
  it('a clean fixture is scanned', () => {
    const { code, output } = check('clean');
    expect(code).toBe(0);
    expect(output).toContain('no portability violations');
  });

  /**
   * The failure mode of a regex-based checker, and the reason this one parses.
   * `state.document`, `{ window: 1 }` and the word `Math.random` in a comment
   * are not reaches for a banned global, and a checker that says they are gets
   * switched off.
   */
  it('a banned name appears somewhere that is not a reference', () => {
    const { code, output } = check('not-a-reference');
    expect(code).toBe(0);
    expect(output).toContain('no portability violations');
  });
});
