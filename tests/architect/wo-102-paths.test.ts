// WO-102 all-paths enforcement: the second judge's submission-quality contract (extension/src/apply_core.ts:
// trustedManifest, contractFill, quarantinedFact, QUARANTINE_VERSION) holds on every other path that can submit:
//   A  the desktop terminal engine (scripts/apply.ts), which every other path below runs;
//   B  the person's own computer (workers/career-browser/approve-first.ts: prepare-batch, run, run-one);
//   C  the cloud worker (workers/career-cloud/worker.ts), which writes approve-first's factsFromPayload for the engine;
//   D  the J10 batch executor's profile source (workers/career-browser/production-sources.cjs).
// A contaminated fixture, an F-033 fact, a legacy fact with no provenance, a forged reserved id, a cross-user fact and a
// conflicting text answer must each stop the application; a clean owner-stated fact set still goes. Synthetic TEST data.
import { createRequire } from "node:module";
import * as Engine from "../../scripts/apply.ts";
import * as Own from "../../workers/career-browser/approve-first.ts";
import { type CloudJob, runCloudJob } from "../../workers/career-cloud/worker.ts";
import { type Manifest, QUARANTINE_VERSION } from "../../extension/src/apply_core.ts";

// Read as namespaces so each test fails on its own where a path does not enforce the contract yet.
const { approvalSources, planApplication, trustedFacts } = Engine as unknown as {
  approvalSources: (fields: any[], m: Manifest) => { name: string; factId: string; event: string; provenance: string; authorizes: boolean; quarantine_version: string }[];
  planApplication: (o: Record<string, unknown>) => any;
  trustedFacts: (facts: unknown, artifact: { sha256: string }) => Manifest;
};
const { factsFromPayload, prepare, runApproved } = Own;
const { engineFacts, payloadTrust } = Own as unknown as { engineFacts: (facts: unknown, rows: unknown[]) => any; payloadTrust: (p: unknown) => string[] };

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const OWNER = "TEST-owner";
const NOW = Date.UTC(2026, 9, 21);
const ARTIFACT = { filename: "TEST-resume.pdf", sha256: "b".repeat(64) };
const JOB = "lever:test-co:1111-2222";
const SPONS = "Will you now or in the future require visa sponsorship?";
const CERT = "I certify that the information in this application is true and complete";
// The schema as scripts/apply.ts binds a page (scripts/career/form-bind.ts).
const SCHEMA = [
  { name: "fn", label: "First name", type: "text", required: true, options: [] },
  { name: "ln", label: "Last name", type: "text", required: true, options: [] },
  { name: "email", label: "Email", type: "email", required: true, options: [] },
  { name: "resume", label: "Resume/CV", type: "file", required: true, options: [] },
  { name: "spons", label: SPONS, type: "radio", required: true, options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }] },
  { name: "li", label: "LinkedIn Profile", type: "text", required: false, options: [] },
];
const own = (factId: string, value: string, extra: Record<string, unknown> = {}) =>
  ({ value, factId, confirmed: true, user_id: OWNER, provenance: "owner stated in chat 2026-10-18", confirmation_event_id: `evt-${factId}`, ...extra });
const CLEAN = {
  user_id: OWNER,
  answers: {
    first_name: own("F-001", "Test"), last_name: own("F-002", "Person"), email: own("F-003", "test.person@example.test"),
    sponsorship: own("F-005", "No"), linkedin: own("F-007", "https://www.linkedin.com/in/test-person"),
  },
  saved: {},
};
function plan(facts: unknown, schema = SCHEMA) {
  const manifest = trustedFacts(facts, ARTIFACT);
  return { manifest, r: planApplication({ manifest, userId: OWNER, jobId: JOB, employer: "test-co", schema, artifact: ARTIFACT, now: NOW }) };
}
const asked = (r: any, re: RegExp) => !r.ready && r.needs.some((n: any) => re.test(n.label));
// The contaminations every path must stop, each on the required sponsorship question.
const CONTAMINATED: [string, (f: any) => void][] = [
  ["an agent-invented fact (F-033)", (f) => f.answers.sponsorship = own("F-033", "No")],
  ["the answer-all delegation's provenance under a new id", (f) => f.answers.sponsorship = own("F-200", "No", { provenance: "owner-delegated 2026-10-17 (answer-all directive)" })],
  ["a legacy fact with no provenance", (f) => f.answers.sponsorship = { value: "No", factId: "F-010", confirmed: true }],
  ["a fact with no confirmation event", (f) => f.answers.sponsorship = own("F-011", "No", { confirmation_event_id: "" })],
  ["a forged reserved id (a file fact posing as a text answer)", (f) => f.answers.sponsorship = own("text-answer:12", "No")],
  ["a forged reserved id (posing as the picked resume)", (f) => f.answers.sponsorship = own("approved-local-resume:abc", "No")],
  ["a fact derived from a quarantined one", (f) => f.answers.sponsorship = own("F-090", "No", { derived_from: ["F-033"] })],
  ["a confirmed:true label alone", (f) => f.answers.sponsorship = { value: "No", factId: "F-012", confirmed: true, provenance: "inferred by Trainee from the resume", confirmation_event_id: "evt-x" }],
];

