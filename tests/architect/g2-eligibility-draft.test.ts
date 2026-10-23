// Backend gap map G2, executor side (owner, 2026-10-23: work authorization is a safety field; every fact carries its source
// or stays unwritten; never infer work authorization from anything). The person said it in chat ("I don't need visa
// sponsorship"), but the executor reads only confirmed facts and their texted answers, so the application stops and asks
// again with no memory of it. Now, when the sponsorship or work-authorization question is shown, the person's own earlier
// message is offered as a draft: quoted word for word with its date. Only "use N" saves it, through the same check and
// store.answer as a typed answer, and showing it saves nothing.
// A sponsorship statement never drafts work authorization (nor the reverse); citizenship, a visa type, a question, a
// maybe, someone else's situation or two answers in one message draft nothing. The router (142) is not touched.
import {
  type OpenQuestion,
  type QuestionStore,
  QUESTIONS_INTENT,
  questionsTurn,
  supabaseQuestionStore,
} from "../../supabase/functions/_shared/career_apply_questions.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const T = Date.UTC(2026, 9, 23, 15);
const Q = (o: Partial<OpenQuestion> = {}): OpenQuestion => ({
  id: "q-sp", key: "fact:sponsorship", kind: "fact", label: "Will you now or in the future require sponsorship for employment visa status?",
  type: "select", options: ["Yes", "No"], company: "Ramp", job_ids: ["j1"], misfit: false, answer: null, ...o,
});
const WA = (o: Partial<OpenQuestion> = {}) =>
  Q({ id: "q-wa", key: "fact:work_authorization", label: "Are you legally authorized to work in the United States?", ...o });
type Said = { text: string; at: string };

function fakeStore(rows: OpenQuestion[], statements: Said[] | (() => Promise<Said[]>) | null) {
  const kv: { shown?: any } = {};
  const answers: [string, string][] = [];
  let last: string | null = null;
  const store: QuestionStore & { answers: typeof answers; setIntent(i: string | null): void } = {
    answers,
    setIntent(i) { last = i; },
    async open(_u, limit) { return rows.filter((r) => !r.answer || r.misfit).slice(0, limit); },
    async countOpen() { return rows.filter((r) => !r.answer || r.misfit).length; },
    async get(_u, ids) { return rows.filter((r) => ids.includes(r.id)); },
    async answer(_u, id, a) { const r = rows.find((x) => x.id === id)!; r.answer = a; r.misfit = false; answers.push([id, a]); },
    async shown() { return kv.shown ? JSON.parse(JSON.stringify(kv.shown)) : null; },
    async setShown(_u, s) { kv.shown = JSON.parse(JSON.stringify(s)); },
    async lastAssistantIntent() { return last; },
  };
  if (statements) {
    (store as any).statements = typeof statements === "function" ? statements : async () => statements;
  }
  return store;
}
const waiting = (s: string) => ["shown", "partial"].includes(s) || s.startsWith("draft");
async function say(store: ReturnType<typeof fakeStore>, message: string) {
  const r = await questionsTurn({ message, userId: "u", threadId: "t", now: T, store });
  if (r) store.setIntent(waiting(r.status) ? QUESTIONS_INTENT : "career_apply_questions_answer");
  return r;
}
const at = (d: string) => `${d}T14:00:00.000Z`;
const ASK = "what do you need from me";

Deno.test("G2/1 the person's own sponsorship statement is offered word for word, with its date; showing saves nothing", async () => {
  const store = fakeStore([Q()], [{ text: "I don't need visa sponsorship", at: at("2026-10-22") }]);
  const r = await say(store, ASK);
  assert(r && r.status === "shown", JSON.stringify(r));
  assert(r.reply.includes(`"I don't need visa sponsorship"`), r.reply);
  assert(/Oct(ober)? 22/.test(r.reply), "the date it was said: " + r.reply);
  assert(/use 1/.test(r.reply) && /\bNo\b/.test(r.reply), "the answer it reads as, and how to use it: " + r.reply);
  eq(store.answers, [], "nothing saved by showing it");
});

Deno.test("G2/2 only 'use N' saves the drafted answer, through the same check as a typed answer", async () => {
  const store = fakeStore([Q()], [{ text: "I will not require sponsorship now or in the future", at: at("2026-10-21") }]);
  await say(store, ASK);
  const r = await say(store, "use 1");
  assert(r && /Saved, as drafted/.test(r.reply), JSON.stringify(r));
  eq(store.answers, [["q-sp", "No"]], "saved as the plain No a shared fact keeps");
});

