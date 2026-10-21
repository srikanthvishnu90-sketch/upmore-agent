// Independent synthetic writer/next-turn regressions. No corpus, provider, DB, or network.
// Owner-assigned fail-first gate. Baseline: 5 failures, 3 passing controls.
// Run explicitly while Claude fixes the correction writer; move to the active architect suite once it passes.
// deno test --no-check --allow-read --deny-net tests/architect/pending/brain-goal-correction.test.ts
import { CareerProfile } from "../../../supabase/functions/_shared/router_core.career.js";
import { careerTools } from "../../../supabase/functions/_shared/agent/career_tools.ts";
import { agentTurn } from "../../../supabase/functions/agent-chat/career_brain.ts";

const NOW = Date.UTC(2026, 9, 21, 15);
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
function eq(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: got ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
}
function seed(goal = "Data analyst role in Austin") {
  return CareerProfile.createProfile({
    preferences: { roles: ["Data analyst"], locations: ["Austin"], remote: "hybrid", compFloor: "$80,000", targetCompanies: ["Synthetic Co"] },
    facts: [{ id: "F-001", kind: "goal", text: goal, status: "confirmed", needs_confirmation: false },
      { id: "F-002", kind: "skill", text: "SQL", status: "confirmed", needs_confirmation: false }],
  });
}
async function correct(profile: any, id: string, text: string) {
  const state = { profile };
  const tool = careerTools({ postings: async () => [] }).find((t) => t.name === "correct_profile_fact")!;
  const result: any = await tool.run({ id, text }, { userId: "SYN-CACHE", threadId: "SYN-T", now: NOW, state, turn: { message: `Actually, ${text}`, added: [] } });
  eq([result.fact.text, result.fact.status, result.fact.needs_confirmation], [text, "draft", true], "correction must replace fact and require confirmation");
  assert(!profile.facts.some((f: any) => f.id === id && f.text === result.was), "old fact must be replaced");
  return result;
}
const pool = [
  { job_id: "SYN-OLD", company: "Synthetic Old", title: "Data analyst", location: "Austin", url: "https://jobs.example.test/old", description: "Data analyst", first_seen_at: "2026-10-21T12:00:00Z" },
  { job_id: "SYN-NEW", company: "Synthetic New", title: "UX designer", location: "Denver", url: "https://jobs.example.test/new", description: "UX designer", first_seen_at: "2026-10-20T12:00:00Z" },
];

const goalBlock = (system: string) => {
  const at = system.indexOf("\nTheir goal (what they want;");
  assert(at >= 0, "account goal heading missing");
  return system.slice(at + 1, system.indexOf("\nJob alerts:", at));
};

async function correctedThenSearch(reconcileCache?: (p: any) => void) {
  const stores = { profile: seed() };
  const common = { stores, userId: "SYN-CACHE", threadId: "SYN-T", now: NOW, history: [], known: { standing: [], alerts: null, pipeline: null }, postings: async () => pool };
  let first = true;
  const corrected = await agentTurn({ ...common, message: "Actually, my goal is UX designer role in Denver.", model: async () => {
    if (first) { first = false; return { content: [{ type: "tool_use", id: "c1", name: "correct_profile_fact", input: { id: "F-001", text: "UX designer role in Denver" } }], stop_reason: "tool_use" }; }
    return { content: [{ type: "text", text: "Please confirm the corrected goal wording: UX designer role in Denver." }], stop_reason: "end_turn" };
  } });
  assert(corrected.tool_calls.some((t) => t.name === "correct_profile_fact" && t.ok), "real agentTurn correction did not succeed");
  eq([stores.profile.facts[0].text, stores.profile.facts[0].status], ["UX designer role in Denver", "draft"], "stored fact must contain new goal only");
  reconcileCache?.(stores.profile);
  // Cross the same JSON snapshot boundary as persisted per-person state; history contains no old goal.
  const persisted = JSON.parse(JSON.stringify(stores));
  let system = "", result: any = null, queried = false;
  const searched = await agentTurn({ ...common, stores: persisted, message: "Find jobs for my goal.", model: async (p: any) => {
    system ||= p.system;
    if (!queried) { queried = true; return { content: [{ type: "tool_use", id: "s1", name: "search_jobs", input: {} }], stop_reason: "tool_use" }; }
    for (const m of p.messages) for (const b of Array.isArray(m.content) ? m.content : []) if (b.type === "tool_result" && b.tool_use_id === "s1") result = JSON.parse(b.content);
    return { content: [{ type: "text", text: "Compare the listed responsibilities and requirements before choosing a role." }], stop_reason: "end_turn" };
  } });
  assert(searched.tool_calls.some((t) => t.name === "search_jobs" && t.ok), "real next-turn search did not succeed");
  assert(result !== null, "scripted model did not observe search result");
  console.log(JSON.stringify({ evidence: reconcileCache ? "counterfactual-cache-reconciliation" : "correctedThenSearch", storedFact: persisted.profile.facts[0], cachedPreferences: persisted.profile.preferences, goalBlock: goalBlock(system), searchGoal: result.goal, rankedJobs: result.postings.map((p: any) => ({ id: p.job_id, role_match: p.role_match })) }));
  return { system, result, persisted };
}

