"use strict";
/* Lane C guards — module 174 (profile surfaces) over engines
 * 122/165/167/168/169/170. Synthetic persona only (the owner's real
 * corpus runs in the local exercise, never in committed tests). */
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

const S = require("../packages/domain/174-career-profile-surfaces.js");
const P122 = require("../packages/domain/122-career-profile.js");
const P167 = require("../packages/domain/167-career-trusted-facts.js");
const P170 = require("../packages/domain/170-career-facts-parser.js");

const TEXT = [
  "Jordan Rivera, Austin TX, (512) 555-0147, jordan.rivera@example.com, linkedin.com/in/jordan-rivera.",
  "State University, Computer Science bachelors 2024-2028, GPA 3.7/4.0.",
  "Founder Studyloop 2024-present (tutoring platform, 300+ students, peer matching engine).",
  "Data Intern Citylab 2025 (Python ETL pipelines, SQL dashboards).",
  "Skills: Python, SQL, Java; React, Node.js, Excel.",
  "Certs: AWS Cloud Practitioner.",
  "Work authorized: YES.",
  "Purple monkey dishwasher rambling that matches no known shape at all.",
].join(" ");

function stagedProfile() {
  const profile = P122.createProfile({ id: "u-test" });
  const review = S.importReview(P170.parseTextedFacts(TEXT));
  const staging = S.stageImport(profile, review);
  return { profile, review, staging };
}

test("import review: every item labeled needs_confirmation with a verbatim span at its offsets", () => {
  const review = S.importReview(P170.parseTextedFacts(TEXT));
  assert.ok(review.counts.facts >= 5, `expected >=5 parsed facts, got ${review.counts.facts}`);
  assert.ok(review.counts.basics >= 4, `expected basics, got ${review.counts.basics}`);
  for (const item of review.items) {
    assert.equal(item.label.state, "needs_confirmation", item.review_id);
    assert.equal(item.label.verbatim, true, item.review_id);
    if (item.label.start != null) assert.equal(TEXT.slice(item.label.start, item.label.end), item.label.span, item.review_id);
    assert.deepEqual(item.actions, ["confirm", "discard"]);
  }
  for (const u of review.unparsed) {
    assert.equal(u.label.state, "unparsed");
    assert.ok(u.reason, "unparsed carries a named reason");
    assert.deepEqual(u.actions, []);
  }
  const rendered = S.renderImportReview(review);
  assert.ok(rendered.includes("Not confirmed yet"));
  assert.ok(!rendered.includes("Confirmed —"), "review never claims confirmed");
});

test("staging writes drafts only: 167 serves nothing from a fresh import", () => {
  const { profile, staging } = stagedProfile();
  assert.equal(staging.ok, true);
  assert.ok(staging.staged_fact_ids.length >= 5);
  assert.equal(P167.trustedFacts(profile).length, 0);
  assert.equal(P122.confirmedFacts(profile).length, 0);
  assert.equal(profile.basics.name, null, "basics are not written before a confirm decision");
});

test("decisions: confirm lands via 122, discard stays quarantined and visible, basics wait for their tap", () => {
  const { profile, review, staging } = stagedProfile();
  const factItems = review.items.filter((x) => x.type === "fact");
  const decisions = {};
  decisions[factItems[0].review_id] = "confirm";
  decisions[factItems[1].review_id] = "confirm";
  decisions[factItems[2].review_id] = "discard";
  decisions["imb_name"] = "confirm";
  decisions["imb_email"] = "discard";
  const receipt = S.applyImportDecisions(profile, review, staging, decisions);
  assert.equal(receipt.confirmed.length, 2);
  assert.equal(receipt.discarded.length, 1);
  assert.deepEqual(receipt.basics_confirmed, ["name"]);
  assert.deepEqual(receipt.basics_discarded, ["email"]);
  assert.equal(profile.basics.name, "Jordan Rivera");
  assert.equal(profile.basics.email, null, "discarded basic never written");
  assert.equal(profile.basics._provenance.name.state, "needs_confirmation", "the label that was shown rides with the value");
  const trusted = P167.trustedFacts(profile);
  assert.equal(trusted.length, 2, "exactly the two confirmed facts are served");
  const editor = S.profileEditor(profile, { user_id: "u-test" });
  assert.equal(editor.counts.confirmed, 2);
  assert.equal(editor.counts.discarded, 1);
  assert.equal(editor.counts.unconfirmed, staging.staged_fact_ids.length - 3);
  const discarded = P122.getFact(profile, receipt.discarded[0]);
  assert.equal(discarded.status, "discarded");
  assert.equal(discarded.quarantined, true, "discard pins the explicit hold flag");
});

