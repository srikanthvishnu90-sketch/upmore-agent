// WO-097: the agent API's HTTP edge. A store stands in for the database doors (their own rules are proven against
// Postgres in tests/db/trainee_agent_api.test.sql); here: the token is hashed before anything leaves the edge, each
// operation answers, a missing scope, a revoked token and a hash mismatch are refused with their status, a fact the store
// returned unconfirmed is never sent, an application whose payload does not hash to its approval is never listed, the
// resume link is short-lived and checked, and no operation can approve anything. Synthetic data only.
import { handleAgentApi, LINK_SECONDS, sha256Hex, TOOLS, type Deps } from "../../supabase/functions/_shared/trainee_agent_api.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";

function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }

const BASE = "https://project.supabase.test/functions/v1/trainee-agent-api";
const TOKEN_A = "tra_" + "A".repeat(64), TOKEN_READ = "tra_" + "r".repeat(64), TOKEN_REVOKED = "tra_" + "x".repeat(64), TOKEN_B = "tra_" + "B".repeat(64);
const ALL = ["read_profile", "read_answers", "read_resume", "read_approved_applications", "report_submission"];
const GRANT_A = "00000000-0000-4000-8000-0000000000a1", GRANT_READ = "00000000-0000-4000-8000-0000000000a2";
const GRANT_REVOKED = "00000000-0000-4000-8000-0000000000a3", GRANT_B = "00000000-0000-4000-8000-0000000000b1";
const APP = "00000000-0000-4000-8000-0000000000c1", APP_BAD = "00000000-0000-4000-8000-0000000000c2", APP_B = "00000000-0000-4000-8000-0000000000c3";
const RESUME = new TextEncoder().encode("TEST resume A");

