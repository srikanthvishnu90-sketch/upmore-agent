// Every migration that redefines career_outbox_kind_check must keep every kind an earlier one allowed. Builders work in
// parallel and each redefines the whole list; one that drops a kind breaks every text of that kind once it applies (found
// in review 2026-10-20: the voice mock's list dropped mail tracking's 'status' and 'followup').
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const lists = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().flatMap((f) => {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  return [...sql.matchAll(/career_outbox_kind_check\s+check\s*\(\s*kind\s+in\s*\(([^)]*)\)/gi)]
    .map((m) => ({ file: f, kinds: [...m[1].matchAll(/'([a-z_]+)'/g)].map((k) => k[1]) }));
});

test('the outbox kind list only ever grows', () => {
  assert.ok(lists.length >= 2, 'the kind list is defined by the migrations');
  const seen = new Set();
  for (const { file, kinds } of lists) {
    const lost = [...seen].filter((k) => !kinds.includes(k));
    assert.deepEqual(lost, [], `${file} drops outbox kinds an earlier migration allowed`);
    kinds.forEach((k) => seen.add(k));
  }
});
