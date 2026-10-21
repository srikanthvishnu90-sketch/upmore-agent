// Invented fixtures only. No provider, database, browser, or network.
import { careerTools, factRefusal } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { planBatch } from "../../supabase/functions/_shared/career_apply.ts";
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }

Deno.test("trust control: a required unknown stays a question, never a guessed answer", () => {
  const r = planBatch({ userId: "SYNTHETIC-TRUST-OWNER", postings: [{ job_id: "SYNTHETIC-JOB", company: "Synthetic Employer", title: "TEST role", fields: [{ name: "full_name", label: "Full name", required: true, type: "input_text", options: [] }] }], answers: {}, saved: {}, log: [], now: Date.UTC(2026, 9, 21) });
  assert(r.ready.length === 0 && r.needs.length === 1, "unknown required data was admitted instead of asked");
});

Deno.test("trust control: the person's exact literal statement is permitted at fact ingress", () => {
  const text = "Worked alongside a project team.";
  assert(factRefusal(text, text) === null, "the literal source statement was refused");
});

Deno.test("trust control: a fact added this turn cannot be confirmed in the same turn", async () => {
  const state = { profile: { facts: [{ id: "SYN-NEW-FACT", kind: "experience", text: "Synthetic project.", source: "user", needs_confirmation: true, status: "draft" }] } };
  const tool = careerTools({ postings: async () => [] }).find((t) => t.name === "confirm_profile_fact")!;
  let refused = false;
  try { await tool.run({ id: "SYN-NEW-FACT" }, { userId: "SYNTHETIC-TRUST-OWNER", threadId: "SYNTHETIC-THREAD", now: 0, state, turn: { message: "yes", added: ["SYN-NEW-FACT"], before: "" } }); } catch { refused = true; }
  assert(refused && state.profile.facts[0].status === "draft", "same-turn model-authored fact was confirmed");
});
