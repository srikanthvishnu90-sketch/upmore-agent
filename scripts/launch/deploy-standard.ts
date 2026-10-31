// THE DEPLOY STANDARD (D-034; owner, in writing, 2026-10-31 11:57 CT: "set a requirement a standard, whenever the product
// reaches that standard deploy, make that a set rule, make sure it verifies and meets that large scale standard. if it does
// then auto deploy, also make sure u test everytime if it does."). A commit on release/production may deploy only if every
// check below holds. Each prints PASS or FAIL with its evidence; a check whose evidence cannot be read FAILS (never a soft
// pass), and any FAIL exits 1.
//
//   S1 every required CI check on that exact SHA concluded success. The required list is read from the workflows AT that
//      SHA: every job of .github/workflows/ci.yml (matrix jobs expanded) and of deploy-preflight.yml (which
//      deploy-production.yml also calls, so its checks exist on every deployed SHA; a check named "<caller> / <name>"
//      counts for <name>). The latest run of each name decides.
//   S2 every PR merged (first-parent commits of trunk) since the last successful production deploy has an APPROVED review
//      at its merged head SHA, or a line `<PR> <40-hex head SHA> <reviewer note>` in docs/architect/approvals.txt at the
//      candidate SHA. A first-parent commit that names no PR, or whose PR does not own it, fails.
//   S3 reply quality does not regress: on ci/brain-eval's evals/career/SCORE-LOG.md, the live brain's (DEPLOY_STANDARD_BRAIN,
//      default router) pass rate measured for the candidate >= the rate measured for the deployed SHA, on the same set and
//      set size. A measurement counts for a SHA when its brain commit is that SHA, or a first-parent ancestor within 10
//      commits with no change under supabase/functions/ since, or a measurement-branch commit descending from one of those
//      whose supabase/functions/ tree is identical. Rows that stopped, or are NOT A SCORE, are not measurements. The rate of
//      one measurement is the mean over the passes of its latest CI run. No measurement on either side: FAIL.
//   S4 the Telegram acceptance suite (tests/architect/telegram-acceptance.test.ts) passed in CI on that SHA (its check,
//      "acceptance (telegram)", concluded success: every step not in KNOWN_GAP passed), and its KNOWN_GAP list did not grow
//      against the deployed SHA's (shrink-only). Where the deployed SHA predates the suite, the baseline is the list as the
//      suite was first committed.
//   S5 scripts/launch/secrets-audit.sh --features: no feature both enabled and NOT_WIRED (a feature without its secrets stays
//      off; it is never faked). The audit not able to read the names (exit 2) is a FAIL.
//
//   deno run -A scripts/launch/deploy-standard.ts --sha <40-hex> [--checks S1,S2,S3,S4,S5] [--exclude-run <run id>]
//                                                 [--wait-checks <minutes>]
// --wait-checks: first wait (polling each minute, at most that long) until every required check on the SHA has finished,
// so a push to release/production right after a merge is judged on finished CI, not on runs still going. Waiting decides
// nothing: a check still unfinished at the deadline is judged as it stands (not success: FAIL).
// Needs: a git checkout with full history and origin/ci/brain-eval fetched; GITHUB_TOKEN and GITHUB_REPOSITORY (the checks,
// PR and Actions APIs, read only); for S5, what secrets-audit.sh needs (SUPABASE_PROJECT_REF, the supabase CLI logged in).
// It changes nothing anywhere. Exit 0: the SHA meets the standard; 1: it does not; 2: usage.
import { parse as parseYaml } from "npm:yaml@2.9.1";

