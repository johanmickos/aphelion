/**
 * What a session was actually scored, as a profile that can be compared to
 * another session's.
 *
 * WHY IT EXISTS. Every scoring question this repo has argued about was settled by
 * the same handful of distributions — what a swing pays, what fraction of it is
 * carry against multiplier, where the tier ladder lands, how tight the arrivals
 * were, whether the boost plateau still saturates — and each of them was
 * re-derived from scratch in a throwaway harness, four times, with the
 * deduplication bug rediscovered twice. This prints them.
 *
 * IT READS THE RECORDED AWARDS AND NOTHING ELSE, which is the whole point. Every
 * replay on this build diverges within a few hundred ticks (`sin`/`cos`/`atan2`
 * are implementation-approximated — PORT_NOTES 16), so a recomputed score is
 * evidence about the replay rather than about the session. The award tuple is what
 * the phone actually paid, and it survives the divergence.
 *
 * WHAT IT CANNOT DO. It cannot re-score a session under different weights. The
 * cash-step factors are all in the tuple, but the carry's are not: `climbPerPx`,
 * `chainStep`, `tightMax` and `fireBoost` are applied tick by tick and only their
 * product is recorded. Answering "what would this session have scored at
 * `tightMax` 4" needs a faithful replay, and there is not one.
 *
 *   node tools/score-profile.ts diagnostics/<file>.json [more...]
 *   node tools/score-profile.ts diagnostics            # every comparable session
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { configFromReport } from '../src/app/report.ts';
import type { DiagReport } from '../src/app/report.ts';

type Award = [number, string, number, number, ...unknown[]];

interface Session {
  name: string;
  secs: number;
  awards: Award[];
  /** Where the boost peak arrives, so `boostT` can be read against something. */
  peakAt: number;
}

/**
 * A report can be exported more than once — `06-23-27` and `06-24-38` are
 * byte-identical in input and awards and differ only in the export stamp — and
 * nothing in the file says so. The page load plus the tick count is the identity.
 */
function load(paths: string[]): Session[] {
  const files: string[] = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p).sort()) if (f.endsWith('.json')) files.push(join(p, f));
    } else files.push(p);
  }
  const seen = new Set<string>();
  const out: Session[] = [];
  for (const f of files) {
    const r = JSON.parse(readFileSync(f, 'utf8')) as DiagReport & { awards?: Award[] };
    if (!Array.isArray(r.awards) || r.awards.length === 0) continue;
    const id = `${r.loadedAt}|${r.ticks}`;
    if (seen.has(id)) {
      console.log(`  (skipping ${f.split('/').pop()} — a re-export of an earlier one)`);
      continue;
    }
    seen.add(id);
    const cfg = configFromReport(r);
    out.push({
      name: f.split('/').pop()!.slice(0, 19),
      secs: r.ticks * r.dt,
      awards: r.awards,
      // Off the REPORT's config, not the current one: `boostPeakAt` has moved and
      // a session has to be read against the envelope it was flown under.
      peakAt: cfg.boostHoldsThroughSettle
        ? Math.max(cfg.boostArmTime, cfg.boostPeakAt * cfg.settleDur)
        : cfg.boostArmTime,
    });
  }
  return out;
}

const pct = (xs: number[], p: number): number =>
  xs.length === 0 ? 0 : xs.slice().sort((a, b) => a - b)[Math.round(p * (xs.length - 1))]!;
const n0 = (v: number) => Math.round(v).toLocaleString();

function profile(s: Session): void {
  const swings = s.awards.filter((a) => a[1] !== 'd');
  if (swings.length === 0) return;
  const num = (i: number) => swings.map((a) => a[i] as number).filter(Number.isFinite);
  const pts = num(2);
  const total = pts.reduce((x, y) => x + y, 0);

  // Lives are cut where the streak multiplier falls back to 1, which is the only
  // marker of a death in an award list.
  const lives: number[] = [0];
  let prev = 0;
  for (const a of swings) {
    const streak = (a[3] as number) / (((a[14] as number) || 1) * ((a[15] as number) || 1));
    if (streak < prev - 0.01 && Math.abs(streak - 1) < 0.01) lives.push(0);
    lives[lives.length - 1]! += a[2] as number;
    prev = streak;
  }

  console.log(`\n=== ${s.name}  ·  ${s.secs.toFixed(0)}s  ·  ${swings.length} swings ===`);
  console.log(
    `  best life ${n0(Math.max(...lives))}   total ${n0(total)}   over ${lives.length} life/lives`,
  );
  console.log(
    `  per swing   p50 ${n0(pct(pts, 0.5))}   p90 ${n0(pct(pts, 0.9))}   max ${n0(Math.max(...pts))}`,
  );
  const climb = num(10);
  const carry = num(16);
  console.log(
    `  climb px    p10 ${n0(pct(climb, 0.1))}  p50 ${n0(pct(climb, 0.5))}  p90 ${n0(pct(climb, 0.9))}   spread ${(pct(climb, 0.9) / Math.max(1, pct(climb, 0.1))).toFixed(1)}x`,
  );
  console.log(
    `  carry       p10 ${n0(pct(carry, 0.1))}  p50 ${n0(pct(carry, 0.5))}  p90 ${n0(pct(carry, 0.9))}`,
  );

  const tiers = new Map<number, number>();
  for (const a of swings) tiers.set(a[14] as number, (tiers.get(a[14] as number) ?? 0) + 1);
  console.log(
    `  tier        ${[...tiers.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, v]) => `x${k} ${((100 * v) / swings.length).toFixed(0)}%`)
      .join('  ')}`,
  );

  const links = swings.filter((a) => a[1] === 'l');
  const timing = links.map((a) => a[8] as number);
  const arrival = links.map((a) => a[18] as number).filter(Number.isFinite);
  const boostT = links.map((a) => a[17] as number).filter(Number.isFinite);
  if (timing.length > 0) {
    console.log(
      `  timing      p50 ${pct(timing, 0.5).toFixed(2)}  p90 ${pct(timing, 0.9).toFixed(2)}   reads 1.00 on ${timing.filter((v) => v >= 0.995).length}/${timing.length}`,
    );
  }
  if (arrival.length > 0) {
    console.log(
      `  arrival     p10 ${pct(arrival, 0.1).toFixed(2)}  p50 ${pct(arrival, 0.5).toFixed(2)}  p90 ${pct(arrival, 0.9).toFixed(2)}`,
    );
  }
  if (boostT.length > 0) {
    console.log(
      `  boostT      p10 ${pct(boostT, 0.1).toFixed(2)}  p50 ${pct(boostT, 0.5).toFixed(2)}  p90 ${pct(boostT, 0.9).toFixed(2)}   (its own build's peak arrives at ${s.peakAt.toFixed(2)}s)`,
    );
  }

  const hot = swings.filter((a) => ((a[12] as number) ?? 0) > 0);
  console.log(
    `  fire        ${hot.length}/${swings.length} swings touched it${
      hot.length > 0
        ? `, worth x${hot.map((a) => (a[15] as number).toFixed(2)).join(' x')} on ${hot.map((a) => n0(a[2] as number)).join(' / ')} points`
        : ''
    }`,
  );
  const zero = swings.filter((a) => a[2] === 0).length;
  console.log(
    `  paid nothing ${zero}/${swings.length}  (a swing that climbed no metres cashes 0 x anything)`,
  );
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node tools/score-profile.ts <report.json | diagnostics/> ...');
  process.exit(1);
}
const sessions = load(args);
for (const s of sessions) profile(s);
if (sessions.length > 1) {
  console.log(`\n${sessions.length} comparable sessions.`);
}
