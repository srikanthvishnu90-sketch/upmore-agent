// Original invented conversations, driven through the real agentTurn + career tools.
// Scripted providers prove routing, state and output-boundary behavior; they do not measure model quality.
import { agentTurn } from "../../supabase/functions/agent-chat/career_brain.ts";
import { memoryWantStore } from "../../supabase/functions/_shared/career_apply_want.ts";
import type { ModelFn } from "../../supabase/functions/_shared/agent/loop.ts";

function eq(got: unknown, expected: unknown, reason = "") {
  if (JSON.stringify(got) !== JSON.stringify(expected)) throw new Error(reason + ": got " + JSON.stringify(got) + ", expected " + JSON.stringify(expected));
}
function ok(value: unknown, reason: string): asserts value { if (!value) throw new Error(reason); }
const NOW = Date.UTC(2026, 9, 21, 17);
const USER = "SYNTHETIC-CONVERSATION-OWNER";
const THREAD = "SYNTHETIC-CONVERSATION-THREAD";
const STEPS = "Read the role. Rehearse one example.";
const text = (s: string) => ({ content: [{ type: "text", text: s }], stop_reason: "end_turn" });
const call = (id: string, name: string, input: unknown, pre = "") => ({
  content: [...(pre ? [{ type: "text", text: pre }] : []), { type: "tool_use", id, name, input }], stop_reason: "tool_use",
});
type Options = Partial<Omit<Parameters<typeof agentTurn>[0], "model">>;
async function conversation(responses: any[], options: Options = {}) {
  const payloads: any[] = [];
  const stores = options.stores ?? {};
  const model: ModelFn = async (p) => {
    payloads.push(structuredClone(p));
    const response = responses[Math.min(payloads.length - 1, responses.length - 1)];
    if (response instanceof Error) throw response;
    return response;
  };
  const result = await agentTurn({
    message: "Give me two concrete interview preparation steps tonight.", history: [], stores,
    userId: USER, threadId: THREAD, now: NOW, ...options, model,
  });
  return { result, payloads, stores };
}
function toolResults(payload: any): any[] {
  return payload.messages.flatMap((m: any) => Array.isArray(m.content) ? m.content : [])
    .filter((b: any) => b.type === "tool_result")
    .map((b: any) => { try { return JSON.parse(b.content); } catch { return b.content; } });
}
const POSTINGS = [
  { job_id: "greenhouse:cedarvalefixture:531", company: "Cedarvale Fixture Studio", title: "Data Analyst", location: "Remote",
    url: "https://boards.greenhouse.io/cedarvalefixture/jobs/531", description: "Analyze reporting data.", first_seen_at: new Date(NOW).toISOString(), closed_at: null },
  { job_id: "lever:willowfixture:fixture-532", company: "Willow Fixture Workshop", title: "Payroll Analyst", location: "Remote",
    url: "https://jobs.lever.co/willowfixture/fixture-532", description: "Run payroll reporting.", first_seen_at: new Date(NOW).toISOString(), closed_at: null },
];
const posting = async (id: string) => POSTINGS.find((p) => p.job_id === id) ?? null;

Deno.test("conversation capability: an answer and draft fact survive the save-confirmation handoff", async () => {
  const { result, stores, payloads } = await conversation([
    call("save-goal", "add_profile_fact", { kind: "goal", text: "data analyst role" }, STEPS),
    text("Saved: you want a data analyst role. Is that right?"),
  ], { message: "I want a data analyst role. Give me two concrete interview preparation steps tonight." });
  ok(result.reply.includes(STEPS), "the requested two-step answer was lost to the save receipt");
  eq(payloads.length, 2, "retaining an existing answer adds no provider call");
  const facts = (stores.profile as any).facts;
  eq(facts.length, 1); eq(facts[0].text, "data analyst role");
  eq(facts[0].needs_confirmation, true); eq(facts[0].status, "draft");
  eq(result.tool_calls.map((c) => [c.name, c.ok]), [["add_profile_fact", true]]);
  eq(result.pending_approvals, []);
});

