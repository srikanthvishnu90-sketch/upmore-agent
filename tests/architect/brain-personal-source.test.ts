// Invented records only. Exercise the actual memory and reply-source boundaries without providers or network.
import { goalLines, personBlock } from "../../supabase/functions/_shared/agent/memory.ts";
import { factSources, untracedFacts } from "../../supabase/functions/_shared/agent/reply_guards.ts";
import { agentTurn } from "../../supabase/functions/agent-chat/career_brain.ts";
import { personalSourceDenied } from "../../supabase/functions/_shared/personal_fact_source.ts";
const assert = (v: unknown, why: string) => { if (!v) throw new Error(why); };
const row = (extra: any = {}) => ({ id: "SYN-PERSONAL", kind: "skill", text: "Excel", status: "confirmed", needs_confirmation: false, ...extra });
const block = (profile: any, standing: any[] = []) => personBlock({ profile, standing, alerts: null, pipeline: null });
const sources = (state: any = {}, results: string[] = []) => factSources({ state, message: "Which skills fit?", history: [], results });
const unsupported = [{ provenance: "agent-generated" }, { provenance: " MODEL GENERATED " }, { source: "AI" }, { origin: "inferred" }, { provenance: { source: "ai", origin: "user" } }];
const claim = "Your Excel skills are a strong match.";

Deno.test("personal source metadata: independent aliases flags and rejected wrappers agree without parsing content", () => {
  for (const meta of [{ source: "user", origin: "agent" }, { provenance: { source: "user", origin: "assistant" } }, { provenance: { status: "rejected" } }, { provenance: { unproven: true } }, { provenance: { quarantined: true } }, { rejected: true }, { status: " REJECTED " }])
    assert(personalSourceDenied(meta), "explicit negative metadata was masked: " + JSON.stringify(meta));
  for (const value of [null, [], "agent-generated", { text: "agent-generated", title: "inferred", value: "AI", evidence: "model generated" }, { source: "user", provenance: "owner stated this goal" }, { status: "draft", needs_confirmation: true }])
    assert(!personalSourceDenied(value), "content/ordinary state became negative metadata: " + JSON.stringify(value));
});

Deno.test("personal source: direct labels and AI/inferred aliases cannot become confirmed memory", () => {
  for (const extra of unsupported) {
    const profile = { facts: [row(extra)] }, before = JSON.stringify(profile);
    assert(!block(profile).includes("Excel"), "denied metadata reached confirmed memory: " + JSON.stringify(extra));
    assert(JSON.stringify(profile) === before, "source filtering changed stored data");
  }
});
Deno.test("personal source: denied profile preference basics and standing wrappers hide their children", () => {
  for (const extra of [...unsupported, { status: "rejected" }]) {
    assert(!block({ ...extra, facts: [row()] }).includes("Excel"), "profile wrapper promoted child");
    assert(!goalLines({ preferences: { ...extra, roles: ["SYN-DENIED-ROLE"] }, facts: [] }).join().includes("SYN-DENIED-ROLE"), "preference wrapper promoted role");
    assert(!goalLines({ basics: { ...extra, location: "SYN-DENIED-PLACE" }, facts: [] }).join().includes("SYN-DENIED-PLACE"), "basics wrapper promoted place");
    assert(!block({}, [{ id: "SYN-STANDING", text: "SYN-DENIED-STANDING", ...extra }]).includes("SYN-DENIED-STANDING"), "standing wrapper became mandatory");
  }
});
Deno.test("personal source: profile and stated fact replies reject denied rows and wrappers", () => {
  for (const extra of [...unsupported, { status: "rejected" }]) {
    for (const state of [{ profile: { facts: [row(extra)] } }, { profile: { ...extra, facts: [row()] } }, { statedFacts: { ...extra, facts: [row()] } }]) {
      assert(untracedFacts(claim, sources(state)).length > 0, "denied personal evidence validated a claim: " + JSON.stringify(extra));
    }
  }
});
Deno.test("personal source: tool result rows and enclosing denied records cannot back a personal claim", () => {
  for (const extra of [...unsupported, { status: "rejected" }]) {
    for (const result of [{ facts: [row(extra)] }, { ...extra, facts: [row()] }])
      assert(untracedFacts(claim, sources({}, [JSON.stringify(result)])).length > 0, "tool envelope laundered denied personal evidence: " + JSON.stringify(extra));
  }
});
Deno.test("personal source control: own facts draft goals literal text and ordinary tool records survive", () => {
  const own = row({ provenance: "owner stated this experience", text: "Excel; I study how model generated prose works" });
  const profile = { preferences: { roles: ["Data analyst"] }, facts: [own, row({ id: "SYN-GOAL", kind: "goal", text: "A design internship", provenance: "user", status: "draft", needs_confirmation: true })] };
  const before = JSON.stringify(profile), out = block(profile);
  assert(out.includes(own.text), "fact body was interpreted as provenance");
  assert(out.includes("A design internship (said, not confirmed yet)"), "own draft goal was hidden or promoted");
  assert(out.includes("Roles: Data analyst"), "independent preference disappeared");
  assert(untracedFacts(claim, sources({ profile })).length === 0, "own confirmed source was lost");
  const tool = sources({}, [JSON.stringify({ status: "completed", facts: [row({ status: undefined })], count: 1 })]);
  assert(untracedFacts(claim, tool).length === 0, "ordinary unlabelled tool record contract changed");
  assert(JSON.stringify(profile) === before, "positive source filtering mutated stored data");
});
Deno.test("personal source: actual brain entry excludes unsupported goals without losing the own draft goal", async () => {
  let system = "", calls = 0;
  const profile = { facts: [row({ kind: "goal", text: "SYN-AGENT-INVENTED-GOAL", provenance: "agent-generated" }), row({ id: "SYN-OWN-GOAL", kind: "goal", text: "SYN-OWN-DESIGN-GOAL", source: "user", status: "draft", needs_confirmation: true })] };
  const before = JSON.stringify(profile);
  await agentTurn({ message: "What goal did I give you?", history: [], stores: { profile }, userId: "SYN-OWNER", threadId: "SYN-RETURN", now: 0,
    known: { standing: [], alerts: null, pipeline: null }, model: async p => { system = p.system; calls++; return { content: [{ type: "text", text: "Which role should I search for next?" }], stop_reason: "end_turn" }; } });
  assert(!system.includes("SYN-AGENT-INVENTED-GOAL"), "actual brain prompt contains invented goal");
  assert(system.includes("SYN-OWN-DESIGN-GOAL (said, not confirmed yet)"), "actual prompt lost qualification of own goal");
  assert(calls === 1, "scripted positive turn unexpectedly retried");
  assert(JSON.stringify(profile) === before, "actual recall rewrote the profile");
});
