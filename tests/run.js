// run.js — tiny zero-dependency test runner. Collects results, prints, sets exit code.

let passed = 0;
let failed = 0;
const failures = [];
let currentSuite = '';

export function suite(name) { currentSuite = name; }

export function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${currentSuite} > ${name}: ${err.message}`);
    console.log(`  ✗ ${name}`);
  }
}

export function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg || 'eq'}: expected ${e}, got ${a}`);
}

export function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'expected truthy');
}

export function approx(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) > (tol ?? 1e-6)) {
    throw new Error(`${msg || 'approx'}: expected ~${expected}, got ${actual}`);
  }
}

async function main() {
  const suites = [
    './content.test.js', './floor.test.js', './combat.test.js',
    './sprite.test.js', './items.test.js', './obstacles.test.js',
  ];
  for (const s of suites) {
    const mod = await import(s);
    console.log(`\n${mod.NAME || s}`);
    mod.run();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

main();
