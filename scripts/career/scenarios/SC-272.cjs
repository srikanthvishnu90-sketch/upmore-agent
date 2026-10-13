"use strict"; const {H,OS,fixture}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-272","skill-gap-top3-learn-order");
  s.user("Skill gap: the three skills between me and the next pay band, in learn order");
  const fx=fixture("test-career-os-w14.json"); const g=OS.skillGap({profileSkills:fx.profile_skills,postings:fx.postings_current}); s.tool("129.skillGap (TEST postings)",g);
  const top=g.learn_next_order.slice(0,3);
  s.agent(`The three skills between you and the next pay band, in learn order: ${top.join(" \u2192 ")}. Basis: the higher-paying postings with stated ranges (${g.basis.higher_paying_postings_considered} considered). ${g.statement}`);
  s.verify("top-3 taken verbatim from learn_next_order in rail output",{top,basis:g.basis});
  await s.finish({status:top.length===3?"COMPLETE":"LEARN",outcome:`Skill-gap top 3 in learn order from higher-paying TEST postings: ${top.join(", ")}`,reason:top.length===3?undefined:"fewer than 3 grounded gaps",unblock:top.length===3?undefined:"more postings with stated ranges"}); })();
