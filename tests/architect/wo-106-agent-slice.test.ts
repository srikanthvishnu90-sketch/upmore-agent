// WO-106: the agent brain on the slice (resume -> live job links -> one application), fixed in the owner's order from the
// live @TraineeCareerBot test of 2026-10-21 (14 messages: 9 "I didn't catch that", 2 hijacked into interview mode, 1
// error). Each test names the fix it holds.
// Run: deno test -A --no-check tests/architect/wo-106-agent-slice.test.ts
import { mockTurn, notAnAnswer, type MockState, type MockStore } from "../../supabase/functions/_shared/career_mock.ts";
import { CHANNEL_REPLIES } from "../../supabase/functions/_shared/channel.ts";
import { memoryChannelWorld } from "../../supabase/functions/_shared/channel_memory.ts";
import { FILE_NOT_READ_REPLY, runInbound } from "../../supabase/functions/_shared/channel_inbound.ts";
import { parseTelegramUpdate, telegramAdapter } from "../../supabase/functions/_shared/telegram.ts";
import { careerTools, offRole } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { goalLines, personBlock } from "../../supabase/functions/_shared/agent/memory.ts";
import { goalOf, searchPostings } from "../../supabase/functions/_shared/career_search.ts";
import { apiUrlFor, linkChecker } from "../../supabase/functions/_shared/link_check.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }

function mockThread() {
  const kv = new Map<string, MockState>();
  let last: string | null = null;
  const store: MockStore = {
    get: async (u, t) => (kv.has(`${u}:${t}`) ? structuredClone(kv.get(`${u}:${t}`)!) : null),
    save: async (u, t, s) => void kv.set(`${u}:${t}`, structuredClone(s)),
    clear: async (u, t) => void kv.delete(`${u}:${t}`),
    lastAssistantIntent: async () => last,
  };
  const say = async (message: string, now: number) => {
    const r = await mockTurn({ message, userId: "u1", threadId: "t1", now, store });
    last = r ? r.intent : "agent";
    return r;
  };
  return { say, state: () => kv.get("u1:t1") ?? null };
}

Deno.test("WO-106/F1.1 a mock waiting for an answer lets \"/start\", a greeting, \"find jobs\" and \"what's my goal\" through to the brain, and keeps the mock", async () => {
  for (const text of ["/start", "/help", "hi", "hey there", "help me", "find jobs", "find me data analyst jobs in Chicago", "show my applications",
    "what's my goal?", "how's my batch going", "apply to the first one", "here's my resume: Jane Doe, barista"]) {
    const t = mockThread();
    const t0 = Date.UTC(2026, 9, 21, 2);
    const started = await t.say("mock me for data analyst at Stripe", t0);
    assert(started && started.status === "started", JSON.stringify(started));
    const r = await t.say(text, t0 + 60_000);
    assert(r === null, `"${text}" was taken as an interview answer: ${JSON.stringify(r)}`);
    assert(t.state()?.status === "running" && t.state()?.answers.length === 0, `"${text}": the mock is kept, unanswered`);
    const back = await t.say("resume mock", t0 + 120_000);
    assert(back && back.status === "resumed", `"${text}": "resume mock" picks it up again: ${JSON.stringify(back)}`);
  }
});

Deno.test("WO-106/F1.2 \"exit the interview\" ends the mock with its debrief; real answers are still answers", async () => {
  const t = mockThread();
  const t0 = Date.UTC(2026, 9, 21, 2);
  await t.say("mock me for data analyst at Stripe", t0);
  const a = await t.say("I built the weekly revenue dashboard in SQL and it cut reporting from 6 hours to 1.", t0 + 60_000);
  assert(a && a.status === "answered", JSON.stringify(a));
  const e = await t.say("exit the interview", t0 + 120_000);
  assert(e && e.status === "ended", JSON.stringify(e));
  assert(t.state() === null, "ended and cleared");
  for (const answer of ["I would find the root cause first, then fix the pipeline.", "Showing the team the numbers early helped.",
    "In my last role I led five analysts.", "Honestly, help came from my manager.", "What I learned is to ask early."]) {
    assert(!notAnAnswer(answer), `an answer: "${answer}"`);
  }
});

