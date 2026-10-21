import { githubMeterPublisher, LiveCostMeter, validatePublicMeter, type MeterBinding, type PublicMeter } from "../evals/brain-reliability/live-meter.ts";
import { BudgetJournal, recoverJournal } from "../evals/brain-reliability/run-comparison.ts";
const assert = (ok: unknown, why = "assertion failed") => { if (!ok) throw new Error(why); };
async function refuses(fn: () => unknown | Promise<unknown>) { let refused = false; try { await fn(); } catch { refused = true; } assert(refused, "expected refusal"); }
const SECRET = "SEALED_CASE_PROMPT_REPLY_RUBRIC_DO_NOT_PUBLISH", TOKEN = "GITHUB_TOKEN_SYNTHETIC_DO_NOT_PUBLISH";
const binding: MeterBinding = { repository: "synthetic/eval", run_id: "123456", source_commit: "a".repeat(40), corpus_sha256: "b".repeat(64),
  model: "gpt-5", cap_usd: 8, comparison_spent_usd: 2.258950 };
const receipt = () => ({ commit_sha: "c".repeat(40), content_sha: "d".repeat(40), url: "https://github.com/synthetic/eval/blob/" + "c".repeat(40) + "/cost.json" });
function fixture(publish?: (p: PublicMeter) => Promise<ReturnType<typeof receipt>>) {
  let now = Date.parse("2026-10-21T21:00:00Z"); const sent: PublicMeter[] = [], events: any[] = [];
  const meter = new LiveCostMeter(binding, publish ?? (async p => { sent.push(JSON.parse(JSON.stringify(p))); return receipt(); }), () => now);
  const append = (event: Record<string, unknown>) => { events.push(event); meter.observe(event); };
  append({ type: "arm", model: binding.model, approval: { cap_usd: 8, comparison_spent_usd: 2.258950 },
    identity: { source_commit: binding.source_commit, corpus_sha256: binding.corpus_sha256, private: SECRET } });
  append({ type: "preflight", status: "available" });
  const journal = new BudgetJournal(8e6, append);
  let serial = 0;
  const reserve = (reserve_micros = 1e6) => {
    const meta: any = { case_id: SECRET + ++serial, category: "help_scope", model: "gpt-5", role: "brain", turn: 0 };
    const id = journal.reserve(meta, reserve_micros);
    return { settle: (usage: any) => journal.settle(id, meta, usage, 1) };
  };
  return { meter, sent, events, append, journal, reserve, advance: (n: number) => now += n, raw: () => events.map(e => JSON.stringify(e)).join("\n") + "\n" };
}
Deno.test("live meter: initial publication is source/run/model/cap bound and safe", async () => {
  const f = fixture(); await f.meter.flush(true); const p = f.sent[0]; validatePublicMeter(p);
  assert(p.run_id === binding.run_id && p.source_commit === binding.source_commit && p.model === "gpt-5" && p.cap_usd === 8);
  assert(p.known_cost_usd === 0 && p.held_reservations_usd === 0 && p.combined_known_cost_usd === 2.258950 && !p.total_cost_final);
  assert(p.alert_delivery === "ARTIFACT_ONLY" && p.threshold_crossed_at === null && !JSON.stringify(p).includes(SECRET) && !JSON.stringify(p).includes(TOKEN));
});
Deno.test("live meter: exact settlements and retained reservations remain separate", async () => {
  const f = fixture(); await f.meter.flush(true); f.reserve(1e6).settle({ input_tokens: 400000, output_tokens: 0 }); f.reserve(2e6);
  f.advance(15000); await f.meter.flush(); const p = f.sent.at(-1)!;
  assert(p.known_cost_usd === .5 && p.held_reservations_usd === 2 && p.combined_exposure_usd === 4.758950 && p.settled_calls === 1 && p.unsettled_calls === 1);
  assert(!p.total_cost_final && p.threshold_crossed_at === null);
});
Deno.test("live meter: periodic fake clock is bounded and has monotone sequences", async () => {
  const f = fixture(); await f.meter.flush(true); f.advance(14999); await f.meter.flush(); assert(f.sent.length === 1);
  f.advance(1); await f.meter.flush(); assert(f.sent.length === 2 && f.sent[1].sequence === 2);
  f.advance(15000); await f.meter.flush(); assert(f.sent[2].sequence === 3 && Date.parse(f.sent[2].observed_at) > Date.parse(f.sent[1].observed_at));
});
Deno.test("live meter: reservation exposure at six does not invent a settled crossing", async () => {
  const f = fixture(); await f.meter.flush(true); f.reserve(5e6).settle({ input_tokens: 4000000, output_tokens: 0 }); f.reserve(1e6);
  await f.meter.flush(true); const p = f.sent.at(-1)!;
  assert(p.known_cost_usd === 5 && p.held_reservations_usd === 1 && p.threshold_crossed_at === null);
});
Deno.test("live meter: six-dollar crossing publishes immediately once, even inside interval", async () => {
  const f = fixture(); await f.meter.flush(true); f.reserve(5e6).settle({ input_tokens: 4000000, output_tokens: 0 });
  f.advance(250); f.reserve(1e6).settle({ input_tokens: 800000, output_tokens: 0 }); await f.meter.flush();
  assert(f.sent.length === 2 && f.sent[1].known_cost_usd === 6 && f.sent[1].threshold_crossed_at === "2026-10-21T21:00:00.250Z");
  f.advance(100); f.reserve(10000).settle({ input_tokens: 100, output_tokens: 0 }); await f.meter.flush(); assert(f.sent.length === 2);
  f.advance(15000); await f.meter.flush(); assert(f.sent[2].threshold_crossed_at === f.sent[1].threshold_crossed_at);
});
Deno.test("live meter: before-dispatch awaits publication acknowledgement", async () => {
  let acknowledge!: (r: ReturnType<typeof receipt>) => void, paid = 0;
  const f = fixture(async () => await new Promise(resolve => acknowledge = resolve)); f.reserve(1000);
  const request = f.meter.wrapRequest((async () => { paid++; return new Response("{}"); }) as typeof fetch);
  const pending = request("https://provider.example.test"); await Promise.resolve(); await Promise.resolve(); assert(paid === 0);
  acknowledge(receipt()); await pending; assert(paid === 1);
});
Deno.test("live meter: publication failure poisons every future dispatch and preserves reservation", async () => {
  let paid = 0, publishes = 0; const f = fixture(async () => { publishes++; throw new Error(SECRET + TOKEN); }); f.reserve(20000);
  const request = f.meter.wrapRequest((async () => { paid++; return new Response("{}"); }) as typeof fetch);
  await refuses(() => request("https://provider.example.test")); await refuses(() => request("https://provider.example.test"));
  const r = recoverJournal(f.raw()); assert(paid === 0 && publishes === 1 && r.charged_micros === 0 && r.reserved_micros === 20000 && r.unsettled_calls === 1);
});
Deno.test("live meter: failure after a crossing blocks the next provider call", async () => {
  let publications = 0, paid = 0; const f = fixture(async () => { if (++publications > 1) throw Error(TOKEN); return receipt(); });
  await f.meter.flush(true); f.reserve(6e6).settle({ input_tokens: 4800000, output_tokens: 0 });
  await refuses(() => f.meter.wrapRequest((async () => { paid++; return new Response("{}"); }) as typeof fetch)("https://provider.example.test"));
  assert(paid === 0 && publications === 2 && recoverJournal(f.raw()).charged_micros === 6e6);
});
Deno.test("live meter: unknown provider charge retains reservation and refuses dispatch", async () => {
  const f = fixture(); await f.meter.flush(true); f.reserve(1000).settle(null); await f.meter.flush(true);
  assert(f.sent.at(-1)!.known_cost_usd === 0 && f.sent.at(-1)!.held_reservations_usd === .001 && f.sent.at(-1)!.unknown_charges === 1);
  await refuses(() => f.meter.beforeDispatch());
});
Deno.test("live meter: malformed journal and changed identity stop before request", async () => {
  const f = fixture(); await refuses(() => f.append({ type: "settlement", call_id: 999, private: SECRET }));
  await refuses(() => f.meter.beforeDispatch());
  const g = new LiveCostMeter(binding, async () => receipt());
  await refuses(() => g.observe({ type: "arm", model: "gpt-5-mini", identity: { source_commit: binding.source_commit, corpus_sha256: binding.corpus_sha256 }, approval: { cap_usd: 8, comparison_spent_usd: 2.258950 } }));
});
Deno.test("live meter: over-cap or malformed binding is refused without publication", async () => {
  for (const change of [{ cap_usd: 8.000001 }, { comparison_spent_usd: 13 }, { run_id: "../leak" }, { source_commit: SECRET }, { repository: "synthetic/eval?token=" + TOKEN }]) {
    await refuses(() => new LiveCostMeter({ ...binding, ...change } as any, async () => receipt()));
  }
});
function githubFixture() {
  const requests: { url: string; method: string; body: any }[] = []; let exists = false, file: any = null, n = 0;
  const api: typeof fetch = (async (url: any, init: any) => {
    const method = init?.method ?? "GET", body = init?.body ? JSON.parse(init.body) : null;
    requests.push({ url: String(url), method, body });
    if (String(url).includes("/git/ref/")) return exists ? Response.json({ ref: "refs/heads/wo/brain-eval-meter-123456" }) : new Response(null, { status: 404 });
    if (String(url).endsWith("/git/refs")) { exists = true; return Response.json({ ref: body.ref, object: { sha: body.sha } }, { status: 201 }); }
    if (method === "GET") return file ? Response.json(file) : new Response(null, { status: 404 });
    const sha = (++n).toString(16).padStart(40, "0"), commit = (n + 100).toString(16).padStart(40, "0");
    file = { sha, encoding: "base64", content: body.content };
    return Response.json({ commit: { sha: commit }, content: { sha, path: "evals/brain-reliability/runtime/123456.json" } }, { status: n === 1 ? 201 : 200 });
  }) as typeof fetch;
  return { api, requests, file: () => file };
}
Deno.test("live meter GitHub: supported branch artifact creates and updates with SHA lease", async () => {
  const fake = githubFixture(), pub = githubMeterPublisher(binding, TOKEN, fake.api), f = fixture(pub);
  await f.meter.flush(true); f.advance(15000); await f.meter.flush();
  const writes = fake.requests.filter(r => r.method === "PUT"); assert(writes.length === 2 && !writes[0].body.sha && writes[1].body.sha === "1".padStart(40, "0"));
  const p = JSON.parse(atob(fake.file().content)); assert(p.sequence === 2 && p.run_id === binding.run_id);
  assert(fake.requests.every(r => r.url.startsWith("https://api.github.com/repos/synthetic/eval/")));
  assert(!JSON.stringify(fake.requests).includes(SECRET) && !JSON.stringify(fake.requests).includes(TOKEN));
});
Deno.test("live meter GitHub: response failure has no retry and no sensitive error", async () => {
  let calls = 0; const pub = githubMeterPublisher(binding, TOKEN, (async () => { calls++; return new Response(SECRET + TOKEN, { status: 403 }); }) as typeof fetch);
  const f = fixture(pub); let message = ""; try { await f.meter.flush(true); } catch (e) { message = String(e); }
  assert(calls === 1 && !message.includes(SECRET) && !message.includes(TOKEN)); await refuses(() => f.meter.beforeDispatch()); assert(calls === 1);
});
Deno.test("live meter GitHub: duplicate sequence and alien identity cannot overwrite artifact", async () => {
  const fake = githubFixture(), pub = githubMeterPublisher(binding, TOKEN, fake.api), f = fixture(); await f.meter.flush(true);
  await pub(f.sent[0]); const before = fake.requests.filter(r => r.method === "PUT").length;
  await refuses(() => pub(f.sent[0])); await refuses(() => pub({ ...f.sent[0], sequence: 2, source_commit: "e".repeat(40) }));
  assert(fake.requests.filter(r => r.method === "PUT").length === before);
});
Deno.test("live meter GitHub: arbitrary extra data is rejected before HTTP", async () => {
  let calls = 0; const f = fixture(); await f.meter.flush(true);
  const pub = githubMeterPublisher(binding, TOKEN, (async () => { calls++; return new Response("{}"); }) as typeof fetch);
  await refuses(() => pub({ ...f.sent[0], private: SECRET } as any)); assert(calls === 0);
});
