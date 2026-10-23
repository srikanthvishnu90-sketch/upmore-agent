// Router before/after spend ledger (scripts/eval/rba-ledger.sh), fail-closed, 2026-10-23. Every case runs the real script
// against a real bare git repo as origin, with a fake paid runner that logs each call. A refusal must make zero calls and
// write nothing to the ledger; a run must get the remaining authorized total, never the full cap.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/eval/rba-ledger.sh");
const WORKFLOW = path.join(ROOT, ".github/workflows/router-before-after.yml");
const REF = "ci/router-before-after";
const REAL_GIT = execFileSync("bash", ["-c", "command -v git"]).toString().trim();

function sh(cwd, cmd, args) { return execFileSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }); }
const result = (label, brain, judge, extra = {}) => JSON.stringify({ label, cost_usd: { brain, judge }, unpriced_calls: 0, passed: 1, total: 1, ...extra });

// A world: origin (bare), a checkout of it (the job's checkout), and, if `ledger` is given, the ledger branch on origin.
function world(t, { ledger } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rba-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const origin = path.join(dir, "origin.git"), work = path.join(dir, "work"), bin = path.join(dir, "bin");
  sh(dir, REAL_GIT, ["init", "-q", "--bare", origin]);
  sh(dir, REAL_GIT, ["init", "-q", "-b", "main", work]);
  fs.writeFileSync(path.join(work, "README"), "job checkout\n");
  sh(work, REAL_GIT, ["add", "-A"]); sh(work, REAL_GIT, ["commit", "-qm", "base"]);
  sh(work, REAL_GIT, ["remote", "add", "origin", origin]); sh(work, REAL_GIT, ["push", "-q", "origin", "main"]);
  if (ledger) {
    const l = path.join(dir, "seed");
    sh(dir, REAL_GIT, ["init", "-q", "-b", "seed", l]);
    for (const [name, body] of Object.entries(ledger)) { fs.mkdirSync(path.dirname(path.join(l, name)), { recursive: true }); fs.writeFileSync(path.join(l, name), body); }
    sh(l, REAL_GIT, ["add", "-A"]); sh(l, REAL_GIT, ["commit", "-qm", "seed ledger"]);
    sh(l, REAL_GIT, ["push", "-q", origin, `HEAD:refs/heads/${REF}`]);
  }
  // git wrapper: FAIL_GIT=<subcommand> makes that subcommand fail, as a network or permission failure would.
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "git"), `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in -C|-c) skip=1; continue;; esac; if [ -n "\${skip:-}" ]; then skip=; continue; fi; case "$a" in -*) continue;; esac; sub="$a"; break; done\nif [ -n "\${FAIL_GIT:-}" ] && [ "\${sub:-}" = "$FAIL_GIT" ]; then echo "fatal: simulated $FAIL_GIT failure" >&2; exit 128; fi\nexec ${REAL_GIT} "$@"\n`, { mode: 0o755 });
  // The fake paid runner: logs its arguments, then writes the result file the real runner would (or not, on FAKE=crash).
  fs.writeFileSync(path.join(bin, "fake-runner"), `#!/usr/bin/env bash\nfor a in "$@"; do if [ "$a" = --plan-only ]; then [ "\${FAKE_PLAN:-}" = fail ] && exit 2; echo "EXPOSURE_USD \${FAKE_EXPOSURE:-0.393420} (fake)"; exit 0; fi; done\necho "$*" >> "${dir}/calls.log"\nlabel=""; prev=""; for a in "$@"; do [ "$prev" = --label ] && label="$a"; prev="$a"; done\n[ "\${FAKE:-}" = crash ] && exit 1\nmkdir -p evals/career/results\nprintf '{"label":"%s","cost_usd":{"brain":0,"judge":%s},"unpriced_calls":0,"passed":1,"total":1}' "$label" "\${FAKE_COST:-0.4}" > "evals/career/results/$label.json"\n`, { mode: 0o755 });
  const run = (sub, env = {}) => {
    const r = spawnSync("bash", [SCRIPT, sub], { cwd: work, encoding: "utf8", env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
      LEDGER_REF: REF, AUTHORIZED_TOTAL_USD: "5", LEDGER_FLOOR_USD: "0.050843", RUNNER_TEMP: dir, RUN_ID: "77",
      RBA_RUNNER: path.join(bin, "fake-runner"), ...env } });
    return { status: r.status, out: r.stdout + r.stderr };
  };
  const calls = () => (fs.existsSync(path.join(dir, "calls.log")) ? fs.readFileSync(path.join(dir, "calls.log"), "utf8").trim().split("\n") : []);
  const ledgerHead = () => { try { return sh(dir, REAL_GIT, ["--git-dir", origin, "rev-parse", `refs/heads/${REF}`]).trim(); } catch { return null; } };
  const ledgerFiles = () => sh(dir, REAL_GIT, ["--git-dir", origin, "ls-tree", "-r", "--name-only", `refs/heads/${REF}`]).trim().split("\n");
  return { dir, origin, work, run, calls, ledgerHead, ledgerFiles };
}