const T0 = Date.parse("2026-10-21T02:00:00Z");
const tg = (id: number, text: string, extra: Record<string, unknown> = {}) => ({ provider: "telegram", channel: "telegram", messageId: String(id), kind: "text", contact: "tg:5551", address: "5551", text, ...extra });
function channel() {
  const world = memoryChannelWorld();
  const chats: string[] = [], sent: string[] = [];
  const adapter = telegramAdapter({ token: "t", fetch: (async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }))) as typeof fetch, sleep: async () => {} });
  const d = {
    env: { get: (k: string) => ({ TRAINEE_SIGNUP: "open" } as Record<string, string>)[k] }, now: () => T0, store: world.inbound, render: adapter.render,
    chat: async (a: any) => { chats.push(a.message); return { status: 200, reply: "Paste your resume or tell me the role and city, and I'll find live openings.", threadId: "th1" }; },
    reply: async (_c: string, b: string[]) => { sent.push(b.join("\n")); return { ok: true }; },
    deliver: async () => {},
  };
  return { world, d, chats, sent, queued: () => [...world.outbox.values()].map((r: any) => r.text) };
}

Deno.test("WO-106/F1.3 Telegram /start and help reach the brain, so the reply ends in the person's next step; /start still says messages are back on", async () => {
  const c = channel();
  await runInbound(tg(1, "", { command: "start" }) as any, c.d as any);
  assert(c.chats[0] === "/start", `a first /start is the person's first message for the brain: ${JSON.stringify(c.chats)}`);
  await runInbound(tg(2, "", { command: "start" }) as any, c.d as any);
  await runInbound(tg(3, "help") as any, c.d as any);
  assert(JSON.stringify(c.chats) === JSON.stringify(["/start", "/start", "help"]), JSON.stringify(c.chats));
  const out = c.queued().join("\n---\n");
  assert(out.includes(CHANNEL_REPLIES.start) && /Paste your resume or tell me the role and city/.test(out), out);
  assert(!c.sent.includes(CHANNEL_REPLIES.help), "never the one generic line alone");
});

Deno.test("WO-106/F1.4 STOP keeps its fixed reply and opts out; with no chat channel (SMS) every command keeps its fixed reply", async () => {
  const c = channel();
  await runInbound(tg(1, "hi") as any, c.d as any);
  await runInbound(tg(2, "STOP") as any, c.d as any);
  assert(c.sent.includes(CHANNEL_REPLIES.stop) && c.world.contacts.get("tg:5551")!.optedOut === true, JSON.stringify(c.sent));
  assert(!c.chats.includes("STOP"), "STOP is never a brain turn");
  await runInbound(tg(3, "", { command: "start" }) as any, c.d as any);
  assert(c.world.contacts.get("tg:5551")!.optedOut === false, "/start lifts the STOP");
  const sms = channel();
  await runInbound({ ...tg(1, "hi"), channel: undefined, provider: "loopmessage", contact: "+15550001" } as any, sms.d as any);
  await runInbound({ ...tg(2, "HELP"), channel: undefined, provider: "loopmessage", contact: "+15550001" } as any, sms.d as any);
  assert(sms.sent.includes(CHANNEL_REPLIES.help) && !sms.chats.includes("HELP"), `SMS HELP is the fixed reply: ${JSON.stringify(sms)}`);
});

const tools = (deps: Record<string, unknown> = {}) => Object.fromEntries(careerTools({ postings: async () => [], ...deps } as any).map((t) => [t.name, t]));
const ctxFor = (message: string, state: Record<string, unknown> = {}) => ({ userId: "u1", threadId: "t1", now: T0, state, turn: { message, added: [] as string[] } });

Deno.test("WO-106/F2.1 the stored goal is in front of the agent every turn, never cut for length, and says which parts they have not confirmed", async () => {
  const t = tools(), state: Record<string, unknown> = {};
  await t.add_profile_fact.run({ kind: "goal", text: "senior data analyst role" }, ctxFor("I want a senior data analyst role", state));
  await t.add_profile_fact.run({ kind: "location", text: "based in Chicago" }, ctxFor("I'm based in Chicago", state));
  const p: any = state.profile;
  p.preferences.roles = ["Senior Data Analyst"];
  const block = personBlock({ profile: p, standing: [], alerts: null, pipeline: null, budget: 200 });
  assert(/Their goal/.test(block) && /\[goal\] senior data analyst role \(said, not confirmed yet\)/.test(block) && /\[location\] based in Chicago/.test(block) && /Roles: Senior Data Analyst/.test(block), block);
  assert(goalLines({}).length === 0 && /- none on file yet/.test(personBlock({ profile: {}, standing: [], alerts: null, pipeline: null })), "nothing on file is said, not guessed");
});

