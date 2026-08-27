/**
 * The diagnostics endpoint writes files, on a server bound to every interface so
 * that a phone can reach it. `parseDiagReport` is the thing standing between
 * "something POSTed" and "a file was written", so it is tested rather than
 * trusted — and it stays tested after `app/spike/` is deleted, because the
 * endpoint outlives the spike that needed it.
 */
import { describe, expect, it } from 'vitest';
import { formatDiagReport, parseDiagReport } from '../tools/vite-plugin-diag.ts';
import type { DiagReport } from '../tools/vite-plugin-diag.ts';

const stats = { p50: 1, p95: 2, p99: 3, max: 4 };

const report: DiagReport = {
  kind: 'renderer-spike',
  at: '2026-08-27T12:00:00.000Z',
  device: {
    ua: 'test',
    dpr: 3,
    css: { w: 390, h: 844 },
    backing: { w: 1170, h: 2532 },
    webgl2: true,
  },
  scene: { rungs: 120 },
  runs: [
    {
      id: 'a',
      label: '(a) Canvas2D',
      ok: true,
      note: '',
      frames: 600,
      cpu: stats,
      interval: stats,
      dropped: 0,
      drift: { early: 3, late: 3 },
    },
  ],
};

describe('parseDiagReport', () => {
  it('accepts a well-formed report', () => {
    expect(parseDiagReport(JSON.stringify(report)).runs[0]?.id).toBe('a');
  });

  it.each([
    ['not JSON at all', '{'],
    ['JSON that is not an object', '42'],
    ['a report of an unknown kind', JSON.stringify({ ...report, kind: 'something-else' })],
    ['a report with no runs', JSON.stringify({ ...report, runs: [] })],
    ['a run with no timings', JSON.stringify({ ...report, runs: [{ id: 'a' }] })],
    [
      'a run whose timings are not numbers',
      JSON.stringify({
        ...report,
        runs: [{ ...report.runs[0], cpu: { p50: 'fast', p95: 2, p99: 3, max: 4 } }],
      }),
    ],
    ['a report with no device', JSON.stringify({ ...report, device: undefined })],
  ])('refuses %s', (_label, body) => {
    expect(() => parseDiagReport(body)).toThrow();
  });
});

describe('formatDiagReport', () => {
  const GREEN = '\x1b[32m';
  const RED = '\x1b[31m';
  // eslint-disable-next-line no-control-regex
  const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

  it('calls a run inside both budgets a pass', () => {
    expect(formatDiagReport(report).join('\n')).toContain(GREEN);
  });

  it('fails a run over the time budget', () => {
    const slow: DiagReport = {
      ...report,
      runs: [{ ...report.runs[0]!, cpu: { ...stats, p99: 9 } }],
    };
    expect(formatDiagReport(slow).join('\n')).toContain(RED);
  });

  it('fails a run that is inside the time budget but missing frames', () => {
    // The case main-thread timing cannot see on its own: cheap on the CPU, and
    // still not presenting. Without this half of the test the budget would pass
    // a candidate that stutters.
    const stuttering: DiagReport = {
      ...report,
      runs: [{ ...report.runs[0]!, dropped: 40 }],
    };
    expect(formatDiagReport(stuttering).join('\n')).toContain(RED);
  });

  it('says outright when a report was not measured at the design size', () => {
    // The first four reports off the phone were taken at 902×1953 because
    // browser chrome ate the viewport height, and nothing in the output said
    // so. A number measured on 59.5% of the pixels is not the number.
    const header = strip(formatDiagReport(report)[1] ?? '');
    expect(header).toContain('not the design size');

    const atDesign: DiagReport = {
      ...report,
      device: { ...report.device, renderAt: 'design', fit: 0.257 },
    };
    expect(strip(formatDiagReport(atDesign)[1] ?? '')).toContain('design size');
    expect(strip(formatDiagReport(atDesign)[1] ?? '')).not.toContain('not the design size');
  });

  it('offers no mean column to quote', () => {
    // `VISION.md`: the units that matter are p99 and max. The footer says the
    // word so a reader knows the omission is deliberate; the table must not
    // give anyone the number.
    const header = strip(formatDiagReport(report)[4] ?? '');
    expect(header).toContain('p99');
    expect(header).not.toContain('mean');
    expect(header).not.toContain('avg');
  });
});
