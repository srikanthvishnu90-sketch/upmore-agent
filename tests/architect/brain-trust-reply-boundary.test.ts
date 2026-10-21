// Original synthetic source-boundary regressions. Scripted model, no providers or network.
import { factSources, postingsOf, untracedFacts } from "../../supabase/functions/_shared/agent/reply_guards.ts";
import { runAgentTurn, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";

function assert(v: unknown, why: string): asserts v { if (!v) throw new Error(why); }
function eq(a: unknown, b: unknown, why: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(why + ": " + JSON.stringify(a)); }
const claim = "Your Excel skills are a strong match.";
const source = (facts: unknown[], results: string[] = []) => factSources({ state: { profile: { facts } }, message: "Which skills match?", history: [], results });
const row = (extra: Record<string, unknown> = {}) => ({ id: "SYN-FACT", kind: "skill", text: "Excel", status: "confirmed", needs_confirmation: false, ...extra });
async function reply(facts: unknown[], toolResult?: unknown) {
  let calls = 0;
  const tools: ToolSpec[] = toolResult === undefined ? [] : [{ name: "get_profile", effect: "read", description: "Read synthetic records", input_schema: { type: "object", properties: {}, required: [] }, run: async () => structuredClone(toolResult) }];
  const r = await runAgentTurn({ system: "Use only supported facts.", history: [], message: "Which of my skills match?", tools,
    model: async () => { calls++; return toolResult !== undefined && calls === 1
      ? { content: [{ type: "tool_use", id: "read-synthetic", name: "get_profile", input: {} }], stop_reason: "tool_use" }
      : { content: [{ type: "text", text: claim }], stop_reason: "end_turn" }; },
    ctx: { userId: "SYNTHETIC-REPLY-OWNER", threadId: "SYNTHETIC-REPLY-THREAD", now: 0, state: { profile: { facts } } } });
  return { ...r, calls };
}
const bare = (s: string, word = "Excel") => new RegExp(`\\b${word}\\b`, "i").test(s.replace(/\[[^\]]*\]/g, ""));

Deno.test("reply trust: unknown or absent profile confirmation states cannot back a personal claim", async () => {
  for (const status of [undefined, null, "", "imported", "deleted"]) {
    const facts = [row({ status })];
    assert(untracedFacts(claim, source(facts)).some((f) => f.word === "Excel"), "status was promoted to proof: " + status);
    const r = await reply(facts); assert(!bare(r.reply), "unsupported state reached the person: " + status);
  }
});

Deno.test("reply trust: explicitly agent-authored or quarantined rows never become proof through confirmed status", () => {
  for (const extra of [{ source: "agent" }, { source: "model-generated" }, { origin: "assistant" }, { quarantined: true }, { source: "rejected" }]) {
    assert(untracedFacts(claim, source([row(extra)])).some((f) => f.word === "Excel"), "origin was promoted to proof: " + JSON.stringify(extra));
  }
});

Deno.test("reply trust: corrected-away values and arbitrary audit metadata are not current fact evidence", async () => {
  const facts = [row({ text: "SQL", corrected_from: "Excel", audit: { old_text: "Excel" }, model_summary: "Excel" })];
  const s = source(facts);
  assert(s.some((x) => x.includes("SQL")), "current fact was discarded");
  assert(!s.some((x) => x.includes("Excel")), "bookkeeping text became active evidence");
  const r = await reply(facts); assert(!bare(r.reply), "corrected-away skill survived the real output guard");
});

Deno.test("reply trust: get_profile cannot launder explicitly unconfirmed or rejected facts through raw JSON", async () => {
  for (const fact of [row({ status: "draft", needs_confirmation: true }), row({ status: "rejected" }), row({ status: "imported" }), row({ source: "agent" })]) {
    const r = await reply([], { confirmed: [], unconfirmed: [fact], facts: [fact] });
    assert(!bare(r.reply), "ineligible row escaped through the tool result: " + JSON.stringify(fact));
  }
});

Deno.test("reply trust: correction-result audit values cannot restore a superseded skill", async () => {
  const r = await reply([], { fact: row({ text: "SQL" }), was: "Excel" });
  assert(!bare(r.reply), "old-value receipt became personal evidence");
});

Deno.test("reply trust: a truncated structured result cannot bypass fact-status filtering as prose", async () => {
  const result = { facts: [row({ status: "draft", needs_confirmation: true })], padding: "synthetic padding ".repeat(1000) };
  const r = await reply([], result);
  assert(!bare(r.reply), "truncated ineligible JSON became plain-text proof");
});

Deno.test("reply trust: posting requirements cannot serve as the applicant's personal skills", () => {
  const posting = { job_id: "greenhouse:synthetic:21", company: "Synthetic Employer", title: "Data Analyst", description: "Excel required", url: "https://example.test/jobs/21" };
  const results = [JSON.stringify({ postings: [posting] })];
  assert(untracedFacts(claim, source([], results)).some((f) => f.word === "Excel"), "employer requirement became applicant evidence");
  eq(postingsOf(results).get(posting.job_id), { title: posting.title, company: posting.company }, "posting display context must remain available");
});

Deno.test("reply trust control: a target employer is not presented as the person's own employer", () => {
  const results = [JSON.stringify({ job_id: "SYN-JOB", company: "Synthetic Employer", title: "Analyst", url: "https://example.test/jobs/1" })];
  const s = source([row({ text: "SQL" })], results);
  for (const text of ["Your SQL skills are relevant to the role at Synthetic Employer.", "Your SQL skills would help in a role at Synthetic Employer."])
    assert(!untracedFacts(text, s).length, "prospective role reference became a personal-employer claim");
  for (const text of ["You worked at Synthetic Employer.", "Your experience in the role at Synthetic Employer fits.", "Your work in the role at Synthetic Employer fits."])
    assert(untracedFacts(text, s).some((f) => f.kind === "place"), "an invented employment claim was allowed: " + text);
});

Deno.test("reply trust control: explicit confirmed legacy rows remain usable for conversational advice", async () => {
  const facts = [row({ needs_confirmation: undefined })];
  const r = await reply(facts); eq(r.reply, claim, "legacy confirmed advice lost its fact"); eq(r.calls, 1, "valid fact triggered repair");
});

Deno.test("reply trust control: current user words and earlier user words remain sources, not assistant inventions", () => {
  const o = { state: {}, message: "I use Excel daily.", history: [{ role: "assistant", content: "You know Tableau." }, { role: "user", content: "I use SQL too." }], results: [] };
  const s = factSources(o); assert(!untracedFacts(claim, s).length, "the person's own words were lost");
  assert(!untracedFacts("Your SQL skills fit.", s).length, "earlier user words were lost");
  assert(untracedFacts("Your Tableau skills fit.", s).length > 0, "assistant history became proof");
});

Deno.test("reply trust control: unlabelled legacy tool facts still work without inventing a confirmation event", async () => {
  const r = await reply([], { facts: [{ text: "Excel" }] });
  eq(r.reply, claim, "trusted unlabelled tool text changed"); eq(r.calls, 2, "valid tool fact triggered repair");
});

Deno.test("reply trust control: source preparation is nonmutating and retains current fact content", () => {
  const facts = [row({ text: "SQL", bullets: ["Built Python tooling"], corrected_from: "Excel" })], before = JSON.stringify(facts);
  const s = source(facts);
  assert(!untracedFacts("Your SQL and Python skills fit.", s).length, "valid current fields were lost");
  eq(JSON.stringify(facts), before, "reading sources mutated stored data");
});
