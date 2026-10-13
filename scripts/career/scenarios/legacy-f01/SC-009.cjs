"use strict";
// SC-009 Resume upload to profile — 122 ingest: drafts marked needs_confirmation, confirm in chat, inspectable by ID.
const fs = require("fs"); const path = require("path");
const { H, Profile, ROOT, resumeText } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-009", "resume-upload-to-profile");
  s.user("here's my resume (attaches TEST resume)");
  const p = Profile.createProfile({ basics: { name: "Alex Testcase (TEST)" } });
  const { drafts, factIds } = Profile.ingestResume(p, resumeText());
  s.tool("CareerProfile.ingestResume(TEST resume)", { draft_count: drafts.length, factIds, kinds: drafts.map((d) => d.kind) });
  s.agent(`I parsed your resume into ${drafts.length} draft facts — every one is marked needs confirmation and none of them can support a tailored resume until you confirm them. Say "confirm all" or name a fact ID to confirm just that one.`, { card: { type: "resume_drafts", title: "Resume draft facts", facts: drafts.map((d) => ({ id: d.id, kind: d.kind, title: d.title, status: d.status })) } });
  const allDraft = drafts.every((d) => d.needs_confirmation === true && d.status === "draft");
  const confirmedBefore = Profile.confirmedFacts(p).length;
  s.user(`confirm ${factIds[0]}`);
  const one = Profile.confirmFact(p, factIds[0]);
  s.tool("CareerProfile.confirmFact", one);
  s.agent(`Confirmed ${one.id} (${one.title}). The other ${drafts.length - 1} drafts are still unconfirmed. You can inspect any fact by ID — for example ${factIds[1]} is "${Profile.getFact(p, factIds[1]).title}".`);
  const byId = Profile.getFact(p, factIds[1]);
  const ok = drafts.length >= 8 && allDraft && confirmedBefore === 0 && one.needs_confirmation === false && one.status === "confirmed"
    && Profile.confirmedFacts(p).length === 1 && byId && byId.id === factIds[1]
    && drafts.some((d) => d.kind === "experience") && drafts.some((d) => d.kind === "skill" && d.name === "Python");
  s.verify("profile state: all ingested facts arrived as drafts (confirmedFacts = 0 before any confirm), confirming one ID flips only that fact, every fact is inspectable by its stable ID", { ok, draft_count: drafts.length, fact_ids: factIds, confirmed_after: Profile.confirmedFacts(p).map((f) => f.id) });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `TEST resume parsed into ${drafts.length} draft facts, all marked needs_confirmation; the user confirmed one by ID in chat and only that fact became confirmed; every fact is inspectable by ID.` }
    : { status: "LEARN", outcome: "Resume ingestion did not hold the draft/confirm standard.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix ingestResume/confirmFact in 122 and rerun SC-009." });
})().catch((e) => { console.error(e); process.exit(1); });
