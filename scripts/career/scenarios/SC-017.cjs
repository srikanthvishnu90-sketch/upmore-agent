"use strict";
// SC-017 What can you do? (honest status) — answer generated from registry.json + inventory rows.
const { H, O, capabilitySources } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-017", "what-can-you-do-honest-status");
  s.user("what can you actually do for my job search?");
  const sources = capabilitySources();
  const r = O.handleChat("what can you actually do for my job search?", { capabilitySources: sources });
  const st = O.capabilityStatus(sources);
  s.tool("CareerOnboarding.capabilityStatus(registry + inventory rows)", { proven_live: st.proven_live, blocked_count: st.blocked_count, built: st.built, blocked_sample: st.blocked.slice(0, 3) });
  s.agent(r.reply, { card: { type: "capability_status", title: "What I can actually do", proven_live: r.proven_live, blocked_count: r.blocked_count, built_registry_tested: r.built.registry_tested } });
  // Independent recount straight from the source files (the rail's own state, not the reply):
  const caps = sources.registry.capabilities;
  const expTested = caps.filter((c) => c.status === "TESTED").length;
  const expGated = caps.filter((c) => c.status === "GATED").length;
  const expVerified = caps.filter((c) => c.status === "VERIFIED").length;
  const expCareerBlocked = sources.careerRows.filter((c) => /blocked/i.test(c.status)).length;
  const ok = r.intent === "capability_status" && r.proven_live === expVerified && expVerified === 0
    && st.built.registry_tested === expTested && st.blocked_count === expGated + expCareerBlocked
    && /Proven live: 0/.test(r.reply) && !/I can (?:definitely|guarantee)/i.test(r.reply);
  s.verify("buckets recount independently from registry.json + inventory rows and match the answer exactly: built = TESTED count, proven live = VERIFIED count (0), blocked = GATED rows + blocked career rows", { ok, expected: { tested: expTested, gated: expGated, verified: expVerified, career_blocked: expCareerBlocked }, answer: { built: st.built.registry_tested, proven_live: st.proven_live, blocked_count: st.blocked_count } });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `Honest-status answer generated from the registry/inventory rows themselves: ${expTested} tested finance capabilities + the built career modules, proven live 0 (nothing carries a live record yet), ${r.blocked_count} blocked rows named with reasons — no invented abilities.` }
    : { status: "LEARN", outcome: "Capability answer did not match the registry/inventory recount.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix capabilityStatus in 130 and rerun SC-017." });
})().catch((e) => { console.error(e); process.exit(1); });
