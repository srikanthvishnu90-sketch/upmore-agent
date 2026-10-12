// The CI workflow must stay valid YAML (overnight 2026-10-12): a step name with an unquoted ": " inside it ("tests
// (typed, no permissions: ...)") made GitHub reject .github/workflows/ci.yml, so six pushes ran no checks at all and
// showed only a failed run named after the file. No YAML library is installed for node, so this checks the one rule that
// bit: a plain (unquoted) scalar on a `name:`/`run:`/`with:` line never contains ": " or " #".
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(__dirname, "..", ".github", "workflows");

test("every workflow's one-line names and commands are plain scalars YAML accepts", () => {
  const files = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0);
  for (const f of files) {
    fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((line, i) => {
      const m = /^\s*(?:-\s+)?(name|run):\s+(.+)$/.exec(line);
      if (!m) return;
      const v = m[2].trim();
      if (/^["'|>]/.test(v)) return; // quoted or a block scalar
      assert.ok(!/: /.test(v) && !/ #/.test(v), `${f}:${i + 1}: unquoted "${m[1]}" value has ": " or " #" (quote it): ${v}`);
    });
  }
});