test("no decisions -> nothing confirmed, everything still pending", () => {
  const { profile, review, staging } = stagedProfile();
  const receipt = S.applyImportDecisions(profile, review, staging, {});
  assert.equal(receipt.confirmed.length, 0);
  assert.equal(P122.confirmedFacts(profile).length, 0);
  assert.equal(receipt.still_pending.length, review.items.length);
});

test("unknown review ids are named, never applied", () => {
  const { profile, review, staging } = stagedProfile();
  const receipt = S.applyImportDecisions(profile, review, staging, { imp_999: "confirm", imb_nope: "confirm" });
  assert.deepEqual(receipt.unknown.sort(), ["imb_nope", "imp_999"]);
  assert.equal(P122.confirmedFacts(profile).length, 0);
  assert.equal(profile.basics.name, null);
});

test("editor edit flow: the old value is served until the edit is confirmed, then superseded", () => {
  const profile = P122.createProfile({ id: "u-edit", basics: { name: "Jordan Rivera" } });
  const orig = P122.addFact(profile, { kind: "experience", title: "Founder", org: "Studyloop", text: "Founder Studyloop 2024-present", source: "test" });
  P122.confirmFact(profile, orig.id);
  const before = P167.trustedFacts(profile).map((f) => f.text);
  assert.deepEqual(before, ["Founder Studyloop 2024-present"]);
  const prop = S.proposeEdit(profile, orig.id, "Founder Studyloop 2024-present (300+ students)");
  assert.equal(prop.ok, true);
  assert.deepEqual(P167.trustedFacts(profile).map((f) => f.text), before, "unconfirmed edit changes nothing served");
  const editor = S.profileEditor(profile, { user_id: "u-edit" });
  const draftEntry = editor.unconfirmed.find((e) => e.fact_id === prop.draft_id);
  assert.ok(draftEntry, "edit draft appears in the unconfirmed group");
  assert.equal(draftEntry.supersedes, orig.id);
  const done = S.confirmEdit(profile, prop.draft_id);
  assert.equal(done.ok, true);
  assert.deepEqual(P167.trustedFacts(profile).map((f) => f.text), ["Founder Studyloop 2024-present (300+ students)"]);
  const after = S.profileEditor(profile, { user_id: "u-edit" });
  assert.equal(after.counts.superseded, 1);
  assert.equal(after.superseded[0].fact_id, orig.id);
});

test("edit guards: discarded / missing / non-edit drafts are refused by name", () => {
  const { profile, review, staging } = stagedProfile();
  const item = review.items.find((x) => x.type === "fact");
  S.applyImportDecisions(profile, review, staging, { [item.review_id]: "discard" });
  const factId = staging.idByReview[item.review_id];
  assert.equal(S.proposeEdit(profile, factId, "anything").reason, "fact_discarded");
  assert.equal(S.proposeEdit(profile, "F-999", "anything").reason, "fact_not_found");
  const plain = P122.addFact(profile, { kind: "skill", name: "Python", text: "Skill: Python", source: "test" });
  assert.equal(S.confirmEdit(profile, plain.id).reason, "not_an_edit_draft");
  assert.equal(S.proposeEdit(profile, factId, "  ").reason, "fact_discarded");
});

