// F-RUNNER load measurement (docs/launch/CLOUD-RUNNER.md "Load model"). Runs inside a runner sandbox (or any host with
// the runner's tools): N applications to a local synthetic form on 127.0.0.1, each prepared by the engine's dry run and
// then sent by the cloud worker's own runCloudJob with the real engine, C at a time. Nothing leaves the machine.
//   deno run -A scripts/cloud-runner/bench.ts [--jobs 6] [--parallel 1]
// Prints BENCH {...} with the per-phase times in milliseconds.
import { prepare } from "../../workers/career-browser/approve-first.ts";
import { cloudEngineRunner, type CloudJob, runCloudJob } from "../../workers/career-cloud/worker.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";

const arg = (k: string, d: number) => {
  const i = Deno.args.indexOf(k);
  return i >= 0 ? Number(Deno.args[i + 1]) : d;
};
const jobs = arg("--jobs", 6), parallel = arg("--parallel", 1);
let posts = 0;
const form = `<!doctype html><title>TEST role</title><h1>TEST Analyst</h1><form method="post" action="/submit" enctype="multipart/form-data">` +
  `<label for="first">First name</label><input name="first_name" id="first" required>` +
  `<label for="email">Email</label><input name="email" id="email" type="email" required>` +
  `<label for="resume">Resume</label><input type="file" name="resume" id="resume" required>` +
  `<button type="submit">Submit application</button></form>`;
const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
  if (req.method === "POST") {
    await req.arrayBuffer();
    posts++;
    return new Response("<h1>Thank you for applying</h1><p>Application received. Confirmation number: BENCH-1.</p>", { headers: { "content-type": "text/html" } });
  }
  return new Response(form, { headers: { "content-type": "text/html" } });
});
const base = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const dir = await Deno.makeTempDir({ prefix: "trainee-bench-" });
await Deno.mkdir(`${dir}/evidence`, { mode: 0o700 });
const engine = cloudEngineRunner({ root, evidenceRoot: `${dir}/evidence` });
const resume = new TextEncoder().encode("%PDF-1.4 SYNTHETIC BENCH RESUME");
await Deno.writeFile(`${dir}/resume.pdf`, resume);
const one = async (n: number) => {
  const user = `TEST-BENCH-${n}`, src = { confirmed: true, provenance: "owner stated (TEST)", confirmation_event_id: `evt-${n}` };
  const facts = `${dir}/facts-${n}.json`;
  await Deno.writeTextFile(facts, JSON.stringify({ user_id: user, saved: {}, answers: {
    first_name: { value: `Bench ${n}`, factId: `B-${n}-1`, ...src }, email: { value: `bench${n}@example.test`, factId: `B-${n}-2`, ...src } } }));
  const t0 = Date.now();
  const p: any = await prepare({ url: `${base}/form/${n}`, factsPath: facts, resumePath: `${dir}/resume.pdf`, account: { epoch: 1, version: 1 }, now: Date.now(), runEngine: engine });
  const t1 = Date.now();
  if (!p.ready) throw Error("not prepared: " + JSON.stringify(p.result));
  const h = await hashApplyPayload(p.payload);
  const job: CloudJob = { id: `bench-${n}`, lease_token: `lease-${n}`, user_id: user, company: p.payload.company, url: p.payload.url, payload: p.payload, payload_hash: h, approval_hash: h };
  let state = "";
  await runCloudJob(job, { runEngine: engine, tmpRoot: dir, log: () => {}, queue: {
    claim: async () => [], authorize: async () => {}, gatePresent: async () => true, ask: async () => 0,
    resume: async () => ({ filename: "resume.pdf", sha256: p.payload.resume_sha256, b64: btoa(String.fromCharCode(...resume)) }),
    finish: async (_j, s) => { state = s; },
  } });
  return { dry_run_ms: t1 - t0, submit_ms: Date.now() - t1, state };
};
const started = Date.now(), out: Awaited<ReturnType<typeof one>>[] = [];
for (let i = 0; i < jobs; i += parallel) {
  out.push(...await Promise.all(Array.from({ length: Math.min(parallel, jobs - i) }, (_, k) => one(i + k))));
}
const wall = Date.now() - started;
const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log("BENCH " + JSON.stringify({ jobs, parallel, posts, wall_ms: wall, per_job_wall_ms: Math.round(wall / jobs),
  dry_run_ms_median: med(out.map((o) => o.dry_run_ms)), submit_ms_median: med(out.map((o) => o.submit_ms)),
  states: [...new Set(out.map((o) => o.state))] }));
await server.shutdown();
await Deno.remove(dir, { recursive: true }).catch(() => {});
