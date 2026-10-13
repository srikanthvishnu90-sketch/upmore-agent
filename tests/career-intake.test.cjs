// Intake lane (wedge build, 2026-10-13): one intake engine for candidate
// names — pasted names (lines or CSV), the user's LinkedIn export (via 122),
// and a forwarded email. Pipeline: parse -> dedupe (name+firm+office) ->
// employment-currency check -> honest running counts
// (received -> deduped -> current -> ready). Fail-first: written before
// packages/domain/146-career-intake.js existed.
// Check: node --test tests/career-intake.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Intake = require(path.join(root, "packages/domain/146-career-intake.js"));

test("intake: pasted lines — CSV-ish, em-dash, and bare-name shapes all parse; bare name is flagged needs_firm and not ready", () => {
  const r = Intake.intake({ pastedText: "Jane Doe, Evercore, Analyst, New York\nJohn Roe — Lazard\nPlain Person" });
  assert.equal(r.counts.received, 3);
  assert.equal(r.counts.deduped, 3);
  const jane = r.records.find((x) => x.full_name === "Jane Doe");
  assert.equal(jane.current_firm, "Evercore"); assert.equal(jane.title, "Analyst"); assert.equal(jane.office, "New York");
  assert.deepEqual(jane.sources, ["pasted"]);
  const plain = r.records.find((x) => x.full_name === "Plain Person");
  assert.ok(plain.flags.includes("needs_firm"));
  assert.equal(r.counts.current, 3);
  assert.equal(r.counts.ready, 2);
});

test("intake: pasted CSV with a header row maps columns by name", () => {
  const r = Intake.intake({ pastedText: "Name,Firm,Title,Office\nAmy Poe,KKR,Associate,Chicago\nBen Sol,KKR,Analyst,Chicago" });
  assert.equal(r.counts.received, 2);
  assert.equal(r.records[0].full_name, "Amy Poe");
  assert.equal(r.records[0].current_firm, "KKR");
  assert.equal(r.records[0].office, "Chicago");
  assert.equal(r.counts.ready, 2);
});

test("intake: malformed CSV — the broken row is reported with its line and the good rows still parse", () => {
  const csv = "Name,Firm,Title\nAmy Poe,KKR,Associate\n\"Ben Sol,KKR,Analyst\nCat Dee,Lazard,Analyst";
  const r = Intake.intake({ pastedText: csv });
  assert.equal(r.counts.received, 3);
  assert.ok(r.errors.length >= 1, "the malformed row must surface in errors");
  assert.ok(r.errors.some((e) => /line/i.test(e.where || e.message || "")));
  assert.equal(r.counts.deduped, 2);
  assert.ok(r.records.some((x) => x.full_name === "Amy Poe"));
  assert.ok(r.records.some((x) => x.full_name === "Cat Dee"));
});

test("intake: LinkedIn export leg — connections parse via 122 with email + source carried", () => {
  const csv = "First Name,Last Name,Email Address,Company,Position,Connected On\nJane,Doe,jane.doe@example.com,Evercore,Analyst,2025-09-01";
  const r = Intake.intake({ linkedinConnectionsCsv: csv });
  assert.equal(r.counts.received, 1);
  const jane = r.records[0];
  assert.equal(jane.full_name, "Jane Doe");
  assert.equal(jane.email, "jane.doe@example.com");
  assert.ok(jane.sources.includes("linkedin-export"));
  assert.equal(r.counts.ready, 1);
});

test("intake: forwarded email — signature block yields the person; a person-less email yields an honest zero", () => {
  const email = "Hi Vishnu — great meeting you at the panel.\n\nBest regards,\nJane Doe\nAnalyst | Evercore\nNew York";
  const r = Intake.intake({ forwardedEmail: email });
  assert.equal(r.counts.received, 1);
  assert.equal(r.records[0].full_name, "Jane Doe");
  assert.equal(r.records[0].current_firm, "Evercore");
  assert.ok(r.records[0].sources.includes("forwarded-email"));
  const none = Intake.intake({ forwardedEmail: "Your weekly digest: markets rose, deals closed, see inside for more." });
  assert.equal(none.counts.received, 0);
  assert.equal(none.errors.length, 0);
  assert.equal(none.counts.ready, 0);
});

test("intake: duplicates across sources merge into one record keeping both sources and the email", () => {
  const csv = "First Name,Last Name,Email Address,Company,Position,Connected On\nJane,Doe,jane.doe@example.com,Evercore,Analyst,2025-09-01";
  const r = Intake.intake({ pastedText: "Jane Doe, Evercore, Analyst", linkedinConnectionsCsv: csv });
  assert.equal(r.counts.received, 2);
  assert.equal(r.counts.deduped, 1);
  assert.equal(r.counts.duplicates_removed, 1);
  assert.equal(r.records[0].email, "jane.doe@example.com");
  assert.ok(r.records[0].sources.includes("pasted") && r.records[0].sources.includes("linkedin-export"));
});

test("intake: office is part of the dedupe key — same name+firm in two offices stays two records", () => {
  const r = Intake.intake({ pastedText: "Jane Doe, Evercore, Analyst, New York\nJane Doe, Evercore, Analyst, Chicago" });
  assert.equal(r.counts.deduped, 2);
});

test("intake: a person known to have departed is flagged at intake and leaves the current/ready counts", () => {
  const r = Intake.intake(
    { pastedText: "Jordan Park, Acme Robotics (TEST), Engineer\nJane Doe, Evercore, Analyst" },
    { knownDepartures: [{ full_name: "Jordan Park", current_firm: "Acme Robotics (TEST)", note: "Left Acme Robotics (TEST) June 2025" }] });
  const jordan = r.records.find((x) => x.full_name === "Jordan Park");
  assert.ok(jordan.flags.includes("departed"));
  assert.ok(r.flagged.some((f) => f.full_name === "Jordan Park"));
  assert.equal(r.counts.deduped, 2);
  assert.equal(r.counts.current, 1);
  assert.equal(r.counts.ready, 1);
});

test("intake: self-reported departure in a forwarded email flags the signer against their signature firm", () => {
  const email = "Hi — circling back. I left Evercore in June, so I may not be the right person there anymore.\n\nBest,\nSam Ortiz\nAnalyst, Evercore";
  const r = Intake.intake({ forwardedEmail: email });
  assert.equal(r.counts.received, 1);
  assert.ok(r.records[0].flags.includes("departed"));
  assert.equal(r.counts.current, 0);
});

test("intake: counts reconcile across a combined input (received = deduped + duplicates_removed; current = deduped - departed)", () => {
  const csv = "First Name,Last Name,Email Address,Company,Position,Connected On\nJane,Doe,,Evercore,Analyst,2025-09-01";
  const r = Intake.intake(
    { pastedText: "Jane Doe, Evercore, Analyst\nJordan Park, Acme Robotics (TEST), Engineer\nNew Person, Lazard",
      linkedinConnectionsCsv: csv },
    { knownDepartures: [{ full_name: "Jordan Park", current_firm: "Acme Robotics (TEST)", note: "Left June 2025" }] });
  assert.equal(r.counts.received, r.counts.deduped + r.counts.duplicates_removed);
  assert.equal(r.counts.current, r.counts.deduped - r.flagged.length);
  assert.ok(r.counts.ready <= r.counts.current);
  assert.equal(r.counts.received, 4);
  assert.equal(r.counts.deduped, 3);
});