export type CheckId = "S1" | "S2" | "S3" | "S4" | "S5";
export const ALL_CHECKS: CheckId[] = ["S1", "S2", "S3", "S4", "S5"];
export interface CheckRun { name: string; status: string; conclusion: string | null; id: number; completed_at?: string | null }
export interface Pull { number: number; merged: boolean; merge_commit_sha: string | null; head_sha: string; base: string }
export interface Review { state: string; commit_id: string; user: string }
export interface Commit { sha: string; subject: string }
export interface Sources {
  checkRuns(sha: string): Promise<CheckRun[]>;
  fileAt(sha: string, path: string): Promise<string | null>;
  lastDeployedSha(): Promise<string | null>;
  firstParent(from: string, to: string): Promise<Commit[]>; // commits in from..to on to's first-parent line, newest first
  pull(n: number): Promise<Pull | null>;
  reviews(n: number): Promise<Review[]>;
  scoreLog(): Promise<string | null>;
  resolve(rev: string): Promise<string | null>; // full sha of a (short) commit, or null
  parent(sha: string): Promise<string | null>; // first parent
  isAncestor(a: string, b: string): Promise<boolean>;
  changed(a: string, b: string, path: string): Promise<boolean>; // any difference under path between a and b
  tree(sha: string, path: string): Promise<string | null>;
  firstAdded(sha: string, path: string): Promise<string | null>; // the commit (on sha's history) that added path
  secretsAudit(): Promise<{ code: number; out: string }>;
}
export interface Result { id: CheckId; pass: boolean; summary: string; evidence: string[] }

export const REPLY_CODE = "supabase/functions";
export const ACCEPTANCE_FILE = "tests/architect/telegram-acceptance.test.ts";
export const ACCEPTANCE_CHECK = "acceptance (telegram)";
export const REQUIRED_WORKFLOWS = [".github/workflows/ci.yml", ".github/workflows/deploy-preflight.yml"];
const SHA40 = /^[0-9a-f]{40}$/;
const short = (s: string | null | undefined) => (s ?? "").slice(0, 10);

// ------------------------------------------------------------------------------------------------ S1
// Every job's check name in a workflow: `name:` (or the job id), each matrix combination substituted.
export function jobCheckNames(yaml: string): string[] {
  const doc = parseYaml(yaml) as { jobs?: Record<string, { name?: string; strategy?: { matrix?: Record<string, unknown> } }> };
  const out: string[] = [];
  for (const [id, job] of Object.entries(doc?.jobs ?? {})) {
    const name = String(job?.name ?? id);
    const matrix = job?.strategy?.matrix ?? {};
    const axes = Object.entries(matrix).filter(([k, v]) => Array.isArray(v) && k !== "include" && k !== "exclude") as [string, unknown[]][];
    let combos: Record<string, unknown>[] = [{}];
    for (const [k, vs] of axes) combos = combos.flatMap((c) => vs.map((v) => ({ ...c, [k]: v })));
    for (const c of combos) out.push(name.replace(/\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}/g, (_, k) => String(c[k] ?? `\${{ matrix.${k} }}`)));
  }
  return out;
}

export async function s1(src: Sources, sha: string): Promise<Result> {
  const evidence: string[] = [];
  const required: string[] = [];
  for (const wf of REQUIRED_WORKFLOWS) {
    const text = await src.fileAt(sha, wf);
    if (text === null) return { id: "S1", pass: false, summary: `${wf} is not in ${short(sha)}: the required list cannot be read`, evidence };
    required.push(...jobCheckNames(text));
  }
  if (!required.includes(ACCEPTANCE_CHECK)) evidence.push(`missing from the workflows: ${ACCEPTANCE_CHECK} (S4's suite is not a CI job at this SHA)`);
  const runs = await src.checkRuns(sha);
  const bad: string[] = [];
  for (const name of [...new Set([...required, ACCEPTANCE_CHECK])]) {
    const mine = runs.filter((r) => r.name === name || r.name.endsWith(` / ${name}`)).sort((a, b) => b.id - a.id); // check run ids only grow: the highest is the latest
    const latest = mine[0];
    const verdict = !latest ? "NO RUN" : latest.status !== "completed" ? latest.status : latest.conclusion ?? "none";
    evidence.push(`${verdict === "success" ? "ok  " : "BAD "} ${name}: ${verdict}${latest ? ` (check run ${latest.id})` : ""}`);
    if (verdict !== "success") bad.push(`${name} (${verdict})`);
  }
  const total = new Set([...required, ACCEPTANCE_CHECK]).size;
  return bad.length
    ? { id: "S1", pass: false, summary: `${bad.length}/${total} required checks are not success on ${short(sha)}: ${bad.slice(0, 6).join(", ")}${bad.length > 6 ? ", ..." : ""}`, evidence }
    : { id: "S1", pass: true, summary: `all ${total} required checks are success on ${short(sha)}`, evidence };
}

