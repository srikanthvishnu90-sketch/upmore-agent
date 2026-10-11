// The weekly corpus growth export (corpus/USAGE-PROMPT.txt step 3): picks failures, corrections and new situations,
// redacts names, handles and numbers, and writes drafts only (gitignored), never into the corpus itself.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { execFileSync } = require("node:child_process");
const X = require("../scripts/corpus-weekly-export.cjs");
const examples = require("../corpus/corpus.json").examples;
const at = (thread, n, role, content, meta) => ({ id: n, thread_id: thread, role, content, meta: meta || null, created_at: `2026-10-05T12:00:${String(n).padStart(2, "0")}Z` });
const ROWS = [
  // a failure: the model was down
  at("t1", 1, "user", "whats my balance"), at("t1", 2, "assistant", "I can't answer that right now: the AI service Upmore uses isn't responding, so I didn't look anything up and nothing was changed.", { failure_code: "model_unavailable" }),
  // a correction
  at("t2", 3, "user", "send Priya 40"), at("t2", 4, "assistant", "Set up $40.00 to Priya Nair (@priyan) in Venmo. Reply YES or NO."), at("t2", 5, "user", "no i meant 14 to priya patel, 312-555-0199"),
  // ordinary and covered by the corpus: not exported
  at("t3", 6, "user", "cancel netflix"), at("t3", 7, "assistant", "Cancel Netflix ($15.49/mo) on card ••8830? Reply YES or NO."), at("t3", 8, "user", "yes"),
  // a situation the corpus has nothing near
  at("t4", 9, "user", "my landlord wants the deposit wired to a crypto wallet tomorrow morning"), at("t4", 10, "assistant", "I can't help with that."),
];

test("classify: a failure, a correction and a new situation are picked; an ordinary covered turn is not", () => {
  const d = X.classify(ROWS, examples), by = Object.fromEntries(d.map(x => [x.thread, x.reasons.map(r => r.kind)]));
  assert.ok(by.t1.includes("failure"), JSON.stringify(by)); assert.ok(by.t2.includes("corrected"), JSON.stringify(by));
  assert.equal(by.t3, undefined, "a covered, successful conversation is not exported"); assert.ok(by.t4.includes("new_situation"), JSON.stringify(by));
});
test("redaction: names, handles, phone numbers, card digits and amounts never survive; placeholders stay consistent", () => {
  const r = X.redactor();
  const a = r("send Priya 40 to @priyan, call 312-555-0199, card ••8830, email p.nair@example.org");
  for (const leak of ["Priya", "@priyan", "312", "0199", "8830", "40", "p.nair", "example.org"]) assert.ok(!a.includes(leak), `${leak} leaked: ${a}`);
  const b = r("no, $40.00 to priya patel");
  assert.ok(!/patel|priya/i.test(b), `a lowercase name or surname leaked: ${b}`);
  assert.ok(!/@handle\d+N|@handleN/.test(a), `a handle placeholder was mangled: ${a}`);
  assert.equal(r("Staged $5.00 from Checking ••4417 for you to send"), "Staged $N2 from Checking ••NNNN for you to send", "ordinary words around a card stay readable");
  assert.match(a, /<NAME1>/); assert.match(b, /<NAME1>/, "the same person keeps the same placeholder"); assert.match(b, /N1\b/, "the same amount keeps the same placeholder");
  assert.equal(r("cancel it for me, you to send"), "cancel it for me, you to send", "ordinary words are not names");
});
test("the script writes a draft file (mode 0600, gitignored folder), never the corpus, and says NOT RUN without live credentials", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weekly-")), rows = path.join(dir, "rows.json");
  fs.writeFileSync(rows, JSON.stringify(ROWS));
  const before = fs.readFileSync(path.join(__dirname, "../corpus/upmore-convo-corpus-5-of-5.txt"), "utf8");
  const out = execFileSync(process.execPath, [path.join(__dirname, "../scripts/corpus-weekly-export.cjs"), "--rows", rows, "--since", "2026-10-04", "--out", dir], { encoding: "utf8" });
  assert.match(out, /3 draft examples \(failures 1, corrected 1, new situations \d\)/);
  const f = path.join(dir, "weekly-2026-10-04.txt"), text = fs.readFileSync(f, "utf8");
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  assert.match(text, /^# DRAFT corpus examples/); assert.match(text, /### W\.01 /); assert.ok(!/Priya|0199|@priyan/.test(text), text);
  assert.equal(fs.readFileSync(path.join(__dirname, "../corpus/upmore-convo-corpus-5-of-5.txt"), "utf8"), before, "the corpus is untouched");
  assert.match(fs.readFileSync(path.join(__dirname, "../.gitignore"), "utf8"), /^corpus\/drafts\/$/m);
  let live; try { execFileSync(process.execPath, [path.join(__dirname, "../scripts/corpus-weekly-export.cjs"), "--live"], { encoding: "utf8", env: { PATH: process.env.PATH } }); } catch (e) { live = e; }
  assert.equal(live.status, 2); assert.match(live.stdout, /^NOT RUN: --live needs SUPABASE_URL/);
});
