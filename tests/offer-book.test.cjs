// The offer book (packages/domain/82-offer-book.js, packages/offers/terms.json): every outside term carries its source
// and checked date, names the method cards that use it, and is never shown as current past its freshness window.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const OfferBook = require("../packages/domain/82-offer-book.js");
const TERMS = require("../packages/offers/terms.json");
const { build: buildMethods } = require("../scripts/build-methods.cjs");

const book = OfferBook.create(TERMS);
const methodIds = new Set(buildMethods().cards.map(c => c.id));

test("every term is valid: kind, value, unit, an https source, a checked date, the cards that use it", () => {
  assert.deepEqual(OfferBook.validate(TERMS), []);
  assert.ok(TERMS.terms.length >= 30);
  for (const t of TERMS.terms) for (const m of t.methods) assert.ok(methodIds.has(m), `${t.id} names ${m}, which is not a method card`);
});

test("a term inside its window is cited with its source and date; past it, it says it may have changed", () => {
  const fresh = book.term("price.netflix.standard_cents", "2026-10-20");
  assert.equal(fresh.value, 1999);
  assert.equal(fresh.stale, false);
  assert.match(fresh.cite, /^per Plans and Pricing, Netflix Help Center, checked 2026-10-11$/);
  const old = book.term("price.netflix.standard_cents", "2026-11-11"); // 31 days: a price is current for 30
  assert.equal(old.stale, true);
  assert.match(old.cite, /may have changed, so check before acting/);
  // A promo goes stale after a week; a federal rule after a year.
  assert.equal(book.term("card.chase_freedom_flex.q4_2026.cap_cents", "2026-10-19").stale, true);
  assert.equal(book.term("dot.refund.change_hours.domestic", "2027-06-01").stale, false);
  assert.equal(book.term("dot.refund.change_hours.domestic", "2027-10-12").stale, true);
});

test("a date before the term was checked is not current either, and an unknown term or date throws", () => {
  assert.equal(book.term("price.prime.month_cents", "2026-10-01").stale, true);
  assert.throws(() => book.term("price.nope", "2026-10-12"), /no term/);
  assert.throws(() => book.term("price.prime.month_cents", "soon"), /must be a date/);
});

test("validation refuses a term without a source, a date, a known kind or a card", () => {
  const bad = { terms: [
    { id: "a", kind: "price", value: 1, unit: "cents", source: { title: "x", url: "http://insecure" }, checked_on: "2026-10-11", methods: ["M3-SUBS-01"] },
    { id: "b", kind: "rumor", value: 1, unit: "cents", source: { title: "x", url: "https://x.example/" }, checked_on: "Oct 2026", methods: [] },
  ] };
  const p = OfferBook.validate(bad);
  assert.ok(p.some(x => /a: source/.test(x)));
  assert.ok(p.some(x => /b: kind/.test(x)) && p.some(x => /b: checked_on/.test(x)) && p.some(x => /b: methods/.test(x)));
  assert.throws(() => OfferBook.create(bad), /offer book/);
});

test("the edge bundle carries the book and its terms", () => {
  const src = require("node:fs").readFileSync(path.join(__dirname, "../supabase/functions/_shared/router_core.js"), "utf8");
  assert.ok(src.includes("const OfferBook = (() =>") && src.includes("const OFFER_TERMS_JSON = "));
});
