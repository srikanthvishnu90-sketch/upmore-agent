// #354 safety re-review (2026-11-01): the crisis screen's second layer, OpenAI moderation, beside the deterministic list.
// Fail-safe: either layer flagging gives the crisis reply; moderation erroring or timing out leaves the list's verdict
// and never blocks the turn. A fake moderation client stands in for OpenAI: nothing here leaves the process.
import assertNode from "node:assert/strict";
import { crisisScreen, type Moderate, MODERATION_MODEL, MODERATION_URL, moderationFromEnv, openAIModeration } from "../../supabase/functions/_shared/career_crisis_screen.ts";
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
    openAIModeration({ apiKey: "k", fetch: () => Promise.resolve(new Response("no", { status: 500 })) })]) {
    const q = quiet();
    eq(await crisisScreen(CAREER, m, { log: q.log }), { distress: false, rules: false, moderation: "error", categories: [] });
    eq(q.lines.length, 1); assert(/failed/.test(q.lines[0]), q.lines[0]);
  }
  // an error never hides the list's own hit
  eq((await crisisScreen("i took too many pills", () => Promise.reject(new Error("x")))).distress, true);
});

Deno.test("the OpenAI client posts to the moderation endpoint and reads only the self-harm categories", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const reply = (cats: Record<string, boolean>) => (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init! });
    return Promise.resolve(Response.json({ results: [{ flagged: true, categories: cats }] }));
  };
  const ctl = new AbortController();
  const r1 = await openAIModeration({ apiKey: "sk-test", fetch: reply({ "self-harm": false, "self-harm/intent": true, "self-harm/instructions": true, violence: true }) as typeof fetch })("x", ctl.signal);
  eq(r1, { flagged: true, categories: ["self-harm/intent", "self-harm/instructions"] });
  eq(seen[0].url, MODERATION_URL);
  eq(JSON.parse(String(seen[0].init.body)), { model: MODERATION_MODEL, input: "x" });
  eq((seen[0].init.headers as Record<string, string>).authorization, "Bearer sk-test");
  eq(seen[0].init.signal, ctl.signal);
  const r2 = await openAIModeration({ apiKey: "k", fetch: reply({ violence: true, harassment: true }) as typeof fetch })("x", ctl.signal);
  eq(r2, { flagged: false, categories: [] }, "another category is not this screen's business");
});

Deno.test("the second layer is on only with CAREER_CRISIS_MODERATION=on and a key", () => {
  const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
  eq(moderationFromEnv(env({})), null);
  eq(moderationFromEnv(env({ OPENAI_API_KEY: "k" })), null);
  eq(moderationFromEnv(env({ CAREER_CRISIS_MODERATION: "on" })), null, "no key: off");
  assert(typeof moderationFromEnv(env({ OPENAI_API_KEY: "k", CAREER_CRISIS_MODERATION: "on" })) === "function");
  const live = Deno.readTextFileSync(new URL("../../scripts/launch/trainee-go-live.sh", import.meta.url));
  assert(/^\s*add CAREER_CRISIS_MODERATION on on$/m.test(live), "every deploy turns it on");
});

Deno.test("the handler starts the screen before the turn's reads and decides distress from its verdict", () => {
  const h = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler-career.ts", import.meta.url));
  const at = (re: RegExp) => { const m = re.exec(h); assert(m, `${re}`); return m!.index; };
  const start = at(/const crisisPending = crisisScreen\(message, moderationFromEnv\(Deno\.env\)\);/);
  assert(start < at(/const loaded = await persistence\.load/), "started before the thread's state is read");
  assert(start < at(/const distress = /) && /const crisis = await crisisPending;[\s\S]{0,300}const distress = !tapIn && !careerTask && !careerBatch && crisis\.distress;/.test(h));
  assert(/trustTurn\(\{ message, distress, deps:/.test(h), "the trust turn answers what the screen flagged");
});