// A store with the doors' contract: the person comes from the token hash only; refusals are returned, not thrown.
async function world() {
  const grants = new Map<string, { id: string; user: string; scopes: string[]; revoked: boolean }>([
    [await sha256Hex(TOKEN_A), { id: GRANT_A, user: "A", scopes: ALL, revoked: false }],
    [await sha256Hex(TOKEN_READ), { id: GRANT_READ, user: "A", scopes: ["read_profile"], revoked: false }],
    [await sha256Hex(TOKEN_REVOKED), { id: GRANT_REVOKED, user: "A", scopes: ALL, revoked: true }],
    [await sha256Hex(TOKEN_B), { id: GRANT_B, user: "B", scopes: ALL, revoked: false }],
  ]);
  const payload = { version: 1, user_id: "A", job_id: "ok:1", company: "Alpha Co", url: "https://jobs.example.test/ok:1", fields: [{ name: "name", value: "TEST Person", factId: "f1" }],
    privacy_epoch: 1, account_version: 2, expires_at: "2026-10-23T12:00:00.000Z" };
  const jobs = new Map<string, any>([
    [APP, { id: APP, user: "A", payload, payload_hash: await hashApplyPayload(payload), state: "queued", lease: null as string | null }],
    // A row whose stored hash does not match its payload: a store gone wrong must still never list it.
    [APP_BAD, { id: APP_BAD, user: "A", payload: { ...payload, job_id: "bad:1" }, payload_hash: "e".repeat(64), state: "queued", lease: null }],
    [APP_B, { id: APP_B, user: "B", payload: { ...payload, user_id: "B" }, payload_hash: await hashApplyPayload({ ...payload, user_id: "B" }), state: "queued", lease: null }],
  ]);
  const resumeSha = await sha256Hex(RESUME);
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const enter = (h: unknown, scope: string) => {
    const g = typeof h === "string" ? grants.get(h) : undefined;
    if (!g) return { ok: false, refusal: "unauthorized" };
    if (g.revoked) return { ok: false, refusal: "revoked", grant_id: g.id };
    if (!g.scopes.includes(scope)) return { ok: false, refusal: "scope", grant_id: g.id };
    return { ok: true, grant_id: g.id, user: g.user };
  };
  const store = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "trainee_agent_resume_download") {
        const g = [...grants.values()].find((x) => x.id === args.p_grant);
        if (!g) return { ok: false, refusal: "unauthorized" };
        if (g.revoked) return { ok: false, refusal: "revoked", grant_id: g.id };
        if (!g.scopes.includes("read_resume")) return { ok: false, refusal: "scope", grant_id: g.id };
        if (g.user !== "A" || args.p_sha256 !== resumeSha) return { ok: false, refusal: "not_found", grant_id: g.id };
        return { ok: true, grant_id: g.id, filename: "a resume.pdf", sha256: resumeSha, b64: btoa(String.fromCharCode(...RESUME)) };
      }
      const scope = ({ trainee_agent_get_profile: "read_profile", trainee_agent_get_saved_answers: "read_answers", trainee_agent_get_resume: "read_resume",
        trainee_agent_list_approved: "read_approved_applications", trainee_agent_begin_submission: "report_submission",
        trainee_agent_report_submission: "report_submission" } as Record<string, string>)[fn];
      if (!scope) throw new Error(`no such door: ${fn}`);
      const e: any = enter(args.p_token_hash, scope);
      if (!e.ok) return e;
      const mine = (id: unknown) => { const j = jobs.get(String(id)); return j && j.user === e.user ? j : null; };
      if (fn === "trainee_agent_get_profile") {
        // As if the store returned a draft: the edge must still never send it.
        return { ok: true, grant_id: e.grant_id, facts: e.user === "A" ? [
          { id: "f1", kind: "experience", text: "TEST Analyst at Example Co", needs_confirmation: false, status: "confirmed" },
          { id: "f2", kind: "skill", text: "TEST draft skill", needs_confirmation: true, status: "draft" },
          { id: "f3", kind: "education", text: "TEST unconfirmed status", status: "draft" },
        ] : [{ id: "f1", text: "TEST B private fact", needs_confirmation: false }] };
      }
      if (fn === "trainee_agent_get_saved_answers") return { ok: true, grant_id: e.grant_id, answers: [{ key: "fact:sponsorship", answer: e.user === "A" ? "TEST No" : "TEST B" }] };
      if (fn === "trainee_agent_get_resume") {
        if (args.p_sha256 === "c".repeat(64)) return { ok: true, grant_id: e.grant_id, resume: { source: "tailored", sha256: "c".repeat(64), filename: "c.pdf", path: `${e.user}/${"c".repeat(64)}.pdf` } };
        if (args.p_sha256 !== null && args.p_sha256 !== resumeSha) return { ok: false, refusal: "not_found", grant_id: e.grant_id };
        return { ok: true, grant_id: e.grant_id, resume: { source: "kept", sha256: resumeSha, filename: "a resume.pdf", bytes: RESUME.length } };
      }
      if (fn === "trainee_agent_list_approved") {
        return { ok: true, grant_id: e.grant_id, applications: [...jobs.values()].filter((j) => j.user === e.user && j.state === "queued")
          .map((j) => ({ id: j.id, payload: j.payload, payload_hash: j.payload_hash })) };
      }
      if (fn === "trainee_agent_begin_submission") {
        const j = mine(args.p_application);
        if (!j) return { ok: false, refusal: "not_found", grant_id: e.grant_id };
        if (args.p_payload_hash !== j.payload_hash) return { ok: false, refusal: "hash_mismatch", grant_id: e.grant_id };
        if (j.state !== "queued") return { ok: false, refusal: "not_ready", grant_id: e.grant_id };
        j.state = "driving"; j.lease = "00000000-0000-4000-8000-0000000000d1"; j.grant = e.grant_id;
        return { ok: true, grant_id: e.grant_id, application_id: j.id, lease: j.lease, payload_hash: j.payload_hash };
      }
      if (fn === "trainee_agent_report_submission") {
        const j = mine(args.p_application);
        if (!j) return { ok: false, refusal: "not_found", grant_id: e.grant_id };
        if (args.p_payload_hash !== j.payload_hash) return { ok: false, refusal: "hash_mismatch", grant_id: e.grant_id };
        if (j.state !== "driving" || args.p_lease !== j.lease || j.grant !== e.grant_id) return { ok: false, refusal: "not_ready", grant_id: e.grant_id };
        j.state = args.p_outcome === "blocked" ? "needs_user" : "submitted_unconfirmed";
        j.evidence = args.p_evidence;
        return { ok: true, grant_id: e.grant_id, application_id: j.id, state: j.state };
      }
    },
  };
  const signed: { path: string; seconds: number }[] = [];
  const lines: Record<string, unknown>[] = [];
  let clock = Date.parse("2026-10-23T10:00:00Z");
  const deps: Deps = {
    store, linkKey: new TextEncoder().encode("TEST link key, synthetic, 32 bytes+"), baseUrl: BASE, now: () => clock, log: (l) => lines.push(l),
    async signStorage(path, seconds) { signed.push({ path, seconds }); return `https://project.supabase.test/storage/v1/object/sign/career-resumes/${path}?token=TEST`; },
  };
  return { deps, calls, jobs, signed, lines, resumeSha, tick: (ms: number) => { clock += ms; } };
}

