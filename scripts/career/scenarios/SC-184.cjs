"use strict"; const { H, N } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-184", "negotiation-roleplay");
  s.user("practice the negotiation with me");
  let st = { turn: 0, pushes: 0 };
  s.agent("I'll play your recruiter. Your offer is on the table — open however you'd open the real call.");
  for (const line of ["Thank you — I'm excited, this is my first choice.", "I was hoping base could land closer to $142,000, given the sourced range for this role.", "If base can't move, a signing adjustment works too — and if we land there, I'm ready to sign today."]) {
    s.user(line); const r = N.roleplayTurn(st, line); st = r; s.tool("128.roleplayTurn", r); s.agent(r.recruiter + (r.feedback ? `\n\n${r.feedback}` : ""));
  }
  s.verify("roleplay ended with feedback after the user's closing line; push count recorded", { final_state: st });
  await s.finish({ status: "COMPLETE", outcome: "Agent played the recruiter against the user's script across 3 turns and gave closing feedback" }); })();