Deno.test("conversation capability: a bare acknowledgement is repaired against the original real entry-point request", async () => {
  const { result, payloads } = await conversation([text("Got it."), text(STEPS)]);
  eq(result.reply, STEPS); eq(result.stopped, "final"); eq(payloads.length, 2);
  eq(payloads[1].messages, payloads[0].messages, "the repair is not a new user request");
  eq(payloads[1].tool_choice, { type: "none" });
  eq(result.tool_calls, []);
});

Deno.test("conversation capability: complete useful text adds no repair call", async () => {
  const { result, payloads } = await conversation([text(STEPS)]);
  eq(result.reply, STEPS); eq(payloads.length, 1); eq(result.stopped, "final");
});

Deno.test("conversation capability: a deliberately requested future-tense phrase stays literal", async () => {
  const literal = "I'll put together a plan for tonight.";
  const { result, payloads } = await conversation([text(literal)], { message: 'Reply with exactly "' + literal + '"' });
  eq(result.reply, literal); eq(payloads.length, 1); eq(result.tool_calls, []);
});

Deno.test("conversation capability: a short answer from this conversation needs no rewrite", async () => {
  const { result, payloads } = await conversation([text("Monday.")], { message: "My interview is on Monday. When is my interview?" });
  eq(result.reply, "Monday."); eq(payloads.length, 1); eq(result.tool_calls, []);
});

Deno.test("conversation capability: a concrete missing-posting question neither invents answers nor starts an application", async () => {
  const question = "Which posting should I prepare the application for?";
  const { result, payloads, stores } = await conversation([text(question)], { message: "Prepare an application for me." });
  eq(result.reply, question); eq(payloads.length, 1);
  eq(result.tool_calls, []); eq(result.pending_approvals, []); eq(stores, {});
});

Deno.test("conversation capability: interview news records the real stage and day before answering the next-step question", async () => {
  const { result, stores, payloads } = await conversation([
    call("track-news", "track_application", { company: "Cedarvale Fixture Studio", role: "Data Analyst", stage: "Interview", when: "Friday" }),
    text("Recorded the interview at Cedarvale Fixture Studio for Friday. Read the role and rehearse one example."),
  ], { message: "Cedarvale Fixture Studio invited me to interview for Data Analyst on Friday. Record it and tell me what to prepare." });
  const rows = (stores.trackStore as any).rows;
  eq(rows.length, 1); eq(rows[0].stage, "Interview rounds"); eq(rows[0].next_when, "Friday");
  eq(result.tool_calls.map((c) => [c.name, c.ok]), [["track_application", true]]);
  eq(payloads.length, 2); ok(result.reply.includes("Friday"), "the reported day was omitted");
  ok(result.reply.includes("rehearse"), "recording replaced the requested preparation answer");
});

Deno.test("conversation capability: a later correction updates the existing tracker row", async () => {
  const stores: Record<string, unknown> = {};
  const first = await conversation([
    call("first-day", "track_application", { company: "Cedarvale Fixture Studio", role: "Data Analyst", stage: "Interview", when: "Friday" }),
    text("Recorded the interview for Friday."),
  ], { stores, message: "Cedarvale Fixture Studio invited me to interview for Data Analyst on Friday." });
  const second = await conversation([
    call("correct-day", "track_application", { company: "Cedarvale Fixture Studio", stage: "Interview rounds", when: "Monday" }),
    text("Updated the interview at Cedarvale Fixture Studio to Monday."),
  ], { stores, message: "Correction: Cedarvale Fixture Studio moved that interview to Monday.",
    history: [{ role: "user", content: "Cedarvale Fixture Studio invited me to interview for Data Analyst on Friday." }, { role: "assistant", content: first.result.reply }] });
  const rows = (stores.trackStore as any).rows;
  eq(rows.length, 1); eq(rows[0].next_when, "Monday"); eq(rows[0].role, "Data Analyst");
  eq(second.result.tool_calls.length, 1);
});

