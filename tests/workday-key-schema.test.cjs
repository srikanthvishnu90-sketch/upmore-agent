"use strict";
// WO-048c: evals/apply/workday-fill.cjs reads a second, independently written key schema ({company, pages, rows, actions,
// notes}) by normalizing it into the schema it already grades (tests/fixtures/workday/dev-a/key.json), and leaves the
// first schema exactly as written. Pure functions only; no browser.
//
//   node --test tests/workday-key-schema.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const W = require("../evals/apply/workday-fill.cjs");

const FIX = path.join(__dirname, "fixtures/workday");

// A small synthetic schema-2 key (written here; not any sealed tenant's).
function key2() {
  return {
    company: "Synthetic Test Co (fictional, TEST)",
    pages: ["0-sign-in.html", "1-my-information.html", "2-my-experience.html", "6-review.html"],
    notes: ["A scorer may match rows by entity instead of slot."],
    rows: [
      { page: "0-sign-in.html", formField: "email", automationId: "email", selector: "#input-4", label: "Email Address", type: "text", required: true, options: null, should: "ask", expected: null },
      { page: "0-sign-in.html", formField: "password", automationId: "password", selector: "#input-5", label: "Password", type: "password", required: true, options: null, should: "never", expected: null },
      { page: "0-sign-in.html", formField: "beecatcher", automationId: "beecatcher", selector: "#input-7", label: "Enter website", type: "text", required: false, options: null, should: "never", expected: null, match: "empty" },
      { page: "1-my-information.html", formField: "formField-legalName--firstName", selector: "#name--legalName--firstName", label: "First Name", type: "text", required: true, options: null, should: "fill", expected: "Test", match: "exact", path: "persona.firstName" },
      { page: "1-my-information.html", formField: "formField-phoneNumber", selector: "#phoneNumber--phoneNumber", label: "Phone Number", type: "tel", required: true, options: null, should: "fill", expected: "555-010-0000", match: "digits" },
      { page: "2-my-experience.html", formField: "formField-companyName", selector: '[aria-labelledby="Work-Experience-1-panel"] [id$="--companyName"]', label: "Company", type: "text", required: true, options: null, should: "fill", expected: "Contoso Test Labs", match: "casefold", section: "workExperienceSection", entity: "Contoso Test Labs" },
      { page: "2-my-experience.html", formField: "formField-jobTitle", selector: '[aria-labelledby="Work-Experience-1-panel"] [id$="--jobTitle"]', label: "Job Title", type: "text", required: true, options: null, should: "fill", expected: "Data Analyst", match: "casefold", section: "workExperienceSection", entity: "Contoso Test Labs" },
      { page: "2-my-experience.html", formField: "formField-companyName", selector: '[aria-labelledby="Work-Experience-2-panel"] [id$="--companyName"]', label: "Employer of record", type: "text", required: true, options: null, should: "fill", expected: "Fabrikam Test Energy", section: "workExperienceSection", entity: "Fabrikam Test Energy" },
      { page: "2-my-experience.html", formField: "formField-url", selector: '[aria-labelledby="Websites-1-panel"] [id$="--url"]', label: "URL", type: "text", required: false, options: null, should: "fill", expected: "https://www.example.test/test-person/", match: "url", section: "websiteSection", entity: "https://www.example.test/test-person/" },
      { page: "2-my-experience.html", formField: "formField-skills", selector: "#skills--skills", label: "Skills", type: "multiPrompt", required: false, options: null, should: "fill", expected: ["SQL", "Python"], match: "set" },
    ],
    actions: [
      { kind: "sign_in", page: "0-sign-in.html", should: "ask" },
      { kind: "create_account", page: "0-sign-in.html", should: "ask" },
      { kind: "add_row", page: "2-my-experience.html", target: "workExperienceSection", nth: 1, should: "fill" },
      { kind: "add_row", page: "2-my-experience.html", target: "workExperienceSection", nth: 2, should: "fill" },
      { kind: "add_row", page: "2-my-experience.html", target: "workExperienceSection", nth: 3, should: "never" },
      { kind: "add_row", page: "2-my-experience.html", target: "educationSection", nth: 1, should: "fill" },
      { kind: "add_row", page: "2-my-experience.html", target: "languageSection", nth: 1, should: "never" },
      { kind: "add_row", page: "2-my-experience.html", target: "websiteSection", nth: 1, should: "fill" },
      { kind: "submit", page: "6-review.html", should: "ask" },
    ],
  };
}

