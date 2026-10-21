/* TEST fixtures only — synthetic TEST persona, never real user data. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Parser = require("../packages/domain/170-career-facts-parser.js");

const DUMP_LINES = [
  "TEST Alex Example",
  "alex@example.com, (555) 010-2233, Springfield IL, linkedin.com/in/test-alex-example",
  "State University, Computer Science bachelors 2024-2028, GPA 3.5/4.0, CS GPA 3.8",
  "Intern TEST Systems Inc 2026 (built dashboards, Python automation)",
  "Founder TEST Club Tools 2025-present (12 members, $2,000 in 3 weeks raised)",
  "Skills: Python, SQL; React, Excel",
  "Certs: TEST Prep modeling, Forage sims (Acme, Globex)",
  "Work authorized: YES",
].join("\n");

test("line-shaped dump parses into the bank's shapes", () => {
  const out = Parser.parseTextedFacts(DUMP_LINES);
  assert.equal(out.basics.name, "TEST Alex Example");
  assert.equal(out.basics.email, "alex@example.com");
  assert.equal(out.basics.phone, "(555) 010-2233");
  assert.equal(out.basics.location, "Springfield IL");
  assert.equal(out.basics.links.linkedin, "linkedin.com/in/test-alex-example");
  const edu = out.facts.find((f) => f.kind === "education");
  assert.equal(edu.org, "State University");
  assert.equal(edu.title, "Computer Science bachelors");
  assert.equal(edu.start, "2024");
  assert.equal(edu.end, "2028");
  const exps = out.facts.filter((f) => f.kind === "experience");
  assert.equal(exps.length, 2);
  assert.equal(exps[0].org, "TEST Systems Inc");
  assert.equal(exps[0].title, "Intern");
  assert.equal(exps[0].start, "2026");
  assert.deepEqual(exps[0].bullets, ["built dashboards", "Python automation"]);
  assert.deepEqual(exps[0].skills, ["Python"]);
  assert.equal(exps[1].org, "TEST Club Tools");
  assert.equal(exps[1].end, "present");
  const skills = out.facts.filter((f) => f.kind === "skill").map((f) => f.name).sort();
  assert.deepEqual(skills, ["Excel", "Python", "React", "SQL"]);
  const certs = out.facts.filter((f) => f.kind === "certification");
  assert.equal(certs[0].org, "TEST Prep");
  assert.deepEqual(certs[1].bullets, ["Acme", "Globex"]);
  const wa = out.facts.find((f) => f.kind === "eligibility");
  assert.equal(wa.name, "Work authorization");
  assert.equal(wa.value, "Yes");
  assert.equal(out.unparsed.length, 0);
  assert.equal(out.meta.unparsedSegments, 0);
});

test("two GPAs stay two distinct facts; the education span is one fact", () => {
  const out = Parser.parseTextedFacts(DUMP_LINES);
  const gpa = out.facts.find((f) => f.kind === "profile" && f.name === "GPA");
  const cs = out.facts.find((f) => f.kind === "profile" && f.name === "CS GPA");
  assert.equal(gpa.value, "3.5");
  assert.equal(gpa.scale, "4.0");
  assert.equal(cs.value, "3.8");
  assert.equal(out.facts.filter((f) => f.kind === "education").length, 1);
  assert.equal(out.profileFields.gpa, "3.5");
});

test("a revenue metric in bullets is never a salary or comp value", () => {
  const out = Parser.parseTextedFacts(DUMP_LINES);
  const founder = out.facts.find((f) => f.kind === "experience" && f.org === "TEST Club Tools");
  assert.ok(founder.bullets.includes("$2,000 in 3 weeks raised"));
  assert.ok(!out.facts.some((f) => /2000/.test(String(f.value || ""))));
  assert.equal(out.profileFields.compFloor, undefined);
});

test("abbreviated dump: B.S. degree, org-first role, TS/JS aliases", () => {
  const dump = [
    "Data Intern at TEST Analytics 2025-2026 (SQL reports, Excel models).",
    "B.S. Computer Science, TEST University 2023-2027, GPA 3.7.",
    "Skills: TS/JS, SQL",
  ].join("\n");
  const out = Parser.parseTextedFacts(dump);
  const exp = out.facts.find((f) => f.kind === "experience");
  assert.equal(exp.title, "Data Intern");
  assert.equal(exp.org, "TEST Analytics");
  assert.equal(exp.start, "2025");
  assert.equal(exp.end, "2026");
  assert.deepEqual(exp.skills.slice().sort(), ["Excel", "SQL"]);
  const edu = out.facts.find((f) => f.kind === "education");
  assert.equal(edu.org, "TEST University");
  assert.equal(edu.title, "B.S. Computer Science");
  assert.equal(edu.start, "2023");
  assert.equal(edu.end, "2027");
  const skills = out.facts.filter((f) => f.kind === "skill");
  assert.deepEqual(skills.map((f) => f.name).sort(), ["JavaScript", "SQL", "TypeScript"]);
  assert.equal(skills.find((f) => f.name === "TypeScript").asStated, "TS");
});

test("org-first experience with trailing acronym role (Org Global AI M&A Intern shape)", () => {
  const out = Parser.parseTextedFacts("TEST Global AI M&A Intern 2024-2025 (built evals). Sporv-like TEST Labs founder 2024- (did things).");
  const exps = out.facts.filter((f) => f.kind === "experience");
  assert.equal(exps[0].org, "TEST Global");
  assert.equal(exps[0].title, "AI M&A Intern");
  assert.equal(exps[1].org, "Sporv-like TEST Labs");
  assert.equal(exps[1].title, "Founder");
  assert.equal(exps[1].end, null);
  assert.equal(exps[1].current, true);
});

test("unstructured text and placeholders land in unparsed verbatim — never dropped, never manufactured", () => {
  const dump = "Volunteered at the food bank on weekends.\nGrad month: [TBD]\nMy favorite color is blue.";
  const out = Parser.parseTextedFacts(dump);
  assert.equal(out.facts.length, 0);
  assert.deepEqual(out.unparsed.map((u) => u.text), [
    "Volunteered at the food bank on weekends.",
    "Grad month: [TBD]",
    "My favorite color is blue.",
  ]);
  assert.ok(out.unparsed.every((u) => typeof u.reason === "string" && u.reason.length > 0));
  assert.ok(!JSON.stringify(out.facts).includes("TBD"));
});

test("no graduation month is ever manufactured from a year", () => {
  const out = Parser.parseTextedFacts(DUMP_LINES);
  const edu = out.facts.find((f) => f.kind === "education");
  assert.equal(edu.end, "2028");
  assert.ok(!("month" in edu) && !("gradMonth" in edu) && !("graduationMonth" in edu));
  assert.ok(!/january|february|march|april|may|june|july|august|september|october|november|december/i.test(JSON.stringify(out.facts)));
});

test("every record's span is a verbatim slice of the input at its offsets", () => {
  const out = Parser.parseTextedFacts(DUMP_LINES);
  for (const f of out.facts) assert.equal(DUMP_LINES.slice(f.provenance.start, f.provenance.end), f.provenance.span);
  for (const k of Object.keys(out.basicsProvenance)) {
    const p = out.basicsProvenance[k];
    assert.equal(DUMP_LINES.slice(p.start, p.end), p.span);
  }
  const noisy = Parser.parseTextedFacts("Random noise sentence here.");
  assert.equal(noisy.unparsed.length, 1);
  assert.equal("Random noise sentence here.".slice(noisy.unparsed[0].start, noisy.unparsed[0].end), noisy.unparsed[0].span);
});

test("parsed records are drafts: provenance-stamped, never pre-confirmed", () => {
  const out = Parser.parseTextedFacts(DUMP_LINES);
  assert.ok(out.facts.length > 0);
  for (const f of out.facts) {
    assert.equal(f.source, "texted-facts");
    assert.equal(f.needs_confirmation, true);
    assert.equal(f.status, "draft");
    assert.equal(f.provenance.source, "texted-facts");
  }
});

test("deterministic: the same text parses to the identical output twice", () => {
  assert.deepEqual(Parser.parseTextedFacts(DUMP_LINES), Parser.parseTextedFacts(DUMP_LINES));
});

test("the parse path makes no model or network calls (static source check)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "packages", "domain", "170-career-facts-parser.js"), "utf8");
  for (const banned of ["fetch(", "XMLHttpRequest", "http.request", "https.request", "api.openai", "model_gateway", "require("]) {
    assert.ok(!src.includes(banned), `parse path must not contain ${banned}`);
  }
});

test("empty and whitespace input parse to empty output, nothing invented", () => {
  for (const input of ["", "   \n  ", null, undefined]) {
    const out = Parser.parseTextedFacts(input);
    assert.equal(out.facts.length, 0);
    assert.equal(out.unparsed.length, 0);
    assert.equal(out.basics.name, null);
  }
});
