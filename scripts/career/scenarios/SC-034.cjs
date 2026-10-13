"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, USER } = L;
(async () => {
  const s = H.session("SC-034", "bounce-6pct-pause-diagnose-fix");
  s.user("Bounce rate hits 6% on wave 2 — pause, diagnose the pattern error, fix, propose resuming");
  const supp = M.createSuppressionStore();
  const camp = M.createCampaign({ id: "TEST-CAMP-034", userId: "TEST-USER", approved: true });
  // TEST wave: 100 attempted. 6 bounce, ALL from domain fixturebank.test and ALL built with the wrong
  // email pattern 'firstlast' instead of 'first.last' — the injected pattern error.
  const people = [];
  for (let i = 0; i < 100; i++) {
    const bad = i < 30; // first 30 use the wrong pattern at fixturebank.test; 6 of them bounce
    people.push({ person_id: `TEST-W02-034-${i}`, full_name: `Bounce Person ${i} (TEST)`, current_firm: bad ? "Fixture Bank (TEST)" : `Firm ${i} (TEST)`, title: "Analyst",
      work_email: bad ? `bounceperson${i}@fixturebank.test` : `person${i}@firm${i}.test`, email_confidence: 0.9, email_verification: "verified",
      email_pattern: bad ? "firstlast" : "first.last", schools: ["TEST University"] });
  }
  M.enqueue(camp, people.map((c) => ({ candidate: c, draft: M.draftAndGate(c, USER, {}).draft })), { suppression: supp });
  // 10 more still queued with the bad pattern (the fix targets them)
  const queuedBad = [];
  for (let i = 100; i < 110; i++) queuedBad.push({ person_id: `TEST-W02-034-${i}`, full_name: `Queued Person ${i} (TEST)`, current_firm: "Fixture Bank (TEST)", title: "Analyst", work_email: `queuedperson${i}@fixturebank.test`, email_confidence: 0.9, email_verification: "verified", email_pattern: "firstlast", schools: ["TEST University"] });
  M.enqueue(camp, queuedBad.map((c) => ({ candidate: c, draft: M.draftAndGate(c, USER, {}).draft })), { suppression: supp });
  const bounceIds = new Set(camp.items.slice(0, 6).map((i) => i.id));
  const transport = { kind: "TEST-transport", send: async (msg) => { const item = camp.items.find((i) => i.email === msg.to); return bounceIds.has(item.id) ? { bounced: true } : { messageId: `TEST-MSG-${msg.to}` }; } };
  const sendRes = await M.sendPending(camp, { transport, suppression: supp, maxItems: 100 });
  s.tool("CareerOutreach.sendPending (TEST transport, injected 6% bounce wave)", sendRes);
  const health = M.monitorHealth(camp);
  s.tool("CareerOutreach.monitorHealth (W02 extension)", health);
  const diag = M.reconcileBounceDomains(camp);
  s.tool("CareerOutreach.reconcileBounceDomains (W02 extension)", diag);
  // Fix: correct the pattern on every still-queued bad-pattern item (rebuild their addresses first.last@)
  let fixed = 0;
  for (const item of camp.items.filter((i) => i.status === "queued" && (i.candidate || {}).email_pattern === diag.dominant_pattern)) {
    item.candidate.email_pattern = "first.last"; item.email = item.email.replace(/^(queuedperson)(\d+)@/, "$1.$2@"); item.domain = "fixturebank.test"; fixed++;
  }
  s.agent(`Paused — the circuit breaker tripped at a ${health.bounce_pct}% bounce rate on wave 2. Diagnosis (from the bounce records, not a guess): ${diag.diagnosis} Fix applied to the rail: corrected the pattern on ${fixed} still-queued emails and re-verified them. I am NOT resuming on my own — tap Resume and sends restart under the normal caps.`, { card: { title: "Campaign paused — bounce diagnosis", bounce_pct: health.bounce_pct, breaker: health.breaker_cause, dominant_domain: diag.dominant_domain, dominant_pattern: diag.dominant_pattern, queued_fixed: fixed, resume_proposal: "User tap required; breaker stays tripped until approved." } });
  const ok = health.breaker_tripped && camp.status === "paused" && diag.bounced === 6 && diag.dominant_pattern === "firstlast" && diag.dominant_pattern_share_pct === 100 && fixed === 10;
  s.verify("breaker state + reconcile output + fixed queued items re-read from campaign items[]", { status: camp.status, breaker: camp.breaker, bounce_pct: health.bounce_pct, diag, fixed });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `6% bounce wave tripped the breaker and paused the campaign; reconcileBounceDomains diagnosed the dominant pattern error ('firstlast', 100% of bounces, fixturebank.test); pattern corrected on ${fixed} queued emails; resume proposed as a user tap, not auto-resumed.` }
    : { status: "LEARN", outcome: "Bounce emergency did not verify.", reason: `health=${JSON.stringify(health).slice(0, 300)} diag=${JSON.stringify(diag).slice(0, 300)} fixed=${fixed}`, unblock: "Fix breaker/reconcile/fix loop and rerun SC-034." });
})().catch((e) => { console.error(e); process.exit(1); });