// The required checks whose latest run has not finished (or not started) on the SHA: what --wait-checks waits for.
export async function unfinished(src: Sources, sha: string): Promise<string[]> {
  const required: string[] = [ACCEPTANCE_CHECK];
  for (const wf of REQUIRED_WORKFLOWS) required.push(...jobCheckNames((await src.fileAt(sha, wf)) ?? "jobs: {}"));
  const runs = await src.checkRuns(sha);
  return [...new Set(required)].filter((name) => {
    const latest = runs.filter((r) => r.name === name || r.name.endsWith(` / ${name}`)).sort((a, b) => b.id - a.id)[0];
    return !latest || latest.status !== "completed";
  });
}

// ------------------------------------------------------------------------------------------------ S2
export function prOf(subject: string): number | null {
  const m = /^Merge pull request #(\d+) /.exec(subject) ?? /\(#(\d+)\)\s*$/.exec(subject);
  return m ? Number(m[1]) : null;
}
export function parseLedger(text: string | null): Map<number, { sha: string; note: string }[]> {
  const out = new Map<number, { sha: string; note: string }[]>();
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(\d+)\s+([0-9a-f]{40})\s+(\S.*)$/.exec(line);
    if (!m) continue; // a malformed line approves nothing
    const n = Number(m[1]);
    out.set(n, [...(out.get(n) ?? []), { sha: m[2], note: m[3] }]);
  }
  return out;
}

export async function s2(src: Sources, sha: string, deployed: string | null): Promise<Result> {
  const evidence: string[] = [];
  if (!deployed) return { id: "S2", pass: false, summary: "no successful production deploy found: the PRs to review cannot be bounded", evidence };
  if (deployed === sha) return { id: "S2", pass: true, summary: `${short(sha)} is the deployed SHA: no PR merged since`, evidence };
  if (!(await src.isAncestor(deployed, sha))) return { id: "S2", pass: false, summary: `the deployed ${short(deployed)} is not an ancestor of ${short(sha)}`, evidence };
  const ledger = parseLedger(await src.fileAt(sha, "docs/architect/approvals.txt"));
  const commits = await src.firstParent(deployed, sha);
  const bad: string[] = [];
  for (const c of commits) {
    const n = prOf(c.subject);
    if (n === null) { bad.push(`${short(c.sha)} (no PR)`); evidence.push(`BAD  ${short(c.sha)} "${c.subject.slice(0, 70)}": not merged through a PR`); continue; }
    const pr = await src.pull(n);
    if (!pr || !pr.merged || pr.merge_commit_sha !== c.sha) {
      bad.push(`#${n} (does not own ${short(c.sha)})`);
      evidence.push(`BAD  #${n}: ${!pr ? "not found" : !pr.merged ? "not merged" : `its merge commit is ${short(pr.merge_commit_sha)}, not ${short(c.sha)}`}`);
      continue;
    }
    const review = (await src.reviews(n)).find((r) => r.state === "APPROVED" && r.commit_id === pr.head_sha);
    const entry = (ledger.get(n) ?? []).find((e) => e.sha === pr.head_sha);
    if (review) evidence.push(`ok   #${n} head ${short(pr.head_sha)}: APPROVED by ${review.user}`);
    else if (entry) evidence.push(`ok   #${n} head ${short(pr.head_sha)}: approvals.txt, ${entry.note.slice(0, 80)}`);
    else {
      const stale = (ledger.get(n) ?? []).map((e) => short(e.sha));
      bad.push(`#${n}`);
      evidence.push(`BAD  #${n} head ${short(pr.head_sha)}: no APPROVED review at the merged head${stale.length ? `; approvals.txt names ${stale.join(", ")}, not the merged head` : ", and no approvals.txt line"}`);
    }
  }
  return bad.length
    ? { id: "S2", pass: false, summary: `${bad.length}/${commits.length} merges since ${short(deployed)} lack an approval at their merged head: ${bad.slice(0, 8).join(", ")}${bad.length > 8 ? ", ..." : ""}`, evidence }
    : { id: "S2", pass: true, summary: `all ${commits.length} merges since ${short(deployed)} are approved at their merged head`, evidence };
}