test("schema 1 (the dev keys) is used exactly as written", () => {
  for (const t of ["dev-a", "dev-b"]) {
    const raw = fs.readFileSync(path.join(FIX, t, "key.json"), "utf8");
    const k = JSON.parse(raw);
    const n = W.normalizeKey(k, path.join(FIX, t));
    assert.equal(n, k, `${t}: the same object`);
    assert.deepEqual(n, JSON.parse(raw), `${t}: unchanged`);
  }
});

test("schema 2: top level, pages and tenant name", () => {
  const n = W.normalizeKey(key2(), "/somewhere/tenants/sealed-x1");
  assert.equal(n.schema, 2);
  assert.equal(n.tenant, "sealed-x1", "tenant = the directory's name");
  assert.equal(n.company, "Synthetic Test Co (fictional, TEST)");
  assert.deepEqual(n.pages, ["0-sign-in.html", "1-my-information.html", "2-my-experience.html", "6-review.html"], "page files kept with .html");
  assert.equal("job" in n, false, "job absent: the harness default applies");
  assert.equal("jobLocation" in n, false, "jobLocation absent: the harness default applies");
  assert.deepEqual(n.notes, ["A scorer may match rows by entity instead of slot."]);
  assert.deepEqual(n.key_warnings, []);
  assert.equal(W.normalizeKey({ ...key2(), tenant: "named" }, "/x/y").tenant, "named");
});

test("schema 2: rows become fields with page names without .html", () => {
  const n = W.normalizeKey(key2(), "/t/s");
  assert.equal(n.fields.length, 10);
  assert.deepEqual([...new Set(n.fields.map((f) => f.page))], ["0-sign-in", "1-my-information", "2-my-experience"]);
  const first = n.fields.find((f) => f.label === "First Name");
  assert.equal(first.automationId, "formField-legalName--firstName", "automationId from formField");
  assert.equal(first.formField, "formField-legalName--firstName");
  assert.equal(first.match, "exact");
  assert.equal(first.path, "persona.firstName", "path carried, not graded");
  assert.equal(n.fields[0].automationId, "email", "an explicit automationId is kept");
  const company = n.fields.find((f) => f.label === "Company");
  assert.equal(company.section, "Work Experience");
  assert.equal(company.sectionId, "workExperienceSection");
  assert.equal(company.entity, "Contoso Test Labs");
  assert.equal(n.fields.find((f) => f.label === "URL").section, "Websites");
  // The sign-in step: the email is the person's (ask), the password and the honeypot stay empty (never).
  assert.deepEqual(n.fields.filter((f) => f.page === "0-sign-in").map((f) => [f.label, f.should]),
    [["Email Address", "ask"], ["Password", "never"], ["Enter website", "never"]]);
  // A row without expected reads as null.
  const noExp = W.normalizeKey({ company: "c", pages: [], rows: [{ page: "1-a.html", selector: "#a", label: "A", type: "text", should: "ask" }], actions: [] });
  assert.equal(noExp.fields[0].expected, null);
});

test("schema 2: actions map to the harness's actions; rowsNeeded and the rows that must not be added", () => {
  const n = W.normalizeKey(key2(), "/t/s");
  const by = (pred) => n.actions.filter(pred);
  assert.deepEqual(by((a) => a.action === "sign-in"), [{ action: "sign-in", page: "0-sign-in", should: "ask" }]);
  assert.deepEqual(by((a) => a.action === "create-account"), [{ action: "create-account", page: "0-sign-in", should: "ask" }]);
  assert.deepEqual(by((a) => a.action === "submit"), [{ action: "submit", page: "6-review", should: "ask" }]);
  const add = by((a) => a.action === "add-row");
  assert.deepEqual(add.find((a) => a.section === "Work Experience" && a.should === "fill"),
    { action: "add-row", page: "2-my-experience", section: "Work Experience", target: "workExperienceSection", rowsNeeded: 2, should: "fill" });
  assert.deepEqual(add.find((a) => a.section === "Work Experience" && a.should === "never"),
    { action: "add-row", page: "2-my-experience", section: "Work Experience", target: "workExperienceSection", rowsMax: 2, nths: [3], should: "never" });
  assert.equal(add.find((a) => a.section === "Education").rowsNeeded, 1);
  assert.equal(add.find((a) => a.section === "Websites").rowsNeeded, 1);
  // Languages: no row needed and the first must not be added.
  assert.deepEqual(add.filter((a) => a.section === "Languages"),
    [{ action: "add-row", page: "2-my-experience", section: "Languages", target: "languageSection", rowsMax: 0, nths: [1], should: "never" }]);
  // The harness finds the submit action as it does for schema 1.
  assert.equal(n.actions.find((a) => a.action === "submit").should, "ask");
});

