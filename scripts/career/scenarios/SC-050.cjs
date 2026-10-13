"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-050", "doorstep-ashby");
  s.user("apply for me (Ashby posting)");
  const postings = await L.feed("ashby", "ramp");
  const posting = postings.filter((p) => /engineer/i.test(p.title))[0];
  const t = L.Tailor.tailorResume(L.persona(), posting.jd_text, { jobId: posting.job_id, company: "Ramp" });
  s.tool("121-career-jobs ashby feed + 123 tailor (doorstep prep)", { posting: { title: posting.title, url: posting.url, job_id: posting.job_id }, tailorOk: t.ok, resumeVersion: t.version && t.version.versionId, fieldMapNote: "Ashby boards at jobs.ashbyhq.com are real employer boards; there is NO public Ashby test/demo board. Filling the Ramp board would be a real application flow." });
  s.agent(`Your tailored resume for ${posting.title} at Ramp is ready (version ${t.version ? t.version.versionId : "n/a"}, audit passed). Ashby runs no public test/demo board, so the doorstep fill can only happen on Ramp's real board — I have NOT filled or submitted anything there. The parent agent's browser task can do the fill to the final review step and stop before Submit, with the screenshot as evidence.`);
  s.verify("tailor prep is real (audit state), and NO submission was made or claimed", { tailorOk: t.ok, submitted: false });
  await s.finish({ status: "LEARN", outcome: "Tailored resume ready for the real Ramp Ashby posting; doorstep fill not performed — no Ashby test/demo board exists.", reason: "live doorstep fill on the real board needs the parent's browser task", unblock: "Parent runs a browser task on the posting apply URL (see messages.json tool record), fills to the final review step, screenshots, and stops before Submit." });
})();
