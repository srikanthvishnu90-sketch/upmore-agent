// #354 safety re-review (2026-11-01): the crisis screen's second layer, OpenAI moderation, beside the deterministic list.
// Fail-safe: either layer flagging gives the crisis reply; moderation erroring or timing out leaves the list's verdict
// and never blocks the turn. A fake moderation client stands in for OpenAI: nothing here leaves the process.
import assertNode from "node:assert/strict";
import { crisisScreen, gatewayModeration, type Moderate, moderationFromEnv, readModeration } from "../../supabase/functions/_shared/career_crisis_screen.ts";
import { moderate, MODERATION_MODEL } from "../../supabase/functions/_shared/model_gateway.ts";
import { SAFETY_REPLY, trustTurn } from "../../supabase/functions/_shared/career_trust_turn.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
// A message the list does not catch (moderation's job): an oblique one.
const OBLIQUE = "i gave away my things and wrote the letters, tonight is the night";
const CAREER = "find me data analyst jobs in chicago";
const flag = (cats = ["self-harm/intent"]): Moderate => () => Promise.resolve({ flagged: true, categories: cats });
const clear: Moderate = () => Promise.resolve({ flagged: false, categories: [] });
const quiet = () => { const lines: string[] = []; return { lines, log: (l: string) => lines.push(l) }; };

Deno.test("moderation flags what the list missed: the crisis reply wins", async () => {
  const v = await crisisScreen(OBLIQUE, flag());
  eq(v, { distress: true, rules: false, moderation: "flagged", categories: ["self-harm/intent"] });
  const a = await trustTurn({ message: OBLIQUE, distress: v.distress, deps: { connections: () => Promise.resolve([]), stored: () => Promise.resolve(null) } });
  eq(a?.intent, "safety_support");
  eq(a?.reply, SAFETY_REPLY);
});

Deno.test("no flag from moderation and none from the list: no crisis", async () => {
  eq(await crisisScreen(CAREER, clear), { distress: false, rules: false, moderation: "clear", categories: [] });
});

Deno.test("the list's hit stands without waiting on moderation, even if moderation says clear or hangs", async () => {
  let called = 0;
  const hang: Moderate = () => { called++; return new Promise(() => {}); };
  const started = Date.now();
  const v = await crisisScreen("kms", hang, { timeoutMs: 5000 });
  eq(v.distress, true); eq(v.rules, true); eq(v.moderation, "skipped");
  assert(Date.now() - started < 200, "answered at once"); eq(called, 0, "no call needed");
  eq((await crisisScreen("i want to die", clear)).distress, true, "a clear moderation never overrides the list");
});

Deno.test("a moderation timeout falls back to the list within the cap, logs it, and aborts the call", async () => {
  let aborted = false;
  const hang: Moderate = (_t, signal) => new Promise((_res, rej) => signal.addEventListener("abort", () => { aborted = true; rej(new Error("aborted")); }));
  const q = quiet();
  const started = Date.now();
  const v = await crisisScreen(CAREER, hang, { timeoutMs: 50, log: q.log });
  eq(v, { distress: false, rules: false, moderation: "timeout", categories: [] });
  assert(Date.now() - started < 1000, `within the cap: ${Date.now() - started} ms`);
  assert(aborted, "the call was aborted");
  eq(q.lines.length, 1); assert(/timed out/.test(q.lines[0]) && !q.lines[0].includes(CAREER), "logged, never the text");
});

Deno.test("a moderation error (thrown, rejected or HTTP) falls back to the list and logs", async () => {
  for (const m of [(() => { throw new Error("boom"); }) as Moderate, (() => Promise.reject(new Error("network"))) as Moderate,
    gatewayModeration((t, o) => moderate(t, { ...o, env: { get: (k) => (k === "OPENAI_API_KEY" ? "k" : undefined) }, request: () => Promise.resolve(new Response("no", { status: 500 })) }))]) {
    const q = quiet();
    eq(await crisisScreen(CAREER, m, { log: q.log }), { distress: false, rules: false, moderation: "error", categories: [] });
    eq(q.lines.length, 1); assert(/failed/.test(q.lines[0]), q.lines[0]);
  }
  // an error never hides the list's own hit
  eq((await crisisScreen("i took too many pills", () => Promise.reject(new Error("x")))).distress, true);
});

