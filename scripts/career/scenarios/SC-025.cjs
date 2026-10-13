"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, PROFILE, USER } = L;
(async () => {
  const s = H.session("SC-025", "middle-market-tier-a-only-hold-tier-c");
  s.user("Email 175 middle-market bankers, Tier A personalization only; hold Tier C back and tell me");
  const q = M.parseTarget("Email 175 middle-market bankers, Tier A personalization only; hold Tier C back and tell me", PROFILE);
  s.tool("CareerOutreach.parseTarget", q);
  // TEST pool engineered across tiers: strong sourced facts -> A; school overlap only -> B; bare records -> C.
  const firms = ["Piper Sandler", "William Blair", "Baird", "Raymond James", "Stifel", "Lincoln International", "Harris Williams"];
  const base = L.gen(175, { tag: "025", count: 175, firms, title: "Analyst", seniority: "analyst" });
  const pool0 = base.map((c, i) => {
    if (i % 3 === 0) return Object.assign(c, { personalization_facts: [{ fact: `led a deal-club session at ${c.current_firm}`, source_url: "TEST-fixture", strength: "strong" }] });
    if (i % 3 === 1) return Object.assign(c, { schools: ["TEST University"], personalization_facts: [{ fact: "alumni directory row", source_url: "TEST-fixture", strength: "weak" }] });
    return Object.assign(c, { schools: ["Other College (TEST)"], geography: "", office: "", personalization_facts: [] });
  });
  const tiers = pool0.map((c) => ({ c, tier: M.determineTier(c, PROFILE) }));
  const counts = { A: 0, B: 0, C: 0 }; tiers.forEach((t) => counts[t.tier]++);
  s.tool("CareerOutreach.determineTier counts over TEST pool", counts);
  const camp = M.createCampaign({ id: "TEST-CAMP-025", userId: "TEST-USER", approved: true });
  const supp = M.createSuppressionStore();
  const aEntries = tiers.filter((t) => t.tier === "A").map((t) => { const d = M.draftAndGate(t.c, USER, {}); return { candidate: t.c, draft: d.draft, tier: "A" }; });
  const queued = M.enqueue(camp, aEntries, { suppression: supp });
  const queuedOk = queued.filter((x) => x.status === "queued");
  const heldC = counts.C;
  s.agent(`Tier counts from the rail: A=${counts.A}, B=${counts.B}, C=${counts.C}. I queued ONLY the ${queuedOk.length} Tier A bankers for sending. Tier C (${heldC} people) is held back — not queued, not sent — exactly as you said. Tier B is also not in this send (you asked for Tier A only).`, { card: { title: "Tier A only — Tier C held", tier_counts: counts, queued_tier_a: queuedOk.length, held_tier_c: heldC } });
  const queueTiers = [...new Set(camp.items.map((i) => i.tier))];
  const ok = camp.items.length === queuedOk.length && queueTiers.length === 1 && queueTiers[0] === "A" && heldC > 0 && counts.A + counts.B + counts.C === 175;
  s.verify("campaign queue contents inspected: every queued item is tier A; Tier C count held = tier census C; total census = 175", { queue_items: camp.items.length, queue_tiers: queueTiers, counts, heldC });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `175 middle-market bankers tiered (A=${counts.A} B=${counts.B} C=${counts.C}); only Tier A queued (${queuedOk.length}); Tier C held back (${heldC}) and reported to the user.` }
    : { status: "LEARN", outcome: "Tier gating did not verify.", reason: `queueTiers=${JSON.stringify(queueTiers)} counts=${JSON.stringify(counts)}`, unblock: "Fix determineTier/enqueue tier handling and rerun SC-025." });
})().catch((e) => { console.error(e); process.exit(1); });
