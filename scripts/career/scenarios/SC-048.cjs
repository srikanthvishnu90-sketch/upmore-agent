"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-048", "doorstep-greenhouse");
  s.user("apply for me (Greenhouse posting)");
  const postings = await L.feed("greenhouse", "figma");
  const posting = postings.find((p) => /engineer/i.test(p.title)) || postings[0];
  const t = L.Tailor.tailorResume(L.persona(), posting.jd_text, { jobId: posting.job_id, company: "Figma" });
  s.tool("121-career-jobs greenhouse feed + 123 tailor (doorstep prep)", { posting: { title: posting.title, url: posting.url, job_id: posting.job_id }, tailorOk: t.ok, resumeVersion: t.version && t.version.versionId, fieldMapNote: "Greenhouse apply forms live on boards.greenhouse.io / the employer's careers page; there is NO public Greenhouse test/demo board. Field map of a live form cannot be captured without the parent's live browser task." });
  s.agent(`Your tailored resume for ${posting.title} at Figma is ready (version ${t.version ? t.version.versionId : "n/a"}, audit passed). The last step — filling the Greenhouse form to its final review screen — has to happen on the live board, and Greenhouse runs no public test/demo board I can fill safely. I have NOT submitted anything, and I won't submit a fake application to a real employer. The parent agent's browser task can do the doorstep fill on the real posting with you watching, stopping before Submit.`);
  s.verify("tailor prep is real (audit state), and NO submission was made or claimed", { tailorOk: t.ok, submitted: false });
  await s.finish({ status: "LEARN", outcome: "Tailored resume ready for the real Figma Greenhouse posting; doorstep fill not performed — no Greenhouse test/demo board exists.", reason: "live doorstep fill on the real board needs the parent's browser task", unblock: "Parent runs a browser task on the posting URL (see messages.json tool record), fills to the final review step with the TEST persona only if the user approves a test fill, screenshots, and stops before Submit." });
})();
