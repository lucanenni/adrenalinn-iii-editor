#!/usr/bin/env node
/**
 * CI entry point for the data round-trip checks — see roundtrip.mjs.
 * Usage: node test/run.mjs
 */
import { runRoundTripTests } from './roundtrip.mjs';

const groups = runRoundTripTests();
let passed = 0, total = 0;

for (const g of groups) {
  for (const c of g.checks) {
    total++;
    if (c.pass) {
      passed++;
    } else {
      console.error(`FAIL [${g.name}] ${c.name}`);
      console.error(`  expected: ${JSON.stringify(c.expected)}`);
      console.error(`  got:      ${JSON.stringify(c.actual)}`);
    }
  }
}

console.log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
