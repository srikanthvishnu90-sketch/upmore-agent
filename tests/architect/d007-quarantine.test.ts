// D-007: the 47 agent-invented "confirmed" facts (F-027..F-079, provenance "owner-delegated 2026-10-17 (answer-all
// directive)") never reach a real application. They stay in the owner's fact bank (not deleted); the extension's import
// leaves them out, by id and by provenance, and says how many it left out. Synthetic values; no real data.
import { quarantinedFact, confirmedFacts } from "../../extension/src/apply_core.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const U = "TEST-owner";
const fact = (factId: string, value = "TEST value", extra: Record<string, unknown> = {}) => ({ value, factId, confirmed: true, user_id: U, ...extra });

Deno.test("D-007 F-027..F-079 are quarantined by id, whatever the padding; F-001..F-026 and F-080 on are not", () => {
  for (const id of ["F-027", "F-79", "F-050", "F-0050", " F-033 "]) assert(quarantinedFact({ factId: id }), id);
  for (const id of ["F-001", "F-026", "F-080", "F-100", "text-answer:27", "approved-local-resume:abc", "F027x"]) assert(!quarantinedFact({ factId: id }), id);
});

Deno.test("D-007 a fact whose provenance is the answer-all delegation is quarantined, whatever its id", () => {
  assert(quarantinedFact({ factId: "F-200", provenance: "owner-delegated 2026-10-17 (answer-all directive)" }));
  assert(!quarantinedFact({ factId: "F-200", provenance: "owner stated in chat 2026-10-21" }));
});

Deno.test("D-007 the import keeps the owner's own confirmed facts and leaves out the quarantined ones, counted", () => {
  const r = confirmedFacts({
    first_name: fact("F-001", "TEST First"), email: fact("F-002", "test@example.test"),
    sponsorship: fact("F-033", "No"), how_heard: fact("F-060", "TEST board"),
    languages: fact("F-120", "English", { provenance: "owner-delegated 2026-10-17 (answer-all directive)" }),
    draft: { value: "x", factId: "F-005", confirmed: false, user_id: U },
    other_user: fact("F-003", "y", { user_id: "TEST-someone-else" }),
  }, U);
  assert(Object.keys(r.kept).sort().join(",") === "email,first_name", JSON.stringify(r.kept));
  assert(r.quarantined === 3, `three quarantined: ${r.quarantined}`);
  assert(r.kept.first_name.value === "TEST First" && r.kept.first_name.factId === "F-001");
});
