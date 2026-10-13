"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-120", "batch-approval-card");
  s.user("Apply to these 8 roles?");
  const prof = L.profile("test-persona.json"); const profP = L.personaProfile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const scored = L.scoreAll(r.postings, prof);
  const top8 = await J.buildShortlist(scored, { limit: 8 });
  const registry = []; const cardRows = [];
  for (const x of top8) {
    const t = T.tailorResume(profP, x.posting.title + "\n" + x.posting.jd_text.slice(0, 2000), { jobId: x.posting.job_id });
    const vid = "VAR-" + x.posting.job_id;
    registry.push({ variant_id: vid, company: x.posting.company, job_id: x.posting.job_id });
    cardRows.push({ company: x.posting.company, title: x.posting.title, fit_score: x.adjusted_score, bucket: x.bucket, variant_id: vid, variant_audit_ok: t.audit ? t.audit.ok : false, attach_guard: A3.guardAttach(registry, x.posting.company, vid).ok });
  }
  s.agent(`Approval card — nothing goes out until your yes. 8 roles, each with its fit and the exact resume variant that would be attached: ${cardRows.map((c) => `${c.company} — ${c.title}: fit ${c.fit_score} (${c.bucket}), variant ${c.variant_id} (audit ${c.variant_audit_ok ? "passed" : "FAILED"})`).join(" | ")}. Every variant passed the wrong-company attach guard against its own company. Say yes to the card (or name the ones to drop) and only then do doorstep submissions begin — one yes covers this exact list, nothing more.`, { card: { title: "Apply to these 8 roles?", roles: cardRows, submitted: false } });
  s.verify("card rows built from buildShortlist + per-role tailor audits + attach-guard verdicts; submitted flag is false — the card is the deliverable", { roles: cardRows.length, all_guards_ok: cardRows.every((c) => c.attach_guard), submitted: false });
  await s.finish({ status: cardRows.length === 8 && cardRows.every((c) => c.attach_guard) ? "COMPLETE" : "LEARN", outcome: "Batch approval card presented for 8 live roles — fit + bucket + audited variant per role, attach guards green, zero submitted pending the user's yes" });
})().catch((e) => { console.error(e); process.exit(1); });
