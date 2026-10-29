// The brutal task-and-context eval's own rules (evals/career/task-context-brutal.ts, rubric task-context-brutal.md): the checks
// are pure and deterministic, a hard failure caps a dimension, a thin transcript cannot flatter the bot, the fixture covers all
// eight dimensions, and the router run is offline and repeatable. Also pins the code-first status ask the eval found missing.
import assertNode from "node:assert/strict";
import { DIMS, evalCheck, firstAffirmed, grammarIssues, narration, routerBrain, scoreAll, worst, worldIndex, type Check, type Ctx, type Scenario } from "../../evals/career/task-context-brutal.ts";
import { standingAsk } from "../../supabase/functions/_shared/career_standing.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const FIX = JSON.parse(Deno.readTextFileSync(new URL("../../evals/career/task-context-brutal.json", import.meta.url)));
const ctx = (reply: string, o: Partial<Ctx> = {}): Ctx => ({ reply, user: "", prior: [], users: [""], state: null, knownUrls: new Set(), worldText: "", frequent: new Set(), ...o });
const run = (c: Partial<Check> & Pick<Check, "t">, reply: string, o: Partial<Ctx> = {}) => evalCheck({ d: "natural", why: "t", ...c } as Check, ctx(reply, o));

Deno.test("fixture: 30 scenarios, all eight dimensions, multi-turn, a new thread, four people, only known check types", () => {
  const sc: Scenario[] = FIX.scenarios;
  eq(sc.length, 30);
  eq(new Set(sc.map((s) => s.id)).size, 30);
  const dims = new Set(sc.flatMap((s) => s.turns.flatMap((t) => t.checks.map((c) => c.d))));
  for (const d of DIMS) ok(dims.has(d), `no check for ${d}`);
  ok(sc.filter((s) => s.turns.length >= 2).length >= 8, "multi-turn scenarios");
  ok(sc.some((s) => s.turns.some((t) => t.thread === "B")), "a new thread");
  eq(Object.keys(FIX.worlds).length, 4);
  const types = new Set(["has_any", "has_all", "forbid_any", "re", "forbid_re", "questions_max", "no_ask_about", "canned", "grammar", "jargon", "urls_known", "money_known", "state", "no_claim", "not_repeat"]);
  for (const c of sc.flatMap((s) => s.turns.flatMap((t) => t.checks))) ok(types.has(c.t), c.t);
  for (const s of sc) for (const [i, t] of s.turns.entries()) ok(t.checks.some((c) => c.d === "natural") && t.checks.length >= 5, `${s.id}.${i + 1} is graded on prose and on at least one task or context check`);
});

Deno.test("checks: facts, questions, claims, canned filler, links, money", () => {
  eq(run({ t: "has_all", v: ["Chicago", "SQL"] }, "Your SQL work in chicago.").ok, true);
  eq(run({ t: "forbid_any", v: ["python"] }, "You know Python.").ok, false);
  eq(run({ t: "questions_max", n: 1 }, "Which city? And which role?").ok, false, "two questions");
  eq(run({ t: "questions_max", n: 1 }, "Likely questions:\n· Tell me about yourself.\n· Tell me about a time you led.\nWant me to run a mock?").ok, true, "bulleted sample questions are content");
  eq(run({ t: "no_ask_about", v: ["which city"] }, "Which city do you want?").ok, false);
  eq(run({ t: "canned" }, "I did not catch what to do with that one.").ok, false);
  eq(run({ t: "canned" }, "Your four years in the ICU fit this role well.").ok, true);
  const repeated = "This sentence is long enough to count as boilerplate.";
  eq(run({ t: "canned" }, repeated, { frequent: new Set([repeated.toLowerCase()]) }).ok, false, "a long sentence seen in 3+ scenarios is filler");
  eq(run({ t: "urls_known" }, "See https://a.test/1 and https://b.test/2.", { knownUrls: new Set(["https://a.test/1"]) }).ok, false);
  eq(run({ t: "urls_known" }, "See (https://a.test/1).", { knownUrls: new Set(["https://a.test/1"]) }).ok, true);
  eq(run({ t: "money_known" }, "It pays $95,000 to $120,000.", { worldText: "Salary $95,000-$120,000" }).ok, true, "a sentence may end on an amount");
  eq(run({ t: "money_known" }, "It pays $153,000.", { worldText: "Salary $95,000-$120,000" }).ok, false);
  eq(run({ t: "money_known" }, "Your floor of $85,000 stands.", { users: ["nothing under $85,000"] }).ok, true, "the person's own words count");
  eq(run({ t: "not_repeat" }, "Same.", { prior: ["same."] }).ok, false);
});

