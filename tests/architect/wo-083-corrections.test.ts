// WO-083 (architect): a correction replaces what it corrects. Found by the live task battery (T13): the person said where
// they live, then "sorry, I meant Denver", and the agent kept the wrong city next to the new one and saved the correction
// sentence itself as a fact. The old value is removed, never kept beside the new one, and "sorry, I meant …" is never a fact.
import { CareerProfile } from "../../supabase/functions/_shared/router_core.career.js";
import { careerTools, factRefusal } from "../../supabase/functions/_shared/agent/career_tools.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const tools = () => Object.fromEntries(careerTools({ postings: async () => [] }).map((t) => [t.name, t]));
const ctx = (state: Record<string, unknown>, message: string) => ({ userId: "u", threadId: "t", now: 0, state, turn: { message, added: [] as string[] } });
async function refused(run: () => Promise<unknown>): Promise<string> {
  try { await run(); } catch (e) { return (e as Error).message; }
  return "";
}
function withSF() {
  const p = CareerProfile.createProfile({});
  const f = CareerProfile.addFact(p, { kind: "location", text: "Lives in San Francisco", needs_confirmation: true, status: "draft" });
  return { state: { profile: p } as Record<string, unknown>, id: f.id as string };
}

Deno.test("WO-083/1 the correction sentence is never saved as a fact", async () => {
  assert(factRefusal("sorry, I meant Denver", "sorry, I meant Denver") !== null, "a correction sentence is not a fact");
  assert(factRefusal("Oops, my bad, it's Denver", "oops my bad, it's Denver") !== null);
  assert(factRefusal("Lives in Denver", "sorry, I meant Denver") === null, "the corrected value in plain words is fine");
  const { state } = withSF();
  const err = await refused(() => tools().add_profile_fact.run({ kind: "location", text: "sorry, I meant Denver" }, ctx(state, "sorry, I meant Denver")));
  assert(/not saved/.test(err), err);
  assert((state.profile as any).facts.length === 1, "nothing added");
});

Deno.test("WO-083/2 a correction to a saved fact is refused as a new fact and points at the one it corrects", async () => {
  const { state, id } = withSF();
  const err = await refused(() => tools().add_profile_fact.run({ kind: "location", text: "Lives in Denver" }, ctx(state, "sorry, I meant Denver")));
  assert(err.includes("correct_profile_fact") && err.includes(id), `it names the tool and the fact to correct: ${err}`);
  assert((state.profile as any).facts.length === 1, "the wrong value is never kept next to the new one");
});

Deno.test("WO-083/3 correct_profile_fact replaces the old value in place: one location, Denver, no San Francisco", async () => {
  const { state, id } = withSF();
  const r: any = await tools().correct_profile_fact.run({ id, text: "Lives in Denver" }, ctx(state, "sorry, I meant Denver"));
  const facts = (state.profile as any).facts;
  assert(facts.length === 1, `exactly one fact: ${JSON.stringify(facts)}`);
  assert(facts[0].id === id && /Denver/.test(facts[0].text) && !/San Francisco/i.test(JSON.stringify(facts)), JSON.stringify(facts));
  assert(facts[0].needs_confirmation === true && facts[0].status === "draft", "the corrected value waits for their yes like any new fact");
  assert(r.fact.text === "Lives in Denver");
});

Deno.test("WO-083/4 a confirmed fact corrected goes back to draft: its yes was to the old words", async () => {
  const { state, id } = withSF();
  CareerProfile.confirmFact(state.profile, id);
  await tools().correct_profile_fact.run({ id, text: "Lives in Denver" }, ctx(state, "wait no, I meant Denver"));
  const f = (state.profile as any).facts[0];
  assert(f.text === "Lives in Denver" && f.needs_confirmation === true && f.status === "draft", JSON.stringify(f));
});

Deno.test("WO-083/5 correct_profile_fact refuses without a correction, with words never said, or with the correction sentence", async () => {
  const { state, id } = withSF();
  const t = tools().correct_profile_fact;
  assert(/not corrected/.test(await refused(() => t.run({ id, text: "Lives in Denver" }, ctx(state, "what jobs are there in Denver?")))), "no correction said");
  assert(/not saved/.test(await refused(() => t.run({ id, text: "Lives in Boston" }, ctx(state, "sorry, I meant Denver")))), "never said");
  assert(/not saved/.test(await refused(() => t.run({ id, text: "sorry, I meant Denver" }, ctx(state, "sorry, I meant Denver")))), "the sentence itself");
  assert(/no fact/.test(await refused(() => t.run({ id: "F-999", text: "Lives in Denver" }, ctx(state, "sorry, I meant Denver")))));
  assert((state.profile as any).facts[0].text === "Lives in San Francisco", "nothing changed on a refusal");
});

Deno.test("WO-083/6 a first fact said with a correction word is still saved: there is nothing to replace", async () => {
  const state: Record<string, unknown> = {};
  const r: any = await tools().add_profile_fact.run({ kind: "location", text: "Lives in Denver" }, ctx(state, "sorry, I meant Denver"));
  assert(r.fact.text === "Lives in Denver");
});

Deno.test("WO-083/7 across turns: a saved location corrected next turn is replaced; an added fact of another kind is not blocked", async () => {
  const state: Record<string, unknown> = {};
  const t = tools();
  await t.add_profile_fact.run({ kind: "location", text: "Lives in San Francisco" }, ctx(state, "I live in San Francisco"));
  const id = (state.profile as any).facts[0].id;
  assert(/correct_profile_fact/.test(await refused(() => t.add_profile_fact.run({ kind: "location", text: "Lives in Denver" }, ctx(state, "sorry, I meant Denver")))));
  await t.correct_profile_fact.run({ id, text: "Lives in Denver" }, ctx(state, "sorry, I meant Denver"));
  await t.add_profile_fact.run({ kind: "education", text: "BS in Economics" }, ctx(state, "sorry, I forgot, I also have a BS in Economics"));
  const texts = (state.profile as any).facts.map((f: any) => f.text);
  assert(JSON.stringify(texts) === JSON.stringify(["Lives in Denver", "BS in Economics"]), JSON.stringify(texts));
});
