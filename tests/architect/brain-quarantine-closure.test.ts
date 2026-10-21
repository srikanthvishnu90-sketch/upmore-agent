// Invented D-007 identifiers and facts only; actual memory/reply/brain paths, no network or providers.
import { personBlock } from "../../supabase/functions/_shared/agent/memory.ts";
import { factSources, untracedFacts } from "../../supabase/functions/_shared/agent/reply_guards.ts";
import { agentTurn } from "../../supabase/functions/agent-chat/career_brain.ts";
import { factDependencies, quarantinedFact } from "../../supabase/functions/_shared/fact_quarantine.ts";
const assert = (v: unknown, why: string) => { if (!v) throw new Error(why); };
const row = (id: string, text: string, extra: any = {}) => ({ id, kind: "skill", text, source: "user", status: "confirmed", needs_confirmation: false, provenance: "owner stated synthetic words", ...extra });
const block = (facts: any[]) => personBlock({ profile: { facts }, standing: [], alerts: null, pipeline: null });
const sources = (facts: any[], results: string[] = []) => factSources({ state: { profile: { facts } }, message: "Which skills fit?", history: [], results });
const supported = (skill: string, s: string[]) => untracedFacts(`Your ${skill} skills are a strong match.`, s).length === 0;
Deno.test("quarantine closure: reserved IDs and delegated provenance never enter remembered own facts", () => {
  for (const fact of [row("F-033", "Excel"), row("F-00027", "Excel"), row("SYN-DELEGATED", "Excel", { provenance: "Owner-delegated answer-all" })]) {
    assert(!block([fact]).includes("[skill] Excel"), "reserved/delegated fact printed as own memory");
    assert(!supported("Excel", sources([fact])), "reserved/delegated fact backed a reply");
  }
});
Deno.test("quarantine closure: direct and transitive derived facts cannot escape a reserved source", () => {
  const facts = [row("SYN-SECOND", "Python", { derived_from: ["SYN-FIRST"] }), row("SYN-FIRST", "Java", { derived_from: ["F-033"] }), row("F-033", "Excel"), row("SYN-OWN", "SQL")];
  const before = JSON.stringify(facts), s = sources(facts), text = block(facts);
  for (const skill of ["Python", "Java", "Excel"]) { assert(!text.includes("[skill] " + skill), "tainted derivation remained remembered: " + skill);assert(!supported(skill, s), "tainted derivation backed claim: " + skill); }
  assert(text.includes("[skill] SQL") && supported("SQL", s), "independent own SQL lost");assert(JSON.stringify(facts) === before, "read rewrote bank");
});
Deno.test("quarantine closure: absent reserved parent and quarantined structured tool rows still taint derivatives", () => {
  for (const root of [{ facts: [row("SYN-FIRST", "Java", { derived_from: ["F-033"] }), row("SYN-SECOND", "Python", { derived_from: ["SYN-FIRST"] })] }, { facts: [row("F-033", "Excel"), row("SYN-SECOND", "Python", { derived_from: ["F-033"] })] }]) {
    const before = JSON.stringify(root), s = sources([], [JSON.stringify(root)]);
    for (const skill of ["Excel", "Java", "Python"]) assert(!supported(skill, s), "tool laundering from quarantine: " + skill);
    assert(JSON.stringify(root) === before, "tool source changed");
  }
});
Deno.test("quarantine closure: cross profile and result dependencies share the same exclusion closure", () => {
  const facts = [row("SYN-SECOND", "Python", { derived_from: ["SYN-FIRST"] })];
  const result = JSON.stringify({ facts: [row("SYN-FIRST", "Java", { derived_from: ["F-033"] })] });
  assert(!supported("Python", sources(facts, [result])), "result-side taint did not reach stored derivative");
  assert(!supported("Java", sources(facts, [result])), "result-side tainted parent stayed eligible");
});
Deno.test("quarantine closure control: valid own derivation draft goal content and unrelated tool output survive", () => {
  const facts = [row("SYN-OWN", "SQL"), row("SYN-DERIVED", "Python", { derived_from: ["SYN-OWN"] }), row("SYN-GOAL", "AI engineer working on answer-all text detection", { kind: "goal", status: "draft", needs_confirmation: true })];
  const s = sources(facts, [JSON.stringify({ status: "completed", count: 2 })]), text = block(facts);
  assert(supported("SQL", s) && supported("Python", s), "supported own derivation disappeared");
  assert(text.includes("AI engineer working on answer-all text detection (said, not confirmed yet)"), "fact body was mistaken for negative provenance or draft goal lost");
  assert(s.some(v => v.includes('"count":2')), "unrelated tool record lost");
});
Deno.test("quarantine closure: real next-turn prompt excludes direct and derived inventions and retains own draft goal", async () => {
  const profile = { facts: [row("F-033", "Excel"), row("SYN-DERIVED", "Python", { derived_from: ["F-033"] }), row("SYN-OWN", "SQL"), row("SYN-GOAL", "SYN-OWN-GOAL", { kind: "goal", status: "draft", needs_confirmation: true })] }, before = JSON.stringify(profile);
  let system = "";
  await agentTurn({ message: "Which skills fit?", history: [], stores: { profile }, userId: "SYN-OWNER", threadId: "SYN-NEXT", now: 0, known: { standing: [], alerts: null, pipeline: null }, model: async p => { system = p.system;return { content: [{ type: "text", text: "Which role would you like to target?" }], stop_reason: "end_turn" }; } });
  assert(!system.includes("[skill] Excel") && !system.includes("[skill] Python"), "actual prompt inherited quarantined claim");
  assert(system.includes("[skill] SQL") && system.includes("SYN-OWN-GOAL (said, not confirmed yet)"), "actual prompt lost own fact or goal qualification");assert(JSON.stringify(profile) === before, "recall mutated bank");
});
Deno.test("quarantine policy: shared reserved range and provenance preserve exact canonical boundaries", () => {
  for (const id of ["F-027", "F-033", "F-079", "F-00033"]) { assert(quarantinedFact({ id }), "profile id escaped quarantine");assert(quarantinedFact({ factId: id }), "file factId escaped quarantine"); }
  for (const id of ["F-026", "F-080", "SYN-OWN"]) assert(!quarantinedFact({ id }), "unreserved own identifier was excluded");
  assert(quarantinedFact({ provenance: "OWNER-DELEGATED" }) && quarantinedFact({ provenance: "answer-all" }), "delegation provenance escaped");
  assert(!quarantinedFact({ id: "SYN-OWN", text: "I study answer-all classifiers" }), "fact text interpreted as provenance");
});
Deno.test("quarantine closure: denied parent descendants and missing dependencies cannot bootstrap sources", () => {
  const nested = { id: "SYN-WRAPPER", derived_from: ["F-033"], facts: [row("SYN-CHILD", "Excel")] };
  const facts = [row("SYN-DERIVED", "Python", { derived_from: ["SYN-CHILD"] }), row("SYN-MISSING", "Java", { derived_from: ["SYN-ABSENT"] })];
  const s = sources(facts, [JSON.stringify(nested)]);
  for (const skill of ["Excel", "Python", "Java"]) assert(!supported(skill, s), "descendant/missing source became evidence: " + skill);
  const text = personBlock({ profile: { facts: [row("SYN-OWN", "SQL")], preferences: { roles: ["SYN-DENIED-ROLE"], derived_from: ["F-033"] } }, standing: [], alerts: null, pipeline: null });
  assert(!text.includes("SYN-DENIED-ROLE") && text.includes("[skill] SQL"), "derived preference escaped or unrelated fact disappeared");
});
Deno.test("quarantine control: historical audit ids and old provenance cannot erase a corrected own current fact", () => {
  const facts = [row("SYN-OWN", "SQL", { corrected_from: row("SYN-OWN", "Excel", { source: "agent" }), audit: [{ id: "F-033", text: "Excel" }] })];
  const before = JSON.stringify(facts), s = sources(facts), text = block(facts);
  assert(supported("SQL", s) && !supported("Excel", s), "historical data became evidence or current source was erased");
  assert(text.includes("[skill] SQL") && !text.includes("[skill] Excel"), "memory rendered history as current");assert(JSON.stringify(facts) === before, "audit was mutated");
});
Deno.test("quarantine closure: camel dependencies and mixed aliases cannot mask a reserved source", () => {
  for (const metadata of [{ derivedFrom: ["F-033"] }, { derived_from: ["SYN-OWN"], derivedFrom: ["F-033"] }, { derivedFrom: ["SYN-FIRST"] }]) {
    const facts = [row("SYN-OWN", "SQL"), row("SYN-FIRST", "Java", { derivedFrom: ["F-033"] }), row("SYN-DERIVED", "Python", metadata)], before = JSON.stringify(facts);
    assert(!block(facts).includes("[skill] Python") && !supported("Python", sources(facts)), "camel dependency was ignored or masked");
    assert(block(facts).includes("[skill] SQL") && supported("SQL", sources(facts)), "independent own source lost");assert(JSON.stringify(facts) === before, "alias read changed facts");
  }
});
Deno.test("quarantine closure: malformed dependency alias fails closed even beside a valid other alias", () => {
  for (const key of ["derivedFrom", "derived_from"]) for (const malformed of [null, "SYN-OWN", [null], [""], [{}]]) {
    const other = key === "derivedFrom" ? "derived_from" : "derivedFrom", facts = [row("SYN-OWN", "SQL"), row("SYN-DERIVED", "Python", { [key]: malformed, [other]: ["SYN-OWN"] })];
    assert(!block(facts).includes("[skill] Python") && !supported("Python", sources(facts)), "malformed alias was masked by valid alias");
  }
});
Deno.test("quarantine alias control: own camel and mixed valid derivations remain usable without reading historical evidence", () => {
  const facts = [row("SYN-OWN", "SQL"), row("SYN-FIRST", "Java", { derivedFrom: ["SYN-OWN"] }), row("SYN-DERIVED", "Python", { derived_from: ["SYN-OWN"], derivedFrom: ["SYN-FIRST"], evidence: [{ id: "F-033", provenance: "answer-all" }] })];
  assert(supported("SQL", sources(facts)) && supported("Java", sources(facts)) && supported("Python", sources(facts)), "valid alias chain or historical evidence was misread");
  assert(block(facts).includes("[skill] Python"), "valid mixed-alias derivation disappeared from memory");
  assert(JSON.stringify(factDependencies({ derived_from: ["SYN-OWN"], derivedFrom: ["SYN-FIRST", "SYN-OWN"] })) === '["SYN-OWN","SYN-FIRST"]', "dependency union or deduplication differs across consumers");
  assert(factDependencies({ derived_from: [], derivedFrom: null }) === null, "valid empty alias hid malformed other alias");
  assert(JSON.stringify(factDependencies({ text: "derivedFrom F-033", evidence: ["F-033"] })) === "[]", "untyped body/evidence was read as dependency metadata");
});