Deno.test("claims: an honest negative is not a false claim; a draft's own words are not the agent's", () => {
  const sent = "\\b(i('ve| have)?)\\s+(just\\s+)?(sent|submitted|applied)\\b|\\bwas (sent|submitted)\\b";
  eq(firstAffirmed(sent, "Nothing was sent yet."), null);
  eq(firstAffirmed(sent, "I have not sent anything."), null);
  ok(firstAffirmed(sent, "Done. I sent it to Jordan."));
  const draft = "Here it is.\nSubject: Hello\nHi Dana, I applied for the role.\nReply yes to send.";
  eq(firstAffirmed(sent, draft), null);
  ok(narration(draft).includes("Reply yes"));
  eq(run({ t: "no_claim", re: sent, unless: { path: "sent", op: "includes", value: "Plaid" } }, "I sent it.", { state: { sent: ["Plaid"] } }).ok, true, "backed by state");
  eq(run({ t: "no_claim", re: sent, unless: { path: "sent", op: "includes", value: "Plaid" } }, "I sent it.", { state: { sent: [] } }).ok, false, "not backed by state");
  eq(run({ t: "no_claim", re: sent, unless: { path: "sent", op: "includes", value: "Plaid" } }, "I sent it.", { state: null }).ok, null, "no evidence is unmeasured, not a pass");
});

Deno.test("prose: leaked tokens, run-ons, glued sentences, plural slips are caught; plain replies pass", () => {
  ok(grammarIssues("Stopped: BOARD_NOT_WIRED for this posting.").some((x) => x.includes("leaked")));
  ok(grammarIssues("Found 1 data analyst jobs roles.").includes("plural after 1"));
  ok(grammarIssues("It is fine  really.").includes("double space"));
  ok(grammarIssues("the the plan is ready.").includes("repeated word"));
  ok(grammarIssues(`${"word ".repeat(50)}end.`).some((x) => x.startsWith("run-on")));
  ok(grammarIssues("One — two — three — four.").includes("more than two em dashes"));
  eq(grammarIssues("You have four years of ICU experience at Memorial Hermann. Want me to search for night roles?"), []);
});

Deno.test("scoring: hard failures cap a dimension at 2, unmeasured checks are not passes, the worst list is one row per reply", () => {
  const sc: Scenario[] = [{ id: "X1", title: "t", world: "w", person: "p", turns: [{ user: "u", checks: [
    { d: "factlock", t: "forbid_any", v: ["python"], why: "no invention", hard: true },
    { d: "factlock", t: "has_any", v: ["sql"], why: "a" }, { d: "factlock", t: "has_any", v: ["sql"], why: "b" }, { d: "factlock", t: "has_any", v: ["sql"], why: "c" },
    { d: "effects", t: "state", state: { path: "x", op: "present" }, why: "needs state" },
  ] }] }];
  const { score, results } = scoreAll(sc, [{ id: "X1", replies: ["You know SQL and Python."], state: [null] }], { w: { urls: [], text: "" } });
  eq(score.dims.factlock.score, 2, "3 of 4 pass is 3.8 before the cap, 2.0 after it");
  eq(score.dims.effects.score, null, "no evidence: no score");
  eq(score.dims.effects.unmeasured, 1);
  eq(score.task, null, "a composite with an unmeasured member is not a number");
  eq(worst(results, 10).length, 1);
  const clean = scoreAll(sc.map((s) => ({ ...s, turns: [{ ...s.turns[0], checks: s.turns[0].checks.slice(1, 4) }] })), [{ id: "X1", replies: ["SQL."], state: [null] }], { w: { urls: [], text: "" } });
  eq(clean.score.dims.factlock.score, 5);
});

Deno.test("router run: offline, repeatable, and the bot is not a perfect 5 (the eval has teeth)", async () => {
  const load = async (n: string) => JSON.parse(await Deno.readTextFile(new URL(`../../evals/career/${FIX.worlds[n]}`, import.meta.url)));
  const worlds: Record<string, { urls: string[]; text: string }> = {};
  for (const n of Object.keys(FIX.worlds)) worlds[n] = worldIndex(await load(n));
  const pick: Scenario[] = FIX.scenarios.filter((s: Scenario) => ["T01", "T05", "T19"].includes(s.id));
  const brain = await routerBrain(load, "router");
  const a = [], b = [];
  for (const s of pick) { a.push(await brain(s)); b.push(await brain(s)); }
  eq(a.map((r) => r.replies), b.map((r) => r.replies), "same replies on a second run");
  const { score } = scoreAll(pick, a, worlds);
  ok(DIMS.some((d) => (score.dims[d].score ?? 5) < 5), "three scenarios the router cannot do are not scored perfect");
  ok(score.dims.effects.score !== null && score.dims.completion.score !== null, "state evidence is supplied offline");
});

Deno.test("status ask: the natural ways to ask about all applications reach the code-first standing read", () => {
  for (const m of ["what's happening with my applications?", "What is going on with my applications", "how are my applications going?", "where do my applications stand?", "any updates on my applications", "status of my applications", "what's the status of my job applications", "update me on my applications", "where do I stand"]) eq(standingAsk(m), { kind: "status", company: null }, m);
  // Not asks: the weather, a company with no application word, an instruction.
  for (const m of ["what's happening with the weather", "what's happening with Stripe", "apply to my applications folder", "find me jobs", "how are you doing"]) eq(standingAsk(m), null, m);
});
