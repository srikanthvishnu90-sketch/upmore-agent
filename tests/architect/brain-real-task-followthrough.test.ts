// Original synthetic return-to-task cases. Real conversation, agentTurn and timeline; no provider or network.
import { agentTurn, historyWindow, summaryFor } from "../../supabase/functions/agent-chat/career_brain.ts";
import { handleInbound, memoryStore } from "../../supabase/functions/_shared/conversation.ts";
import { memoryEventStore, normalizeEvent, SUMMARY_MAX, threadSummary, type CareerEvent } from "../../supabase/functions/_shared/agent/timeline.ts";
import { memoryWantStore } from "../../supabase/functions/_shared/career_apply_want.ts";

function ok(v: unknown, why: string): asserts v { if (!v) throw new Error(why); }
function eq(a: unknown, b: unknown, why = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${why}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
}
const NOW = Date.UTC(2026, 9, 21, 18);
const USER = "SYNTHETIC-FOLLOWTHROUGH-OWNER", CONTACT = "+15550002342";
const POSTING = { job_id: "greenhouse:cedarvalefixture:744", company: "Cedarvale Fixture Studio", title: "Data Analyst",
  location: "Remote", url: "https://boards.greenhouse.io/cedarvalefixture/jobs/744", description: "Reporting analysis.",
  first_seen_at: new Date(NOW - 60000).toISOString(), closed_at: null };
const text = (s: string) => ({ content: [{ type: "text", text: s }], stop_reason: "end_turn" });
const use = (name: string, input: unknown) => ({ content: [{ type: "tool_use", id: "synthetic-call", name, input }], stop_reason: "tool_use" });
const event = (kind: CareerEvent["kind"], subject: string, at = NOW, detail: Record<string, unknown> = {}, user = USER) =>
  normalizeEvent({ user_id: user, kind, subject, at, detail, source: kind === "application_finished" ? "receipt" : "chat" });

async function queuedConversation() {
  const events = memoryEventStore(), wants = memoryWantStore();
  let store = memoryStore({ people: [{ id: USER, contact: CONTACT, created: NOW }], history: {}, stores: {}, queue: [], delivered: [], seq: 1 });
  const turns: any[] = [];
  const response = await handleInbound({ contact: CONTACT, at: NOW, text: "Queue the Data Analyst application at Cedarvale Fixture Studio." }, {
    store, brain: async (a) => {
      let n = 0;
      const r = await agentTurn({ ...a, now: NOW, threadId: "SYNTHETIC-ORIGINAL", events, wants,
        posting: async (id) => id === POSTING.job_id ? POSTING : null,
        model: async (p) => { turns.push(structuredClone(p)); return n++ === 0 ? use("queue_applications", { postings: [POSTING] })
          : text("Cedarvale Fixture Studio is queued, not sent. Review its card in the extension before approving it."); } });
      eq(r.stopped, "final", "queue conversation must complete");
      return { reply: r.reply, stores: a.stores };
    },
  });
  eq((await wants.list(USER)).length, 1, "real queue received exactly one posting");
  ok(response.bubbles.join(" ").includes("not sent"), "the first turn must not claim a submission");
  // The conversation and events cross a JSON persistence boundary, as they do between sessions.
  store = memoryStore(JSON.parse(JSON.stringify(store.dump())));
  return { store, events: memoryEventStore(JSON.parse(JSON.stringify(events.dump()))), wants, turns };
}

Deno.test("follow-through: a real queued application survives the long-thread summary into the return prompt", async () => {
  const { store, events, wants } = await queuedConversation();
  for (let n = 0; n < 45; n++) await store.append(USER, { role: n % 2 ? "assistant" : "user", content: `Synthetic unrelated message ${n}.` });
  const newest = [...await store.history(USER)].reverse(), window = historyWindow(newest);
  eq(window.cut, true); ok(!JSON.stringify(window.history).includes(POSTING.company), "old task must be outside the context window");
  const summary = summaryFor(window.cut, await events.recall(USER, {}), NOW + 86400000, "America/Chicago");
  let prompt = "";
  const r = await agentTurn({ message: "Where did we leave that application?", history: window.history, stores: {},
    userId: USER, threadId: "SYNTHETIC-RETURN", now: NOW + 86400000, events, wants, summary,
    model: async (p) => { prompt = p.system; return text("Review the queued application's card in the extension before approving it."); } });
  eq(r.stopped, "final");
  ok(prompt.includes(POSTING.company), "the account's own queued task disappeared from the return prompt");
  ok(/not sent/i.test(prompt), "the queue record must not imply a submission");
});

Deno.test("follow-through: returning through conversation recalls the existing task without queueing or sending it again", async () => {
  const { store, events, wants } = await queuedConversation();
  const calls: string[] = [];
  const returned = await handleInbound({ contact: CONTACT, at: NOW + 86400000, text: "What happened to the application we queued?" }, {
    store, brain: async (a) => {
      let n = 0;
      const r = await agentTurn({ ...a, threadId: "SYNTHETIC-RETURN", now: NOW + 86400000, events, wants,
        model: async () => n++ === 0 ? use("recall", { kinds: ["apply_queued"] })
          : text("Cedarvale Fixture Studio is queued, not sent. Review its card in the extension before approving it.") });
      calls.push(...r.tool_calls.map((c) => c.name));
      eq(r.pending_approvals, []); eq(r.stopped, "final");
      return { reply: r.reply, stores: a.stores };
    },
  });
  eq(calls, ["recall"], "a recall never repeats the queue write");
  eq((await wants.list(USER)).length, 1); eq(events.dump().filter((e) => e.kind === "apply_queued").length, 1);
  ok(returned.bubbles.join(" ").includes("not sent"), "return reply falsely completed the task");
});

