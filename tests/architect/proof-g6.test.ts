// G6 (D-024): the proof an approved application keeps, and what it never does. The employer's own server is the witness
// of what was sent; runApproved (the queue's driver) and the real engine run against it, with no database:
//   1 no before-click picture  -> no click: nothing reaches the employer, and the application stays not sent
//   2 a stale picture          -> a picture already in the evidence directory (an earlier run's, another application's)
//                                 is refused, never recorded as this click's
//   3 a wrong application      -> a proof bound to another application is never kept on this one's record
//   4 no after-submit picture  -> the outcome is never "confirmed"
// Each picture is what the page showed. It does not prove that the employer accepted anything.
import assertNode from "node:assert/strict";
import { engineRunner, type Job, prepare, runApproved } from "../../workers/career-browser/approve-first.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = Deno.env.get("CI") === "true";
const PERSON = "7b0f8f8e-6a43-4a49-9d2c-0000000000g6".replace("g6", "f6");
const SOURCE = { confirmed: true, provenance: "owner stated (TEST person, synthetic)", confirmation_event_id: "evt-proof-test" };
const FACTS = {
  user_id: PERSON,
  answers: {
    first_name: { value: "Proofa", factId: "PROOF-TEST-FACT-1", ...SOURCE },
    last_name: { value: "Tester", factId: "PROOF-TEST-FACT-2", ...SOURCE },
    email: { value: "proofa.tester@example.test", factId: "PROOF-TEST-FACT-3", ...SOURCE },
  },
};
async function sha256hex(b: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const APP_A = "11111111-1111-4111-8111-111111111111", APP_B = "22222222-2222-4222-8222-222222222222";

function browserEnv(): boolean {
  if (Deno.env.get("UPMORE_PLAYWRIGHT_PATH")) return true;
  try {
    Deno.statSync(`${ROOT}/tools/node_modules/playwright`);
    Deno.env.set("UPMORE_PLAYWRIGHT_PATH", `${ROOT}/tools/node_modules/playwright`);
    return true;
  } catch {
    return false;
  }
}

// The employer: one posting; its thank-you page states the application was received (the engine reads it as
// confirmed on the page). Every POST is logged.
function employer() {
  const posts: string[] = [];
  const page = `<!doctype html><title>TEST role</title><h1>TEST Analyst</h1><p>TEST Proof Employer</p>
<form method="post" action="/apply/submit" enctype="multipart/form-data">
<label for="first">First name</label><input name="first_name" id="first" required>
<label for="last">Last name</label><input name="last_name" id="last" required>
<label for="email">Email</label><input name="email" id="email" type="email" required>
<label for="resume">Resume</label><input type="file" name="resume" id="resume" required>
<button type="submit">Submit application</button></form>`;
  const s = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    if (req.method === "POST") {
      const form = await req.formData();
      posts.push(String(form.get("first_name")));
      return new Response(`<h1>Thank you for applying</h1><p>Application received. Confirmation number: PROOF-1.</p>`, { headers: { "content-type": "text/html" } });
    }
    return new Response(page, { headers: { "content-type": "text/html" } });
  });
  return { base: `http://127.0.0.1:${(s.addr as Deno.NetAddr).port}`, posts, close: () => s.shutdown() };
}