Deno.test("WO-106/F2.2 \"actually I'm in Michigan now\" replaces the Ohio fact (one location on file, waiting for their yes), and only in their words", async () => {
  const t = tools(), state: Record<string, unknown> = {};
  const { fact } = await t.add_profile_fact.run({ kind: "location", text: "nurse in Ohio" }, ctxFor("I'm a nurse in Ohio", state)) as any;
  const r = await t.correct_profile_fact.run({ id: fact.id, text: "in Michigan now" }, ctxFor("actually I'm in Michigan now", state)) as any;
  const locs = (state.profile as any).facts.filter((f: any) => f.kind === "location");
  assert(locs.length === 1 && locs[0].text === "in Michigan now" && locs[0].needs_confirmation && r.was === "nurse in Ohio", JSON.stringify(locs));
  let refused = "";
  try { await t.correct_profile_fact.run({ id: fact.id, text: "in Texas" }, ctxFor("actually I'm in Michigan now", state)); } catch (e) { refused = String(e); }
  assert(/not saved/.test(refused), `a correction they did not say is refused: ${refused}`);
});

const iso = "2026-10-20T12:00:00Z";
const post = (job_id: string, title: string, location: string, first_seen_at = iso) => ({ job_id, company: job_id.split(":")[1], title, location, url: `https://boards.greenhouse.io/${job_id.split(":")[1]}/jobs/${job_id.split(":")[2]}`, description: "", first_seen_at, closed_at: null });
const POOL = [
  post("greenhouse:newest:1", "Data Analyst", "Austin, TX", "2026-10-21T01:00:00Z"),
  post("greenhouse:chi:2", "Senior Data Analyst", "Chicago, IL"),
  post("greenhouse:rem:3", "Senior Data Analyst", "Remote - US"),
  post("greenhouse:jr:4", "Junior Data Analyst", "Chicago, IL"),
];

Deno.test("WO-106/F3.1 the stored goal ranks the search: \"senior data analyst\" + Chicago first, before newer postings that miss it; nothing confirmed is needed", async () => {
  const t = tools({ postings: async () => POOL }), state: Record<string, unknown> = {};
  await t.add_profile_fact.run({ kind: "goal", text: "senior data analyst role" }, ctxFor("I want a senior data analyst role", state));
  await t.add_profile_fact.run({ kind: "location", text: "based in Chicago" }, ctxFor("I'm based in Chicago", state));
  const g = goalOf(state.profile);
  assert(g && g.roles.includes("senior") && g.places.includes("chicago"), JSON.stringify(g));
  const r = await t.search_jobs.run({ query: "data analyst" }, ctxFor("find me jobs", state)) as any;
  const ids = r.postings.map((p: any) => p.job_id);
  assert(ids[0] === "greenhouse:chi:2" && ids[1] === "greenhouse:rem:3" && r.ranked_by === "goal" && r.goal.places.includes("chicago"), JSON.stringify({ ids, ranked_by: r.ranked_by }));
  const none = searchPostings(POOL, "data analyst", null);
  assert(none.postings[0].job_id === "greenhouse:newest:1" && none.ranked_by === "newest" && none.goal === null, "no goal on file: newest first, as before");
});

Deno.test("WO-106/F3.2 a remote goal ranks remote postings first", () => {
  const p: any = { facts: [{ id: "F-1", kind: "goal", text: "remote senior data analyst", needs_confirmation: true, status: "draft" }], preferences: {} };
  const r = searchPostings(POOL, "data analyst", p);
  assert(r.postings[0].job_id === "greenhouse:rem:3", JSON.stringify(r.postings.map((x) => x.job_id)));
});

