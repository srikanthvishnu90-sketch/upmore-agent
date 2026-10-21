// D-007 (fact_quarantine.ts): the F-027..F-079 range names the owner's fact BANK, whose ids live in factId. A chat profile
// numbers its own facts F-001 up in id, so a person with 27 or more facts keeps facts 27..79 as their own: their goal
// still steers search. Quarantine by the bank's id field, a quarantine flag, or a delegated provenance only.
// Same rule as packages/domain/122-career-profile.js and tests/architect/d007-drafters.test.ts. Synthetic TEST data only.
import { quarantinedFact } from "../../supabase/functions/_shared/fact_quarantine.ts";
import { personalSourceDenied } from "../../supabase/functions/_shared/personal_fact_source.ts";
import { goalOf } from "../../supabase/functions/_shared/career_search.ts";

function assert(v: unknown, message: string): asserts v {
  if (!v) throw new Error(message);
}
const goal = (id: string) => ({ id, kind: "goal", text: "Data analyst role in Denver", status: "confirmed", needs_confirmation: false });

Deno.test("D-007: a chat profile's own fact id in F-027..F-079 is the person's own, not the bank's", () => {
  for (const id of ["F-027", "F-030", "F-033", "F-079"]) {
    assert(!quarantinedFact(goal(id)), `${id} in id was quarantined`);
    assert(!personalSourceDenied(goal(id)), `${id} in id was denied as a personal source`);
  }
});

Deno.test("D-007: the person's own goal numbered F-030 steers search like F-026 does", () => {
  const mk = (id: string) => ({ facts: [goal(id)], preferences: {} });
  const want = JSON.stringify({ roles: ["data", "analyst"], places: ["denver"], remote: false });
  assert(JSON.stringify(goalOf(mk("F-026"))) === want, "control: F-026 steers");
  assert(JSON.stringify(goalOf(mk("F-030"))) === want, `F-030 was dropped: ${JSON.stringify(goalOf(mk("F-030")))}`);
});

Deno.test("D-007: the bank's id field, a quarantine flag and a delegated provenance still quarantine", () => {
  for (const id of ["F-027", "F-033", "F-079"]) assert(quarantinedFact({ factId: id }), `bank ${id} not quarantined`);
  assert(quarantinedFact({ factId: "F-041", id: "F-091" }), "a bank fact carried with a chat id");
  assert(!quarantinedFact({ factId: "F-026" }) && !quarantinedFact({ factId: "F-080" }), "outside the range");
  assert(quarantinedFact({ id: "F-005", provenance: "owner-delegated 2026-10-17 (answer-all directive)" }), "delegated provenance");
  assert(personalSourceDenied({ id: "F-005", quarantined: true }), "a quarantine flag");
  const mk = (f: Record<string, unknown>) => ({ facts: [{ ...goal("F-005"), ...f }], preferences: {} });
  assert(goalOf(mk({ factId: "F-033" })) === null, "a bank goal never steers");
});
