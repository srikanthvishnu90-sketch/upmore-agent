"use strict";
// Seeds a REAL 124 campaign by replaying the labeled fixture events (w03-campaign-events.json)
// through sendPending (mock transport, tests only) + recordOutcome/handleReply. Numbers are never hand-set.
const fs = require("fs");
const path = require("path");
const { M, USER, poolOverFirms, FIRM_SETS, mockTransport, root } = require("./w03-common.cjs");
async function seedCampaign() {
  const fx = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/fixtures/w03-campaign-events.json"), "utf8"));
  const firms = FIRM_SETS.sets.elite_boutique.firms.slice(0, 8).map((f) => f.name);
  const records = poolOverFirms(firms, 6, { per: (i) => ({ personalization_facts: [{ fact: "spoke at a campus finance panel (TEST fact)", source_url: "https://example.test/p" + i, strength: "medium" }] }) });
  const supp = M.createSuppressionStore();
  const camp = M.createCampaign({ id: fx.campaign_id, userId: "w03-user", approved: true });
  const structures = ["path_question", "shared_context", "specific_question", "short_honest"];
  const entries = records.slice(0, fx.sent_count).map((c, i) => { const d = M.draftFor(c, USER, { structureIndex: i % 4 }); d.structure = structures[i % 4]; return { candidate: c, draft: d }; });
  M.enqueue(camp, entries, { suppression: supp });
  const sent = await M.sendPending(camp, { transport: mockTransport(), suppression: supp });
  for (const bi of fx.bounce_person_indexes) { const item = camp.items[bi]; M.recordOutcome(camp, { type: "bounce", item, suppression: supp }); }
  const replyLog = [];
  for (const r of fx.replies) { const item = camp.items[r.person_index]; const out = M.handleReply(camp, { body: r.body }, item.candidate, { suppression: supp, nowMs: Date.parse("2026-10-13T15:00:00Z") }); replyLog.push({ person_id: item.person_id, name: item.candidate.full_name, email: item.email, classification: out.classification.classification, positive: !!r.positive }); }
  for (let i = 0; i < fx.meetings_booked; i++) M.recordOutcome(camp, { type: "meeting_booked" });
  for (let i = 0; i < fx.meetings_held; i++) M.recordOutcome(camp, { type: "meeting_held" });
  const notes = {}; for (const r of fx.replies) if (r.note) notes[camp.items[r.person_index].person_id] = r.note;
  return { camp, supp, fx, replyLog, notes, sentResult: sent, records };
}
module.exports = { seedCampaign };