// ------------------------------------------------------------------------------------------------ S3
export interface ScoreRow { commit: string; set: string; brain: string; size: number; passed: number; stopped: string; run: string }
export function parseScoreLog(text: string): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) continue;
    const c = line.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length < 10 || !/^[0-9a-f]{7,40}$/.test(c[1])) continue;
    const size = Number(c[4]), passed = Number(c[5]);
    if (!Number.isFinite(size) || !Number.isFinite(passed) || size <= 0) continue;
    rows.push({ commit: c[1], set: c[2], brain: c[3], size, passed, stopped: c[8], run: (/^(\d+)/.exec(c[9]) ?? [])[1] ?? "" });
  }
  return rows;
}
export interface Measurement { set: string; size: number; run: string; rate: number; passes: number; commit: string }

// The SHAs a measurement may stand for: sha and its first-parent ancestors within 10 commits, up to the first one whose
// reply code differs from sha's.
export async function sameReplyCode(src: Sources, sha: string): Promise<string[]> {
  const out = [sha];
  let cur = sha;
  for (let i = 0; i < 10; i++) {
    const p = await src.parent(cur);
    if (!p || (await src.changed(p, sha, REPLY_CODE))) break;
    out.push(p);
    cur = p;
  }
  return out;
}

export async function measurementOf(src: Sources, sha: string, rows: ScoreRow[], brain: string): Promise<{ m: Measurement | null; why: string }> {
  const lineage = await sameReplyCode(src, sha);
  const tree = await src.tree(sha, REPLY_CODE);
  const valid = rows.filter((r) => r.brain === brain && r.stopped === "no" && r.run);
  const cache = new Map<string, boolean>();
  const counts = async (short: string) => {
    if (cache.has(short)) return cache.get(short)!;
    let yes = false;
    const full = await src.resolve(short);
    if (full) {
      if (lineage.includes(full)) yes = true;
      else if (tree && (await src.tree(full, REPLY_CODE)) === tree) {
        for (const a of lineage) if (await src.isAncestor(a, full)) { yes = true; break; }
      }
    }
    cache.set(short, yes);
    return yes;
  };
  const mine: ScoreRow[] = [];
  for (const r of valid) if (await counts(r.commit)) mine.push(r);
  if (!mine.length) return { m: null, why: `no ${brain} measurement on ci/brain-eval for ${short(sha)} or its ${lineage.length - 1} same-reply-code ancestors` };
  const latestRun = mine.map((r) => r.run).sort((a, b) => Number(b) - Number(a))[0];
  const run = mine.filter((r) => r.run === latestRun);
  const set = run[0].set, size = run[0].size;
  const same = run.filter((r) => r.set === set && r.size === size);
  const rate = same.reduce((a, r) => a + r.passed / r.size, 0) / same.length;
  return { m: { set, size, run: latestRun, rate, passes: same.length, commit: same[0].commit }, why: "" };
}

export async function s3(src: Sources, sha: string, deployed: string | null, brain: string): Promise<Result> {
  const evidence: string[] = [];
  if (!deployed) return { id: "S3", pass: false, summary: "no successful production deploy found: nothing to compare with", evidence };
  const log = await src.scoreLog();
  if (log === null) return { id: "S3", pass: false, summary: "evals/career/SCORE-LOG.md on ci/brain-eval cannot be read", evidence };
  const rows = parseScoreLog(log);
  const cand = await measurementOf(src, sha, rows, brain);
  if (!cand.m) return { id: "S3", pass: false, summary: `candidate: ${cand.why}`, evidence };
  evidence.push(`candidate ${short(sha)}: ${(cand.m.rate * 100).toFixed(1)}% (${brain}, ${cand.m.set}/${cand.m.size}, mean of ${cand.m.passes} passes of CI run ${cand.m.run}, brain commit ${cand.m.commit})`);
  // The deployed side is measured on the candidate's set and size: only those rows count.
  const dep = await measurementOf(src, deployed, rows.filter((r) => r.set === cand.m!.set && r.size === cand.m!.size), brain);
  if (!dep.m) return { id: "S3", pass: false, summary: `deployed: ${dep.why} on set ${cand.m.set}/${cand.m.size}`, evidence };
  evidence.push(`deployed  ${short(deployed)}: ${(dep.m.rate * 100).toFixed(1)}% (${brain}, ${dep.m.set}/${dep.m.size}, mean of ${dep.m.passes} passes of CI run ${dep.m.run}, brain commit ${dep.m.commit})`);
  const pass = cand.m.rate + 1e-9 >= dep.m.rate;
  return { id: "S3", pass, summary: `${brain} pass rate ${(cand.m.rate * 100).toFixed(1)}% ${pass ? ">=" : "<"} deployed ${(dep.m.rate * 100).toFixed(1)}%`, evidence };
}

