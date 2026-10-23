// Read-only probe: the frozen modules, loaded unmodified, on a person's own sponsorship sentences.
const root = process.argv[2] || require("path").resolve(__dirname, "../../..");
const R = require(root + "/packages/domain/142-career-router.js");
const D = require(root + "/packages/domain/141-career-doorstep.js");
const P = require(root + "/packages/domain/149-career-portal-apply.js");
const A = require(root + "/packages/domain/132-career-apply.js");
const texts = [
  "I no longer need sponsorship.",
  "I don't need sponsorship.",
  "I do not require visa sponsorship.",
  "No sponsorship needed.",
  "I will need sponsorship in the future.",
  "I need sponsorship.",
  "Update: I'm not going to need sponsorship anymore.",
];
const rows = [];
for (const t of texts) {
  const profile = { basics: { name: "Ada" }, constraints: {} };
  let r; try { r = R.handleStateChangeIntents(t, { profile, now: "2026-10-23T12:00:00Z" }); } catch (e) { r = { error: String(e.message || e) }; }
  const c = profile.constraints;
  const d141 = D.resolveField({ field_id: "work_authorization" }, { profile });
  const sd141 = D.resolveField({ field_id: "sponsorship_detail" }, { profile });
  const p149 = P.portalInputsFromBank({ basics: { name: "Ada" }, constraints: c }, { now: Date.parse("2026-10-23T12:00:00Z") });
  const wa149 = p149.attestations && p149.profile ? (p149.profile.answers || {}) : {};
  rows.push({
    said: t,
    intent: r && r.intent || null,
    stored_workAuthorization: c.workAuthorization ?? null,
    stored_needsSponsorship: c.needsSponsorship ?? null,
    "141 work_authorization": d141.value ?? ("ASK: " + d141.ask),
    "141 sponsorship_detail": sd141.value ?? ("ASK: " + sd141.ask),
    "149 work_authorization": JSON.stringify((p149.profile && p149.profile.answers && p149.profile.answers.work_authorization) || null),
    "149 sponsorship": JSON.stringify((p149.profile && p149.profile.answers && p149.profile.answers.sponsorship) || null),
    "132 work_authorization": A.savedAnswerFor(profile, "work_authorization"),
    "132 sponsorship": A.savedAnswerFor(profile, "sponsorship"),
  });
}
console.log(JSON.stringify(rows, null, 1));