// The real ledger's four result files ($0.050843 in all), as recorded on ci/router-before-after.
const PRIOR = {
  "evals/career/results/rba-v248-r1-1.json": result("rba-v248-r1-1", 0, 0.012409),
  "evals/career/results/rba-cand-r1-1.json": result("rba-cand-r1-1", 0, 0.013032),
  "evals/career/results/rba-v248-r2-1.json": result("rba-v248-r2-1", 0, 0.012546),
  "evals/career/results/rba-cand-r2-1.json": result("rba-cand-r2-1", 0, 0.012856),
};

function refusedClean(t, w, out, why) {
  const before = w.ledgerHead(), callsBefore = w.calls().length;
  const r = w.run("run", out.env);
  assert.equal(r.status, 4, `${why}: exit 4 expected\n${r.out}`);
  assert.match(r.out, out.match, why);
  assert.equal(w.calls().length, callsBefore, `${why}: no paid call`);
  assert.equal(w.ledgerHead(), before, `${why}: the ledger is untouched`);
}

test("parent finding 2: the ledger ref exists but the fetch fails -> REFUSED, no paid call (was: every check skipped, 4 runs)", (t) => {
  const w = world(t, { ledger: PRIOR });
  refusedClean(t, w, { env: { FAIL_GIT: "fetch" }, match: /exists \([0-9a-f]{40}\) but could not be fetched: spend unknown/ }, "fetch failure");
});