// ------------------------------------------------------------------------------------------------ S4
export function knownGaps(text: string): string[] | null {
  const m = /export const KNOWN_GAP\b[^=]*=\s*\[([\s\S]*?)\]/.exec(text);
  if (!m) return null;
  const body = m[1].split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  return [...body.matchAll(/"([^"]+)"|'([^']+)'/g)].map((x) => x[1] ?? x[2]);
}

export async function s4(src: Sources, sha: string, deployed: string | null): Promise<Result> {
  const evidence: string[] = [];
  const now = await src.fileAt(sha, ACCEPTANCE_FILE);
  if (now === null) return { id: "S4", pass: false, summary: `${ACCEPTANCE_FILE} is not in ${short(sha)}`, evidence };
  const gaps = knownGaps(now);
  if (gaps === null) return { id: "S4", pass: false, summary: "the suite has no readable KNOWN_GAP list", evidence };
  const runs = (await src.checkRuns(sha)).filter((r) => r.name === ACCEPTANCE_CHECK || r.name.endsWith(` / ${ACCEPTANCE_CHECK}`))
    .sort((a, b) => b.id - a.id);
  const latest = runs[0];
  const verdict = !latest ? "NO RUN" : latest.status !== "completed" ? latest.status : latest.conclusion ?? "none";
  evidence.push(`${ACCEPTANCE_CHECK} on ${short(sha)}: ${verdict}${latest ? ` (check run ${latest.id})` : ""}`);
  evidence.push(`KNOWN_GAP at ${short(sha)} (${gaps.length}): ${gaps.join(", ") || "none"}`);
  let base: string[] | null = null, baseFrom = "";
  if (deployed) {
    const then = await src.fileAt(deployed, ACCEPTANCE_FILE);
    if (then !== null) { base = knownGaps(then); baseFrom = `the deployed ${short(deployed)}`; }
  }
  if (base === null) {
    const added = await src.firstAdded(sha, ACCEPTANCE_FILE);
    const first = added ? await src.fileAt(added, ACCEPTANCE_FILE) : null;
    if (first !== null) { base = knownGaps(first); baseFrom = `the suite as first committed (${short(added)}; the deployed SHA predates it)`; }
  }
  if (base === null) return { id: "S4", pass: false, summary: "no baseline KNOWN_GAP list to compare with", evidence };
  evidence.push(`baseline KNOWN_GAP from ${baseFrom} (${base.length}): ${base.join(", ") || "none"}`);
  const grown = gaps.filter((g) => !base!.includes(g));
  const problems: string[] = [];
  if (verdict !== "success") problems.push(`the suite is ${verdict} on ${short(sha)}`);
  if (grown.length) problems.push(`KNOWN_GAP grew: ${grown.join(", ")}`);
  return problems.length
    ? { id: "S4", pass: false, summary: problems.join("; "), evidence }
    : { id: "S4", pass: true, summary: `the suite passed on ${short(sha)}; KNOWN_GAP ${gaps.length} <= baseline ${base.length}, none added`, evidence };
}

// ------------------------------------------------------------------------------------------------ S5
export async function s5(src: Sources): Promise<Result> {
  const { code, out } = await src.secretsAudit();
  const lines = out.split("\n").filter((l) => /^FEATURE /.test(l));
  const evidence = lines.map((l) => l.replace(/^FEATURE /, ""));
  if (code === 2 || !lines.length) return { id: "S5", pass: false, summary: `the secrets audit could not run (exit ${code}): ${out.trim().split("\n").pop() ?? ""}`.slice(0, 300), evidence };
  const bad = lines.filter((l) => /\bENABLED\b/.test(l) && /\bNOT_WIRED\b/.test(l)).map((l) => l.split(/\s+/)[1]);
  if (bad.length) return { id: "S5", pass: false, summary: `enabled and NOT_WIRED: ${bad.join(", ")}`, evidence };
  if (code !== 0) return { id: "S5", pass: false, summary: `the secrets audit exited ${code}`, evidence };
  return { id: "S5", pass: true, summary: `${lines.length} features: none enabled and NOT_WIRED`, evidence };
}

