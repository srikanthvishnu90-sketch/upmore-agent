// LANE L9 (workflows + reminders, #216 follow-ups) at the REAL handler on real Postgres, fake model on the OpenAI wire.
//   1. The #216 patch note (handler-career.ts): accountMemoryAfterTurn skips brain turns, so a reminder set from part
//      of a longer message was SET (workflowTurn runs before the router and the brain alike) but never SAID when the
//      brain answered the rest. The patch runs workflowAfterTurn for brain turns too. Fail-first: at base the brain's
//      reply carries no reminder line while the row exists.
//   2. Compound messages split by a SENTENCE boundary (". " / "? ") never reach the workflow turns at all:
//      workflowAsk returns null (reminder second) or swallows the second sentence into the reminder's "what"
//      (reminder first). The router then answers the rest alone (a recall question lands on conversation_recall) and
//      the reminder silently does not exist, or exists with another ask buried in its text.
// Run: PGBIN=<pg16 bin> deno test -A --no-check --import-map=tests/flow/supabase-npm.json tests/architect/lane-l9-workflows.test.ts
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, supabaseParity } from "../flow/handler.ts";
import { workflowAfterTurn, workflowAsk } from "../../supabase/functions/_shared/career_workflow.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const PEOPLE: Record<string, string> = {
  "tok-l9a": "5f1c0de0-0000-4000-8000-000000000901",
  "tok-l9b": "5f1c0de0-0000-4000-8000-000000000902",
  "tok-l9c": "5f1c0de0-0000-4000-8000-000000000903",
};
const ADVICE = "how do I negotiate a raise";
const COMMA = `${ADVICE}, and remind me Friday at 9am central to check the portal`;
const SENTENCE = `How do I negotiate a raise? Remind me Friday at 9am central to check the portal.`;
const ANSWER = "Anchor on the range you researched, name your strongest result from this year, and ask what the budget timeline looks like.";
const MIN = 60_000, DAY = 86_400_000;
const _d = new Date(); const T0 = Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate() + (((8 - _d.getUTCDay()) % 7) || 7), 16);