// Prepare the application for real, then drive it through runApproved as the queue would, as application `id`.
async function drive(o: { id: string; fault?: string; evidenceDir?: (work: string) => Promise<string>; tamper?: (r: any) => void; ownDir?: boolean }) {
  const site = employer();
  const work = await Deno.makeTempDir({ prefix: "trainee-proof-" });
  try {
    const factsPath = `${work}/facts.json`, resumePath = `${work}/resume.pdf`;
    await Deno.writeTextFile(factsPath, JSON.stringify(FACTS));
    await Deno.writeFile(resumePath, new TextEncoder().encode("%PDF-1.4\n% synthetic proof-test resume\n%%EOF\n"));
    const engine = engineRunner({ root: ROOT, extra: ["--state-dir", `${work}/engine-state`] });
    const prepared = await prepare({ url: `${site.base}/apply`, factsPath, resumePath, account: { epoch: 0, version: 0 }, now: Date.now(), runEngine: engine });
    assert(prepared.ready, `not ready: ${JSON.stringify((prepared as any).result)}`);
    const resumeSha = prepared.payload.resume_sha256;
    const job: Job = { id: o.id, lease_token: "33333333-3333-4333-8333-333333333333", url: `${site.base}/apply`, user_id: PERSON, payload: prepared.payload };
    const finished: any[] = [];
    let claimed = false;
    // ownDir: a path that does not exist yet, so the engine itself creates the evidence directory (as in production).
    const fixedDir = o.evidenceDir ? await o.evidenceDir(work) : o.ownDir ? `${work}/engine-evidence` : null;
    let engineOutput = "";
    await runApproved({
      claim: async () => claimed ? [] : (claimed = true, [job]),
      finish: async (id, lease, state, evidence) => void finished.push({ id, lease, state, evidence }),
      resumeFor: async () => ({ path: resumePath, sha256: resumeSha }),
      writeFacts: async (_job, facts) => {
        const p = `${work}/approved-facts.json`;
        await Deno.writeTextFile(p, JSON.stringify(facts));
        return p;
      },
      runEngine: async (args, env) => {
        let r: any;
        if (fixedDir) {
          // The engine run with the evidence directory the test filled beforehand.
          const out = await new Deno.Command(Deno.execPath(), {
            args: ["run", "-A", `${ROOT}/scripts/apply.ts`, ...args, "--state-dir", `${work}/engine-state`, "--evidence-dir", fixedDir],
            stdout: "piped", stderr: "piped",
          }).output();
          engineOutput = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
          const line = new TextDecoder().decode(out.stdout).split("\n").filter((l) => l.startsWith("RESULT ")).at(-1);
          r = line ? { result: JSON.parse(line.slice(7)), evidence: null } : null;
        } else {
          r = await engine(args, env ?? (o.fault ? { UPMORE_TEST_PROOF_FAULT: o.fault } : undefined));
        }
        if (r && o.tamper) o.tamper(r);
        return r;
      },
    });
    console.log(`${o.id.slice(0, 8)} fault=${o.fault ?? "-"}: ${JSON.stringify(finished[0]?.state)} ${JSON.stringify(finished[0]?.evidence)} posts=${site.posts.length}`);
    // What the engine left on disk, read before the work directory is removed: each entry's mode, and its bytes.
    const disk: { name: string; mode: number; bytes: Uint8Array }[] = [];
    let dirMode = -1;
    if (fixedDir && o.ownDir) {
      dirMode = (await Deno.stat(fixedDir)).mode! & 0o777;
      for await (const e of Deno.readDir(fixedDir)) {
        const p = `${fixedDir}/${e.name}`;
        disk.push({ name: e.name, mode: (await Deno.lstat(p)).mode! & 0o777, bytes: await Deno.readFile(p) });
      }
    }
    return { finished: finished[0], posts: site.posts, engineOutput, disk, dirMode };
  } finally {
    await site.close();
    await Deno.remove(work, { recursive: true }).catch(() => {});
  }
}

const opts = { sanitizeResources: false, sanitizeOps: false };
const guard = () => {
  if (!browserEnv()) { if (CI) throw Error("needs the gate's Playwright browser in CI"); console.log("NOT_RUN locally: no Playwright browser"); return false; }
  if (Deno.uid?.() === 0 && !CI) { console.log("NOT_RUN locally as root: run it as an unprivileged user"); return false; }
  return true;
};

Deno.test({
  ...opts,
  name: "proof (control): the approved application is sent once; its proof is kept, bound to this application, in the click's order",
  async fn() {
    if (!guard()) return;
    const r = await drive({ id: APP_A });
    eq(r.posts, ["Proofa"], "exactly one application reached the employer");
    const proof = r.finished.evidence.proof;
    assert(proof, JSON.stringify(r.finished.evidence));
    eq([proof.application_id, proof.before_click.application_id, proof.after_submit.application_id], [APP_A, APP_A, APP_A]);
    assert(proof.before_click.seq < proof.click.seq && proof.click.seq < proof.after_submit.seq, JSON.stringify(proof));
    // What each field held at the click, by hash only: the synthetic first name is bound, its text is not kept again.
    const held = proof.before_click.fields_sha256;
    eq(held.first_name, await sha256hex(new TextEncoder().encode(JSON.stringify("Proofa"))), "the first name held at the click is bound");
    assert(!JSON.stringify(r.finished.evidence).includes("Proofa"), "the record keeps no answer's text");
    eq(r.finished.state, "confirmed", "the page said it was received, and both pictures were taken");
  },
});

Deno.test({
  ...opts,
  name: "proof 1: without the before-click picture there is no click; nothing reaches the employer and the application is not sent",
  async fn() {
    if (!guard()) return;
    const r = await drive({ id: APP_A, fault: "before-click" });
    eq(r.posts, [], "nothing reached the employer");
    eq([r.finished.state, r.finished.evidence.reason], ["not_submitted", "BEFORE_CLICK_PROOF_MISSING"]);
  },
});

