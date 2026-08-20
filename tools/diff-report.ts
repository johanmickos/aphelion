/** Ad-hoc: run every scenario on both sides and print the divergence table. */
import { runPrototype } from './prototype-harness.ts';
import { runPort } from '../test/run-port.ts';
import { SCENARIOS } from '../test/scenarios.ts';
import { compare } from './compare.ts';
import { FIXED_DT } from '../src/sim/config.ts';

const EPS = 1e-9;
console.log(
  'scenario'.padEnd(46),
  'maxΔpos'.padStart(11),
  'maxΔvel'.padStart(11),
  'Δfuel'.padStart(9),
  'phase≠'.padStart(7),
  '  first divergence',
);
console.log('-'.repeat(120));
let worst = 0;
for (const sc of SCENARIOS) {
  const proto = runPrototype(sc, FIXED_DT);
  const port = runPort(sc, FIXED_DT);
  const r = compare(proto, port, EPS);
  worst = Math.max(worst, r.maxPositionDelta);
  const first = r.first
    ? `t=${r.first.tick} ${r.first.field} ${String(r.first.proto)} vs ${String(r.first.port)}`
    : '—';
  console.log(
    sc.name.padEnd(46),
    r.maxPositionDelta.toExponential(3).padStart(11),
    r.maxVelocityDelta.toExponential(3).padStart(11),
    r.maxFuelDelta.toExponential(2).padStart(9),
    String(r.phaseMismatches).padStart(7),
    ' ',
    first,
  );
}
console.log('\nworst position divergence across all scenarios:', worst.toExponential(3), 'px');