// ------------------------------------------------------------------------------------------- A: scripts/apply.ts
Deno.test("WO-102-paths/A1 the terminal engine sends a clean owner-stated fact set, each answer with its source", () => {
  const { manifest, r } = plan(CLEAN);
  assert(r.ready, JSON.stringify(r));
  assert(r.fields.map((f: any) => f.name).sort().join() === "email,fn,li,ln,resume,spons", JSON.stringify(r.fields));
  const src = approvalSources(r.fields, manifest);
  assert(src.length === 6 && src.every((s) => s.event && s.provenance), JSON.stringify(src));
  assert(src.find((s) => s.name === "spons")!.factId === "F-005" && src.find((s) => s.name === "resume")!.factId === "approved-local-resume:" + ARTIFACT.sha256);
});

Deno.test("WO-102-paths/A2 the terminal engine stops every contaminated fact: the required question is asked, nothing is sent", () => {
  for (const [what, spoil] of CONTAMINATED) {
    const f = clone(CLEAN);
    spoil(f);
    const { manifest, r } = plan(f);
    assert(!manifest.answers.sponsorship, `${what}: kept`);
    assert(asked(r, /sponsorship/), `${what}: not asked: ${JSON.stringify(r)}`);
  }
});

Deno.test("WO-102-paths/A3 a cross-user fact or text answer stops the terminal engine", () => {
  const f = clone(CLEAN);
  (f.answers as any).email = own("F-003", "x@example.test", { user_id: "TEST-someone-else" });
  let code = "";
  try {
    plan(f);
  } catch (e: any) {
    code = e.code;
  }
  assert(code === "FACT_OWNER_MISMATCH", code);
  const g = { ...clone(CLEAN), text_answers: [{ id: "9", key: "fact:email", kind: "fact", answer: "x@example.test", user_id: "TEST-someone-else" }] };
  code = "";
  try {
    plan(g);
  } catch (e: any) {
    code = e.code;
  }
  assert(code === "FACT_OWNER_MISMATCH", code);
});

Deno.test("WO-102-paths/A4 a text answer that disagrees with the file is asked again, never silently beaten by the file", () => {
  const conflict = { ...clone(CLEAN), text_answers: [{ id: "41", key: "fact:sponsorship", kind: "fact", answer: "Yes" }] };
  const { manifest, r } = plan(conflict);
  assert(manifest.conflicts.some((c) => c.key === "sponsorship") && asked(r, /sponsorship/), JSON.stringify(r));
  const same = { ...clone(CLEAN), text_answers: [{ id: "42", key: "fact:sponsorship", kind: "fact", answer: "no" }] };
  assert(plan(same).r.ready, "the same answer twice is no conflict");
});

Deno.test("WO-102-paths/A5 an attestation goes only on the owner's own answer to it; an optional unknown stays empty", () => {
  const schema = [...SCHEMA, { name: "cert", label: CERT, type: "checkbox", required: true, options: [] }];
  const f = clone(CLEAN) as any;
  f.saved[CERT.toLowerCase()] = own("F-020", "Yes");
  const a = plan(f, schema);
  assert(a.manifest.saved[CERT.toLowerCase()], "the fact itself is kept");
  assert(asked(a.r, /certify/) && a.r.needs.some((n: any) => /your own answer/.test(n.why ?? "")), "a standing fact does not attest: " + JSON.stringify(a.r));
  f.saved[CERT.toLowerCase()] = own("F-020", "Yes", { authorizes: true });
  const b = plan(f, schema).r;
  assert(b.ready && b.fields.some((x: any) => x.name === "cert"), JSON.stringify(b));
  // An optional answer the contract cannot stand behind is left empty, not guessed.
  const g = clone(CLEAN) as any;
  g.answers.linkedin = own("F-033", "https://www.linkedin.com/in/test-person");
  const c = plan(g).r;
  assert(c.ready && !c.fields.some((x: any) => x.name === "li"), JSON.stringify(c));
});