const call = (deps: Deps, token: string | null, tool: string, input: unknown = {}, shape: "tool" | "mcp" = "tool") =>
  handleAgentApi(new Request(`${BASE}/call`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(shape === "tool" ? { tool, input } : { name: tool, arguments: input }) }), deps);
const body = async (r: Response) => ({ status: r.status, ...(await r.json()) });

Deno.test("WO-097/1 GET /tools lists the six operations with their scope and input schema; none approves anything", async () => {
  const w = await world();
  const r = await body(await handleAgentApi(new Request(`${BASE}/tools`), w.deps));
  eq(r.status, 200);
  eq(r.tools.map((t: any) => [t.name, t.scope]), [["get_profile", "read_profile"], ["get_saved_answers", "read_answers"], ["get_resume", "read_resume"],
    ["list_approved_applications", "read_approved_applications"], ["begin_submission", "report_submission"], ["report_submission", "report_submission"]]);
  ok(r.tools.every((t: any) => t.input_schema?.type === "object" && typeof t.description === "string"), "every tool has a schema and a description");
  ok(!TOOLS.some((t) => /approv(e|al)_|create|confirm_fact|add_fact|set_/.test(t.name)), "no tool approves, creates or sets anything");
  eq(w.calls.length, 0, "listing the tools touches no data");
});

Deno.test("WO-097/2 the token is hashed before it leaves the edge; a missing, malformed or unknown token reads nothing", async () => {
  const w = await world();
  eq((await body(await call(w.deps, null, "get_profile"))).status, 401);
  eq((await body(await call(w.deps, "Bearer-not-a-token", "get_profile"))).status, 401);
  eq(w.calls.length, 0, "a malformed token never reaches the store");
  const unknown = await body(await call(w.deps, "tra_" + "z".repeat(64), "get_profile"));
  eq([unknown.status, unknown.error], [401, "unauthorized"]);
  await call(w.deps, TOKEN_A, "get_profile");
  const sent = JSON.stringify(w.calls);
  ok(!sent.includes(TOKEN_A) && !sent.includes("tra_"), "the raw token is never sent to the store");
  eq(w.calls.at(-1)!.args, { p_token_hash: await sha256Hex(TOKEN_A) }, "only its SHA-256, and no user id");
  ok(!JSON.stringify(w.lines).includes("tra_"), "nor written to the log");
});

Deno.test("WO-097/3 get_profile sends confirmed facts only, even when the store returns a draft", async () => {
  const w = await world();
  const r = await body(await call(w.deps, TOKEN_A, "get_profile"));
  eq(r.status, 200);
  eq(r.facts.map((f: any) => f.id), ["f1"], "the draft and the fact with a draft status are never sent");
  const b = await body(await call(w.deps, TOKEN_B, "get_profile", {}, "mcp"));
  ok(!JSON.stringify(r).includes("TEST B") && JSON.stringify(b).includes("TEST B private fact"), "each token reads its own person (MCP-style call works)");
  ok(w.lines.every((l) => !JSON.stringify(l).includes("TEST")), "the log holds ids and outcomes, never a fact");
});

