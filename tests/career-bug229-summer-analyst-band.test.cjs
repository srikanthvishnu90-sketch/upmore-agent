"use strict";
// BUG-229 / FR-387 (MI-094, Crew A, 2026-10-15): 121's seniorityBand did not
// know the seasonal-analyst internship convention. The standard IB internship
// title "Summer Analyst" (witness: Lane A seed LA-0043, Meridian Bank) carries
// no intern/internship/co-op token, so it fell through to the "mid" default
// and intern-band watch profiles silently mismatched it. The convention class
// is the season + analyst-track noun (Summer Analyst, Summer Associate,
// Summer Business Analyst, and the winter forms) — NOT any seasonal title:
// the corpus's seasonal titles without the noun are genuine seasonal jobs
// (customer service, housekeeping) and must stay exactly where they banded.
// A title that also names a management role ("Summer Analyst Program
// Manager") is the manager's posting, not the intern's, and stays manager.
const test = require("node:test");
const assert = require("node:assert/strict");
const Jobs = require("../packages/domain/121-career-jobs.js");

const band = (title, jd = "") => Jobs.seniorityBand(title, jd);
const LA0043_JD = "Our investment banking division hosts this summer analyst program. Work on live transactions and financial models.";

test("BUG-229: the LA-0043 witness — 'Summer Analyst' bands intern", () => {
  assert.equal(band("Summer Analyst", LA0043_JD), "intern");
});

test("BUG-229: the seasonal-analyst title family bands intern", () => {
  for (const t of [
    "Summer Associate",
    "Summer Business Analyst",
    "Winter Analyst",
    "Winter Associate",
    "Investment Banking Summer Analyst",
    "Summer Analyst — Investment Banking Division",
    "2027 Summer Analyst",
  ]) assert.equal(band(t), "intern", `${t} must band intern`);
});

test("BUG-229: seasonal JOBS keep their bands — the noun is the convention, not the season", () => {
  assert.equal(band("Seasonal Customer Service Representative"), "mid");
  assert.equal(band("Seasonal Housekeeper - Weekends included"), "mid");
  assert.equal(band("Summer Camp Counselor"), "mid");
  assert.equal(band("Summer Opportunities - Retirement Sales AE"), "mid");
  assert.equal(band("SAS in Walmart – Retail Representative - Seasonal"), "mid");
});

test("BUG-229: a management title naming the program stays the manager's band", () => {
  assert.equal(band("Summer Analyst Program Manager"), "manager");
  assert.equal(band("(USA) Senior Manager, Creative- Senior Copy Lead, Seasonal Brand Campaigns"), "manager");
});

test("BUG-229: frozen verdicts — unrelated bands do not move", () => {
  assert.equal(band("Senior Analyst"), "senior");
  assert.equal(band("Associate"), "junior");
  assert.equal(band("Software Engineering Intern — Summer 2027"), "intern");
  assert.equal(band("Analyst Intern"), "intern");
  assert.equal(band("Staff Engineer"), "staff");
  assert.equal(band("Director of Engineering"), "director");
});