Deno.test("WO-102-paths/A6 the engine's approval binds each answer's fact, event, provenance and the quarantine version", () => {
  const { manifest, r } = plan(CLEAN);
  assert(r.ready);
  const f = clone(CLEAN) as any;
  f.answers.sponsorship = own("F-005", "No", { confirmation_event_id: "evt-other" });
  const other = plan(f);
  assert(other.r.ready);
  const a = JSON.stringify(approvalSources(r.fields, manifest)), b = JSON.stringify(approvalSources(other.r.fields, other.manifest));
  assert(a !== b, "another confirmation event is another approval");
  assert(approvalSources(r.fields, manifest).every((s) => s.quarantine_version === QUARANTINE_VERSION));
});

Deno.test("WO-102-paths/A7 the engine reads its facts through the contract, never through a confirmed:true filter", async () => {
  const src = await Deno.readTextFile(new URL("../../scripts/apply.ts", import.meta.url));
  assert(!/function confirmed\(/.test(src), "the old confirmed:true filter is gone");
  assert(/trustedFacts\(facts, artifact\)/.test(src) && /planApplication\(\{/.test(src), "runApply plans through the contract");
});

// ------------------------------------------------------------------------------- B: the person's own computer
// An approved payload as the contract prepares it: each answer with its source, so the run can be checked again.
async function preparedPayload(facts: unknown = CLEAN, rows: unknown[] = []) {
  const manifest = trustedFacts(engineFacts(facts, rows as any), ARTIFACT);
  const r = planApplication({ manifest, userId: OWNER, jobId: JOB, employer: "test-co", schema: SCHEMA, artifact: ARTIFACT, now: NOW });
  assert(r.ready, JSON.stringify(r));
  const evidence = {
    approval_hash: "a".repeat(64), readback: {}, fields: r.fields, sources: Object.fromEntries(r.fields.map((x: any) => [x.factId, manifest.byFactId[x.factId]])),
    trust: { quarantine_version: manifest.version, manifest_hash: manifest.hash },
    payload: { user_id: OWNER, posting: JOB, company: "test-co", destination: "https://jobs.lever.co/test-co/1111-2222/apply", resume: ARTIFACT, page_fields: {} },
  };
  const p = await prepare({ url: "https://jobs.lever.co/test-co/1111-2222", factsPath: "f", resumePath: "r", account: { epoch: 1, version: 1 }, now: NOW,
    runEngine: async () => ({ result: { state: "not_submitted", reason: "dry_run" }, evidence }) });
  assert(p.ready);
  return { payload: p.payload, sources: approvalSources(r.fields, manifest) };
}
const replan = (facts: unknown) => plan(facts);

Deno.test("WO-102-paths/B1 prepare-batch hands the engine the texted answers beside the file, so a conflict is asked", () => {
  const rows = [{ id: "41", key: "fact:sponsorship", kind: "fact", answer: "Yes" }];
  const facts = engineFacts(clone(CLEAN), rows);
  assert((facts as any).answers.sponsorship.factId === "F-005" && (facts as any).text_answers.length === 1, "nothing merged, nothing dropped");
  assert(asked(plan(facts).r, /sponsorship/), "the file does not silently win over his texted answer");
});

Deno.test("WO-102-paths/B2 an approved run rebuilds the same trusted answers from the payload, so the approval reproduces", async () => {
  // LinkedIn is his texted answer only, so the run must carry it back as his answer row, not as a file fact.
  const file = clone(CLEAN) as any;
  delete file.answers.linkedin;
  const { payload, sources } = await preparedPayload(file, [{ id: "77", key: "fact:linkedin", kind: "fact", answer: "https://www.linkedin.com/in/test-person" }]);
  assert(payload.quarantine_version === QUARANTINE_VERSION && payload.fields.every((f: any) => f.provenance && f.confirmation_event_id), JSON.stringify(payload.fields));
  assert(payload.fields.find((f: any) => f.name === "li").factId === "text-answer:77" && factsFromPayload(payload).text_answers?.[0]?.key === "fact:linkedin", JSON.stringify(payload.fields));
  assert(payloadTrust(payload).length === 0, JSON.stringify(payloadTrust(payload)));
  const again = replan(factsFromPayload(payload));
  assert(again.r.ready, JSON.stringify(again.r));
  assert(JSON.stringify(approvalSources(again.r.fields, again.manifest)) === JSON.stringify(sources), "the same sources, so the same approval");
});

Deno.test("WO-102-paths/B3 an approved payload carrying a quarantined, delegated or forged answer never reaches the engine", async () => {
  const { payload } = await preparedPayload();
  const spoil: [string, (p: any) => void][] = [
    ["F-033", (p) => p.fields.find((f: any) => f.name === "spons").factId = "F-033"],
    ["the delegation's provenance", (p) => p.fields.find((f: any) => f.name === "spons").provenance = "owner-delegated 2026-10-17 (answer-all)"],
    ["derived from F-047", (p) => p.fields.find((f: any) => f.name === "spons").derived_from = ["F-047"]],
    ["an older quarantine version", (p) => p.quarantine_version = "d007-v0"],
    ["a forged text answer with no source", (p) => { const f = p.fields.find((x: any) => x.name === "spons"); f.factId = "text-answer:5"; delete f.source; }],
  ];
  for (const [what, s] of spoil) {
    const p = clone(payload);
    s(p);
    assert(payloadTrust(p).length > 0, `${what}: not refused`);
    const calls: string[][] = [], finished: any[] = [];
    await runApproved({
      claim: async () => [{ id: "J1", lease_token: "L1", url: p.url, payload: { ...p, engine_approval: "a".repeat(64), resume_sha256: ARTIFACT.sha256 } }],
      finish: async (_i, _l, state, ev) => void finished.push({ state, reason: ev.reason }),
      resumeFor: async () => ({ path: "/r.pdf", sha256: ARTIFACT.sha256 }),
      writeFacts: async () => "/facts.json",
      runEngine: async (args) => (calls.push(args), { result: { state: "confirmed" }, evidence: {} }),
    });
    assert(calls.length === 0 && finished[0].state === "not_submitted", `${what}: ${JSON.stringify(finished)}`);
  }
});

Deno.test("WO-102-paths/B4 a legacy payload (no provenance) or one whose facts were spoiled is stopped by the engine it runs", async () => {
  const legacy = { user_id: OWNER, fields: [{ name: "spons", label: SPONS, value: "0", factId: "F-005" }, { name: "fn", label: "First name", value: "Test", factId: "F-001" }] };
  assert(asked(replan(factsFromPayload(legacy)).r, /sponsorship|First name/), "a legacy approval is asked again");
  const { payload } = await preparedPayload();
  const p = clone(payload);
  p.fields.find((f: any) => f.name === "spons").confirmation_event_id = "";
  assert(asked(replan(factsFromPayload(p)).r, /sponsorship/), "no event, no answer");
  const q = clone(payload);
  q.user_id = "TEST-someone-else";
  q.fields.find((f: any) => f.name === "spons").user_id = OWNER;
  let code = "";
  try {
    replan(factsFromPayload(q));
  } catch (e: any) {
    code = e.code;
  }
  assert(code === "FACT_OWNER_MISMATCH", "another person's payload is refused: " + code);
});

Deno.test("WO-102-paths/B5 the desktop prepare-batch no longer merges texted answers under the file's facts", async () => {
  const src = await Deno.readTextFile(new URL("../../workers/career-browser/approve-first.ts", import.meta.url));
  assert(!/=\s*factsWithTextAnswers\(/.test(src), "factsWithTextAnswers (the file silently wins) is not on a submission path");
  assert(/engineFacts\(/.test(src));
});

// --------------------------------------------------------------------------------------------- C: the cloud worker
// The real engine's decision (scripts/apply.ts trustedFacts + planApplication) on the facts the cloud worker wrote.
function contractEngine(seen: string[]) {
  return async (args: string[]) => {
    const facts = JSON.parse(await Deno.readTextFile(args[args.indexOf("--facts") + 1]));
    seen.push("ran");
    const { r } = plan(facts);
    return r.ready
      ? { result: { state: "submitted_unconfirmed", reason: "acknowledged" }, evidence: { post: { status: 200, mutations: 1 } } }
      : { result: { state: "not_submitted", reason: "needs_answers", fields: r.needs.map((n: any) => n.label) }, evidence: null };
  };
}
async function cloud(payload: any) {
  const RES = new TextEncoder().encode("%PDF-1.4 TEST resume");
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", RES))).map((n) => n.toString(16).padStart(2, "0")).join("");
  const job: CloudJob = { id: "c1", lease_token: "l1", user_id: OWNER, company: "test-co", url: payload.url,
    payload: { ...payload, engine_approval: "a".repeat(64), resume_sha256: sha } };
  const finished: any[] = [], seen: string[] = [];
  await runCloudJob(job, {
    queue: { claim: async () => [], resume: async () => ({ filename: "r.pdf", sha256: sha, b64: btoa(String.fromCharCode(...RES)) }),
      finish: async (_j, state, evidence) => void finished.push({ state, evidence }), gatePresent: async () => true },
    runEngine: contractEngine(seen), log: () => {},
  });
  return { state: finished[0].state, ran: seen.length };
}

Deno.test("WO-102-paths/C1 the cloud worker's facts go through the same contract: contaminated stops, clean goes", async () => {
  const { payload } = await preparedPayload();
  assert((await cloud(payload)).state === "submitted_unconfirmed", "a clean approved application goes");
  const p = clone(payload);
  p.fields.find((f: any) => f.name === "spons").factId = "F-033";
  const a = await cloud(p);
  assert(a.state === "not_submitted", "F-033 stops it: " + JSON.stringify(a));
  const legacy = clone(payload);
  for (const f of legacy.fields) delete f.provenance;
  assert((await cloud(legacy)).state === "not_submitted", "a legacy answer with no provenance stops it");
  const forged = clone(payload);
  Object.assign(forged.fields.find((f: any) => f.name === "spons"), { factId: "approved-local-resume:abc" });
  assert((await cloud(forged)).state === "not_submitted", "a forged reserved id stops it");
});

// ----------------------------------------------------------------------- D: the J10 batch executor's profile source
const require = createRequire(import.meta.url);
const { portalProfileFromMaster } = require("../../workers/career-browser/production-sources.cjs");
const fact = (id: string, name: string, value: string, extra: Record<string, unknown> = {}) =>
  ({ id, kind: "eligibility", status: "confirmed", name, value, provenance: "owner stated in chat 2026-10-18", confirmation_event_id: `evt-${id}`, ...extra });
const BASICS = { name: "Test Person", email: "test.person@example.test", provenance: "owner typed in onboarding", confirmation_event_id: "evt-basics" };

Deno.test("WO-102-paths/D1 the batch executor's profile derives only from facts the contract keeps", () => {
  const clean = portalProfileFromMaster({ basics: BASICS, facts: [fact("F-020", "Work authorization (US)", "Yes"), fact("F-021", "Sponsorship requirement", "No")] }, NOW, OWNER);
  assert(clean.answers.sponsorship?.value === "No" && clean.answers.work_authorization?.value === "Yes" && clean.email === BASICS.email, JSON.stringify(clean));
  const spoiled: [string, any][] = [
    ["F-033", fact("F-033", "Sponsorship requirement", "No")],
    ["delegated", fact("F-201", "Sponsorship requirement", "No", { provenance: "owner-delegated (answer-all)" })],
    ["legacy, no provenance", { id: "F-T-021", kind: "eligibility", status: "confirmed", name: "Sponsorship requirement", value: "No" }],
    ["forged reserved id", fact("text-answer:3", "Sponsorship requirement", "No")],
    ["another person's", fact("F-021", "Sponsorship requirement", "No", { user_id: "TEST-someone-else" })],
  ];
  for (const [what, f] of spoiled) {
    const p = portalProfileFromMaster({ basics: BASICS, facts: [f] }, NOW, OWNER);
    assert(!p.answers.sponsorship, `${what}: derived ${JSON.stringify(p.answers)}`);
  }
  const unproven = portalProfileFromMaster({ basics: { name: "Test Person", email: "test.person@example.test" }, facts: [] }, NOW, OWNER);
  assert(unproven.name === null && unproven.email === null, "identity from basics only with his own confirmation: " + JSON.stringify(unproven));
});