Deno.test("follow-through: queue summary counts actual additions and does not promote retry no-ops into more applications", () => {
  const rows = [event("apply_queued", "1 postings", NOW, { queued: 1, companies: [POSTING.company] }),
    event("apply_queued", "0 postings", NOW + 1000, { queued: 0, companies: [] })];
  const summary = threadSummary(rows, NOW + 2000, "America/Chicago");
  ok(summary.includes("Postings queued: 1"), "summary omitted the task or counted a queue retry as another application");
  ok(/not sent/i.test(summary), "the historical queue action must not become a submission receipt");
  ok(summary.includes(POSTING.company), "the return context must identify the task's employer");
  ok(!summary.includes("Postings queued: 2"), "retry no-op was counted as a task");
});

Deno.test("follow-through: a newer employer receipt survives summary pressure from older long search and alert groups", () => {
  const rows = [
    ...Array.from({ length: 3 }, (_, i) => event("search", `Old search ${i} ` + "s".repeat(175), NOW - 10000 + i)),
    ...Array.from({ length: 4 }, (_, i) => event("alert_changed", `Old alert ${i} ` + "a".repeat(175), NOW - 8000 + i)),
    event("application_finished", "New Receipt Fixture Employer", NOW, { state: "confirmed", confirmation_id: "SYNTHETIC-RECEIPT-744" }),
  ];
  const summary = threadSummary(rows, NOW, "America/Chicago");
  ok(summary.includes("New Receipt Fixture Employer confirmed"), "fixed category order let older text crowd out the newest task outcome");
  ok(summary.length <= SUMMARY_MAX, "recency retention must remain bounded");
});

Deno.test("follow-through: one oversized category cannot hide a smaller receipt that still fits", () => {
  const rows = [
    ...Array.from({ length: 3 }, (_, i) => event("search", `Latest search ${i} ` + "s".repeat(175), NOW + i)),
    ...Array.from({ length: 4 }, (_, i) => event("alert_changed", `Earlier alert ${i} ` + "a".repeat(175), NOW - 5000 + i)),
    event("application_finished", "Earlier Useful Receipt Fixture", NOW - 10000, { state: "failed" }),
  ];
  const summary = threadSummary(rows, NOW + 1000, "America/Chicago");
  ok(summary.includes("Latest search"), "the most recent information was lost");
  ok(summary.includes("Earlier Useful Receipt Fixture failed"), "a non-fitting group blocked a smaller receipt");
  ok(summary.length <= SUMMARY_MAX, "skipping a group cannot exceed the budget");
});

Deno.test("follow-through: a later employer receipt outranks the earlier queue action without rewriting either history", () => {
  const summary = threadSummary([
    event("apply_queued", "1 postings", NOW - 10000, { queued: 1, companies: [POSTING.company] }),
    event("application_finished", POSTING.company, NOW, { state: "confirmed", confirmation_id: "SYNTHETIC-FINAL-RECEIPT" }),
  ], NOW + 1000);
  const receipt = summary.indexOf(`${POSTING.company} confirmed`), queued = summary.indexOf("Postings queued:");
  ok(receipt >= 0 && queued >= 0 && receipt < queued, "the final receipt must remain distinguishable from the older queue action");
});

Deno.test("follow-through: summary building does not mutate persisted event history", () => {
  const rows = [event("application_finished", "Latest Fixture", NOW, { state: "failed" }), event("search", "Older role", NOW - 5000)];
  const before = JSON.stringify(rows); threadSummary(rows, NOW); eq(JSON.stringify(rows), before);
});

Deno.test("follow-through: the return summary and recall cannot include another synthetic user's task", async () => {
  const events = memoryEventStore([event("application_finished", "OWN-RECEIPT-EMPLOYER", NOW, { state: "confirmed" }),
    event("application_finished", "OTHER-USER-EMPLOYER", NOW + 1000, { state: "confirmed" }, "SYNTHETIC-OTHER-OWNER")]);
  const own = await events.recall(USER, {}), summary = threadSummary(own, NOW + 2000);
  eq(own.length, 1); ok(summary.includes("OWN-RECEIPT-EMPLOYER"), "own task missing");
  ok(!summary.includes("OTHER-USER-EMPLOYER"), "another user's task entered recall");
});

Deno.test("follow-through: a missing employer confirmation remains unconfirmed in the next-turn summary", () => {
  const summary = threadSummary([event("application_finished", "Unconfirmed Fixture Employer", NOW, { state: "submitted_unconfirmed" })], NOW);
  ok(summary.includes("submitted unconfirmed"), "an uncertain result lost its uncertainty");
  ok(!/Unconfirmed Fixture Employer confirmed\b/.test(summary), "a missing employer receipt was promoted to confirmed");
});
