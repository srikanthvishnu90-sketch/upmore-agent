// Offline Lever handoff: the canonical prepare -> approved queue -> cloud worker -> apply.ts path.
// Only a captured form and invented TEST person are used. No URL, facts or credentials are accepted.
// A retained receipt is local page evidence; it cannot open the production employer-email gate.
import { prepare } from "../../workers/career-browser/approve-first.ts";
import { cloudEngineRunner, cloudLoop, type CloudQueue } from "../../workers/career-cloud/worker.ts";
import { receiptText } from "../../supabase/functions/_shared/career_apply_receipts.ts";

const args = [...Deno.args];
if (args.length !== 2 || args[0] !== "--out" || !args[1]) {
  console.error("usage: deno run -A evals/apply/lever-driver-readiness.ts --out <new private evidence folder>");
  Deno.exit(2);
}
const out = args[1];
await Deno.mkdir(out, { mode: 0o700 }); // Do not overwrite an earlier proof.
await Deno.chmod(out, 0o700);
const write = (name: string, value: unknown) =>
  Deno.writeTextFile(`${out}/${name}`, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const sha256 = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
const started = Date.now();
const source = new TextDecoder().decode((await new Deno.Command("git", {
  cwd: root, args: ["rev-parse", "HEAD"], stdout: "piped", stderr: "null",
}).output()).stdout).trim();
const fixtureId = "lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027";
const manifest = JSON.parse(await Deno.readTextFile(`${root}/tests/fixtures/forms-ci/manifest.json`));
const fixture = manifest.forms.find((f: { id: string }) => f.id === fixtureId);
if (!fixture) throw Error("CAPTURED_LEVER_FORM_MISSING");
const html = await Deno.readTextFile(`${root}/tests/fixtures/forms-ci/${fixture.html}`);
// The site's scripts, including its Submit-time verification, are not reproduced. The one stand-in only
// wires Lever's button to its existing form, as in the captured-form acceptance test. External assets are removed.
const page = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<link\b[^>]*>/gi, "").replace(/\s(src|srcset)="https?:[^"]*"/gi, "")
  .replace(/<\/body>/i, `<script>document.getElementById("btn-submit").addEventListener("click",()=>document.getElementById("application-form").requestSubmit())</script></body>`);