export async function evaluate(src: Sources, sha: string, checks: CheckId[] = ALL_CHECKS, brain = "router"): Promise<{ results: Result[]; deployed: string | null }> {
  const deployed = checks.some((c) => c === "S2" || c === "S3" || c === "S4") ? await src.lastDeployedSha() : null;
  const results: Result[] = [];
  for (const c of checks) {
    try {
      results.push(c === "S1" ? await s1(src, sha) : c === "S2" ? await s2(src, sha, deployed) : c === "S3" ? await s3(src, sha, deployed, brain) : c === "S4" ? await s4(src, sha, deployed) : await s5(src));
    } catch (e) {
      results.push({ id: c, pass: false, summary: `could not be evaluated: ${String((e as Error)?.message ?? e).slice(0, 300)}`, evidence: [] });
    }
  }
  return { results, deployed };
}

export function report(sha: string, deployed: string | null, results: Result[]): string {
  const lines = [`DEPLOY STANDARD for ${sha} (last successful production deploy: ${deployed ?? "none found"})`];
  for (const r of results) {
    lines.push(`${r.id} ${r.pass ? "PASS" : "FAIL"}: ${r.summary}`);
    for (const e of r.evidence) lines.push(`    ${e}`);
  }
  const failed = results.filter((r) => !r.pass).map((r) => r.id);
  lines.push(failed.length ? `DEPLOY STANDARD: FAIL (${failed.join(", ")}): ${sha} does not deploy` : `DEPLOY STANDARD: PASS (${results.map((r) => r.id).join(", ")}): ${sha} meets the standard`);
  return lines.join("\n");
}