test("parent finding 2: the DONE marker is not skippable: DONE + a failing fetch still refuses, and so does DONE alone", (t) => {
  const w = world(t, { ledger: { ...PRIOR, "evals/career/router-before-after/DONE": "x\n" } });
  refusedClean(t, w, { env: { FAIL_GIT: "fetch" }, match: /could not be fetched/ }, "DONE + fetch failure");
  refusedClean(t, w, { env: {}, match: /already ran \(DONE/ }, "DONE");
});

test("ls-remote itself fails (network, auth) -> REFUSED: the ledger state is unknown", (t) => {
  const w = world(t, { ledger: PRIOR });
  refusedClean(t, w, { env: { FAIL_GIT: "ls-remote" }, match: /ls-remote failed .*unknown/ }, "ls-remote failure");
});

test("the ledger ref is missing while spend was recorded (deleted branch) -> REFUSED, never a fresh $5", (t) => {
  const w = world(t);
  const r = w.run("run");
  assert.equal(r.status, 4, r.out);
  assert.match(r.out, /missing, but \$0\.050843 was recorded/);
  assert.deepEqual(w.calls(), []);
  assert.equal(w.ledgerHead(), null, "no ledger branch was created");
});

test("unknown spend refuses: an INFLIGHT marker, a non-numeric cost, an unpriced call, an unreadable file, a total under the known floor", (t) => {
  const cases = [
    [{ ...PRIOR, "evals/career/router-before-after/INFLIGHT-rba-x": "run rba-x\n" }, /spend was never recorded/],
    [{ ...PRIOR, "evals/career/results/bad.json": result("bad", "0.01", 0) }, /recorded total is unknown/],
    [{ ...PRIOR, "evals/career/results/bad.json": result("bad", 0, 0.01, { unpriced_calls: 2 }) }, /recorded total is unknown/],
    [{ ...PRIOR, "evals/career/results/bad.json": "{not json" }, /recorded total is unknown/],
    [{ "evals/career/results/rba-v248-r1-1.json": PRIOR["evals/career/results/rba-v248-r1-1.json"] }, /below the known \$0\.050843/],
  ];
  for (const [ledger, match] of cases) refusedClean(t, world(t, { ledger }), { env: {}, match }, String(match));
});

test("the committed config: the 21:43 grant is closed (authorized = spent), so the real ledger refuses every run", (t) => {
  const wf = fs.readFileSync(WORKFLOW, "utf8");
  const val = (k) => (wf.match(new RegExp(`${k}: "([^"]+)"`)) || [])[1];
  assert.equal(val("AUTHORIZED_TOTAL_USD"), "0.050843");
  assert.equal(val("LEDGER_FLOOR_USD"), "0.050843");
  const w = world(t, { ledger: PRIOR });
  refusedClean(t, w, { env: { AUTHORIZED_TOTAL_USD: val("AUTHORIZED_TOTAL_USD"), LEDGER_FLOOR_USD: val("LEDGER_FLOOR_USD") },
    match: /\$0\.050843 spent of \$0\.050843 authorized leaves \$0\.000000: nothing authorized remains/ }, "closed grant");
});

test("parent finding 1: each run gets --run-budget-usd = the remaining authorized total, recomputed from the ledger before every run", (t) => {
  const w = world(t, { ledger: PRIOR });
  const r = w.run("run", { AUTHORIZED_TOTAL_USD: "1.6", FAKE_COST: "0.4" });
  // 1.6 - 0.050843 = 1.549157 -> run 1 spends 0.4 -> 1.149157 -> run 2 spends 0.4 -> 0.749157 -> run 3 spends 0.4 ->
  // 0.349157 is under the run's proven worst case of 0.393420: run 4 refuses before its call.
  const budgets = w.calls().map((c) => c.match(/--run-budget-usd (\S+)/)[1]);
  assert.deepEqual(budgets, ["1.549157", "1.149157", "0.749157"], r.out);
  assert.ok(w.calls().every((c) => !/--budget-usd /.test(c)), "the full cap is never passed");
  assert.equal(r.status, 4);
  assert.match(r.out, /rba-cand-r2-77's proven worst case \$0\.393420 is over the \$0\.349157 that remains authorized/);
  const files = w.ledgerFiles();
  for (const l of ["rba-v248-r1-77", "rba-cand-r1-77", "rba-v248-r2-77"]) assert.ok(files.includes(`evals/career/results/${l}.json`), `${l} recorded`);
  assert.ok(!files.some((f) => /INFLIGHT/.test(f)), "every finished run's marker was replaced by its result");
  assert.ok(!files.includes("evals/career/router-before-after/DONE"), "a comparison cut short is not DONE");
});

test("append-only: the ledger's earlier history survives every write (no force push)", (t) => {
  const w = world(t, { ledger: PRIOR });
  const seed = w.ledgerHead();
  const r = w.run("run", { AUTHORIZED_TOTAL_USD: "9", FAKE_COST: "0.01" });
  assert.equal(r.status, 0, r.out);
  assert.equal(w.calls().length, 4);
  assert.doesNotThrow(() => sh(w.dir, REAL_GIT, ["--git-dir", w.origin, "merge-base", "--is-ancestor", seed, `refs/heads/${REF}`]), "the seed ledger commit is an ancestor");
  assert.ok(w.ledgerFiles().includes("evals/career/router-before-after/DONE"));
  const again = w.run("run", { AUTHORIZED_TOTAL_USD: "9" });
  assert.equal(again.status, 4); assert.match(again.out, /already ran/); assert.equal(w.calls().length, 4, "DONE stops the rerun");
  const pushes = fs.readFileSync(SCRIPT, "utf8").split("\n").filter((l) => /git\b.*\bpush\b/.test(l) && !/^\s*#/.test(l));
  assert.ok(pushes.length >= 1 && pushes.every((l) => !/\s(-f|--force\S*)\b|\s\+\S/.test(l)), "every push in the script is non-force: " + pushes.join(" | "));
});

test("a run that crashes leaves its INFLIGHT marker on origin (written before the call), and every later invocation refuses", (t) => {
  const w = world(t, { ledger: PRIOR });
  const r = w.run("run", { AUTHORIZED_TOTAL_USD: "9", FAKE: "crash" });
  assert.equal(r.status, 5, r.out);
  assert.equal(w.calls().length, 1, "one call, then stop");
  assert.ok(w.ledgerFiles().includes("evals/career/router-before-after/INFLIGHT-rba-v248-r1-77"), "the marker is on origin");
  refusedClean(t, w, { env: { AUTHORIZED_TOTAL_USD: "9" }, match: /spend was never recorded: INFLIGHT-rba-v248-r1-77/ }, "after a crash");
});

test("a stale result file in the checkout is never recorded as a crashed run's spend", (t) => {
  const w = world(t, { ledger: PRIOR });
  fs.mkdirSync(path.join(w.work, "evals/career/results"), { recursive: true });
  fs.writeFileSync(path.join(w.work, "evals/career/results/rba-v248-r1-77.json"), result("rba-v248-r1-77", 0, 0.000001));
  const r = w.run("run", { AUTHORIZED_TOTAL_USD: "9", FAKE: "crash" });
  assert.equal(r.status, 5, r.out);
  assert.ok(w.ledgerFiles().includes("evals/career/router-before-after/INFLIGHT-rba-v248-r1-77"), "the crash stays unknown");
  assert.ok(!w.ledgerFiles().includes("evals/career/results/rba-v248-r1-77.json"), "the stale file was not recorded");
});

test("the write-ahead marker cannot be pushed -> no paid call", (t) => {
  const w = world(t, { ledger: PRIOR });
  refusedClean(t, w, { env: { AUTHORIZED_TOTAL_USD: "9", FAIL_GIT: "push" }, match: /could not record rba-v248-r1-77 on the ledger before the run: no paid call/ }, "push failure");
});

test("first-ever run with no recorded spend creates the ledger (only when the floor is 0)", (t) => {
  const w = world(t);
  const r = w.run("run", { LEDGER_FLOOR_USD: "0", AUTHORIZED_TOTAL_USD: "1", FAKE_COST: "0.01", RUNS: "v248-r1" });
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(w.calls().map((c) => c.match(/--run-budget-usd (\S+)/)[1]), ["1.000000"]);
  assert.ok(w.ledgerFiles().includes("evals/career/results/rba-v248-r1-77.json"));
});

test("parent finding 3: the gate is the runner's proven worst case, not a fixed reserve; a worst case over the remainder refuses", (t) => {
  // $0.60 would have passed the old fixed-reserve gate with $0.70 remaining; a worst case of $0.75 must not.
  refusedClean(t, world(t, { ledger: PRIOR }), { env: { AUTHORIZED_TOTAL_USD: "0.750843", FAKE_EXPOSURE: "0.750001" },
    match: /proven worst case \$0\.750001 is over the \$0\.700000 that remains authorized/ }, "worst case over remainder");
  refusedClean(t, world(t, { ledger: PRIOR }), { env: { FAKE_PLAN: "fail" }, match: /could not state rba-v248-r1-77's worst case: no paid call/ }, "no plan");
  refusedClean(t, world(t, { ledger: PRIOR }), { env: { FAKE_EXPOSURE: "NaN" }, match: /worst case for rba-v248-r1-77 is not a number/ }, "NaN plan");
  const w = world(t, { ledger: PRIOR });
  const r = w.run("run", { AUTHORIZED_TOTAL_USD: "0.750843", FAKE_EXPOSURE: "0.7", FAKE_COST: "0.01", RUNS: "v248-r1" });
  assert.equal(r.status, 0, r.out);
  assert.equal(w.calls().length, 1, "a worst case within the remainder runs");
});

test("unmetered spend (failed calls charged at their bound) counts in the ledger total", (t) => {
  const w = world(t, { ledger: { ...PRIOR, "evals/career/results/u.json": JSON.stringify({ label: "u", cost_usd: { brain: 0, judge: 0.001, unmetered_bound: 0.5 }, unpriced_calls: 0 }) } });
  // 0.050843 + 0.001 + 0.5 unmetered = 0.551843 spent; 0.94 leaves 0.388157 < 0.393420. Without the unmetered 0.5 it would run.
  const r = w.run("run", { AUTHORIZED_TOTAL_USD: "0.94", FAKE_EXPOSURE: "0.393420", RUNS: "v248-r1" });
  assert.equal(r.status, 4, r.out);
  assert.match(r.out, /proven worst case \$0\.393420 is over the \$0\.388157 that remains authorized/);
  assert.equal(w.calls().length, 0);
  refusedClean(t, world(t, { ledger: { ...PRIOR, "evals/career/results/u.json": JSON.stringify({ label: "u", cost_usd: { brain: 0, judge: 0, unmetered_bound: "x" }, unpriced_calls: 0 }) } }),
    { env: {}, match: /recorded total is unknown/ }, "non-numeric unmetered");
});

test("bad numbers in the config refuse: NaN, Infinity, negative, empty", (t) => {
  for (const v of ["NaN", "Infinity", "-1", "abc"]) refusedClean(t, world(t, { ledger: PRIOR }), { env: { AUTHORIZED_TOTAL_USD: v }, match: /AUTHORIZED_TOTAL_USD is not a number/ }, v);
});

test("the workflow: the ledger logic lives only in the tested script; no fail-open fetch, no full-cap budget, no force push", () => {
  const wf = fs.readFileSync(WORKFLOW, "utf8");
  assert.match(wf, /run: bash scripts\/eval\/rba-ledger\.sh check/);
  assert.match(wf, /run: bash scripts\/eval\/rba-ledger\.sh run/);
  assert.ok(!/if git fetch/.test(wf), "no fetch whose failure skips the checks");
  assert.ok(!/--budget-usd|CAP_USD/.test(wf), "no full-cap budget");
  assert.ok(!/push -f|--force|git push/.test(wf), "the workflow itself never pushes; the script pushes append-only");
  assert.match(wf, /branches: \[eval\/router-before-after\]/, "the trigger is unchanged (this file is not on that branch)");
});