Deno.test("the gateway's moderation door: /v1/moderations only, the key from the environment, the kill switch, never the text in errors", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
  const ok = (cats: Record<string, boolean>) => (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init! });
    return Promise.resolve(Response.json({ results: [{ flagged: true, categories: cats }] }));
  };
  const ctl = new AbortController();
  const body = await moderate("x", { env: env({ OPENAI_API_KEY: "sk-test" }), request: ok({ "self-harm/intent": true }) as typeof fetch, signal: ctl.signal });
  eq(seen[0].url, "https://api.openai.com/v1/moderations");
  eq(JSON.parse(String(seen[0].init.body)), { model: MODERATION_MODEL, input: "x" });
  eq((seen[0].init.headers as Record<string, string>).authorization, "Bearer sk-test");
  assert(seen[0].init.signal instanceof AbortSignal, "the call carries a deadline");
  eq(readModeration(body), { flagged: true, categories: ["self-harm/intent"] });
  // only the self-harm categories are read
  eq(readModeration({ results: [{ categories: { "self-harm": false, "self-harm/intent": true, "self-harm/instructions": true, violence: true } }] }), { flagged: true, categories: ["self-harm/intent", "self-harm/instructions"] });
  eq(readModeration({ results: [{ categories: { violence: true, harassment: true } }] }), { flagged: false, categories: [] }, "another category is not this screen's business");
  assertNode.throws(() => readModeration({}), /no result/);
  // no key: not configured, nothing sent; the kill switch: paused, nothing sent
  const n = seen.length;
  await assertNode.rejects(() => moderate("x", { env: env({}), request: ok({}) as typeof fetch }), /not configured/);
  await assertNode.rejects(() => moderate("x", { env: env({ OPENAI_API_KEY: "k", MODEL_BUDGET_PAUSED: "on" }), request: ok({}) as typeof fetch }), /PAUSED/);
  eq(seen.length, n, "nothing sent without a key or with the kill switch on");
  // an HTTP error never carries the text
  await assertNode.rejects(() => moderate("secret words", { env: env({ OPENAI_API_KEY: "k" }), request: () => Promise.resolve(new Response("x", { status: 429 })) }), (e: Error) => /429/.test(e.message) && !/secret words/.test(e.message));
  // the deadline: a hang is cut at timeoutMs
  const hang = (_u: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init!.signal!.reason)));
  const t0 = Date.now();
  await assertNode.rejects(() => moderate("x", { env: env({ OPENAI_API_KEY: "k" }), request: hang as typeof fetch, timeoutMs: 50 }));
  assert(Date.now() - t0 < 1000, "cut at the deadline");
});

Deno.test("the second layer is on only with CAREER_CRISIS_MODERATION=on, through the gateway door", async () => {
  const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
  eq(moderationFromEnv(env({})), null);
  eq(moderationFromEnv(env({ OPENAI_API_KEY: "k" })), null, "a key alone does not turn it on");
  let doorCalls = 0;
  const client = moderationFromEnv(env({ CAREER_CRISIS_MODERATION: "on" }), () => { doorCalls++; return Promise.resolve({ results: [{ categories: { "self-harm": true } }] }); });
  assert(client, "on");
  eq((await crisisScreen(OBLIQUE, client)).distress, true);
  eq(doorCalls, 1, "the door was used");
  const live = Deno.readTextFileSync(new URL("../../scripts/launch/trainee-go-live.sh", import.meta.url));
  assert(/^\s*add CAREER_CRISIS_MODERATION on on$/m.test(live), "every deploy turns it on");
  const src = Deno.readTextFileSync(new URL("../../supabase/functions/_shared/career_crisis_screen.ts", import.meta.url)).replace(/\/\/[^\n]*/g, "");
  assert(!/api\.openai\.com|OPENAI_API_KEY/.test(src), "the screen holds no URL and reads no key");
});

Deno.test("the handler starts the screen before the turn's reads and decides distress from its verdict", () => {
  const h = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler-career.ts", import.meta.url));
  const at = (re: RegExp) => { const m = re.exec(h); assert(m, `${re}`); return m!.index; };
  const start = at(/const crisisPending = crisisScreen\(message, moderationFromEnv\(Deno\.env\)\);/);
  assert(start < at(/const loaded = await persistence\.load/), "started before the thread's state is read");
  assert(start < at(/const distress = /) && /const crisis = await crisisPending;[\s\S]{0,300}const distress = !tapIn && !careerTask && !careerBatch && crisis\.distress;/.test(h));
  assert(/trustTurn\(\{ message, distress, deps:/.test(h), "the trust turn answers what the screen flagged");
});
