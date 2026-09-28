// Minimal assertion harness for the execution-trust fixtures.
// Named checks; a summary with exact pass/fail totals at the end.

let passed = 0;
let failed = 0;
const failures = [];

export function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

export function section(title) {
  console.log(`\n## ${title}`);
}

export function totals() {
  return { passed, failed, failures: [...failures] };
}