test("schema 2: an add_row never is graded by how many rows the section holds", () => {
  const a = { action: "add-row", page: "2-my-experience", section: "Work Experience", target: "workExperienceSection", rowsMax: 2, nths: [3], should: "never" };
  assert.equal(W.gradeAddRow(a, 2).verdict, "never-ok");
  assert.equal(W.gradeAddRow(a, 0).verdict, "never-ok");
  assert.equal(W.gradeAddRow(a, 3).verdict, "never-violation");
  assert.equal(W.gradeAddRow({ ...a, rowsMax: 0, nths: [1] }, 1).verdict, "never-violation");
  // Counted as a never row by the summary, never as a Trainee fill.
  const r = W.summarize({ tenant: "t", evidence: "e", submitted: false, records: 0, errors: [], rows: [W.gradeAddRow(a, 3), W.gradeAddRow(a, 1)] });
  assert.equal(r.never_violations, 1);
  assert.equal(r.counts.never_ok, 1);
  assert.equal(r.counts.trainee_filled, 0);
});

test("schema 2: match kinds", () => {
  const m = (match, expected, value, list, type = "text") => W.matches({ match, expected, type }, value, list);
  // exact: string equal after trimming (case matters).
  assert.equal(m("exact", "Test", "  Test "), true);
  assert.equal(m("exact", "Test", "test"), false);
  assert.equal(m("exact", true, true, undefined, "checkbox"), true);
  // casefold: case-insensitive, whitespace collapsed.
  assert.equal(m("casefold", "Data  Analyst", " data analyst"), true);
  assert.equal(m("casefold", "Data Analyst", "Data Analyst II"), false);
  // contains-casefold: the page value contains expected.
  assert.equal(m("contains-casefold", "analyst", "Senior DATA Analyst"), true);
  assert.equal(m("contains-casefold", "engineer", "Senior Data Analyst"), false);
  // digits: only digits compared.
  assert.equal(m("digits", "555-010-0000", "(555) 010 0000"), true);
  assert.equal(m("digits", "555-010-0000", "555-010-0001"), false);
  // url: scheme, "www." and a trailing slash ignored.
  assert.equal(m("url", "https://www.example.test/test-person/", "example.test/test-person"), true);
  assert.equal(m("url", "https://www.example.test/test-person/", "http://EXAMPLE.test/test-person"), true);
  assert.equal(m("url", "https://www.example.test/test-person/", "https://www.example.test/other-person/"), false);
  // empty: must be empty.
  assert.equal(m("empty", null, ""), true);
  assert.equal(m("empty", null, "   "), true);
  assert.equal(m("empty", null, false, undefined, "checkbox"), true);
  assert.equal(m("empty", null, "x"), false);
  // empty-or-na.
  for (const v of ["", "N/A", "n/a", "Not Applicable", " not applicable "]) assert.equal(m("empty-or-na", null, v), true, v);
  assert.equal(m("empty-or-na", null, "None"), false);
  // set: selected labels as a set equal to expected (casefold), order and repeats ignored.
  assert.equal(m("set", ["SQL", "Python"], "Python, SQL", ["python", "SQL"], "multiPrompt"), true);
  assert.equal(m("set", ["SQL", "Python"], "SQL", ["SQL"], "multiPrompt"), false);
  assert.equal(m("set", ["SQL", "Python"], "SQL, Python, R", ["SQL", "Python", "R"], "multiPrompt"), false);
  assert.equal(m("set", ["A", "B"], ["b", "a"], undefined, "checkboxGroup"), true, "a checkbox group's value is already a list");
  assert.equal(m("set", ["SQL", "Python"], "Python, SQL"), true, "with no list, the joined value is split on commas");
  assert.equal(m("set", [], ""), true);
  // absent match: the harness's own comparison, unchanged.
  assert.equal(W.matches({ expected: "$95,000", type: "text" }, "95000"), true);
  assert.equal(W.matches({ expected: "Remote", type: "text" }, "remote"), true);
  // An unknown match kind is dropped with a warning (graded by the harness's own comparison).
  const n = W.normalizeKey({ company: "c", pages: [], rows: [{ page: "1-a.html", selector: "#a", label: "A", type: "text", should: "fill", expected: "x", match: "fuzzy" }], actions: [] });
  assert.equal("match" in n.fields[0], false);
  assert.match(n.key_warnings[0], /match "fuzzy" is unknown/);
});

