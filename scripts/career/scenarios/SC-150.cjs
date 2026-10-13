"use strict"; const { G, H, graphAll, profile } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-150", "forwardable-intro-ask");
  s.user("Intro request: a mutual gets a forwardable blurb and the ask, card-approved");
  const g = graphAll(); const blurb = G.forwardableBlurb(g, profile());
  const intro = G.draftIntroRequest(g, "Daniel Warm (TEST)", "Maya Alumni (TEST)", blurb.ok ? blurb.blurb : null);
  s.tool("135.forwardableBlurb + draftIntroRequest", { blurb, intro });
  s.agent(`Card for your approval — nothing sent. Daniel gets the ask plus this forwardable blurb:\n\n${blurb.blurb}`, { card: { title: "T3 — intro request to Daniel Warm (TEST)", kind: "intro_request", sends: false, draft: intro.draft } });
  s.verify("intro draft exists, is approval-gated (sends:false, T3), and embeds the 3-line blurb built from profile facts", { sends: intro.sends, blurb_lines: blurb.lines.length, fact_ids: blurb.fact_ids });
  await s.finish({ status: "COMPLETE", outcome: "Intro ask drafted for the mutual with a forwardable blurb, held on a T3 approval card — nothing sent" }); })();