Deno.test("WO-097/4 get_saved_answers answers; without its scope it is refused 403; a revoked token is refused 401", async () => {
  const w = await world();
  eq((await body(await call(w.deps, TOKEN_A, "get_saved_answers"))).answers, [{ key: "fact:sponsorship", answer: "TEST No" }]);
  const scope = await body(await call(w.deps, TOKEN_READ, "get_saved_answers"));
  eq([scope.status, scope.error], [403, "scope"]);
  const revoked = await body(await call(w.deps, TOKEN_REVOKED, "get_profile"));
  eq([revoked.status, revoked.error], [401, "revoked"]);
  eq((await body(await call(w.deps, TOKEN_READ, "list_approved_applications"))).status, 403);
  eq((await body(await call(w.deps, TOKEN_READ, "begin_submission", { application_id: APP, payload_hash: "a".repeat(64) }))).status, 403);
  ok(w.lines.some((l) => l.outcome === "scope" && l.grant_id === GRANT_READ), "the refusal is logged with the grant id");
});

Deno.test("WO-097/5 get_resume: a 5-minute signed link and the sha256; the download is checked, expires, and honours revocation", async () => {
  const w = await world();
  const r = await body(await call(w.deps, TOKEN_A, "get_resume"));
  eq([r.status, r.resume.sha256, r.resume.source], [200, w.resumeSha, "kept"]);
  eq(Date.parse(r.resume.expires_at) - Date.parse("2026-10-23T10:00:00Z"), LINK_SECONDS * 1000, "the link lives 5 minutes");
  ok(r.resume.url.startsWith(`${BASE}/resume/download?`) && !r.resume.url.includes("tra_"), "the link carries no token");
  const got = await handleAgentApi(new Request(r.resume.url), w.deps);
  eq(got.status, 200);
  const bytes = new Uint8Array(await got.arrayBuffer());
  eq([await sha256Hex(bytes), got.headers.get("x-content-sha256"), got.headers.get("content-type")], [w.resumeSha, w.resumeSha, "application/pdf"]);
  const tampered = r.resume.url.replace(/sig=([0-9a-f])/, (_: string, c: string) => `sig=${c === "0" ? "1" : "0"}`);
  eq((await handleAgentApi(new Request(tampered), w.deps)).status, 401, "a changed signature downloads nothing");
  const otherFile = r.resume.url.replace(w.resumeSha, "b".repeat(64));
  eq((await handleAgentApi(new Request(otherFile), w.deps)).status, 401, "the signature binds the file's hash");
  w.tick((LINK_SECONDS + 1) * 1000);
  eq((await handleAgentApi(new Request(r.resume.url), w.deps)).status, 401, "an expired link downloads nothing");
  // A link made, then the token revoked: the database refuses the grant at download time.
  const w2 = await world();
  const r2 = await body(await call(w2.deps, TOKEN_A, "get_resume"));
  const store2 = w2.deps.store;
  w2.deps.store = { rpc: (fn, args) => fn === "trainee_agent_resume_download" ? Promise.resolve({ ok: false, refusal: "revoked", grant_id: GRANT_A }) : store2.rpc(fn, args) };
  const after = await body(await handleAgentApi(new Request(r2.resume.url), w2.deps));
  eq([after.status, after.error], [401, "revoked"]);
  // A tailored PDF: the bucket's own signed link, 5 minutes.
  const t = await body(await call(w.deps, TOKEN_A, "get_resume", { sha256: "c".repeat(64) }));
  eq([t.resume.source, w.signed.at(-1)], ["tailored", { path: `A/${"c".repeat(64)}.pdf`, seconds: LINK_SECONDS }]);
  eq((await body(await call(w.deps, TOKEN_A, "get_resume", { sha256: "not-a-hash" }))).status, 400, "a malformed hash never reaches the store");
  eq((await body(await call(w.deps, TOKEN_A, "get_resume", { sha256: "d".repeat(64) }))).status, 404);
});

