"use strict";
// BUG-123 guard — reply-oracle finance-leak judges "portfolio" by
// sense, not by blanket pattern. The career product faithfully quotes
// hiring bars that name a WORK portfolio ("a portfolio, repository
// history or shipped side tool the hiring engineer can inspect
// directly" — DevTools Startup archetype file; "polished portfolio
// projects" — Consumer Startup archetype file); the old blanket
// /\bportfolio\b/i hard-failed both as finance leakage and flipped
// SC-264/SC-268 PASS -> FAIL in the residual lane's family re-run.
// The finance sense (a holdings account: possessives, balances,
// stocks/shares/returns collocates) is still a hard leak, and a bare
// "portfolio" with neither sense marker still fires — the carve-out
// covers only provable work-sample collocations. Ledger: BUG-123.
const test = require("node:test");
const assert = require("node:assert");
const Oracle = require("../scripts/career/reply-oracle.cjs");

const leaks = (text) => (Oracle.checkText(text).failures || []).filter((f) => f.rule === "finance-leak");

test("BUG-123: work-sample portfolio (the two archetype bars, verbatim) does not trip finance-leak", () => {
  assert.deepEqual(leaks("Archetype bar: strong fundamentals plus publicly readable code — a portfolio, repository history or shipped side tool the hiring engineer can inspect directly."), []);
  assert.deepEqual(leaks("Archetype bar: shipped, user-facing work the team can use — a live app, a product with real users, or polished portfolio projects."), []);
  assert.deepEqual(leaks("Bring a design portfolio of shipped product work to the interview."), []);
});

test("BUG-123: finance-sense portfolio still trips finance-leak", () => {
  assert.equal(leaks("Your portfolio balance is down this month.").length, 1);
  assert.equal(leaks("Diversify your portfolio across index funds.").length, 1);
  assert.equal(leaks("Your portfolio of stocks returned 12% this year.").length, 1);
  assert.equal(leaks("I moved money out of your portfolio and sold the shares.").length, 1);
});

test("BUG-123: a bare portfolio with neither sense marker still trips (conservative default)", () => {
  assert.equal(leaks("Check the portfolio before Friday.").length, 1);
});

test("BUG-123: the rest of the finance-leak family is unchanged; career-legit money words stay clean", () => {
  assert.equal(leaks("Cancel your subscription from Settings to stop billing.").length, 1);
  assert.equal(leaks("Your bank balance is $2,300 as of today.").length, 1);
  assert.deepEqual(leaks("Your salary, signing bonus and benefits are in the offer letter."), []);
});
