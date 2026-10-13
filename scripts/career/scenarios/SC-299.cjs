"use strict";
// SC-299 (canonical) A target company asks whether AI helped my application — a truthful answer drafted.
const { H, S } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-299", "ai-helped-application-truthful-answer");
  s.user("A target company asks whether AI helped my application — draft my answer");
  const a = S.aiUseAnswer({ company: "Datadog" });
  s.tool("CareerSafety.aiUseAnswer(no AI-text ban)", a);
  s.agent(a.draft, { card: { type: "ai_use_answer", title: "Answer for Datadog (truthful)", path: a.path, note: a.note } });
  const b = S.aiUseAnswer({ company: "BanCorp (TEST policy fixture)", company_bans_ai_text: true });
  s.tool("control: a company that bans AI-written text gets the outline-path answer", b);
  s.agent(b.draft);
  const ok = a.truthful === true && a.path === "ai_assisted_disclosed" && /Yes — I used an AI assistant/.test(a.draft) && /facts are entirely mine/.test(a.draft)
    && b.truthful === true && b.path === "outline_only" && /wrote the submitted text myself/.test(b.draft)
    && !/no AI|never used/i.test(a.draft + b.draft);
  s.verify("draft state: the answer discloses the AI tailoring help that actually happened (never denies it), claims only the user's own facts, and the AI-ban control case truthfully reflects the outline-only path that was actually used", { ok, path: a.path, control_path: b.path });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "A truthful AI-use answer was drafted: it discloses the AI tailoring/proofreading help that actually happened, claims only the user's own facts, and — for a company that bans AI-written text — truthfully reflects the outline-only path instead of denying AI involvement." }
    : { status: "LEARN", outcome: "AI-use answer was not truthful/complete in both policy worlds.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix aiUseAnswer in 131 and rerun SC-299." });
})().catch((e) => { console.error(e); process.exit(1); });