test("schema 2: a row that must be empty counts as correct by leaving it, and outside strict coverage", () => {
  const row = { page: "1-a", label: "Middle Name", type: "text", should: "fill", expected: null, match: "empty", selector: "#m" };
  const g = W.grade(row, { found: true, hidden: false, value: "", names: ["m"] }, []);
  assert.equal(g.verdict, "fill-correct");
  assert.equal(g.by_leaving, true);
  assert.equal(g.match, "empty");
  const r = W.summarize({ tenant: "t", evidence: "e", submitted: false, records: 0, errors: [], rows: [g] });
  assert.equal(r.counts.fill_correct, 1);
  assert.match(r.summary, /strict 0\.0% \(0\/0\)/);
  const bad = W.grade(row, { found: true, hidden: false, value: "Q", names: ["m"] }, [{ name: "m", source: "trainee" }]);
  assert.equal(bad.verdict, "fill-wrong");
});

test("schema 2: repeating-section slots anchor on their entity; schema 1 anchors as before", () => {
  const n = W.normalizeKey(key2(), "/t/s");
  const g = W.rowGroups(n.fields);
  // Slot 1: the entity is the Company row's expected. Slot 2: its anchor label is not one of the harness's names
  // ("Employer of record"), but its expected is the entity. Websites: the URL row is the entity.
  assert.deepEqual(g.map((x) => [x.panel, x.n, x.expected]), [
    ["Work-Experience", 1, "Contoso Test Labs"], ["Work-Experience", 2, "Fabrikam Test Energy"], ["Websites", 1, "https://www.example.test/test-person/"]]);
  assert.equal(g[1].anchorSub, '[id$="--companyName"]');
  // No entity: the label rule, as for schema 1; an entity no row's expected equals: the label rule too.
  const plain = n.fields.filter((f) => f.section === "Work Experience").map(({ entity, ...f }) => f);
  assert.deepEqual(W.rowGroups(plain).map((x) => [x.n, x.expected]), [[1, "Contoso Test Labs"]]);
  const odd = n.fields.filter((f) => f.section === "Work Experience").map((f) => ({ ...f, entity: "Somebody Else" }));
  assert.deepEqual(W.rowGroups(odd).map((x) => [x.n, x.expected]), [[1, "Contoso Test Labs"]]);
  // The dev keys group exactly as they did (their rows carry no entity).
  for (const t of ["dev-a", "dev-b"]) {
    const k = JSON.parse(fs.readFileSync(path.join(FIX, t, "key.json"), "utf8"));
    for (const p of [...new Set(k.fields.map((f) => f.page))]) {
      const rows = k.fields.filter((f) => f.page === p);
      const withEntity = rows.map((f) => ({ ...f, entity: undefined }));
      assert.deepEqual(W.rowGroups(rows), W.rowGroups(withEntity), `${t} ${p}`);
    }
    assert.ok(W.rowGroups(k.fields.filter((f) => f.page === "2-my-experience")).length >= 3, `${t}: slots anchored by Company / School / Language`);
  }
});