Deno.test("G2/3 a sponsorship statement never answers the work-authorization question", async () => {
  const store = fakeStore([WA()], [{ text: "I don't need visa sponsorship", at: at("2026-10-22") }]);
  const r = await say(store, ASK);
  assert(r && r.status === "shown");
  assert(!r.reply.includes("visa sponsorship\""), "no quote offered for work authorization: " + r.reply);
  const u = await say(store, "use 1");
  assert(u && !/Saved/.test(u.reply), JSON.stringify(u));
  eq(store.answers, [], "nothing saved");
});

Deno.test("G2/4 citizenship, a visa type or a green card is never read as an answer to either question", async () => {
  for (const text of ["I am a US citizen", "I'm on an F-1 visa with OPT", "I have a green card", "I'm a permanent resident"]) {
    for (const q of [Q(), WA()]) {
      const store = fakeStore([q], [{ text, at: at("2026-10-22") }]);
      const r = await say(store, ASK);
      assert(r && !r.reply.includes(`"${text}"`), `${text} → ${q.key}: ${r?.reply}`);
    }
  }
});

Deno.test("G2/5 a question, a maybe, someone else's situation or two answers in one message drafts nothing", async () => {
  for (const text of [
    "Do I need sponsorship?",
    "If I switch to OPT I might need sponsorship",
    "My roommate needs visa sponsorship",
    "I don't need sponsorship. Actually I will need sponsorship later.",
    "Not sure whether I'll need sponsorship",
    "I need to know about sponsorship",
    "I don't need to worry about sponsorship",
    "I don't think I need sponsorship",
    "We don't need sponsorship",
    "Maybe I will need sponsorship",
    "I don't need sponsorship. I might need sponsorship later.",
  ]) {
    const store = fakeStore([Q()], [{ text, at: at("2026-10-22") }]);
    const r = await say(store, ASK);
    assert(r && !r.reply.includes(`"${text}"`) && !/use 1/.test(r.reply), `${text}: ${r?.reply}`);
  }
});

Deno.test("G2/6 polarity: a stated need is Yes, a stated no-need is No, each quoted", async () => {
  const cases: [string, string][] = [
    ["I will need sponsorship for an H-1B", "Yes"],
    ["I'll require visa sponsorship", "Yes"],
    ["I do not require sponsorship", "No"],
    ["I no longer need sponsorship", "No"],
    ["I will need H-1B sponsorship", "Yes"],
    ["I need a visa sponsor", "Yes"],
    ["I do not currently need sponsorship", "No"],
    ["I'm a US citizen and I don't need sponsorship", "No"],
  ];
  for (const [text, want] of cases) {
    const store = fakeStore([Q()], [{ text, at: at("2026-10-22") }]);
    await say(store, ASK);
    await say(store, "use 1");
    eq(store.answers, [["q-sp", want]], text);
  }
});

Deno.test("G2/7 work authorization only from the person's own words about it, and only for the US", async () => {
  const yes = fakeStore([WA()], [{ text: "I'm authorized to work in the US", at: at("2026-10-22") }]);
  await say(yes, ASK);
  await say(yes, "use 1");
  eq(yes.answers, [["q-wa", "Yes"]], "stated authorization");
  const dots = fakeStore([WA()], [{ text: "I am legally authorized to work in the U.S. for any employer.", at: at("2026-10-22") }]);
  await say(dots, ASK);
  await say(dots, "use 1");
  eq(dots.answers, [["q-wa", "Yes"]], "\"U.S.\" does not end the sentence");
  const no = fakeStore([WA()], [{ text: "I am not authorized to work in the United States", at: at("2026-10-22") }]);
  await say(no, ASK);
  await say(no, "use 1");
  eq(no.answers, [["q-wa", "No"]], "stated lack of authorization");
  const ca = fakeStore([WA()], [{ text: "I'm authorized to work in Canada", at: at("2026-10-22") }]);
  const r = await say(ca, ASK);
  assert(r && !/use 1/.test(r.reply), "another country answers nothing: " + r?.reply);
});

Deno.test("G2/7b citizenship beside a sponsorship answer still never answers work authorization", async () => {
  const store = fakeStore([WA()], [{ text: "I'm a US citizen and I don't need sponsorship", at: at("2026-10-22") }]);
  const r = await say(store, ASK);
  assert(r && !/use 1/.test(r.reply), r?.reply);
});

