// WO-061 (architect): the live task battery (WO-065, CI run 39460746482) caught the agent saving facts the person never
// said ("Wants trading/finance quant roles (assumed from earlier)") and assuming a career ("5+ years managing engineering
// teams"). D-007: a fact about the person comes only from what they said. add_profile_fact refuses a guess, in code.
import { careerTools, factRefusal } from "../../supabase/functions/_shared/agent/career_tools.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }

Deno.test("WO-061/F1 what the person said is saved; an assumption or a fact they never said is refused", () => {
  assert(factRefusal("Data analyst, 2 years at a regional bank", "here's me: 2 years as a data analyst at a regional bank") === null);
  assert(factRefusal("Pharmacist in Denver, 6 years retail, no weekends", "im a pharmacist in denver, 6 yrs retail, no weekends") === null);
  assert(factRefusal("Lives in Michigan", "actually I'm in Michigan now") === null);
  assert(factRefusal("Wants quant roles (assumed from earlier)", "wants quant roles") !== null, "an assumption is refused even when worded like them");
  assert(factRefusal("5+ years managing engineering teams", "tell me more about the first one") !== null, "never said");
  assert(factRefusal("Probably open to relocation", "I'm open to relocation") !== null, "inference words are refused");
});

Deno.test("WO-061/F2 the tool itself refuses, and saves nothing", async () => {
  const add = careerTools({ postings: async () => [] }).find((t) => t.name === "add_profile_fact")!;
  const state: Record<string, unknown> = {};
  let err = "";
  try { await add.run({ kind: "experience", text: "5+ years managing engineering teams" }, { userId: "u", threadId: "t", now: 0, state, turn: { message: "tell me more about the first one", added: [] } }); }
  catch (e) { err = (e as Error).message; }
  assert(/not saved/.test(err), err);
  assert(!((state.profile as any)?.facts ?? []).length, "nothing saved");
});
