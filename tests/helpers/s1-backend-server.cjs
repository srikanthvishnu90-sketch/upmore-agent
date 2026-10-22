"use strict";
// #11-3 helper: the fake batch backend as its own PROCESS, over HTTP —
// the same RPC semantics as tests/career-batch-ledger-race.test.cjs
// (whole-array v1 save; v2 append merged under a mutex, deduped by
// canonicalKey + confirmation identity), so multiple executor
// processes can share one store exactly like production's PostgREST.
// Test-only introspection: GET /state. Seeding: POST /seed-intent.
// Usage: node tests/helpers/s1-backend-server.cjs  -> prints PORT <n>
const http = require("node:http");

const intents = new Map();
const runs = new Map();
const ledgers = new Map();
let mutex = Promise.resolve();
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const hop = () => new Promise((r) => setImmediate(r));

async function rpc(name, a) {
  await hop();
  switch (name) {
    case "career_batch_pending_v1": {
      const out = [];
      for (const [intentId, i] of intents) if (i.state === "queued") out.push({ userId: i.userId, intentId, binding: clone(i.binding), request: clone(i.request) });
      return { intents: out };
    }
    case "career_batch_claim_v1": {
      // synchronous claim flip inside one process: atomic by construction,
      // like the SQL function's advisory lock + row update
      const i = intents.get(a.p_intent);
      if (!i || i.state !== "queued") return { claimed: false };
      i.state = "claimed"; i.leaseToken = "lease-" + a.p_intent;
      return { claimed: true, leaseToken: i.leaseToken, binding: clone(i.binding), request: clone(i.request) };
    }
    case "career_batch_finish_v1": {
      const i = intents.get(a.p_intent);
      if (i) { i.state = a.p_state; i.result = clone(a.p_result); }
      return { finished: true };
    }
    case "career_batch_save_run_v1": { runs.set(a.p_run.runId, clone(a.p_run)); return { saved: true }; }
    case "career_batch_result_v1": { const r = runs.get(a.p_run); return { batch: r ? clone(r) : null }; }
    case "career_batch_ledger_v1": return { records: clone(ledgers.get(a.p_user) || []) };
    case "career_batch_save_ledger_v1": { ledgers.set(a.p_user, clone(a.p_records || [])); return { saved: true }; }
    case "career_batch_append_ledger_v2": {
      const run = async () => {
        const cur = ledgers.get(a.p_user) || [];
        const keyOf = (r) => `${r.canonicalKey}|${r.confirmationId || r.timestamp}`;
        const seen = new Set(cur.map(keyOf));
        const merged = cur.slice();
        for (const rec of a.p_records || []) { const k = keyOf(rec); if (!seen.has(k)) { seen.add(k); merged.push(clone(rec)); } }
        ledgers.set(a.p_user, merged);
        return { records: clone(merged), appended: merged.length - cur.length };
      };
      mutex = mutex.then(run, run);
      return mutex;
    }
    default: throw new Error("unexpected RPC " + name);
  }
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => { body += d; });
  req.on("end", async () => {
    try {
      if (req.url === "/state") {
        const li = {};
        for (const [u, r] of ledgers) li[u] = r;
        const ii = {};
        for (const [id, i] of intents) ii[id] = { state: i.state, result: i.result || null };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ledgers: li, intents: ii, runIds: [...runs.keys()] }));
        return;
      }
      const j = body ? JSON.parse(body) : {};
      if (req.url === "/seed-intent") {
        intents.set(j.intentId, { userId: j.userId, binding: j.binding, request: j.request || null, state: "queued", leaseToken: null });
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ seeded: j.intentId })); return;
      }
      if (req.url === "/rpc") {
        const data = await rpc(j.name, j.args || {});
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); return;
      }
      res.writeHead(404); res.end();
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: String((e && e.message) || e) }));
    }
  });
});
server.listen(0, "127.0.0.1", () => console.log("PORT " + server.address().port));