Deno.test("G2/8 a question about working without sponsorship is both facts at once: not drafted", async () => {
  const q = WA({ label: "Are you able to work in the United States without sponsorship?" });
  const store = fakeStore([q], [{ text: "I'm authorized to work in the US", at: at("2026-10-20") }, { text: "I don't need sponsorship", at: at("2026-10-22") }]);
  const r = await say(store, ASK);
  assert(r && !/use 1/.test(r.reply), r?.reply);
});

Deno.test("G2/9 the newest clear statement is the one offered, and it is the one quoted", async () => {
  const store = fakeStore([Q()], [
    { text: "I will need sponsorship", at: at("2026-10-10") },
    { text: "I no longer need sponsorship", at: at("2026-10-22") },
  ]);
  const r = await say(store, ASK);
  assert(r && r.reply.includes(`"I no longer need sponsorship"`) && !r.reply.includes(`"I will need sponsorship"`), r?.reply);
  await say(store, "use 1");
  eq(store.answers, [["q-sp", "No"]]);
});

Deno.test("G2/9b a newer message about sponsorship does not hide an older one about authorization", async () => {
  const store = fakeStore([WA()], [
    { text: "I'm authorized to work in the US", at: at("2026-10-20") },
    { text: "I don't need sponsorship", at: at("2026-10-22") },
  ]);
  await say(store, ASK);
  await say(store, "use 1");
  eq(store.answers, [["q-wa", "Yes"]]);
  const maybe = fakeStore([WA()], [{ text: "Maybe I am authorized to work in the US", at: at("2026-10-22") }]);
  const r = await say(maybe, ASK);
  assert(r && !/use 1/.test(r.reply), "a maybe is not an answer: " + r?.reply);
});

Deno.test("G2/10 a statement reader that fails, or a store without one, leaves the questions as they were", async () => {
  const broken = fakeStore([Q()], () => Promise.reject(new Error("db down")));
  const r = await say(broken, ASK);
  assert(r && r.status === "shown" && !/use 1/.test(r.reply), r?.reply);
  const plain = fakeStore([Q()], null);
  const p = await say(plain, ASK);
  assert(p && p.status === "shown" && !/use 1/.test(p.reply), p?.reply);
  eq(r.reply, p.reply, "same text as before G2");
});

Deno.test("G2/11 a typed answer replaces the draft; the draft is never saved behind it", async () => {
  const store = fakeStore([Q()], [{ text: "I don't need visa sponsorship", at: at("2026-10-22") }]);
  await say(store, ASK);
  await say(store, "yes");
  eq(store.answers, [["q-sp", "Yes"]], "their own typed answer wins");
});

Deno.test("G2/12 the reader takes only the person's own messages: their threads, role user", async () => {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const data: Record<string, unknown[]> = {
    agent_threads: [{ id: "th-1" }, { id: "th-2" }],
    agent_messages: [{ content: "I don't need visa sponsorship", created_at: "2026-10-22T14:00:00Z" }, { content: null, created_at: "2026-10-21T14:00:00Z" }],
  };
  const admin = {
    from(table: string) {
      const rec = { table, ops: [] as [string, unknown[]][] };
      calls.push(rec);
      const b: any = new Proxy({}, {
        get(_t, k: string) {
          if (k === "then") return (res: any) => res({ data: data[table], error: null });
          return (...a: unknown[]) => { rec.ops.push([k, a]); return b; };
        },
      });
      return b;
    },
  };
  const said = await supabaseQuestionStore(admin).statements!("user-9");
  eq(said, [{ text: "I don't need visa sponsorship", at: "2026-10-22T14:00:00Z" }], "only text with a time");
  const threads = calls.find((c) => c.table === "agent_threads")!;
  assert(threads.ops.some(([k, a]) => k === "eq" && a[0] === "user_id" && a[1] === "user-9"), "threads scoped to the person");
  const msgs = calls.find((c) => c.table === "agent_messages")!;
  assert(msgs.ops.some(([k, a]) => k === "in" && a[0] === "thread_id" && JSON.stringify(a[1]) === '["th-1","th-2"]'), "their threads only");
  assert(msgs.ops.some(([k, a]) => k === "eq" && a[0] === "role" && a[1] === "user"), "their own words, never the assistant's");
});
