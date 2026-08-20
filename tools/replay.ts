/**
 * Replays a diagnostics report and reports what happened.
 *
 *   node tools/replay.ts report.json
 *   pbpaste | node tools/replay.ts -
 *
 * Reports sent from a phone via the dev server land in diagnostics/ and are
 * analysed automatically; this is for re-running one by hand.
 */
import { readFileSync } from 'node:fs';
import { parseReport } from '../src/app/report.ts';
import { formatAnalysis, replayReport } from './replay-core.ts';

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node tools/replay.ts <report.json | ->');
  process.exit(2);
}
const text = arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8');

let report;
try {
  report = parseReport(text.trim());
} catch (err) {
  console.error(
    `\n  cannot read this report:\n  ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(2);
}
const analysis = replayReport(report);
for (const line of formatAnalysis(report, analysis)) console.log(line);
process.exit(analysis.fidelity === 'diverged' ? 1 : 0);