Deno.test("WO-106/F4.1 every job shown has its own link, checked just before: a dead one is dropped and the next best shown; an unreachable check is marked, never called live", async () => {
  const states: Record<string, "live" | "dead" | "unknown"> = { "greenhouse:chi:2": "dead", "greenhouse:rem:3": "live", "greenhouse:jr:4": "unknown", "greenhouse:newest:1": "live" };
  const noLink = { ...post("acme:x:9", "Data Analyst", "Chicago, IL"), url: "" };
  const t = tools({ postings: async () => [...POOL, noLink], linkCheck: async (j: any) => states[j.job_id] ?? "unknown" });
  const r = await t.search_jobs.run({ query: "data analyst", limit: 3 }, ctxFor("find data analyst jobs", {})) as any;
  const ids = r.postings.map((p: any) => p.job_id);
  assert(!ids.includes("greenhouse:chi:2") && r.links.dead_dropped === 1 && r.postings.length === 3, JSON.stringify({ ids, links: r.links }));
  assert(r.postings.every((p: any) => /^https:\/\//.test(p.url)) && !ids.includes("acme:x:9") && r.links.no_link_dropped >= 1, JSON.stringify(r.links));
  assert(r.postings.find((p: any) => p.job_id === "greenhouse:jr:4")?.link === "unknown", "unknown is said, not hidden and not called live");
});

Deno.test("WO-106/F4.2 the checker asks the board's own API by id: Greenhouse 404 is dead, a 200 is live, a timeout is unknown, Greenhouse's ?error=true redirect is dead", async () => {
  assert(apiUrlFor("greenhouse:stripe:12345") === "https://boards-api.greenhouse.io/v1/boards/stripe/jobs/12345", "greenhouse api");
  assert(apiUrlFor("lever:plaid:0b5e2a4c-1111-4c3e-9a0e-5d1f2c3b4a5d") === "https://api.lever.co/v0/postings/plaid/0b5e2a4c-1111-4c3e-9a0e-5d1f2c3b4a5d", "lever api");
  const asked: string[] = [];
  const fake = (status: number, finalUrl = "", hang = false) => (async (u: string, init: any) => {
    asked.push(u);
    if (hang) return await new Promise<Response>((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted"))));
    const r = new Response("x", { status }); Object.defineProperty(r, "url", { value: finalUrl || u }); return r;
  }) as unknown as typeof fetch;
  assert(await linkChecker(fake(404))({ job_id: "greenhouse:stripe:1", url: "https://boards.greenhouse.io/stripe/jobs/1" }) === "dead", "404");
  assert(asked[0] === "https://boards-api.greenhouse.io/v1/boards/stripe/jobs/1", asked[0]);
  assert(await linkChecker(fake(200))({ job_id: "greenhouse:stripe:2" }) === "live", "200");
  assert(await linkChecker(fake(200, "https://boards.greenhouse.io/stripe?error=true"))({ job_id: "workday:x:1", url: "https://boards.greenhouse.io/stripe/jobs/3" }) === "dead", "error redirect");
  assert(await linkChecker(fake(0, "", true), { timeoutMs: 50 })({ job_id: "lever:plaid:0b5e2a4c-1111", url: "" }) === "unknown", "timeout");
  assert(await linkChecker(fake(200))({ job_id: "x", url: "" }) === "dead", "no link at all is never shown");
});

Deno.test("WO-106/S1 a resume sent as a file on Telegram gets an answer (paste it as text), never silence; a sticker is still left alone", async () => {
  const doc = parseTelegramUpdate({ update_id: 9, message: { message_id: 77, chat: { id: 5551, type: "private" }, from: { id: 5551 }, document: { file_name: "resume.pdf", mime_type: "application/pdf", file_id: "x" } } });
  assert(doc.message?.kind === "seen" && doc.message.file === true, JSON.stringify(doc));
  const c = channel();
  await runInbound(tg(1, "hi") as any, c.d as any);
  await runInbound({ ...doc.message!, messageId: "2" } as any, c.d as any);
  assert(c.sent.includes(FILE_NOT_READ_REPLY), JSON.stringify(c.sent));
  const sticker = parseTelegramUpdate({ update_id: 10, message: { message_id: 78, chat: { id: 5551, type: "private" }, from: { id: 5551 }, sticker: { file_id: "s" } } });
  const before = c.sent.length;
  await runInbound({ ...sticker.message!, messageId: "3" } as any, c.d as any);
  assert(c.sent.length === before, "a sticker gets no reply");
});

Deno.test("WO-106/S2 a pasted resume is read by code into draft facts from the person's own message, never from text the model writes", async () => {
  const msg = "here's my resume:\nMaya Chen\nExperience\nData Analyst, Northbridge Logistics, 2022-2025: built SQL and Tableau dashboards\nSkills\nSQL, Tableau, Python\nEducation\nBS Economics, University of Illinois Chicago, 2022";
  const t = tools(), state: Record<string, unknown> = {};
  const r = await t.read_resume.run({ text: "PhD, Stanford" }, ctxFor(msg, state)) as any;
  const facts = (state.profile as any).facts;
  assert(r.saved >= 5 && facts.every((f: any) => f.needs_confirmation), JSON.stringify(r));
  assert(facts.some((f: any) => f.kind === "experience" && /Northbridge/.test(f.text)) && facts.some((f: any) => f.kind === "education" && /Illinois/.test(f.text)), JSON.stringify(facts));
  assert(!JSON.stringify(facts).includes("Stanford"), "the model's own text is never read");
  const none = await t.read_resume.run({}, ctxFor("I am a data analyst with three years of SQL experience in Chicago", {})) as any;
  assert(none.saved === 0 && /add_profile_fact/.test(none.next), JSON.stringify(none));
});

Deno.test("WO-106/B1 the answer the model writes beside a tool call is kept when its last message is only a trailer (eval E010 lost it)", async () => {
  const { runAgentTurn } = await import("../../supabase/functions/_shared/agent/loop.ts");
  const answer = "The usual path is an apprenticeship (a union program or a non-union one), often after a short trade-school course; licensing rules vary by state.";
  let n = 0;
  const model = async () => (++n === 1
    ? { content: [{ type: "text", text: answer }, { type: "tool_use", id: "t1", name: "add_profile_fact", input: { kind: "goal", text: "be an electrician" } }] }
    : { content: [{ type: "text", text: "Saved: you want to be an electrician. Tell me if that's off." }] }) as any;
  const r = await runAgentTurn({ system: "s", history: [], message: "I want to be an electrician, how do I start", tools: careerTools({ postings: async () => [] }), model, ctx: { userId: "u", threadId: "t", now: T0, state: {} } });
  assert(r.reply.startsWith(answer) && /Tell me if that's off/.test(r.reply), r.reply);
  let m = 0;
  const long = "Here is the full answer, which already covers everything the person asked for in detail, with the steps and the trade-offs for their state laid out in order.";
  const model2 = async () => (++m === 1 ? { content: [{ type: "text", text: "Let me save that." }, { type: "tool_use", id: "t1", name: "add_profile_fact", input: { kind: "goal", text: "be an electrician" } }] } : { content: [{ type: "text", text: long }] }) as any;
  const r2 = await runAgentTurn({ system: "s", history: [], message: "I want to be an electrician, how do I start", tools: careerTools({ postings: async () => [] }), model: model2, ctx: { userId: "u", threadId: "t", now: T0, state: {} } });
  assert(r2.reply === long, `a full final answer is left alone, and a short preamble is never added: ${r2.reply}`);
});

Deno.test("WO-106/B2 the reply check is code's: no tool runs while a wording or fact check is answered, and the note says not to act on it (eval E009 saved it as a standing instruction)", async () => {
  const { runAgentTurn } = await import("../../supabase/functions/_shared/agent/loop.ts");
  const payloads: any[] = [];
  let n = 0;
  const model = async (p: any) => {
    payloads.push(p);
    return (++n === 1
      ? { content: [{ type: "text", text: "You have 7 years at Google as a staff engineer, so quitting is fine." }] }
      : { content: [{ type: "text", text: "Whether to quit depends on your savings and how bad it is day to day; find the next role first if you can." }] }) as any;
  };
  const r = await runAgentTurn({ system: "s", history: [], message: "I hate my job, should I quit?", tools: careerTools({ postings: async () => [] }), model, ctx: { userId: "u", threadId: "t", now: T0, state: {} } });
  assert(payloads.length === 2, `one check: ${payloads.length}`);
  const note = JSON.stringify(payloads[1].messages.at(-1));
  assert(/never mention it, never act on it, never save it/.test(note), note);
  assert(payloads[1].tool_choice?.type === "none", "no tool while a fact check is answered");
  assert(/savings/.test(r.reply) && !/Google/.test(r.reply), r.reply);
});

Deno.test("WO-106/B3 \"apply to 15 data analyst jobs\" queues only data analyst roles; picks by reference are not screened", () => {
  const picks = [
    { job_id: "greenhouse:spacex:1", url: "u1", company: "SpaceX", title: "Payroll Analyst", location: "Hawthorne, CA" },
    { job_id: "greenhouse:spacex:2", url: "u2", company: "SpaceX", title: "Sr. Data Analyst, Starlink", location: "Redmond, WA" },
    { job_id: "greenhouse:acme:3", url: "u3", company: "Acme", title: "Data Analyst", location: "Chicago, IL" },
  ];
  const r = offRole(picks, "apply to 15 data analyst jobs for me");
  assert(r.ok.map((p) => p.job_id).join() === "greenhouse:spacex:2,greenhouse:acme:3" && /not a data analyst role/.test(r.refused[0].reason), JSON.stringify(r));
  assert(offRole(picks, "Apply me to 3 data analyst jobs in Chicago, remote is fine").ok.map((p) => p.job_id).join() === "greenhouse:spacex:2,greenhouse:acme:3", "the role is the words before \"jobs\"; the place and the rest are the search's");
  assert(offRole(picks, "apply me to it").ok.length === 3, "no role named, nothing screened");
  assert(offRole(picks, "apply to the first one").ok.length === 3 && offRole(picks, "apply to both").ok.length === 3, "a pick by reference is the person's choice");
});

Deno.test("WO-106/F2.3 a move changes the city in the goal and keeps the role (run 39535880905 replaced the goal with \"I moved to Denver last month\")", async () => {
  const t = tools(), state: Record<string, unknown> = {};
  const { fact } = await t.add_profile_fact.run({ kind: "goal", text: "Senior data analyst role in Chicago" }, ctxFor("I want a senior data analyst role in Chicago", state)) as any;
  await t.correct_profile_fact.run({ id: fact.id, text: "Senior data analyst role in Denver" }, ctxFor("I moved to Denver last month", state));
  const goals = (state.profile as any).facts.filter((f: any) => f.kind === "goal");
  assert(goals.length === 1 && goals[0].text === "Senior data analyst role in Denver", JSON.stringify(goals));
  let refused = "";
  try { await t.correct_profile_fact.run({ id: fact.id, text: "Staff engineer role in Denver" }, ctxFor("I moved to Denver last month", state)); } catch (e) { refused = String(e); }
  assert(/not saved/.test(refused), `words neither said nor in the corrected fact are refused: ${refused}`);
});

Deno.test("WO-106/F3.3 a goal said in one breath splits into role and place; a posting is a role_match only when its title is the role", () => {
  const p: any = { facts: [{ id: "F-1", kind: "goal", text: "Senior data analyst role in Chicago or remote", needs_confirmation: true }], preferences: {} };
  const g = goalOf(p)!;
  assert(g.roles.join() === "senior,data,analyst" && g.places.includes("chicago") && g.remote, JSON.stringify(g));
  const pool = [post("greenhouse:a:1", "Senior Data Analyst", "Chicago, IL"), post("greenhouse:b:2", "Credit Risk Analyst Commercial Underwriter", "Chicago, IL")];
  const r = searchPostings(pool, "analyst", p);
  const m = Object.fromEntries(r.postings.map((x) => [x.job_id, x.role_match]));
  assert(m["greenhouse:a:1"] === true && m["greenhouse:b:2"] === false, JSON.stringify(m));
});

Deno.test("WO-106/B4 a pay figure no tool returned and the person never said is put to the model, then removed (eval E038 invented $65k-$95k)", async () => {
  const { runAgentTurn } = await import("../../supabase/functions/_shared/agent/loop.ts");
  const { unsourcedMoney } = await import("../../supabase/functions/_shared/agent/reply_guards.ts");
  assert(unsourcedMoney("Postings list about $65k-$95k. Ask for it.", ["how much should a junior analyst make"]).length === 1, "unsourced");
  assert(unsourcedMoney("Your $85k offer is low.", ["I got an offer for 85k"]).length === 0, "their own figure");
  assert(unsourcedMoney("It pays $120,000.", ['{"pay":"$120,000 per year"}']).length === 0, "a tool's figure");
  const model = async () => ({ content: [{ type: "text", text: "Postings list about $65k to $95k for that. I don't have verified pay data beyond postings." }] }) as any;
  const r = await runAgentTurn({ system: "s", history: [], message: "how much should a junior analyst make", tools: careerTools({ postings: async () => [] }), model, ctx: { userId: "u", threadId: "t", now: T0, state: {} } });
  assert(!/\$65k/.test(r.reply) && /don't have verified pay/.test(r.reply), r.reply);
});