Deno.test("conversation capability: search-to-queue does not pad a requested role with another analyst role", async () => {
  const wants = memoryWantStore();
  const { result, payloads } = await conversation([
    call("find-roles", "search_jobs", { query: "analyst", limit: 2 }),
    call("queue-roles", "queue_applications", { postings: POSTINGS }),
    text("Queued the Data Analyst role at Cedarvale Fixture Studio. The payroll role was not queued because it is a different role. Nothing was sent."),
  ], { message: "Apply to 2 data analyst jobs.", postings: async () => POSTINGS, posting, wants, linkCheck: async () => "live" });
  const rows = await wants.list(USER);
  eq(rows.length, 1); eq(rows[0].title, "Data Analyst"); eq(rows[0].company, "Cedarvale Fixture Studio");
  const queue = toolResults(payloads[2]).find((r) => r && r.queued !== undefined);
  eq(queue.queued, 1); eq(queue.refused.length, 1);
  ok(queue.refused[0].reason.includes("not a data analyst role"), "the role-specific refusal disappeared");
  eq(result.pending_approvals, []); ok(!/submitted|sent your application/i.test(result.reply), "queue was reported as submission");
});

Deno.test("conversation capability: repeated queue calls keep one pending posting", async () => {
  const wants = memoryWantStore();
  const { result, payloads } = await conversation([
    call("queue-once", "queue_applications", { postings: [POSTINGS[0]] }),
    call("queue-again", "queue_applications", { postings: [POSTINGS[0]] }),
    text("The Data Analyst role at Cedarvale Fixture Studio is in your queue once. Nothing was sent."),
  ], { message: "Apply to data analyst jobs.", posting, wants });
  eq((await wants.list(USER)).length, 1);
  const results = toolResults(payloads[2]).filter((r) => r && r.queued !== undefined);
  eq(results.map((r) => [r.queued, r.already]), [[1, 0], [0, 1]]);
  eq(result.tool_calls.filter((c) => c.name === "queue_applications" && c.ok).length, 2);
  eq(result.pending_approvals, []);
});

Deno.test("conversation capability: an unavailable apply connection never creates a phantom queued action", async () => {
  const { result } = await conversation([
    call("queue-unwired", "queue_applications", { postings: [POSTINGS[0]] }),
    text("Applying from chat is not connected here. Paste the posting link into the extension queue."),
  ], { message: "Apply to data analyst jobs.", posting });
  eq(result.tool_calls.map((c) => [c.name, c.ok]), [["queue_applications", false]]);
  eq(result.pending_approvals, []);
  ok(/not connected/i.test(result.reply), "missing connection was hidden by a success claim");
  ok(!/queued|submitted/i.test(result.reply), "an unavailable route was reported as completed");
});

Deno.test("conversation capability: repair cannot execute a real draft-save tool", async () => {
  const { result, stores, payloads } = await conversation([
    text("Is that right?"),
    call("repair-save", "add_profile_fact", { kind: "goal", text: "data analyst role" }),
  ], { message: "I want a data analyst role. Give me two concrete interview preparation steps tonight." });
  eq(payloads.length, 2); eq(result.stopped, "incomplete_reply");
  eq(result.tool_calls, []); eq(result.pending_approvals, []); eq(stores, {});
});

Deno.test("conversation capability: failure after a real save does not repeat the save or deny it", async () => {
  const { result, stores, payloads } = await conversation([
    call("initial-save", "add_profile_fact", { kind: "goal", text: "data analyst role" }),
    text("Is that right?"),
    call("repeat-save", "add_profile_fact", { kind: "goal", text: "data analyst role" }),
  ], { message: "I want a data analyst role. Give me two concrete interview preparation steps tonight." });
  eq((stores.profile as any).facts.length, 1);
  eq(result.tool_calls.map((c) => [c.name, c.ok]), [["add_profile_fact", true]]);
  eq(result.stopped, "incomplete_reply"); eq(payloads.length, 3);
  ok(!/nothing.{0,10}saved/i.test(result.reply), "the completed draft save was denied");
});