test("documents: resume descriptor is private, sha-bound, parse-back PASS; surface carries no bytes and no URL", () => {
  const { profile, review, staging } = stagedProfile();
  const decisions = {};
  for (const item of review.items) decisions[item.review_id] = "confirm";
  S.applyImportDecisions(profile, review, staging, decisions);
  const issued = S.issueDocuments(profile, { user_id: "u-test" });
  const resume = issued.documents.find((x) => x.kind === "resume");
  assert.ok(resume, "resume issued");
  assert.equal(resume.state, "ready");
  assert.equal(resume.parse_back.status, "PASS");
  assert.equal(resume.sha256, crypto.createHash("sha256").update(resume._bytes).digest("hex"));
  assert.equal(resume.storage.bucket, "careers-resumes");
  assert.equal(resume.storage.visibility, "private");
  assert.ok(resume.storage.path.startsWith("u-test/"));
  assert.ok(resume.storage.alongside.endsWith(".model.json"), "model JSON lands alongside");
  assert.equal(resume.link.style, "signed");
  assert.equal(resume.link.ttl_seconds, 600);
  assert.equal(resume.artifact.table, "channel_artifacts");
  const surface = S.documentsSurface(issued);
  const json = JSON.stringify(surface);
  assert.ok(!json.includes("_bytes") && !json.includes("base64"), "no bytes on the surface");
  assert.ok(!/https?:\/\//.test(json), "no URL of any kind on the surface");
  const rendered = S.renderDocuments(surface);
  assert.ok(rendered.includes("(private link)"));
  assert.equal(issued.slots.cover_letter.state, "needs_posting");
});

test("documents: cover letter needs a posting, then issues audited with dropped sentences counted", () => {
  const { profile, review, staging } = stagedProfile();
  const decisions = {};
  for (const item of review.items) decisions[item.review_id] = "confirm";
  S.applyImportDecisions(profile, review, staging, decisions);
  const posting = {
    title: "Software Engineering Intern", company: "Example Corp",
    description: "We are hiring a software engineering intern to build Python data pipelines and React tools with our team this summer.",
  };
  const issued = S.issueDocuments(profile, { user_id: "u-test", posting });
  const slot = issued.slots.cover_letter;
  assert.ok(["ready", "blocked", "text_only"].includes(slot.state), `letter slot named: ${slot.state}`);
  if (slot.state === "ready") {
    const letter = issued.documents.find((x) => x.kind === "cover_letter");
    assert.equal(letter.sha256, crypto.createHash("sha256").update(letter._bytes).digest("hex"));
    assert.equal(typeof letter.dropped_by_audit, "number");
    assert.equal(letter.storage.bucket, "careers-resumes");
    assert.equal(letter.storage.visibility, "private");
  } else {
    assert.ok(slot.reason, "a non-ready letter names its reason");
  }
});

test("documents: an unconfirmed profile issues no resume from quarantined facts", () => {
  const { profile } = stagedProfile(); // staged, nothing confirmed
  const issued = S.issueDocuments(profile, { user_id: "u-test" });
  const resume = issued.documents.find((x) => x.kind === "resume");
  // 169 reads through the quarantine gate: with zero cleared facts the
  // resume either refuses (no name) or issues nothing fact-bearing.
  if (resume) {
    const text = JSON.stringify(resume._model || {});
    assert.ok(!text.includes("Studyloop"), "quarantined experience never reaches the document model");
  } else {
    assert.equal(issued.slots.resume.state, "blocked");
  }
});

test("connections skeleton: honest empty states, toggle, pass-through only", () => {
  const skel = S.connectionsSkeleton();
  assert.equal(skel.active, "personal");
  assert.equal(skel.personal.empty, true);
  assert.equal(skel.groups.empty, true);
  assert.ok(skel.personal.empty_text.includes("opt in"));
  assert.ok(S.renderConnections(skel).includes("No personal connections yet"));
  const withData = S.connectionsSkeleton({ active: "groups", groups: [{ name: "Austin Builders", members: 12 }], personal: [{ name: "Sam Example" }] });
  assert.equal(withData.active, "groups");
  assert.equal(withData.groups.count, 1);
  assert.deepEqual(withData.groups.entries[0], { name: "Austin Builders", members: 12 }, "entries pass through untouched");
  assert.equal(withData.personal.count, 1);
  assert.ok(S.renderConnections(withData).includes("Austin Builders"));
});