// ------------------------------------------------------------------------------------------------ the live sources
async function git(args: string[]): Promise<{ code: number; out: string }> {
  const r = await new Deno.Command("git", { args, stdout: "piped", stderr: "piped" }).output();
  return { code: r.code, out: new TextDecoder().decode(r.stdout) };
}
export function liveSources(o: { repo: string; token: string; excludeRun?: string; scoreRef?: string; audit?: string[] }): Sources {
  const api = async (path: string): Promise<any> => {
    const res = await fetch(`https://api.github.com/repos/${o.repo}${path}`, { headers: { authorization: `Bearer ${o.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  };
  return {
    async checkRuns(sha) {
      const out: CheckRun[] = [];
      for (let page = 1; page < 20; page++) {
        const j = await api(`/commits/${sha}/check-runs?per_page=100&page=${page}`);
        const runs = j?.check_runs ?? [];
        out.push(...runs.map((r: any) => ({ name: r.name, status: r.status, conclusion: r.conclusion, id: r.id, completed_at: r.completed_at })));
        if (runs.length < 100) break;
      }
      return out;
    },
    async fileAt(sha, path) { const r = await git(["show", `${sha}:${path}`]); return r.code === 0 ? r.out : null; },
    async lastDeployedSha() {
      for (let page = 1; page < 10; page++) {
        const j = await api(`/actions/workflows/deploy-production.yml/runs?branch=release/production&status=success&per_page=50&page=${page}`);
        const runs = (j?.workflow_runs ?? []) as any[];
        const hit = runs.find((r) => String(r.id) !== o.excludeRun && r.conclusion === "success");
        if (hit) return hit.head_sha;
        if (runs.length < 50) break;
      }
      return null;
    },
    async firstParent(from, to) {
      const r = await git(["log", "--first-parent", "--format=%H%x09%s", `${from}..${to}`]);
      if (r.code !== 0) throw new Error(`git log ${short(from)}..${short(to)} failed`);
      return r.out.split("\n").filter(Boolean).map((l) => ({ sha: l.split("\t")[0], subject: l.slice(41) }));
    },
    async pull(n) {
      const j = await api(`/pulls/${n}`);
      return j ? { number: j.number, merged: !!j.merged, merge_commit_sha: j.merge_commit_sha, head_sha: j.head.sha, base: j.base.ref } : null;
    },
    async reviews(n) {
      const out: Review[] = [];
      for (let page = 1; page < 10; page++) {
        const j = (await api(`/pulls/${n}/reviews?per_page=100&page=${page}`)) ?? [];
        out.push(...j.map((r: any) => ({ state: r.state, commit_id: r.commit_id, user: r.user?.login ?? "" })));
        if (j.length < 100) break;
      }
      return out;
    },
    async scoreLog() { const r = await git(["show", `${o.scoreRef ?? "origin/ci/brain-eval"}:evals/career/SCORE-LOG.md`]); return r.code === 0 ? r.out : null; },
    async resolve(rev) { const r = await git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]); return r.code === 0 ? r.out.trim() : null; },
    async parent(sha) { const r = await git(["rev-parse", "--verify", "--quiet", `${sha}^1`]); return r.code === 0 ? r.out.trim() : null; },
    async isAncestor(a, b) { return (await git(["merge-base", "--is-ancestor", a, b])).code === 0; },
    async changed(a, b, path) {
      const r = await git(["diff", "--quiet", a, b, "--", path]);
      if (r.code > 1) throw new Error(`git diff ${short(a)} ${short(b)} failed`);
      return r.code === 1;
    },
    async tree(sha, path) { const r = await git(["rev-parse", "--verify", "--quiet", `${sha}:${path}`]); return r.code === 0 ? r.out.trim() : null; },
    async firstAdded(sha, path) {
      const r = await git(["log", "--diff-filter=A", "--format=%H", sha, "--", path]);
      const all = r.out.split("\n").filter(Boolean);
      return all.length ? all[all.length - 1] : null;
    },
    async secretsAudit() {
      const r = await new Deno.Command("bash", { args: o.audit ?? ["scripts/launch/secrets-audit.sh", "--features"], stdout: "piped", stderr: "piped" }).output();
      return { code: r.code, out: new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr) };
    },
  };
}

if (import.meta.main) {
  const args = [...Deno.args];
  const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const sha = opt("--sha") ?? "";
  const checks = (opt("--checks") ?? ALL_CHECKS.join(",")).split(",").map((s) => s.trim().toUpperCase()) as CheckId[];
  if (!SHA40.test(sha) || !checks.length || checks.some((c) => !ALL_CHECKS.includes(c))) {
    console.error("usage: deploy-standard.ts --sha <40-hex> [--checks S1,S2,S3,S4,S5] [--exclude-run <run id>]");
    Deno.exit(2);
  }
  const repo = Deno.env.get("GITHUB_REPOSITORY") ?? "", token = Deno.env.get("GITHUB_TOKEN") ?? "";
  if (!repo || !token) { console.error("GITHUB_REPOSITORY and GITHUB_TOKEN are required (read-only API calls)"); Deno.exit(2); }
  const src = liveSources({ repo, token, excludeRun: opt("--exclude-run") });
  const waitMin = Number(opt("--wait-checks") ?? 0);
  if (waitMin > 0 && checks.includes("S1")) {
    const deadline = Date.now() + waitMin * 60_000;
    for (;;) {
      const left = await unfinished(src, sha).catch(() => ["(the checks API)"]);
      if (!left.length) break;
      if (Date.now() >= deadline) { console.log(`waited ${waitMin} min; still unfinished: ${left.join(", ")}`); break; }
      console.log(`waiting for ${left.length} required checks to finish: ${left.slice(0, 5).join(", ")}${left.length > 5 ? ", ..." : ""}`);
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
  const { results, deployed } = await evaluate(src, sha, checks, Deno.env.get("DEPLOY_STANDARD_BRAIN") || "router");
  const text = report(sha, deployed, results);
  console.log(text);
  const summary = Deno.env.get("GITHUB_STEP_SUMMARY");
  if (summary) await Deno.writeTextFile(summary, `### Deploy standard\n\n\`\`\`\n${text}\n\`\`\`\n`, { append: true });
  const out = Deno.env.get("GITHUB_OUTPUT");
  if (out) await Deno.writeTextFile(out, `deployed_sha=${deployed ?? ""}\nverdict=${results.every((r) => r.pass) ? "pass" : "fail"}\n`, { append: true });
  Deno.exit(results.every((r) => r.pass) ? 0 : 1);
}
