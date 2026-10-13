"use strict";
const { H, M, USER, person } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-042", "draft-surgery-shorter-less-formal");
  const cands = [0, 1, 2, 3, 4].map((i) => person(300 + i, { current_firm: ["Evercore", "Lazard", "Moelis & Company", "Houlihan Lokey", "Jefferies"][i], personalization_facts: [{ fact: `spent a year at a search fund before joining ${["Evercore", "Lazard", "Moelis & Company", "Houlihan Lokey", "Jefferies"][i]} (TEST fact)`, source_url: "https://example.test/bio" + i, strength: "strong", topic: "your search-fund path" }] }));
  const before = cands.map((c) => M.draftAndGate(c, USER, {}));
  s.user("Draft the campaign emails — show me 5 samples");
  s.tool("124.draftAndGate x5 (default voice)", before.map((b) => ({ to: b.draft.to, words: b.draft.body.split(/\s+/).length, gate: b.gate.pass })));
  s.agent("Here are the 5 samples in the default voice:\n\n" + before.map((b, i) => `--- Sample ${i + 1} (${b.draft.body.split(/\s+/).length} words) ---\n${b.draft.body}`).join("\n\n"));
  s.user("shorter, less formal");
  const after = cands.map((c) => M.draftAndGate(c, USER, { concise: true, voice: { formality: 0.1, directness: 0.9 } }));
  s.tool("124.draftAndGate x5 (concise, formality 0.1)", after.map((b) => ({ to: b.draft.to, words: b.draft.body.split(/\s+/).length, gate: b.gate.pass, formality: b.draft.voice.formality })));
  s.agent("Re-rendered — shorter, less formal (experience line dropped, formality 0.1):\n\n" + after.map((b, i) => `--- Sample ${i + 1} (${b.draft.body.split(/\s+/).length} words, was ${before[i].draft.body.split(/\s+/).length}) ---\n${b.draft.body}`).join("\n\n"));
  s.verify("every re-rendered draft is strictly shorter than its original and still passes the quality gate", { pairs: after.map((b, i) => ({ before: before[i].draft.body.split(/\s+/).length, after: b.draft.body.split(/\s+/).length })), all_shorter: after.every((b, i) => b.draft.body.split(/\s+/).length < before[i].draft.body.split(/\s+/).length), all_gate_pass: after.every((b) => b.gate.pass) });
  await s.finish({ status: "COMPLETE", outcome: `All 5 sample emails re-rendered shorter + less formal (word counts ${after.map((b, i) => before[i].draft.body.split(/\s+/).length + "->" + b.draft.body.split(/\s+/).length).join(", ")}), every draft still gate-clean` });
})();
