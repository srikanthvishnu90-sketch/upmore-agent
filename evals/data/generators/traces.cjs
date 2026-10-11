#!/usr/bin/env node
// Tool-use trace generator (Instinct spec doc 12, dataset 3).
//   node evals/data/generators/traces.cjs      writes evals/data/traces/traces.json
// One ordered call graph per registry capability, captured by RUNNING the
// operating model (packages/domain/43-agent-loop.js) against in-memory fake
// connectors, not written as prose. The tier decides the path: T0/T1 read and
// answer, T2 draft and approve, T3/T5 confirm then write then verify, T4 act
// inside an envelope, GATED stop at the gate. verification_step points at the
// read-back from the source of truth (the connector verify, or the read itself
// for an inform capability, or the gate for a capability that cannot act).
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..", "..");
const AgentLoop = require(path.join(root, "packages/domain/43-agent-loop.js"));
const DataGuard = require(path.join(root, "packages/domain/47-data-guard.js"));
const registry = JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")).capabilities;
const T0 = Date.UTC(2025, 9, 9, 6, 13, 20); // fixed clock so traces are reproducible

async function trace(cap) {
  const calls = []; let step = 0;
  const call = (name, input, output) => calls.push({ step: ++step, call: name, input: input || {}, output: output || {} });
  const assumed = cap.status === "GATED" ? "GATED" : "TESTED"; // traces show the path once built; gated stays gated
  const reg = { get: id => id === cap.id ? Object.assign({}, cap, { status: assumed }) : null, answer: id => ({ text: `${cap.name} is blocked until a licensed partner or rail is in place${cap.gate_reason ? ": " + cap.gate_reason : ""}.` }) };
  const connectors = {
    read: async (id, p) => { const out = { value: { amount_cents: 421208, memo: "Rent October" }, source: "Example Bank", as_of: T0 - 60000 }; call("connectors.read", { capability_id: id, params: p }, Object.assign({}, out, { as_of: new Date(out.as_of).toISOString() })); return out; },
    write: async (id, p, key) => { const out = { reference: "ref-1001" }; call("connectors.write", { capability_id: id, params: p, idempotency_key: key }, out); return out; },
    verify: async (id, key, ref) => { const out = { confirmed: true, source: "Example Bank" }; call("connectors.verify", { capability_id: id, idempotency_key: key, reference: ref }, out); return out; }
  };
  const now = { t: T0 };
  const envelopes = cap.tier === "T4" ? [{ id: "env-1", capability_id: cap.id, max_cents: 10000, active: true }] : [];
  const loop = AgentLoop.create({ registry: reg, connectors, clock: () => now.t, envelopes, guard: DataGuard, freshness_ms: 3600000 });
  const money = cap.tier !== "T0" && cap.tier !== "T1";
  const request = money
    ? { capability_id: cap.id, key: "trace", amount_cents: 4000, recipient: "Marcus L", params: { amount_cents: 4000, recipient: "Marcus L" }, describe: `${cap.name}: $40.00 to Marcus L`, confirm: { action: cap.name, amount: "$40.00", recipient: "Marcus L", from: "checking", fee: null, when: "now" } }
    : { capability_id: cap.id, params: { account: "checking" }, lead: v => `${cap.name}: ${JSON.stringify(v)}` };
  call("observe", { kind: "message", request: money ? request.describe : `${cap.name} (checking)` });
  call("registry.get", { id: cap.id }, { tier: cap.tier, status: assumed });
  const r1 = await loop.wake({ kind: "message", request });
  let verification_step;
  if (r1.outcome === "blocked") { call("gate", { tier: cap.tier, status: assumed }, { allowed: false, reason: r1.reason }); verification_step = step; call("compose.blocked", {}, { message: r1.message }); }
  else if (r1.outcome === "answer") { verification_step = calls.findIndex(c => c.call === "connectors.read") + 1; call("memory.remember", { store: "facts" }, { source: "Example Bank" }); call("compose.answer", {}, { message: r1.message }); }
  else if (r1.outcome === "awaiting_confirmation") {
    call("gate", { tier: cap.tier }, { allowed: true, confirm: true, draft_only: r1.draft_only });
    call(r1.draft_only ? "compose.draft" : "compose.confirm", {}, { message: r1.message });
    call("user.confirmation", { confirmation_id: r1.confirmation_id }, { approved: true });
    if (r1.draft_only) verification_step = step;
    const r2 = await loop.wake({ kind: "confirmation", confirmation_id: r1.confirmation_id, approved: true });
    if (r2.outcome === "draft_approved") { call("memory.remember", { store: "outcomes", result: "draft_approved" }, {}); call("compose.draft_approved", {}, { message: r2.message }); }
    else { verification_step = calls.findIndex(c => c.call === "connectors.verify") + 1; call("memory.remember", { store: "outcomes", result: r2.outcome }, {}); call("compose.receipt", {}, { message: r2.message }); }
  } else if (r1.outcome === "confirmed") { // T4 inside the envelope
    calls.splice(2, 0, { step: 3, call: "gate", input: { tier: cap.tier, envelope: "env-1" }, output: { allowed: true, confirm: false } }); calls.forEach((c, i) => c.step = i + 1); step = calls.length;
    verification_step = calls.findIndex(c => c.call === "connectors.verify") + 1; call("memory.remember", { store: "outcomes", result: "confirmed" }, {}); call("compose.receipt", {}, { message: r1.message });
  } else throw new Error(`${cap.id}: unexpected outcome ${r1.outcome}`);
  return { capability_id: cap.id, tier: cap.tier, assumed_status: assumed, request: money ? request.describe : `${cap.name} (checking)`, calls, verification_step, transitions: loop.log.map(e => `${e.from}->${e.to}`), final_state: loop.state };
}

async function generate() {
  const traces = [];
  for (const cap of registry) traces.push(await trace(cap));
  return { schema_version: 1, generated_by: "evals/data/generators/traces.cjs", generated_from: "packages/domain/43-agent-loop.js run with in-memory connectors, fixed clock", traces };
}
if (require.main === module) generate().then(out => {
  const file = path.join(root, "evals/data/traces/traces.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
  const byTier = out.traces.reduce((m, t) => (m[t.tier] = (m[t.tier] || 0) + 1, m), {});
  console.log(`traces: ${out.traces.length} capabilities ${JSON.stringify(byTier)} -> ${path.relative(root, file)}`);
}).catch(e => { console.error(e); process.exit(1); });
module.exports = { generate, trace };