const acknowledgement = "I understand that next steps will be sent via email and I have marked the sender address above as safe.";
const own = (factId: string, value: string, authorizes = false) => ({
  value, factId, confirmed: true, provenance: "owner stated in chat (TEST)",
  confirmation_event_id: `evt-${factId}`, ...(authorizes ? { authorizes: true } : {}),
});
const facts = {
  user_id: "TEST-lever-readiness-owner",
  answers: {
    full_name: own("TEST-F-1", "Synthetic Tester"), email: own("TEST-F-2", "synthetic.tester@example.test"),
    sponsorship: own("TEST-F-3", "No"), work_authorization: own("TEST-F-4", "Yes"),
  },
  saved: {
    [acknowledgement.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()]:
      own("TEST-F-5", "Yes", true),
  },
};
const resume = new TextEncoder().encode("%PDF-1.4 SYNTHETIC TEST RESUME");
const received: { at: string; entries: [string, unknown][] }[] = [];
const route = "/veeva-readiness/9ac55b31-df46-4acb-b305-2c0b7ed56027/apply";
const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, async (req) => {
  if (new URL(req.url).pathname !== route) return new Response("not found", { status: 404 });
  if (req.method === "POST") {
    const data = await req.formData();
    const entries: [string, unknown][] = [];
    for (const [name, value] of data) entries.push([name, typeof value === "string" ? value : {
      filename: value.name, size: value.size, sha256: await sha256(new Uint8Array(await value.arrayBuffer())),
    }]);
    received.push({ at: new Date().toISOString(), entries });
    return new Response("<h1>Thank you for applying</h1><p>Application submitted. Confirmation TEST-LEVER-READINESS.</p>", {
      headers: { "content-type": "text/html" },
    });
  }
  if (req.method !== "GET") return new Response("method refused", { status: 405 });
  return new Response(page, { headers: { "content-type": "text/html" } });
});
const url = `http://127.0.0.1:${server.addr.port}${route}`;
await Deno.mkdir(`${out}/evidence`, { mode: 0o700 });
await Deno.mkdir(`${out}/tmp`, { mode: 0o700 });
await Deno.writeTextFile(`${out}/facts.json`, JSON.stringify(facts), { mode: 0o600 });
await Deno.writeFile(`${out}/resume.pdf`, resume, { mode: 0o600 });
const engine = cloudEngineRunner({ root, evidenceRoot: `${out}/evidence` });
const finished: Record<string, any>[] = [];
let engineRuns = 0;
try {
  const prepared = await prepare({
    url, factsPath: `${out}/facts.json`, resumePath: `${out}/resume.pdf`,
    account: { epoch: 1, version: 1 }, now: Date.now(), runEngine: engine,
  });
  await write("prepared.json", prepared);
  if (!prepared.ready) throw Error(`PREPARATION_STOPPED: ${prepared.result.reason}`);
  // The invented local owner approves this exact prepared card. No real person's approval is asserted.
  await write("approval.json", { by: facts.user_id, synthetic: true, hash: prepared.hash, card: prepared.card });
  const job = {
    id: "TEST-lever-readiness-job", lease_token: "TEST-lever-readiness-lease", user_id: facts.user_id,
    company: prepared.payload.company, url, payload: prepared.payload,
  };
  let pending = true;
  const queue: CloudQueue = {
    claim: async () => pending ? (pending = false, [job]) : [],
    resume: async () => ({ filename: "resume.pdf", sha256: prepared.payload.resume_sha256,
      b64: btoa(String.fromCharCode(...resume)) }),
    finish: async (j, state, evidence, outcome, errorKind) => {
      finished.push({ id: j.id, state, outcome, errorKind, evidence });
    },
    ask: async () => { throw Error("CLEAN_CONTROL_MUST_NOT_ASK"); },
    gatePresent: async () => true, // Local queue only; no production gate call or change.
  };
  await cloudLoop({
    queue, contexts: 1, idleMs: 10, tmpRoot: `${out}/tmp`, stop: () => finished.length > 0,
    runEngine: (a) => { engineRuns++; return engine(a); }, log: () => {},
  });
  const result = finished[0];
  const sent = received[0]?.entries ?? [];
  const values = new Map(sent);
  const answerMatch = prepared.payload.fields.every((f: any) => {
    const got = values.get(f.name);
    return f.name === "resume"
      ? typeof got === "object" && got !== null && (got as any).sha256 === prepared.payload.resume_sha256
      : got === f.value;
  });
  const nonempty = sent.filter(([, value]) => value !== "");
  const allowed = new Set([...prepared.payload.fields.map((f: any) => f.name), ...prepared.payload.page_field_names]);
  const wireKeys = new Set(sent.map(([name]) => name));
  const checks = {
    prepared: prepared.ready, one_engine_submission: engineRuns === 1,
    one_employer_post: received.length === 1, one_final_record: finished.length === 1,
    approved_answers_and_resume_received: answerMatch,
    no_extra_nonempty_fields: nonempty.every(([name]) => allowed.has(name)),
    no_repeated_wire_fields: wireKeys.size === sent.length,
    page_confirmation_captured: result?.state === "confirmed" && result?.outcome === "submitted",
    screenshots_retained: ["before-review.png", "after-submit.png"].every((name) => result?.evidence?.screenshots?.sha256?.[name]),
    temporary_person_files_removed: [...Deno.readDirSync(`${out}/tmp`)].length === 0,
  };
  // career_apply_cloud_finish records a page confirmation as submitted_unconfirmed. Its confirmation email
  // is still required; do not fabricate a mail event or call the local page an employer-email confirmation.
  const receipt = receiptText({ company: job.company, url: fixture.source_url, state: "submitted_unconfirmed",
    evidence: { page_confirmation: result?.state === "confirmed" } });
  const proof = {
    scope: "captured Lever form, invented TEST person and in-memory queue, loopback employer only",
    source_sha: source, captured_fixture: fixtureId, fixture_sha256: await sha256(new TextEncoder().encode(html)),
    canonical_path: ["approve-first.prepare", "cloudLoop", "cloudEngineRunner", "scripts/apply.ts --submit --approved"],
    approved_payload_hash: prepared.hash, engine_approval: prepared.payload.engine_approval,
    local_url: url, received, finished, checks, receipt,
    elapsed_ms: Date.now() - started,
    live_gate: "NOT_RUN: three approved gate-tester hand submissions on Lever confirmed by employer email; cloud switch and personal opt-in remain owner-controlled",
  };
  await write("receipt.json", proof);
  console.log(JSON.stringify({ proof: `${out}/receipt.json`, checks, receipt, elapsed_ms: proof.elapsed_ms }));
  if (Object.values(checks).some((ok) => !ok)) Deno.exitCode = 1;
} catch (e) {
  await write("stopped.json", { source_sha: source, reason: String(e), received, finished, elapsed_ms: Date.now() - started });
  console.error(String(e));
  Deno.exitCode = 1;
} finally {
  await server.shutdown();
  await Deno.remove(`${out}/facts.json`).catch(() => {});
  await Deno.remove(`${out}/resume.pdf`).catch(() => {});
}
