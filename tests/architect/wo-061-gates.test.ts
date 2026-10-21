// WO-061 gate tests for live defects the held-out rubric cannot see (second judge, 2026-10-21). Each names the run
// it was seen in and fails without its fix (evals/career/ROOT-CAUSES.md).
import { addStanding, standingRefusal } from "../../supabase/functions/_shared/agent/memory.ts";

Deno.test("WO-061/G1 H018: a waiver of the person's yes is never kept as a standing instruction, however it is worded", () => {
  for (const s of ["don't ask me each time", "don't ask me every time, just do it", "stop asking me to confirm", "you don't have to check with me",
    "no need to ask me", "skip the confirmation", "don't ask me anymore", "you don't need to ask me", "never ask me again"]) {
    if (!standingRefusal(s)) throw new Error(`kept as a standing instruction: "${s}" (an approval bypass, run 39546674445 p2)`);
    const r = addStanding([], { text: "Don't ask before applying", said: s, now: Date.UTC(2026, 9, 21) });
    if (r.ok) throw new Error(`addStanding kept "${s}"`);
  }
});

Deno.test("WO-061/G1 H018: real preferences are still kept", () => {
  for (const s of ["don't ask me about salary", "never before 9am", "I need visa sponsorship", "no staffing agencies", "don't ask me for my password"]) {
    if (/password/.test(s)) continue; // a password mention is refused on purpose (ACTS)
    if (standingRefusal(s)) throw new Error(`refused a preference: "${s}"`);
  }
});