Deno.test("WO-097/6 list_approved_applications: the exact payload and its hash; a payload that does not hash to its approval is never listed", async () => {
  const w = await world();
  const r = await body(await call(w.deps, TOKEN_A, "list_approved_applications"));
  eq(r.applications.map((a: any) => a.id), [APP], "the bad-hash row is dropped, B's never seen");
  eq(r.applications[0].payload_hash, await hashApplyPayload(r.applications[0].payload));
});

Deno.test("WO-097/7 begin and report: the approved hash only; a mismatch is refused 409; submitted is recorded", async () => {
  const w = await world();
  const h = w.jobs.get(APP).payload_hash;
  const bad = await body(await call(w.deps, TOKEN_A, "begin_submission", { application_id: APP, payload_hash: "a".repeat(64) }));
  eq([bad.status, bad.error], [409, "hash_mismatch"]);
  eq((await body(await call(w.deps, TOKEN_A, "begin_submission", { application_id: APP_B, payload_hash: w.jobs.get(APP_B).payload_hash }))).status, 404, "never another person's application");
  eq((await body(await call(w.deps, TOKEN_A, "begin_submission", { application_id: "nope", payload_hash: h }))).status, 400);
  const claim = await body(await call(w.deps, TOKEN_A, "begin_submission", { application_id: APP, payload_hash: h }));
  eq([claim.status, claim.payload_hash], [200, h]);
  eq((await body(await call(w.deps, TOKEN_A, "begin_submission", { application_id: APP, payload_hash: h }))).status, 409, "claimed once");
  const mism = await body(await call(w.deps, TOKEN_A, "report_submission", { application_id: APP, lease: claim.lease, payload_hash: "a".repeat(64), outcome: "submitted" }));
  eq([mism.status, mism.error], [409, "hash_mismatch"]);
  eq((await body(await call(w.deps, TOKEN_A, "report_submission", { application_id: APP, lease: claim.lease, payload_hash: h, outcome: "approved" }))).status, 400,
    "only submitted or blocked");
  eq((await body(await call(w.deps, TOKEN_A, "report_submission", { application_id: APP, lease: claim.lease, payload_hash: h, outcome: "submitted",
    evidence: { reason: "x", screenshot: "data:..." } }))).status, 400, "evidence is the three named fields only");
  const done = await body(await call(w.deps, TOKEN_A, "report_submission", { application_id: APP, lease: claim.lease, payload_hash: h, outcome: "submitted",
    evidence: { confirmation_id: "TEST-97", page_confirmation: true } }));
  eq([done.status, done.state], [200, "submitted_unconfirmed"]);
  ok(w.lines.some((l) => l.tool === "report_submission" && l.outcome === "ok" && l.application_id === APP && l.grant_id === GRANT_A), "the report is logged by ids");
});

Deno.test("WO-097/8 nothing else: an unknown operation, another method or path, a bad body", async () => {
  const w = await world();
  for (const t of ["approve_application", "add_profile_fact", "confirm_fact"]) {
    const r = await body(await call(w.deps, TOKEN_A, t, {}));
    eq([r.status, r.error], [400, "unknown_tool"], t);
  }
  eq(w.calls.length, 0, "an unknown operation reaches no store door");
  eq((await handleAgentApi(new Request(`${BASE}/call`), w.deps)).status, 405);
  eq((await handleAgentApi(new Request(`${BASE}/elsewhere`), w.deps)).status, 404);
  eq((await handleAgentApi(new Request(`${BASE}/call`, { method: "POST", headers: { authorization: `Bearer ${TOKEN_A}` }, body: "not json" }), w.deps)).status, 400);
  eq((await body(await call(w.deps, TOKEN_A, "get_profile", { user_id: "B" }))).status, 400, "no operation takes a user id");
  const boom = { ...w.deps, store: { rpc: () => Promise.reject(new Error("db down")) } };
  const r = await body(await call(boom, TOKEN_A, "get_profile"));
  eq([r.status, r.error], [500, "internal"]);
});
