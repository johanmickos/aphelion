import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { renderQr } from '../tools/qr.ts';

const URL = 'http://192.168.0.37:5173/';
const QUIET = 4;

// Reading ANSI escapes back out is the whole job here, so the escape character
// belongs in this pattern.
// eslint-disable-next-line no-control-regex
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Reads the drawn code back into a module grid.
 *
 * Half-blocks carry two module rows per character: `█` is both dark, `▀` the
 * top only, `▄` the bottom only, a space neither.
 */
function readBack(code: string): { grid: boolean[][]; width: number } {
  const lines = code.split('\n').map(strip);
  const width = lines[0]!.length;
  const grid: boolean[][] = [];
  for (const line of lines) {
    const top: boolean[] = [];
    const bottom: boolean[] = [];
    for (const ch of line) {
      top.push(ch === '█' || ch === '▀');
      bottom.push(ch === '█' || ch === '▄');
    }
    grid.push(top, bottom);
  }
  return { grid, width };
}

describe('the drawn code', () => {
  it('reproduces the encoder’s module matrix exactly', async () => {
    const { modules } = QRCode.create(URL, { errorCorrectionLevel: 'M' });
    const { grid } = readBack(await renderQr(URL));

    const wrong: string[] = [];
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        const expected = modules.data[y * modules.size + x] === 1;
        const actual = grid[y + QUIET]?.[x + QUIET] ?? false;
        if (actual !== expected) wrong.push(`${x},${y}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * The quiet zone is what lets a scanner find the finder patterns at all, and
   * it is the thing the library's own renderer gets wrong — it draws two
   * modules where the specification asks for four, and lets the terminal's
   * background colour eat the bottom of them.
   */
  it('surrounds the matrix with four light modules on every side', async () => {
    const { modules } = QRCode.create(URL, { errorCorrectionLevel: 'M' });
    const { grid, width } = readBack(await renderQr(URL));
    const span = modules.size + QUIET * 2;

    expect(width).toBe(span);

    const lit = (y: number): boolean[] => grid[y] ?? [];
    for (let i = 0; i < QUIET; i++) {
      expect(lit(i).some(Boolean), `top row ${i} is not clear`).toBe(false);
      expect(lit(span - 1 - i).some(Boolean), `bottom row ${i} is not clear`).toBe(false);
    }
    for (let y = 0; y < span; y++) {
      for (let i = 0; i < QUIET; i++) {
        expect(lit(y)[i] ?? false, `left column ${i} of row ${y}`).toBe(false);
        expect(lit(y)[span - 1 - i] ?? false, `right column ${i} of row ${y}`).toBe(false);
      }
    }
  });

  it('draws every line to the same width, and never a half-drawn last line', async () => {
    const lines = (await renderQr(URL)).split('\n').map(strip);
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
    // Two module rows per line, so an odd span must have been padded up.
    expect(lines.length % 1).toBe(0);
    expect(lines[lines.length - 1]).toMatch(/^ +$/);
  });

  it('states its own colours, so a dark terminal theme cannot invert it', async () => {
    const code = await renderQr(URL);
    for (const line of code.split('\n')) {
      expect(line.startsWith('\x1b[47m\x1b[30m')).toBe(true);
      expect(line.endsWith('\x1b[0m')).toBe(true);
    }
  });

  it('renders a larger form for terminals that seam half-blocks', async () => {
    const small = (await renderQr(URL, true)).split('\n');
    const big = (await renderQr(URL, false)).split('\n');
    expect(big.length).toBeGreaterThan(small.length);
    expect(strip(big[0]!).length).toBe(strip(small[0]!).length * 2);
  });
});
