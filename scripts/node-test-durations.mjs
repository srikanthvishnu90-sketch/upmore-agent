// A node:test reporter (an extra one: the gate keeps TAP on stdout) that writes each test file's seconds as JSON lines,
// {"file":"tests/x.test.cjs","seconds":12.3}, for the gate (core) shard table (scripts/node-shards.cjs). A file's seconds
// are the larger of the sum of its top-level tests' durations and the span from its first to its last test event (a
// suite's before/after hooks fall inside the span). Observation only: a reporter cannot change a test's outcome or the
// run's exit code, and nothing reads these numbers to decide a verdict.
import path from "node:path";

export default async function* durations(source) {
  const files = new Map();
  const cwd = process.cwd();
  for await (const event of source) {
    const data = event.data || {};
    if (!data.file) continue;
    const rel = path.relative(cwd, data.file).split(path.sep).join("/");
    const now = performance.now();
    let f = files.get(rel);
    if (!f) files.set(rel, (f = { first: now, last: now, sum: 0 }));
    f.last = now;
    if ((event.type === "test:pass" || event.type === "test:fail") && data.nesting === 0) {
      f.sum += Number(data.details?.duration_ms) || 0;
    }
  }
  for (const [file, f] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const seconds = Math.max(f.sum, f.last - f.first) / 1000;
    yield JSON.stringify({ file, seconds: Math.round(seconds * 10) / 10 }) + "\n";
  }
}
