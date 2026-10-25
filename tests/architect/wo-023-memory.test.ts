// WO-023 part B (architect): Trainee knows what is needed and remembers what matters. What is known about the person is
// built in code and put in every turn's system prompt: standing instructions (kept on the account, only in the person's
// own words), confirmed and unconfirmed facts, job alerts in exact terms, and the application pipeline with what each
// stopped application needs. Alerts change by the field that changed. Synthetic data; a scripted model.
import {
  addStanding, alertLine, BLOCK_BUDGET, memoryStandingStore, personBlock, quotedFrom, type Standing, summarizePipeline,
} from "../../supabase/functions/_shared/agent/memory.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { agentTurn } from "../../supabase/functions/agent-chat/career_brain.ts";
import { memoryAlertStore, validPrefs } from "../../supabase/functions/_shared/career_alert_store.ts";
import { DEFAULT_PREFS } from "../../supabase/functions/_shared/career_alerts.ts";
import HANDLER from "../../supabase/functions/agent-chat/handler-career.ts" with { type: "text" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const T = Date.parse("2026-10-19T15:00:00Z");
const S = (id: string, text: string, said: string): Standing => ({ id, text, said, at: "2026-10-19T15:00:00.000Z" });

Deno.test("WO-023/B1 the block: standing instructions with their words, facts confirmed apart from drafts, alerts in exact terms", () => {
  const prefs = validPrefs({ keywords: ["data analyst"], locations: ["chicago"], remote_ok: true, quiet_end: 9, floor: { min_pay: { amount: 80000, period: "year" } } });
  assert(prefs.ok);
  const b = personBlock({
    profile: { facts: [
      { id: "F-001", kind: "experience", text: "2 years of SQL and Tableau", needs_confirmation: false, status: "confirmed" },
      { id: "F-002", kind: "location", text: "lives in Chicago", needs_confirmation: true, status: "draft" },
    ] },
    standing: [S("S-001", "Needs visa sponsorship (F-1 OPT)", "I will need visa sponsorship")],
    alerts: { prefs: prefs.prefs, tz: "America/Chicago" },
    pipeline: null,
  });
  assert(b.includes('- S-001: Needs visa sponsorship (F-1 OPT) (they said: "I will need visa sponsorship", 2026-10-19)'), b);
  assert(/Confirmed facts[^\n]*\n- \[experience\] 2 years of SQL and Tableau/.test(b), b);
  assert(/waiting for their yes[^\n]*\n- F-002 \[location\] lives in Chicago/.test(b), "a draft is marked as one");
  assert(b.includes("Job alerts: on, for data analyst; chicago, remote allowed; nothing under $80,000 a year; at most 3 instant texts a day; daily report at 8:00; quiet 22:00-9:00 (America/Chicago)."), b);
  assert(b.includes("Applications: could not be read this turn; say so if they ask, never guess."));
  const empty = personBlock({ standing: [], alerts: null, pipeline: null });
  assert(/Standing instructions[^\n]*\n- none yet/.test(empty) && empty.includes("Job alerts: none set.") && /Confirmed facts[^\n]*\n- none yet/.test(empty), "absence is said, never left to guess");
});

Deno.test("WO-023/B1 past the budget, facts and pipeline lines drop and are counted; standing instructions never drop", () => {
  const standing = Array.from({ length: 20 }, (_, i) => S(`S-${String(i + 1).padStart(3, "0")}`, `Instruction number ${i + 1} that must hold`, `instruction ${i + 1}`));
  const facts = Array.from({ length: 200 }, (_, i) => ({ id: `F-${i}`, kind: "skill", text: `skill number ${i} with some words to take room`, needs_confirmation: false, status: "confirmed" }));
  const b = personBlock({ profile: { facts }, standing, alerts: null, pipeline: null, budget: 3000 });
  for (const s of standing) assert(b.includes(s.text), `${s.id} kept`);
  assert(/\(\d+ more lines left out for length; read them with a tool if needed\.\)/.test(b), "what was left out is said");
  assert(b.length <= 3000 + standing.reduce((n, s) => n + s.text.length + s.said.length + 40, 0), "over the budget only by the standing instructions");
  assert(BLOCK_BUDGET === 4500);
});

Deno.test("WO-023/B3 the pipeline: waiting, an open card, queued, sent against the limit, and what each stopped one needs", () => {
  const iso = (h: number) => new Date(T - h * 3600000).toISOString();
  const p = summarizePipeline({
    prepared: [{ state: "ready" }, { state: "shown" }, { state: "approved" }],
    openCard: { shown_at: iso(1), items: [1, 2] },
    jobs: [
      { company: "Queued Co", url: "https://jobs.example.test/q", state: "queued", reason: null, created_at: iso(2), updated_at: iso(2) },
      { company: "Code Co", url: "https://jobs.example.test/c", state: "needs_user", reason: "email_code", created_at: iso(3), updated_at: iso(3) },
      { company: "Done Co", url: "https://jobs.example.test/d", state: "confirmed", reason: null, created_at: iso(5), updated_at: iso(4) },
      { company: "Old Co", url: "https://jobs.example.test/o", state: "confirmed", reason: null, created_at: iso(30), updated_at: iso(30) },
    ],
    dailyLimit: 40,
  }, T);
  eq([p.waiting, p.card?.count, p.queued, p.sent_24h, p.limit], [2, 2, 1, 3, 40]);
  eq(p.needs, [{ company: "Code Co", url: "https://jobs.example.test/c", what: "the employer emailed them a code to enter" }]);
  const b = personBlock({ standing: [], alerts: null, pipeline: p });
  assert(/Applications: 2 prepared and waiting for their yes \(a card of 2 is open[^)]*\); 1 approved and waiting to run on their computer; 3 of their 40 a day used in the last 24 hours\./.test(b), b);
  assert(b.includes("Stopped until they help:\n- Code Co (https://jobs.example.test/c): the employer emailed them a code to enter"), b);
  assert(b.includes("- Done Co: the employer confirmed it"), b);
  eq(summarizePipeline({ prepared: [], openCard: { shown_at: iso(25), items: [1] }, jobs: [], dailyLimit: 999 }, T).card, null, "a card older than a day is not open");
  eq(summarizePipeline({ prepared: [], openCard: null, jobs: [], dailyLimit: 999 }, T).limit, 999, "a pace the person set has no maximum (CAPS-1390)");
  eq(summarizePipeline({ prepared: [], openCard: null, jobs: [], dailyLimit: null }, T).limit, null, "no pace set: no product number");
  assert(/sent in the last 24 hours \(no daily limit; they may set their own pace\)/.test(personBlock({ standing: [], alerts: null, pipeline: summarizePipeline({ prepared: [], openCard: null, jobs: [], dailyLimit: null }, T) })), "the block names no number when none is set");
});

