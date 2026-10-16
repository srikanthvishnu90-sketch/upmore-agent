// Every planted defect still applies to the code as it is now (found 2026-10-12: BUDGETS D16's patch stopped matching
// when category rules changed its line, and the coverage report kept counting its last recorded "proven"). Each patch
// of each evals/depth/<ID>.mutations.cjs must match exactly once in packages/domain, in order, as evals/depth/run.cjs
// applies it. A patch that no longer matches is a proof that no longer exists: re-anchor it and re-run that packet.
// Check: node --test tests/depth-patches-current.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const DEPTH = path.join(root, "evals/depth"), DOMAIN = path.join(root, "packages/domain");

test("every planted defect in every depth packet still applies, each patch matching exactly once", () => {
  const stale = [];
  let defects = 0;
  for (const f of fs.readdirSync(DEPTH).filter((x) => x.endsWith(".mutations.cjs")).sort()) {
    const id = f.replace(/\.mutations\.cjs$/, "");
    for (const m of require(path.join(DEPTH, f))) {
      defects++;
      const files = {};
      for (const p of m.patches) {
        assert.ok(typeof p.file === 'string' && !path.isAbsolute(p.file) && !p.file.split(/[\\/]/).some(x=>x==='..'||x==='.'), 'mutation paths remain within their declared source root');
        const file = path.join(m.scope === 'repository' ? root : DOMAIN, p.file);
        if (!(p.file in files)) files[p.file] = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
        const src = files[p.file];
        const n = src === null ? -1 : src.split(p.find).length - 1;
        if (n !== 1) { stale.push(`${id} ${m.id}: ${p.file} ${n === -1 ? "is missing" : `matches ${n} times`}`); break; }
        files[p.file] = src.replace(p.find, () => p.replace);
      }
    }
  }
  assert.ok(defects > 1000, `expected the recorded defects, found ${defects}`);
  assert.deepEqual(stale, [], `${stale.length} planted defects no longer apply:\n${stale.join("\n")}`);
});