Deno.test({
  ...opts,
  name: "proof 2: a picture already in the evidence directory (an earlier run's, another application's) is never this click's",
  async fn() {
    if (!guard()) return;
    const stale = new TextEncoder().encode("STALE PICTURE FROM ANOTHER RUN");
    const r = await drive({
      id: APP_A,
      evidenceDir: async (work) => {
        const d = `${work}/evidence`;
        await Deno.mkdir(d, { mode: 0o700 });
        await Deno.chmod(d, 0o700);
        await Deno.writeFile(`${d}/proof-1-before-click.png`, stale);
        await Deno.writeFile(`${d}/proof-3-after-submit.png`, stale);
        return d;
      },
    });
    eq(r.posts, [], "nothing reached the employer: the run was refused before it began");
    eq([r.finished.state, r.finished.evidence.reason], ["not_submitted", "EVIDENCE_DIRECTORY_NOT_EMPTY"], JSON.stringify(r.finished));
    assert(!r.finished.evidence.proof, "no proof was recorded from the stale pictures");
  },
});

Deno.test({
  ...opts,
  name: "proof 3: a proof bound to another application is never kept on this application's record, and it is never confirmed",
  async fn() {
    if (!guard()) return;
    // The picture was captured for application A; the record being finished is application B's.
    const r = await drive({ id: APP_B, tamper: (run) => { if (run.result.proof) run.result.proof = { ...run.result.proof, application_id: APP_A }; } });
    eq(r.posts.length, 1, "the application itself went out (the employer's page took it)");
    assert(!r.finished.evidence.proof, `no foreign proof on this record: ${JSON.stringify(r.finished.evidence)}`);
    eq(r.finished.evidence.proof_refused, "PROOF_NOT_THIS_APPLICATION");
    assert(r.finished.state !== "confirmed", r.finished.state);
  },
});

Deno.test({
  ...opts,
  name: "proof 4: without the after-submit picture the outcome is never confirmed, and why is kept",
  async fn() {
    if (!guard()) return;
    const r = await drive({ id: APP_A, fault: "after-submit" });
    eq(r.posts, ["Proofa"], "the application went out once");
    eq(r.finished.state, "submitted_unconfirmed", JSON.stringify(r.finished));
    eq(r.finished.evidence.proof.after_submit, null);
    assert(String(r.finished.evidence.proof.after_submit_error).length > 0, "the capture's failure is kept, not swallowed");
  },
});

Deno.test("proof: the application id the proof is bound to is a canonical uuid; any other is refused before anything runs", async () => {
  for (const id of ["J1", "local", "11111111-1111-4111-8111-11111111111", "11111111-1111-4111-8111-111111111111x", "11111111-1111-4111-8111-11111111111G"]) {
    const out = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", `${ROOT}/scripts/apply.ts`, "--url", "http://127.0.0.1:9/apply", "--facts", "/nonexistent", "--resume", "/nonexistent", "--application-id", id],
      stdout: "piped", stderr: "piped",
    }).output();
    const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
    assert(/INVALID_ARGUMENTS/.test(text), `${id}: ${text.slice(-300)}`);
  }
});

Deno.test({
  ...opts,
  name: "proof, private: the evidence is kept 0700/0600 where the engine writes it; no answer is printed; the record and the proof hold hashes only",
  async fn() {
    if (!guard()) return;
    // Synthetic only: the person is a test person, the email on a reserved test domain (RFC 2606), and every fact says so.
    assert(Object.values(FACTS.answers).every((a) => /synthetic/.test(a.provenance) && a.factId.startsWith("PROOF-TEST-")));
    assert(FACTS.answers.email.value.endsWith("@example.test"));
    const r = await drive({ id: APP_A, ownDir: true });
    eq(r.posts, ["Proofa"], "the application went out once");
    // Where it is kept: the engine's own evidence directory, created private, every file in it private.
    eq(r.dirMode, 0o700, "the evidence directory is 0700");
    assert(r.disk.length >= 4, JSON.stringify(r.disk.map((d) => d.name)));
    for (const d of r.disk) eq([d.name, d.mode], [d.name, 0o600], `${d.name} is 0600`);
    // The synthetic person's answers are never printed: not on the engine's output (which a worker's or CI's log keeps).
    for (const v of ["Proofa", "proofa.tester@example.test"]) assert(!r.engineOutput.includes(v), `the engine printed ${v}`);
    // The queue's record, and the proof in it, hold hashes and names, never an answer's text.
    for (const v of ["Proofa", "proofa.tester@example.test"]) assert(!JSON.stringify(r.finished.evidence).includes(v), `the record holds ${v}`);
    const held = r.finished.evidence.proof.before_click.fields_sha256;
    assert(Object.values(held).every((h: any) => /^[0-9a-f]{64}$/.test(h)), JSON.stringify(held));
    // The answers themselves are kept in one place only, the private evidence.json the approved run is checked against.
    const withAnswers = r.disk.filter((d) => new TextDecoder().decode(d.bytes).includes("Proofa")).map((d) => d.name);
    eq(withAnswers, ["evidence.json"], "only evidence.json holds an answer's text");
  },
});