Deno.test("WO-023/B2 a standing instruction is kept only in the person's own words, once, at most 20; removed only when they ask", async () => {
  assert(quotedFrom("Important: I'm on F-1 OPT and I will NEED visa sponsorship!", "I will need visa sponsorship"));
  assert(!quotedFrom("I'm on F-1 OPT", "I need sponsorship"), "words they did not say");
  assert(!quotedFrom("no staffing agencies please", "staffing"), "one word is not a quote");
  const memory = memoryStandingStore(), tools = careerTools({ postings: async () => [], memory });
  const remember = tools.find((t) => t.name === "remember_instruction")!, forget = tools.find((t) => t.name === "forget_instruction")!;
  const ctx = (message: string) => ({ userId: "TEST-U", threadId: "TH", now: T, state: {}, turn: { message, added: [] } });
  let err = "";
  try { await remember.run({ instruction: "Needs visa sponsorship", quote: "I need sponsorship" }, ctx("find me jobs in chicago")); } catch (e) { err = (e as Error).message; }
  assert(/not kept: the quote is not in the person's message/.test(err), err);
  eq((await memory.standing("TEST-U")).length, 0, "nothing the person did not say is kept");
  const said = "important: I'm on F-1 OPT and I will need visa sponsorship. please never forget that";
  const r: any = await remember.run({ instruction: "Needs visa sponsorship (F-1 OPT)", quote: "I will need visa sponsorship" }, ctx(said));
  eq([r.kept.id, r.kept.said, r.total], ["S-001", "I will need visa sponsorship", 1]);
  await remember.run({ instruction: "needs visa sponsorship (F-1 OPT).", quote: "need visa sponsorship" }, ctx(said));
  eq((await memory.standing("TEST-U")).length, 1, "the same instruction is kept once");
  let full: Standing[] = [];
  for (let i = 0; i < 20; i++) { const a = addStanding(full, { text: `rule ${i}`, said: "x y", now: T }); assert(a.ok); full = a.items; }
  const over = addStanding(full, { text: "one more", said: "x y", now: T });
  assert(!over.ok && /ask which one to drop/.test(over.error));
  err = "";
  try { await forget.run({ id: "S-001" }, ctx("find me nurse jobs")); } catch (e) { err = (e as Error).message; }
  assert(/did not ask to remove/.test(err), err);
  await forget.run({ id: "S-001" }, ctx("I got my green card, I don't need sponsorship anymore"));
  eq((await memory.standing("TEST-U")).length, 0);
});

Deno.test("WO-023/B tasks: an alert changes by the field that changed; quiet hours can be set; a stop is undone with the old settings", async () => {
  const alerts = memoryAlertStore(), tools = careerTools({ postings: async () => [], alerts });
  const run = (name: string, input: any) => tools.find((t) => t.name === name)!.run(input, { userId: "TEST-U", threadId: "TH", now: T, state: {} });
  await run("set_job_alerts", { keywords: ["icu nurse"], locations: ["seattle"] });
  await run("set_job_alerts", { locations: ["detroit"] });
  await run("set_job_alerts", { max_instant_per_day: 1 });
  let p = (await alerts.get("TEST-U"))!.prefs;
  eq([p.keywords, p.locations, p.max_instant_per_day], [["icu nurse"], ["detroit"], 1], "a correction replaces; a cap keeps the place");
  await run("set_job_alerts", { quiet_end: 9 });
  eq((await alerts.get("TEST-U"))!.prefs.quiet_end, 9, "not before 9am");
  await run("stop_job_alerts", {});
  eq((await alerts.get("TEST-U"))!.prefs.on, false);
  await run("set_job_alerts", { max_instant_per_day: 1 });
  p = (await alerts.get("TEST-U"))!.prefs;
  eq([p.on, p.keywords, p.locations], [true, ["icu nurse"], ["detroit"]], "undo keeps the old alert");
  await run("set_job_alerts", { locations: [] });
  eq((await alerts.get("TEST-U"))!.prefs.locations, [], "an empty list clears");
  const fresh = validPrefs({ locations: ["austin"] }, DEFAULT_PREFS);
  assert(!fresh.ok && /at least one kind of job/.test(fresh.error), "a new alert still needs what to watch");
  assert(!validPrefs({ keywords: ["x"], quiet_end: 25 }).ok);
  assert(alertLine(null) === "Job alerts: none set.");
});

Deno.test("WO-023/B1 every agent turn carries the block, so a constraint said 24 messages ago is still there", async () => {
  const memory = memoryStandingStore(), alerts = memoryAlertStore();
  const systems: string[] = [];
  let step = 0;
  const said = "important before we start: I'm on F-1 OPT and I will need visa sponsorship. please never forget that";
  const model = async (p: any) => {
    systems.push(p.system);
    if (step++ === 0) return { content: [{ type: "tool_use", id: "t1", name: "remember_instruction", input: { instruction: "Needs visa sponsorship (F-1 OPT)", quote: "I will need visa sponsorship" } }], stop_reason: "tool_use" };
    return { content: [{ type: "text", text: "Kept: you need visa sponsorship." }], stop_reason: "end_turn" };
  };
  const turn = async (message: string, history: any[]) => agentTurn({ message, history, stores: {}, userId: "TEST-U", threadId: "TH", now: T, model, alerts, memory,
    known: { standing: await memory.standing("TEST-U"), alerts: null, pipeline: null } });
  await turn(said, []);
  const history = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? "assistant" as const : "user" as const, content: `filler ${i}` }));
  systems.length = 0;
  await turn("ok now find me data analyst jobs in chicago", history);
  assert(systems[0].includes("WHAT YOU KNOW ABOUT THIS PERSON") && systems[0].includes("Needs visa sponsorship (F-1 OPT)"), "the block is in the system prompt");
  assert(/remember_instruction/.test(systems[0]) && /never ask for something the block below already says/i.test(systems[0]));
});

Deno.test("WO-023/B the handler reads what is known before the agent turn and fails closed on standing instructions", () => {
  const at = HANDLER.indexOf("const turn = await agentTurn(");
  const mem = HANDLER.indexOf("const standing = await memory.standing(user.id);");
  assert(mem > 0 && mem < at, "standing instructions are read before the turn, with no catch (a failure fails the turn)");
  // WO-100 superseded the pipeline read: the situation is read once at the top of the turn and names what it could not read.
  assert(/readSituation\(admin, user\.id, Date\.now\(\)\)\.catch/.test(HANDLER) && /alertStore\.get\(user\.id\)\.catch/.test(HANDLER), "alerts and the situation say 'could not be read' instead");
  assert(/known: \{ standing, alerts: alertRow \? \{ prefs: alertRow\.prefs, tz: alertRow\.tz \} : null, pipeline: null, situation \}, memory \}/.test(HANDLER));
});
