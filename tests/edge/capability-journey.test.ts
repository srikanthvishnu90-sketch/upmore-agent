// Product capability, end to end (the owner's bar: test what a person can do, not only the parts). One person's day with
// Trainee, through the real modules in the order production runs them:
//   text in (conversation.handleInbound + the channel's STOP rules) -> the agent loop and its career tools -> postings
//   ingested from a Greenhouse-shaped board feed (career_ingest, the real normalizer) -> job alerts planned (runAlerts)
//   -> the outbox delivered to the phone (channel.deliverDue through a recording Send).
// Only two things are stand-ins, both labeled: the board's HTTP (a fixed Greenhouse JSON body) and the model (a
// deterministic tool-caller that reads the real tool results; the model's judgment is graded by the eval runner, WO-003,
// never here). Everything a person would see is asserted as text.
// Run: deno test --no-check tests/edge/capability-journey.test.ts
import { handleInbound, memoryStore, type Brain } from "../../supabase/functions/_shared/conversation.ts";
import { deliverDue, memoryChannel, CHANNEL_REPLIES } from "../../supabase/functions/_shared/channel.ts";
import { agentTurn } from "../../supabase/functions/agent-chat/career_brain.ts";
import { boardFetchFeed, ingestBoards, memoryPostingsDb, searchWords } from "../../supabase/functions/_shared/career_ingest.ts";
import { memoryAlertStore } from "../../supabase/functions/_shared/career_alert_store.ts";
import { runAlerts } from "../../supabase/functions/_shared/career_proactive_run.ts";
import type { ModelFn } from "../../supabase/functions/_shared/agent/loop.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const MIN = 60000, T0 = Date.UTC(2026, 9, 19, 15); // Monday 11:00 in New York
const ME = "+15550001111";

// The board: Stripe's Greenhouse feed, as the public API returns it. Jobs are added over the day.
const ghJob = (id: number, title: string, city: string) => ({ id, title, location: { name: city }, absolute_url: `https://boards.greenhouse.io/stripe/jobs/${id}`, updated_at: "2026-10-18T00:00:00Z", content: "SQL, dashboards." });

