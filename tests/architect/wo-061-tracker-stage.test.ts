// WO-061 (H004, run 39593068532 p2): track_application saved "Interview" (not a stage) on a new row, then refused every
// update to it ("unknown stage"), and the turn ended in the error text. The label is one of the tracker's stages before
// either call; a label that is no stage is refused with the list. Synthetic company; no model.
import { careerTools, trackerStage } from "../../supabase/functions/_shared/agent/career_tools.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const ctx = (state: Record<string, unknown>, message: string) => ({ userId: "TEST-U", threadId: "TH", now: Date.UTC(2026, 9, 21, 15), state, turn: { message, added: [] as string[] } });
const track = () => careerTools({ postings: async () => [] }).find((t) => t.name === "track_application")!;

Deno.test("WO-061/K1 a stage label becomes one of the tracker's stages", () => {
  eq(trackerStage("Interview"), "Interview rounds");
  eq(trackerStage("interview rounds"), "Interview rounds");
  eq(trackerStage("Phone screen"), "Recruiter screen");
  eq(trackerStage("Final round"), "Final");
  eq(trackerStage("Applied"), "Submitted");
  eq(trackerStage("OA/assessment"), "OA/assessment");
  eq(trackerStage("purple"), null);
});

Deno.test("WO-061/K2 a row saved from a loose label can be updated on the next turn (the H004 path)", async () => {
  const state: Record<string, unknown> = {}, t = track();
  const a: any = await t.run({ company: "Harbor Ridge Analytics", stage: "Interview" }, ctx(state, "I have an interview with Harbor Ridge Analytics on Thursday"));
  eq(a.application.stage, "Interview rounds", "never a stage the tracker does not know");
  const b: any = await t.run({ company: "Harbor Ridge Analytics", stage: "Interview" }, ctx(state, "sorry, it's on Friday"));
  eq(b.application.stage, "Interview rounds", "the update is not refused");
  eq((state.trackStore as any).rows.length, 1, "the same row, not a second one");
});

Deno.test("WO-061/K3 a label that is no stage is refused with the list, and nothing is saved", async () => {
  const state: Record<string, unknown> = {}, t = track();
  let err = "";
  try { await t.run({ company: "Harbor Ridge Analytics", stage: "purple" }, ctx(state, "harbor ridge")); } catch (e) { err = (e as Error).message; }
  assert(/is not a stage; use one of: Saved/.test(err) && /Interview rounds/.test(err), err);
  assert(!(state.trackStore as any)?.rows?.length, "nothing saved");
});
