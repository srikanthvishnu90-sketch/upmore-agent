// Paid-workflow disable kit (2026-10-23; coordinator: "prepare and locally verify a non-paid, fail-closed hardening/disable
// plan across all four paid workflows ... no pushes to any triggering path").
//
// disable(text): the workflow file unchanged except that every job holding the OpenAI key gets a job-level
// `if: ${{ false }}`. A job-level condition is the only switch that holds: a failing first STEP does not stop later steps
// marked `if: always()`, and brain-eval.yml runs its paid router and re-score steps under always(). A skipped job runs no
// step at all and never reads the secret. The patch only inserts lines (checked by isAdditive).
//
// simulate(text, branch): runs a workflow's jobs and steps locally the way the runner orders them (job `if`, step `if`
// with success()/always()/failure() and a literal false, `uses:` steps taken as succeeding), with `deno` and `git`
// replaced by shims: a deno invocation of a paid entry point (evals/career/run.ts, rejudge.ts, live-meter.ts) is logged
// as a paid call and never runs; git never touches a remote. It answers one question: would a push reach a paid call?
//
//   deno run -A scripts/eval/paid-workflow-disable.ts disable <in.yml>     prints the disabled file
//   deno run -A scripts/eval/paid-workflow-disable.ts simulate <in.yml> <branch>
import { parse } from "jsr:@std/yaml@1";

export const PAID_ENTRY = /evals\/career\/run\.ts|evals\/career\/rejudge\.ts|evals\/brain-reliability\/live-meter\.ts/;
const KEY = /secrets\.OPENAI_API_KEY/;

type Job = { name: string; text: string; start: number; end: number; parsed: any };
function jobsOf(text: string): Job[] {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (at < 0) throw new Error("no jobs: block");
  const parsed: any = parse(text);
  const out: Job[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    const m = lines[i].match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && !/^  [A-Za-z0-9_-]+:\s*$/.test(lines[j]) && !/^\S/.test(lines[j])) j++;
    out.push({ name: m[1], text: lines.slice(i, j).join("\n"), start: i, end: j, parsed: parsed.jobs[m[1]] });
  }
  return out;
}
export function keyJobs(text: string): string[] { return jobsOf(text).filter((j) => KEY.test(j.text)).map((j) => j.name); }

export function disable(text: string, note = "DISABLED 2026-10-23: no paid evaluation is authorized; re-enabling needs the owner's written approval and a reviewed commit"): string {
  const lines = text.split("\n");
  const jobs = jobsOf(text).filter((j) => KEY.test(j.text));
  if (!jobs.length) return text;
  for (const j of [...jobs].reverse()) {
    if (j.parsed && Object.prototype.hasOwnProperty.call(j.parsed, "if")) throw new Error(`job ${j.name} already has a job-level if; patch it by hand`);
    lines.splice(j.start + 1, 0, `    if: \${{ false }}  # ${note}`);
  }
  return [`# ${note}.`, ...lines].join("\n");
}
export function isAdditive(before: string, after: string): boolean {
  const a = before.split("\n"), b = after.split("\n");
  let i = 0;
  for (const line of b) if (i < a.length && line === a[i]) i++;
  return i === a.length;
}
export function isDisabled(text: string): boolean {
  const jobs = jobsOf(text).filter((j) => KEY.test(j.text));
  return jobs.every((j) => j.parsed && (j.parsed.if === false || /^\$\{\{\s*false\s*\}\}$/.test(String(j.parsed.if).trim())));
}

const expr = (s: string, ctx: Record<string, string>) => s.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, e) => {
  e = e.trim();
  if (e === "github.run_id") return "sim-run";
  if (e === "github.run_attempt") return "1";
  if (e === "github.ref_name") return ctx.__branch;
  if (e === "runner.temp") return ctx.RUNNER_TEMP;
  if (e.startsWith("secrets.")) return e === "secrets.OPENAI_API_KEY" ? "sk-simulated-not-a-key" : "simulated-secret";
  if (e.startsWith("env.")) return ctx[e.slice(4)] ?? "";
  if (e.startsWith("vars.")) return "";
  return "";
});
function condTrue(cond: unknown, failed: boolean, ctx: Record<string, string>): boolean {
  if (cond === undefined || cond === null) return !failed;
  if (cond === false) return false;
  let c = String(cond).trim().replace(/^\$\{\{\s*|\s*\}\}$/g, "").trim();
  if (c === "false") return false;
  if (c === "true") return !failed;
  if (c === "always()") return true;
  if (c === "failure()") return failed;
  if (c === "success()") return !failed;
  // A conjunction: always() in it lifts the failure gate; every other part must hold.
  const parts = c.split(/\s*&&\s*/);
  const always = parts.includes("always()");
  const ok = parts.filter((p) => p !== "always()").every((p) => {
    const m = p.match(/^env\.([A-Za-z0-9_]+)\s*(==|!=)\s*'([^']*)'$/);
    if (!m) throw new Error(`simulate: unsupported condition ${c}`);
    return m[2] === "==" ? (ctx[m[1]] ?? "") === m[3] : (ctx[m[1]] ?? "") !== m[3];
  });
  return ok && (always || !failed);
}