// The model stand-in: decides from the person's words, then answers only from what the tools returned.
const textOf = (m: any) => typeof m.content === "string" ? m.content : (m.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ");
const lastUser = (p: any) => { for (let i = p.messages.length - 1; i >= 0; i--) { const m = p.messages[i]; if (m.role === "user" && textOf(m)) return textOf(m); } return ""; };
const model: ModelFn = (async (p: any) => {
  const last = p.messages[p.messages.length - 1];
  const result = Array.isArray(last.content) ? last.content.find((b: any) => b.type === "tool_result") : null;
  if (result) {
    const r = JSON.parse(result.content);
    if (r.postings) return { content: [{ type: "text", text: r.postings.length ? r.postings.slice(0, 3).map((j: any) => `${j.title} at ${j.company} (${j.location})\n${j.url}`).join("\n\n") : "I found no postings for that yet." }], stop_reason: "end_turn" };
    if (r.alerts) return { content: [{ type: "text", text: `Alerts are on for ${r.alerts.keywords.join(", ")} in ${r.alerts.locations.join(", ") || "any city"}${r.alerts.remote_ok ? " or remote" : ""}: up to ${r.alerts.max_instant_per_day} texts a day, the rest in a report at ${r.alerts.report_hour}:00.` }], stop_reason: "end_turn" };
    return { content: [{ type: "text", text: `Tool said: ${result.content}` }], stop_reason: "end_turn" };
  }
  const said = lastUser(p).toLowerCase();
  if (/find|search/.test(said)) return { content: [{ type: "tool_use", id: "c1", name: "search_jobs", input: { query: "data analyst new york" } }], stop_reason: "tool_use" };
  if (/text me|alert/.test(said)) return { content: [{ type: "tool_use", id: "c2", name: "set_job_alerts", input: { keywords: ["data analyst"], locations: ["New York"] } }], stop_reason: "tool_use" };
  return { content: [{ type: "text", text: "Tell me the kind of job you want." }], stop_reason: "end_turn" };
}) as ModelFn;

function trainee() {
  let now = T0;
  // Each journey has its own board, starting with three jobs.
  const board = [ghJob(555001, "Software Engineer, New Grad", "San Francisco, CA"), ghJob(555002, "Data Analyst", "New York, NY"), ghJob(555003, "Data Analyst", "Chicago, IL")];
  const boardHttp = (async () => new Response(JSON.stringify({ jobs: board }), { status: 200 })) as unknown as typeof fetch;
  const jobs = memoryPostingsDb(), alerts = memoryAlertStore(), people = memoryStore(), channel = memoryChannel();
  const phone: string[][] = [];
  const brain: Brain = async (a) => {
    const t = await agentTurn({ message: a.message, history: a.history, stores: a.stores, userId: a.userId, threadId: a.userId, now, model,
      postings: (q) => jobs.search(searchWords(q), 150), alerts });
    return { reply: t.reply, stores: a.stores };
  };
  const send = async (contact: string, bubbles: string[]) => { if (contact === ME) phone.push(bubbles); return { ok: true as const, id: `lm-${phone.length}` }; };
  let seq = 0;
  return {
    phone, alerts, channel, board,
    at: (t: number) => { now = t; },
    // The person texts; the reply is what their phone shows.
    text: async (words: string) => (await handleInbound({ contact: ME, text: words, at: now }, { brain, store: people, channel })).bubbles,
    // The every-15-minutes ingest, the every-5-minutes alerts run, the every-minute delivery: in production order.
    ingest: () => ingestBoards({ boards: [{ company: "Stripe", provider: "greenhouse", board: "stripe" }], fetchFeed: boardFetchFeed(boardHttp), db: jobs, now }),
    alertsRun: () => runAlerts({ store: alerts, now, recentPostings: (s) => jobs.newSince(s), postingsById: (ids) => jobs.getMany(ids),
      // career_outbox -> the channel's queue (production joins channel_contacts for the number, in career_outbox_claim)
      outbox: { enqueue: async (userId, m) => { const fresh = await alerts.enqueue(userId, m); if (fresh) channel.queue({ id: String(++seq), userId, contact: ME, key: m.key, text: m.text, deliver_at: m.at, attempts: 0 }); return fresh; } } }),
    deliver: () => deliverDue({ store: channel, send, now, dailyContactCap: 300 }),
  };
}

Deno.test("Capability: a new person finds real postings by texting, with the employer's own links, and nothing invented", async () => {
  const t = trainee();
  await t.ingest();
  const reply = (await t.text("find me data analyst jobs in new york")).join("\n\n");
  assert(reply.includes("Data Analyst at Stripe (New York, NY)"), reply);
  assert(reply.includes("https://boards.greenhouse.io/stripe/jobs/555002"), "the employer's own posting link");
  assert(!reply.includes("Software Engineer"), "a job that doesn't match isn't offered");
  const none = memoryPostingsDb(); // a person on a day with no postings ingested gets told so, not a made-up list
  eq((await none.search(searchWords("data analyst new york"), 150)).length, 0);
});

Deno.test("Capability: 'text me when new ones come in' turns on alerts; a new matching job reaches the phone within minutes", async () => {
  const t = trainee();
  await t.ingest();
  t.at(T0 + MIN);
  const on = (await t.text("text me when new data analyst jobs in new york come in")).join(" ");
  assert(/Alerts are on for data analyst in new york or remote: up to 3 texts a day/.test(on), on);
  t.at(T0 + 10 * MIN); await t.alertsRun(); await t.deliver();
  eq(t.phone.length, 0, "jobs that were already on the board when alerts were turned on are not alerted");
  t.board.push(ghJob(555004, "Data Analyst", "New York, NY"), ghJob(555005, "Data Analyst", "Chicago, IL"), ghJob(555006, "Product Designer", "New York, NY"));
  t.at(T0 + 15 * MIN); await t.ingest();
  t.at(T0 + 19 * MIN); await t.alertsRun(); await t.deliver();
  eq(t.phone, [["New match: Data Analyst at Stripe (New York, NY), first seen 4 min ago.", "https://boards.greenhouse.io/stripe/jobs/555004"]],
    "exactly the new New York data analyst job: not Chicago, not the designer role");
  t.at(T0 + 24 * MIN); await t.alertsRun(); await t.deliver();
  eq(t.phone.length, 1, "and never twice");
});

Deno.test("Capability: STOP silences every text Trainee would start, at once; START brings them back; nothing missed is sent late", async () => {
  const t = trainee();
  await t.ingest();
  t.at(T0 + MIN); await t.text("text me when new data analyst jobs in new york come in");
  eq(await t.text("STOP"), [CHANNEL_REPLIES.stop]);
  t.board.push(ghJob(555010, "Data Analyst", "New York, NY"));
  t.at(T0 + 15 * MIN); await t.ingest();
  t.at(T0 + 19 * MIN); await t.alertsRun();
  const r = await t.deliver();
  eq([r.delivered, r.skipped_opt_out, t.phone.length], [0, 1, 0], "the alert was planned but never sent");
  const answered = await t.text("find me data analyst jobs in new york");
  assert(answered.join(" ").includes("Data Analyst at Stripe"), "after STOP Trainee still answers when they text it");
  eq(await t.text("start"), [CHANNEL_REPLIES.start]);
  t.at(T0 + 24 * MIN); await t.deliver();
  eq(t.phone.length, 0, "the alert skipped while they were opted out is not revived");
  t.board.push(ghJob(555011, "Senior Data Analyst", "New York, NY"));
  t.at(T0 + 30 * MIN); await t.ingest();
  t.at(T0 + 34 * MIN); await t.alertsRun(); await t.deliver();
  eq(t.phone.map((b) => b[1]), ["https://boards.greenhouse.io/stripe/jobs/555011"], "after START the next new match arrives");
});

Deno.test("Capability: at night the alert waits for morning, and the person's daily cap holds (the rest go in the morning report)", async () => {
  const t = trainee();
  await t.ingest();
  t.at(T0 + MIN); await t.text("text me when new data analyst jobs in new york come in");
  const night = Date.UTC(2026, 9, 20, 3); // 23:00 in New York
  for (const id of [555020, 555021, 555022, 555023]) t.board.push(ghJob(id, "Data Analyst", "New York, NY"));
  t.at(night); await t.ingest();
  t.at(night + 4 * MIN); await t.alertsRun(); await t.deliver();
  eq(t.phone.length, 0, "nothing at 23:04");
  t.at(Date.UTC(2026, 9, 20, 11, 1)); await t.deliver(); // 07:01, quiet hours over
  eq(t.phone.length, 3, "three instant texts a day by default");
  t.at(Date.UTC(2026, 9, 20, 12, 5)); await t.alertsRun(); await t.deliver(); // 08:05, the report hour
  const report = t.phone.at(-1)!.join("\n");
  assert(t.phone.length === 4 && report.includes("https://boards.greenhouse.io/stripe/jobs/5550"), `the fourth job rides the morning report:\n${report}`);
});
