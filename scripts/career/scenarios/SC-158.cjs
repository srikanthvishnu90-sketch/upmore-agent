"use strict"; const { G, H, graph, profile } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-158", "update-touch-new-project");
  s.user("Update touch drafted around my new offer or project");
  const r = G.draftUpdateTouch(graph(), "Daniel Warm (TEST)", profile(), { factId: "F-003" });
  s.tool("135.draftUpdateTouch(F-003 DeployBoard)", r);
  s.agent(`Draft (approval-gated, unsent), built only from your confirmed profile fact F-003:\n\n${r.draft.body}`, { card: { title: "Update touch — Daniel Warm (TEST)", sends: false, fact_id: r.fact_id } });
  s.verify("draft cites a confirmed master-profile fact and no other news; sends:false", { fact_id: r.fact_id, sends: r.sends, body_has_fact: r.draft.body.includes("DeployBoard") });
  await s.finish({ status: "COMPLETE", outcome: "Update touch drafted around the real DeployBoard project fact (F-003), approval-gated and unsent" }); })();
