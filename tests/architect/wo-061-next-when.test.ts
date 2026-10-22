// WO-061 (H004, run 39603731114 p1): a day said in words had nowhere to go; the model called track_application five times
// and the turn hit the step limit. The day of the next step is kept on the tracker row, only in the person's own words
// from their message (D-007), a correction overwrites it, and the situation shows it. Synthetic company; no model.
import { careerTools, whenSaid } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { situationFrom, situationBlock } from "../../supabase/functions/_shared/career_situation.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = Date.UTC(2026, 9, 21, 15);
const ctx = (state: Record<string, unknown>, message: string) => ({ userId: "TEST-U", threadId: "TH", now: NOW, state, turn: { message, added: [] as string[] } });
const track = () => careerTools({ postings: async () => [] }).find((t) => t.name === "track_application")!;

Deno.test("WO-061/N1 the day is kept only in the person's own words", () => {
  eq(whenSaid("interview with them on tuesday at 2pm", "Tuesday 2pm"), "Tuesday 2pm");
  eq(whenSaid("oops, it's actually wednesday", "Wednesday"), "Wednesday");
  eq(whenSaid("I have an interview with them", "Tuesday"), null, "a day they did not say is never kept");
  eq(whenSaid("tuesday", ""), null);
});

Deno.test("WO-061/N2 a correction overwrites the day; the result says what was kept; a day not said is not kept", async () => {
  const state: Record<string, unknown> = {}, t = track();
  const a: any = await t.run({ company: "Harbor Ridge Analytics", stage: "Interview rounds", when: "Tuesday" }, ctx(state, "I have an interview with Harbor Ridge Analytics on Tuesday"));
  eq([a.application.next_when, a.when_kept], ["Tuesday", "Tuesday"]);
  const b: any = await t.run({ company: "Harbor Ridge Analytics", stage: "Interview rounds", when: "Wednesday" }, ctx(state, "sorry, it's Wednesday not Tuesday"));
  eq([b.application.next_when, (state.trackStore as any).rows.length], ["Wednesday", 1], "the same row, the latest day");
  const c: any = await t.run({ company: "Harbor Ridge Analytics", stage: "Interview rounds", when: "Thursday" }, ctx(state, "thanks"));
  assert(/not in their message/.test(c.when_not_kept) && c.application.next_when === "Wednesday", JSON.stringify(c));
});

Deno.test("WO-061/N3 the situation shows the kept day on the tracked task", async () => {
  const state: Record<string, unknown> = {}, t = track();
  await t.run({ company: "Harbor Ridge Analytics", stage: "Interview rounds", when: "Wednesday" }, ctx(state, "interview with Harbor Ridge Analytics wednesday"));
  const s = situationFrom({ jobs: [], wanted: [], prepared: [], card: null, questions: [], outreach: [], mail_drafts: [], interviews: [], alerts: null, standing: [], threads: [{ thread_id: "TH", rows: (state.trackStore as any).rows }], connections: [], cloud: null, channel: null, last_search: null, unreadable: [] } as any, NOW + 60000);
  const block = situationBlock(s);
  assert(/Harbor Ridge Analytics[^\n]*\(stage: Interview rounds\) \(next: Wednesday, as they said it\)/.test(block), block);
});