const fakeOpenAI = async (input: Request | URL | string, init?: RequestInit): Promise<Response> => {
  const req = input instanceof Request && !init ? input : new Request(input as any, init);
  const url = new URL(req.url);
  if (url.hostname !== "api.openai.com") return new Response("not reachable in this test", { status: 404 });
  const body = await req.json();
  return new Response(JSON.stringify({ id: "fake-l9", model: body.model, choices: [{ index: 0, message: { role: "assistant", content: ANSWER }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 40 } }), { status: 200, headers: { "content-type": "application/json" } });
};
async function sha256(s: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("L9 unit: workflowAsk on sentence-split compounds", () => {
  // Reminder second, after a sentence boundary: a part, not silence.
  const a = workflowAsk(SENTENCE);
  eq(a?.kind, "remind_part", `sentence form parses as a part: ${JSON.stringify(a)}`);
  eq((a as any)?.parse?.what, "check the portal");
  eq((a as any)?.others, ["How do I negotiate a raise"]);
  // Reminder first, then a separate sentence: the second sentence is a part, not part of the "what".
  const b = workflowAsk("Remind me Friday at 9am central to check the portal. I'm so overwhelmed with all of this");
  eq(b?.kind, "remind_part", `reminder-first sentence form: ${JSON.stringify(b)}`);
  eq((b as any)?.parse?.what, "check the portal");
  eq((b as any)?.others, ["I'm so overwhelmed with all of this"]);
  // A recall question, then the reminder as its own sentence.
  const c = workflowAsk("What did we discuss about Stripe? Remind me Friday at 9am central to follow up");
  eq(c?.kind, "remind_part", `recall-first sentence form: ${JSON.stringify(c)}`);
  // Controls: behaviour #216 shipped, unchanged.
  const d = workflowAsk("remind me to call Sam and send the deck");
  eq(d?.kind, "remind", "one reminder, its 'and' included");
  eq((d as any)?.parse?.what, "call Sam and send the deck");
  const e = workflowAsk(COMMA);
  eq(e?.kind, "remind_part", "the comma form still parses as a part");
  const f = workflowAsk("remind me Friday at 9am central to email Dr. Smith about the deck");
  eq(f?.kind, "remind", "an abbreviation is not a sentence split");
  eq((f as any)?.parse?.what, "email Dr. Smith about the deck");
});

Deno.test("L9 unit: workflowAfterTurn does not name a recall part the router answered as not started", async () => {
  const message = "What did we discuss about Stripe? Remind me Friday at 9am central to follow up";
  const said = await sha256(message);
  const events: any = { recall: async () => [{ user_id: "u1", at: new Date().toISOString(), kind: "note", subject: "x", source: "chat",
    detail: { type: "reminder", message_sha256: said, line: "Reminder set for Friday, Oct 30 at 9:00 AM Central time: follow up.", parts: ["What did we discuss about Stripe"] } }] };
  const line = await workflowAfterTurn({ message, userId: "u1", now: Date.now(), out: { reply: "From your record: your recruiter contact at Stripe is Lee.", intent: "conversation_recall", handler: "CareerRouter" }, events });
  assert(line && /Reminder set for Friday/.test(line), `the reminder line is said: ${line}`);
  assert(!/Not started/.test(line!), `the answered recall part is not named not started: ${line}`);
});

Deno.test({ name: "L9 handler: a reminder part is said on brain turns, and sentence compounds set it", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  const pg: Pg = await startPg();
  const realFetch = globalThis.fetch;
  const saved: Record<string, string | undefined> = {};
  for (const k of ["CAREER_BRAIN", "CAREER_BRAIN_ROUTER_INTENTS", "OPENAI_API_KEY", "MODEL_PROVIDER", "CAREER_MODEL", "CAREER_ACCOUNT_MEMORY", "CAREER_REMINDER_DELIVERY"]) saved[k] = Deno.env.get(k);
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  const setBrain = (v: string | null) => { if (v === null) Deno.env.delete("CAREER_BRAIN"); else Deno.env.set("CAREER_BRAIN", v); };
  try {
    await supabaseParity(pg);
    for (const id of Object.values(PEOPLE)) {
      await pg.sql(`insert into auth.users (id, email) values ('${id}', '${id}@example.test'); insert into public.profiles (id) values ('${id}');
        insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
    }
    Deno.env.set("OPENAI_API_KEY", "sk-fake-l9-not-a-key");
    Deno.env.delete("MODEL_PROVIDER");
    Deno.env.set("CAREER_MODEL", "gpt-5-mini");
    Deno.env.set("CAREER_ACCOUNT_MEMORY", "on");
    Deno.env.delete("CAREER_REMINDER_DELIVERY");
    globalThis.fetch = fakeOpenAI as typeof fetch;
    handler = await careerHandler(pg, PEOPLE);
    const realNow = Date.now.bind(Date), start = realNow();
    Date.now = () => T0 + (realNow() - start);
    const say = async (c: Chat, message: string) => { const r = await c.say(message); eq(r.status, 200, r.reply); return r; };
    const doc = async (id: string) => JSON.parse(await pg.sql(`select coalesce((select value from public.career_watch_kv where user_id = '${id}' and key = 'career:workflow')::text, 'null')`));
    const live = async (id: string) => ((await doc(id))?.reminders ?? []).filter((r: any) => r.state !== "cancelled");

    await t.step("brain turn (comma compound): the reminder is set AND said", async () => {
      setBrain("staged");
      const id = PEOPLE["tok-l9a"];
      const r = await say(handler!.chat("tok-l9a"), COMMA);
      eq(r.body.meta.brain, "staged", `the brain answered: ${JSON.stringify(r.body.meta)}`);
      assert(r.reply.includes(ANSWER), "the brain's words are the reply");
      const rows = await live(id);
      eq(rows.length, 1, "the reminder part is a row");
      eq(rows[0].what, "check the portal");
      assert(/Reminder set for Friday/.test(r.reply), `the reminder is SAID on the brain's reply: ${r.reply}`);
    });

    await t.step("router control (same compound, brain off): the reminder is said, as before", async () => {
      setBrain(null);
      const id = PEOPLE["tok-l9b"];
      const r = await say(handler!.chat("tok-l9b"), COMMA);
      eq((await live(id)).length, 1, "the reminder part is a row");
      assert(/Reminder set for Friday/.test(r.reply), `the reminder is said on the router's reply: ${r.reply}`);
    });

    await t.step("brain turn (sentence compound): the reminder is set AND said", async () => {
      setBrain("staged");
      const id = PEOPLE["tok-l9c"];
      const r = await say(handler!.chat("tok-l9c"), SENTENCE);
      const rows = await live(id);
      eq(rows.length, 1, `the sentence compound's reminder is a row: ${JSON.stringify(rows)}`);
      eq(rows[0].what, "check the portal");
      assert(/Reminder set for Friday/.test(r.reply), `the reminder is SAID: ${r.reply}`);
    });
  } finally {
    Date.now = Date.now.bind(Date);
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
    handler?.restore();
    globalThis.fetch = realFetch;
    await pg.stop();
  }
} });