Deno.test("writer: goal correction invalidates only superseded role/place cache", async () => {
  const p = seed();
  // These entries have a separate user-stated fact and must survive correction of F-001.
  p.preferences.roles.push("Product manager");
  p.preferences.locations.push("Boston");
  CareerProfile.addFact(p, { kind: "preference", text: "Also open to Product manager roles in Boston", status: "confirmed", needs_confirmation: false });
  await correct(p, "F-001", "UX designer role in Denver");
  assert(p.preferences.roles.includes("Product manager") && p.preferences.locations.includes("Boston"), "independently stated preferences must survive correction of another fact");
  eq([p.preferences.remote, p.preferences.compFloor, p.preferences.targetCompanies], ["hybrid", "$80,000", ["Synthetic Co"]], "unrelated settings must survive");
  // Rebuilding from exact stated words or invalidating the derived entries are both valid writer fixes.
  assert(!p.preferences.roles.includes("Data analyst") && !p.preferences.locations.includes("Austin"), `replaced fact survives in derived preference cache: ${JSON.stringify(p.preferences)}`);
});

Deno.test("writer: location-only goal correction preserves independent role preference", async () => {
  const p = seed();
  await correct(p, "F-001", "Data analyst role in Denver");
  assert(!p.preferences.locations.includes("Austin"), `old place remains after goal location correction: ${JSON.stringify(p.preferences.locations)}`);
  eq(p.preferences.roles, ["Data analyst"], "unchanged role preference must survive a location correction");
});

Deno.test("writer: standalone location correction invalidates its matching place cache", async () => {
  const p = seed("Data analyst role");
  CareerProfile.addFact(p, { kind: "location", text: "Austin", status: "confirmed", needs_confirmation: false });
  const id = p.facts.at(-1).id;
  await correct(p, id, "Denver");
  assert(!p.preferences.locations.includes("Austin"), `old place remains after location fact correction: ${JSON.stringify(p.preferences.locations)}`);
  eq(p.preferences.roles, ["Data analyst"], "location correction must preserve role preferences");
});

Deno.test("agentTurn: next-turn account memory must not advertise corrected-away role/place", async () => {
  const { system } = await correctedThenSearch();
  const goal = goalBlock(system);
  assert(goal.includes("UX designer role in Denver (said, not confirmed yet)"), "replacement goal must remain visible as unconfirmed");
  assert(!goal.includes("Data analyst") && !goal.includes("Austin"), `next turn still advertises superseded cached goal:\n${goal}`);
});

Deno.test("agentTurn: next-turn search must rank only the corrected goal", async () => {
  const { result } = await correctedThenSearch();
  eq(result.goal, { roles: ["ux", "designer"], places: ["denver"], remote: false }, "search goal must not union replaced cached terms");
  eq(result.postings[0].job_id, "SYN-NEW", "corrected goal must outrank newer posting for replaced goal");
  eq(result.postings[0].role_match, true, "corrected role should be a full goal match");
});

Deno.test("positive control: unrelated skill correction preserves every preference", async () => {
  const p = seed(), before = structuredClone(p.preferences);
  await correct(p, "F-002", "PostgreSQL");
  eq(p.preferences, before, "unrelated fact correction must not erase saved goals or other preferences");
});

Deno.test("positive control: new draft has stable identity, old text only in audit field", async () => {
  const p = seed(), before = structuredClone(p.facts[0]);
  const r = await correct(p, "F-001", "UX designer role in Denver");
  eq([p.facts.length, r.fact.id, r.fact.corrected_from], [2, before.id, before.text], "correction must replace in place with audit provenance");
});

Deno.test("causal control: reconciling stale cache alone restores memory and search on unchanged readers", async () => {
  // Test-only counterfactual at the writer boundary, not a proposed production implementation.
  const { system, result, persisted } = await correctedThenSearch((p) => {
    p.preferences.roles = p.preferences.roles.filter((r: string) => r !== "Data analyst");
    p.preferences.locations = p.preferences.locations.filter((l: string) => l !== "Austin");
  });
  const goal = goalBlock(system);
  assert(!goal.includes("Data analyst") && !goal.includes("Austin"), "stale memory survived cache-only intervention");
  eq(result.goal, { roles: ["ux", "designer"], places: ["denver"], remote: false }, "unchanged search readers should now see only corrected goal");
  eq(result.postings[0].job_id, "SYN-NEW", "corrected goal must rank first after cache-only intervention");
  eq(result.postings[0].role_match, true, "corrected role must regain full match after cache-only intervention");
  eq([persisted.profile.preferences.remote, persisted.profile.preferences.compFloor, persisted.profile.preferences.targetCompanies], ["hybrid", "$80,000", ["Synthetic Co"]], "cache intervention must preserve unrelated preferences");
});
