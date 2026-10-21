// WO-061 (H009): the person's own name for an interview step ("onsite", "superday") is not one of the tracker's stages;
// track_application reads it from THEIR message (never the model's input), keeps it on the row and in the event detail,
// and returns it so the reply confirms the move in their words. Synthetic company; no model.
import { careerTools, stepWord } from "../../supabase/functions/_shared/agent/career_tools.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const T = Date.UTC(2026, 9, 21, 15);
const ctx = (state: Record<string, unknown>, message: string) => ({ userId: "TEST-U", threadId: "TH", now: T, state, turn: { message, added: [] as string[] } });
const track = () => careerTools({ postings: async () => [] }).find((t) => t.name === "track_application")!;

Deno.test("WO-061/W1 the step word is read from the person's message", () => {
  eq(stepWord("great news, I got moved to the onsite with them!"), "onsite");
  eq(stepWord("they invited me to a superday next week"), "superday");
  eq(stepWord("passed the phone screen"), "phone screen");
  eq(stepWord("virtual on-site on monday"), "virtual onsite");
  eq(stepWord("I heard back, they want to talk again"), null, "no step named, none made up");
});

Deno.test("WO-061/W2 a move the person names in their own words: kept on the row and the event, and returned for the reply", async () => {
  const state: Record<string, unknown> = {}, t = track();
  await t.run({ company: "Northfield Labs", role: "Operations Analyst", stage: "Submitted" }, ctx(state, "I applied to Northfield Labs for the ops analyst role"));
  const r: any = await t.run({ company: "Northfield Labs", stage: "Interview rounds" }, ctx(state, "update: northfield moved me to the onsite!"));
  eq(r.stage_in_their_words, "onsite");
  eq([r.application.stage, r.application.stage_detail], ["Interview rounds", "onsite"]);
  const last = r.application.events.at(-1);
  assert(/user reported: onsite/.test(String(last?.detail)), JSON.stringify(last));
  const row = JSON.stringify(state.trackStore);
  assert(row.includes('"stage_detail":"onsite"'), "the stored row carries their word");
});

Deno.test("WO-061/W3 no step word in their message: the result is as before", async () => {
  const state: Record<string, unknown> = {}, t = track();
  const r: any = await t.run({ company: "Northfield Labs", role: "Operations Analyst", stage: "Submitted" }, ctx(state, "I applied to Northfield Labs"));
  assert(!("stage_in_their_words" in r) && !r.application.stage_detail, JSON.stringify(r));
  const m: any = await t.run({ company: "Northfield Labs", stage: "Interview rounds", note: "onsite" }, ctx(state, "they want to talk again"));
  assert(!("stage_in_their_words" in m), "the model's input never supplies their words");
});
