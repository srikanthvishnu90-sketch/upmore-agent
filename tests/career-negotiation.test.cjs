// NEGO-001..006 (128-career-negotiation): offer parsing from authored TEST offer fixtures, CIR-only
// benchmarks, total-comp math with labeled assumptions, card-gated scripts, roleplay, deadline plans.
// Comp honesty: no figure may appear that is not in a CIR comp note. Check: node --test tests/career-negotiation.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path"); const fs = require("node:fs");
const N = require(path.join(__dirname, "..", "packages/domain/128-career-negotiation.js"));
const ROOT = path.join(__dirname, "..");
const offerA = fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-offer-a.txt"), "utf8");
const offerB = fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-offer-b.txt"), "utf8");
const cir = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, `packages/career-data/cirs/${id}.json`), "utf8"));
const NOW = "2026-10-12T12:00:00Z";

test("NEGO-001 parse offer A: every field from the letter", () => {
  const o = N.parseOffer(offerA, { now: NOW });
  assert.equal(o.company, "Airbnb"); assert.equal(o.base_salary, 132000); assert.equal(o.signing_bonus, 15000);
  assert.deepEqual(o.annual_bonus, { kind: "target_pct", pct: 10 });
  assert.equal(o.equity.grant_value, 80000); assert.equal(o.equity.vest_years, 4); assert.equal(o.equity.cliff, "1-year");
  assert.equal(o.start_date, "2027-06-01"); assert.equal(o.expiry_date, "2026-10-30"); assert.deepEqual(o.missing, []);
});
test("NEGO-001 parse offer B: signing bonus is NOT an annual bonus; options unvalued", () => {
  const o = N.parseOffer(offerB, { now: NOW });
  assert.equal(o.annual_bonus, null); assert.equal(o.signing_bonus, 10000);
  assert.equal(o.equity.shares, 6000); assert.equal(o.equity.grant_value, null); assert.equal(o.equity.cliff, "1-year");
});
test("NEGO-001 store: stored values are the parsed values; deadline row created", () => {
  const st = N.createStore(); const row = N.storeOffer(st, N.parseOffer(offerA, { now: NOW }));
  assert.equal(st.offers[0].base_salary, 132000); assert.equal(row.offer_id, "offer-1");
  assert.equal(st.deadlines[0].date, "2026-10-30");
});
test("NEGO-002 benchmark: only CIR figures, each with source+date; anecdotal labeled", () => {
  const b = N.benchmark(cir("airbnb"));
  assert.equal(b.has_sourced_figure, true);
  for (const f of b.figures) { assert.ok(f.source_url && f.as_of && f.source_type); assert.ok(f.low >= 1000); }
  assert.ok(b.figures.some((f) => f.low === 128000 && f.high === 142000));
  const hrt = N.benchmark(cir("hudson-river-trading"));
  assert.ok(hrt.figures.every((f) => typeof f.anecdotal === "boolean"));
});
test("NEGO-002 benchmark honesty: CIR with no published figure yields NO number", () => {
  const b = N.benchmark(cir("bain"));
  assert.equal(b.has_sourced_figure, false); assert.equal(b.figures.length, 0); assert.match(b.statement, /No sourced compensation figure/);
});
test("NEGO-005 total comp A: math + assumptions shown", () => {
  const o = N.parseOffer(offerA, { now: NOW }); const tc = N.totalComp(o);
  assert.equal(tc.bonus, 13200); assert.equal(tc.equity_annual, 20000);
  assert.equal(tc.year1_total, 132000 + 13200 + 15000 + 20000); assert.equal(tc.annualized_total, 165200);
  assert.ok(tc.assumptions.length >= 4);
});
test("NEGO-005/197 equity honesty: unpriced options are unvalued, never $0-worth, delta null", () => {
  const a = N.parseOffer(offerA, { now: NOW }), b = N.parseOffer(offerB, { now: NOW });
  const tc = N.totalComp(b); assert.equal(tc.equity_unvalued, true); assert.equal(tc.equity_annual, null); assert.match(tc.disclaimer, /not a valuation promise/);
  const cmp = N.compareOffers(a, b); const eq = cmp.rows.find((r) => r.field === "equity_annual");
  assert.equal(eq.delta_b_minus_a, null); assert.match(cmp.note, /never treated as \$0/);
});
test("BUG-003 regression: weekly/monthly intern figures never enter annual benchmarks", () => {
  const hrt = N.benchmark(cir("hudson-river-trading"));
  assert.ok(!hrt.figures.some((f) => f.low === 5800 || f.high === 5800), "weekly $5,800 must be excluded");
  assert.ok(hrt.excluded_period_figures.length >= 1);
  const mv = N.benchmark(cir("de-shaw")); assert.ok(!mv.figures.some((f) => f.low === 21000), "monthly $21,000 must be excluded");
});
test("NEGO-003 counter: strategy cites the sourced figure; scripts word-for-word; card gates send", () => {
  const o = N.parseOffer(offerA, { now: NOW }); const cs = N.counterStrategy(o, N.benchmark(cir("airbnb")));
  assert.match(cs.scripts.email, /142,000/); assert.match(cs.scripts.email, /careers\.airbnb\.com/);
  assert.match(cs.scripts.call, /OPEN:/); assert.equal(cs.card.requires_approval, true); assert.equal(cs.card.sent, false);
});
test("NEGO-004 roleplay: recruiter pushes back; feedback after close", () => {
  let st = { turn: 0, pushes: 0 }; let r = N.roleplayTurn(st, "Thanks, I'm excited about the team."); st = r;
  assert.match(r.recruiter, /numbers/); r = N.roleplayTurn(st, "I was hoping base could be $142,000."); st = r;
  assert.ok(r.pushes >= 1); r = N.roleplayTurn(st, "If we land there, I'm ready to sign today.");
  assert.equal(r.done, true); assert.match(r.feedback, /concrete ask/);
});
test("NEGO-006 extension: new date = expiry + days; tracking row drafted_not_sent", () => {
  const st = N.createStore(); const o = N.storeOffer(st, N.parseOffer(offerA, { now: NOW }));
  const ext = N.extensionDraft(o, { days: 7 }); assert.equal(ext.requested_deadline, "2026-11-06");
  const row = N.trackExtension(st, o, ext); assert.equal(row.status, "drafted_not_sent"); assert.equal(ext.card.sent, false);
});
test("decline: warm checks pass, card-gated", () => {
  const o = N.parseOffer(offerB, { now: NOW }); const d = N.declineDraft(o);
  assert.ok(Object.values(d.relationship_kept_checks).every(Boolean)); assert.equal(d.card.sent, false);
});
test("deadline collision: both expire same day -> explicit sequence", () => {
  const st = N.createStore(); N.storeOffer(st, N.parseOffer(offerA, { now: NOW })); N.storeOffer(st, N.parseOffer(offerB, { now: NOW }));
  const p = N.deadlinePlan(st.offers, { now: "2026-10-12" });
  assert.equal(p.collision, true); assert.match(p.steps[0], /2026-10-30/); assert.equal(p.deadlines.length, 2);
});