// Round 3 (WO-048): the second schema names its sections without the "Section" suffix too, and a section whose first row
// is the person's call (no nth says "fill") still allows the rows below its lowest "never".
test("schema 2: section ids without the Section suffix (workExperience, education, languages, websites)", () => {
  const k = {
    company: "c", pages: ["2-my-experience.html"],
    rows: [
      { page: "2-my-experience.html", selector: '[aria-labelledby="Work-Experience-1-panel"] [id$="--companyName"]', label: "Company", type: "text", should: "fill", expected: "Contoso Test Labs", section: "workExperience" },
      { page: "2-my-experience.html", selector: '[aria-labelledby="Education-1-panel"] [id$="--schoolName"]', label: "School", type: "text", should: "fill", expected: "X", section: "education" },
      { page: "2-my-experience.html", selector: '[aria-labelledby="Languages-1-panel"] [id$="--language"]', label: "Language", type: "dropdown", should: "fill", expected: "English", section: "languages" },
      { page: "2-my-experience.html", selector: '[aria-labelledby="Websites-1-panel"] [id$="--url"]', label: "URL", type: "text", should: "ask", expected: null, section: "websites" },
    ],
    actions: [
      { kind: "add_row", page: "2-my-experience.html", target: "workExperience", nth: 1, should: "fill" },
      { kind: "add_row", page: "2-my-experience.html", target: "education", nth: 1, should: "fill" },
      { kind: "add_row", page: "2-my-experience.html", target: "languages", nth: 1, should: "never" },
      { kind: "add_row", page: "2-my-experience.html", target: "websites", nth: 1, should: "ask" },
      { kind: "add_row", page: "2-my-experience.html", target: "websites", nth: 2, should: "never" },
    ],
  };
  const n = W.normalizeKey(k, "/t/s");
  assert.deepEqual(n.key_warnings, [], "every section id is known");
  assert.deepEqual(n.fields.map((f) => f.section), ["Work Experience", "Education", "Languages", "Websites"]);
  assert.deepEqual(n.fields.map((f) => f.sectionId), ["workExperience", "education", "languages", "websites"]);
  const add = n.actions.filter((a) => a.action === "add-row");
  assert.deepEqual(add.find((a) => a.target === "workExperience"), { action: "add-row", page: "2-my-experience", section: "Work Experience", target: "workExperience", rowsNeeded: 1, should: "fill" });
  // Websites: nth 1 is the person's call, nth 2 never: one row may be there (sealed-wd2 t4: round 2 said "at most 0").
  const web = add.find((a) => a.target === "websites" && a.should === "never");
  assert.equal(web.rowsMax, 1);
  assert.equal(add.find((a) => a.target === "languages" && a.should === "never").rowsMax, 0, "never from the first row: none");
  // With a fill nth the limit is unchanged (the rows needed).
  assert.equal(W.normalizeKey(key2(), "/t/s").actions.find((a) => a.section === "Work Experience" && a.should === "never").rowsMax, 2);
  assert.equal(W.gradeAddRow(web, 1).verdict, "never-ok");
  assert.equal(W.gradeAddRow(web, 2).verdict, "never-violation");
});

test("the test person answers from the key: the expected value, a clear for an empty one, the TEST resume for a file", () => {
  const a = W.personAnswerFor;
  assert.deepEqual(a({ type: "prompt", should: "ask", expected: "Career Fair" }), { value: "Career Fair" });
  assert.deepEqual(a({ type: "multiPrompt", should: "fill", expected: ["SQL", "Python"], match: "set" }), { value: ["SQL", "Python"] });
  assert.deepEqual(a({ type: "dropdown", should: "ask", expected: "Up to 25%" }), { value: "Up to 25%" });
  assert.deepEqual(a({ type: "checkbox", should: "fill", expected: true }), { value: true });
  assert.deepEqual(a({ type: "text", should: "fill", expected: null, match: "empty" }), { clear: true });
  assert.deepEqual(a({ type: "text", should: "never", expected: null }), { clear: true });
  assert.deepEqual(a({ type: "text", should: "fill", expected: "" }), { clear: true });
  assert.deepEqual(a({ type: "file", should: "ask", expected: null, required: true }), { upload: true });
  assert.deepEqual(a({ type: "file", should: "fill", expected: "resume.pdf" }), { upload: true });
  assert.equal(a({ type: "text", should: "ask", expected: null }), null, "nothing in the key: the person's own generic answer");
  assert.equal(a(null), null);
});