export type SimResult = { jobs: { name: string; skipped: boolean; steps: { name: string; ran: boolean; code: number | null }[] }[]; paidCalls: string[] };
export async function simulate(text: string, branch: string, opts: { cwd?: string } = {}): Promise<SimResult> {
  const doc: any = parse(text);
  const tmp = await Deno.makeTempDir({ prefix: "pwsim-" });
  const bin = `${tmp}/bin`, log = `${tmp}/paid.log`;
  await Deno.mkdir(bin);
  // The deno shim: `deno run` of a paid entry point is logged and never runs; any other deno command (check, test, eval)
  // succeeds and does nothing.
  await Deno.writeTextFile(`${bin}/deno`, `#!/usr/bin/env bash\n[ "$1" = run ] && for a in "$@"; do if [[ "$a" =~ ${PAID_ENTRY.source.replace(/\\\//g, "/")} ]]; then echo "$*" >> "${log}"; exit 0; fi; done\nexit 0\n`, { mode: 0o755 });
  await Deno.writeTextFile(`${bin}/git`, `#!/usr/bin/env bash\nexit 0\n`, { mode: 0o755 });
  const res: SimResult = { jobs: [], paidCalls: [] };
  for (const [name, job] of Object.entries<any>(doc.jobs ?? {})) {
    const ctx: Record<string, string> = { __branch: branch, RUNNER_TEMP: `${tmp}/runner`, GITHUB_ENV: `${tmp}/github_env`, GITHUB_WORKSPACE: opts.cwd ?? tmp };
    await Deno.mkdir(ctx.RUNNER_TEMP, { recursive: true }); await Deno.writeTextFile(ctx.GITHUB_ENV, "");
    for (const [k, v] of Object.entries<any>({ ...(doc.env ?? {}), ...(job.env ?? {}) })) ctx[k] = expr(String(v), ctx);
    const jr = { name, skipped: !condTrue(job.if, false, ctx), steps: [] as SimResult["jobs"][0]["steps"] };
    res.jobs.push(jr);
    if (jr.skipped) continue;
    let failed = false;
    for (const step of job.steps ?? []) {
      const sname = step.name ?? step.uses ?? "(step)";
      // $GITHUB_ENV lines written by earlier steps become env for later steps, as on the runner.
      for (const l of (await Deno.readTextFile(ctx.GITHUB_ENV)).split("\n")) { const i = l.indexOf("="); if (i > 0) ctx[l.slice(0, i)] = l.slice(i + 1); }
      if (!condTrue(step.if, failed, ctx)) { jr.steps.push({ name: sname, ran: false, code: null }); continue; }
      if (step.uses) { jr.steps.push({ name: sname, ran: true, code: 0 }); continue; }
      const env: Record<string, string> = { ...ctx, PATH: `${bin}:${Deno.env.get("PATH")}` };
      for (const [k, v] of Object.entries<any>(step.env ?? {})) env[k] = expr(String(v), ctx);
      delete env.__branch;
      const o = await new Deno.Command("bash", { args: ["-e", "-c", expr(String(step.run), ctx)], env, cwd: opts.cwd ?? tmp, clearEnv: true, stdout: "null", stderr: "null" }).output();
      jr.steps.push({ name: sname, ran: true, code: o.code });
      if (o.code !== 0) failed = true;
    }
  }
  try { res.paidCalls = (await Deno.readTextFile(log)).trim().split("\n").filter(Boolean); } catch { /* none */ }
  await Deno.remove(tmp, { recursive: true });
  return res;
}

if (import.meta.main) {
  const [cmd, file, branch] = Deno.args;
  const text = await Deno.readTextFile(file);
  if (cmd === "disable") await Deno.stdout.write(new TextEncoder().encode(disable(text)));
  else if (cmd === "simulate") console.log(JSON.stringify(await simulate(text, branch), null, 1));
  else { console.error("usage: disable <in.yml> | simulate <in.yml> <branch>"); Deno.exit(64); }
}
