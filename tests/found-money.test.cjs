// Found money from official sources (cluster K12: C90 settlements, C91 unclaimed property, C94 recalls).
// packages/domain/118-found-money.js over the three dated datasets in packages/offers/. All person data here is
// STAND-IN (a fictional Sam Rivera and invented purchases), labeled as such; the datasets are the real verified rows.
// Check: node --test tests/found-money.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const F = require(path.join(root, "packages/domain/118-found-money.js"));
const settlements = require(path.join(root, "packages/offers/settlements.json"));
const recalls = require(path.join(root, "packages/offers/recalls.json"));
const stateSearch = require(path.join(root, "packages/offers/state-unclaimed-search.json"));
const Earn = (() => { const vm = require("node:vm"), fs = require("node:fs"); const c = vm.createContext({}); vm.runInContext(["33-agent-monitors.js", "36-agent-workflows.js", "41-agent-recovery.js", "49-agent-save.js", "44-agent-earn.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.E=AgentEarn;", c); return c.E; })();

const TODAY = "2026-10-12";
// STAND-IN person and purchases (never the owner's): an MDLIVE charge inside the class period, a GettingOut
// payment (Telmate's service), an Amazon Prime charge, a Target purchase naming the recalled toy, an Amazon
// purchase naming the recalled blanket, and one generic Amazon purchase that names nothing.
const TX = [
  { merchant: "MDLIVE", amount: -25.00, date: "2024-06-14" },
  { merchant: "GETTINGOUT", amount: -40.00, date: "2021-03-02" },
  { merchant: "AMAZON PRIME", amount: -14.99, date: "2024-01-15" },
  { merchant: "TARGET MELISSA DOUG FIRE TRUCK ACTIVITY BOARD", amount: -30.00, date: "2026-02-10" },
  { merchant: "AMAZON JKMAX HEATED BLANKET", amount: -45.99, date: "2025-03-03" },
  { merchant: "AMAZON", amount: -19.99, date: "2025-05-20" },
];
const PROPS = [ // STAND-IN property rows, the shape a state property file would supply
  { id: "IL-2026-88410", holder: "Springfield Utility District", amount_cents: 18642, address: "400 W Elm St", city: "Springfield", state: "IL", reported_on: "2023-05-01" },
  { id: "CA-77-2210", holder: "Bay City Water", amount_cents: 5910, address: "88 Mission St", city: "San Francisco", state: "CA", reported_on: "2022-11-15" },
];
const ctx = (over) => Object.assign({ today: TODAY, settlements, recalls, stateSearch, transactions: TX, person: { name: "Sam Rivera", first: "Sam", last: "Rivera" }, states: ["IL", "CA"], properties: PROPS }, over || {});

test("the datasets obey the sourcing law: every row verifies or does not ship", () => {
  assert.deepEqual(F.validateSettlements(settlements), []);
  assert.deepEqual(F.validateRecalls(recalls), []);
  assert.deepEqual(F.validateStateSearch(stateSearch), []);
  const bad = JSON.parse(JSON.stringify(settlements));
  bad.settlements.push({ id: "x", tier: 2, administrator: "TopClassActions", source_url: "https://example.com", source_checked_on: "2026-10-12", checked_how: "blog", court: "?", docket: "", claim_url: "https://example.com", filing: "claim_form", claim_deadline: "2027-01-01", status: "open" });
  const problems = F.validateSettlements(bad);
  assert.ok(problems.some(p => /administrator/.test(p)), problems.join("; "));
  assert.ok(problems.some(p => /court and docket/.test(p)), problems.join("; "));
  const badRecall = JSON.parse(JSON.stringify(recalls));
  badRecall.recalls[0].source_url = "https://someblog.example/recall";
  assert.ok(F.validateRecalls(badRecall).some(p => /CPSC/.test(p)));
  const badState = JSON.parse(JSON.stringify(stateSearch));
  badState.states[0].search_url = "https://find-unclaimed-money.example/il";
  assert.ok(F.validateStateSearch(badState).some(p => /\.gov/.test(p)));
});

test("C90 kinds: the canonical ask, a packet ask, a notice and a filing all route; other asks do not", () => {
  const c = ctx();
  assert.equal(F.kind("Find any class action settlements I qualify for and claim them.", c), "settlements");
  assert.equal(F.kind("prepare the mdlive claim", c), "settlement_packet");
  assert.equal(F.kind("i got a notice about the telmate settlement", c), "settlements_notice");
  assert.equal(F.kind("i filed the mdlive claim", c), "settlement_filed");
  assert.equal(F.kind("Check if any state is holding money for me.", c), "unclaimed_search");
  assert.equal(F.kind("Anything I own been recalled?", c), "recalls");
  assert.equal(F.kind("what's my balance", c), null);
  assert.equal(F.kind("find me money", c), null);
});

test("C90 matching: inside-period purchases and the FTC automatic program match; a breach settlement with no evidence does not", () => {
  const { matches, nearMisses } = F.matchSettlements(ctx());
  const byId = Object.fromEntries(matches.map(m => [m.row.id, m]));
  assert.ok(byId["mdlive-evernorth-privacy"], "MDLIVE matches on the in-period charge");
  assert.equal(byId["mdlive-evernorth-privacy"].tier, "purchase");
  assert.equal(byId["mdlive-evernorth-privacy"].days_left, 50);
  assert.ok(byId["telmate-data-breach"], "GettingOut is Telmate's service");
  assert.ok(byId["ftc-amazon-prime-refunds"], "the Prime charge matches the FTC program");
  assert.ok(!byId["kelly-benefits-data-breach"], "no Kelly evidence, no match — a name alone never matches");
  assert.equal(nearMisses.length, 0);
  const text = F.answer("Find any class action settlements I qualify for and claim them.", ctx()).text;
  assert.match(text, /Up to \$15\.00 cash/);
  assert.match(text, /Claim by Dec 1, 2026 at https:\/\/www\.ehisettlement\.com/);
  assert.match(text, /no claim to file/i);
  assert.match(text, /Nothing has been filed\./);
});

test("C90 adversarial: a purchase after the class period is a near miss, said with its reason, never a match", () => {
  const late = ctx({ transactions: [{ merchant: "MDLIVE", amount: -25.00, date: "2026-01-05" }] });
  const { matches, nearMisses } = F.matchSettlements(late);
  assert.ok(!matches.some(m => m.row.id === "mdlive-evernorth-privacy"));
  assert.equal(nearMisses.length, 1);
  assert.match(nearMisses[0].reason, /outside its class period \(May 30, 2023 to Aug 11, 2025\)/);
  assert.match(F.answer("Find any class action settlements I qualify for and claim them.", late).text, /One didn't match: MDLIVE \/ Evernorth privacy settlement/);
  // A notice beats the missing purchase: the administrator naming the person is the strongest evidence.
  const noticed = F.matchSettlements(ctx({ transactions: [], notices: ["kelly-benefits-data-breach"] }));
  assert.equal(noticed.matches[0].tier, "notice");
});

test("C90 packet: prepared, complete, and the filing stays the owner's; a filed claim is tracked without an invented confirmation", () => {
  const r = F.answer("prepare the mdlive claim", ctx());
  assert.equal(r.kind, "settlement_packet");
  assert.match(r.text, /^Claim packet — MDLIVE \/ Evernorth privacy settlement\. Prepared for you to file; nothing has been submitted\./);
  assert.match(r.text, /Deadline: Dec 1, 2026 \(50 days left\)/);
  assert.match(r.text, /Case No\. 26-CA-006880/);
  assert.match(r.text, /Your evidence: MDLIVE charge of \$25\.00 on Jun 14, 2024/);
  assert.match(r.text, /penalty of perjury/);
  const filed = F.answer("i filed the mdlive claim", ctx());
  assert.equal(filed.kind, "settlement_filed");
  assert.match(filed.text, /won't invent one/);
  assert.match(filed.text, /final approval hearing is Jan 6, 2027/);
});

test("C90 deadline alerts fire at 30, 7 and 2 days, and not on other days", () => {
  const rows = settlements.settlements.filter(s => s.filing === "claim_form");
  const at = (today) => Object.fromEntries(F.deadlineAlerts(rows, today).map(a => [a.id, a]));
  assert.equal(at("2026-11-01")["mdlive-evernorth-privacy"].fires_today, true, "30 days out");
  assert.equal(at("2026-11-24")["mdlive-evernorth-privacy"].fires_today, true, "7 days out");
  assert.equal(at("2026-11-29")["mdlive-evernorth-privacy"].fires_today, true, "2 days out");
  assert.equal(at("2026-11-15")["mdlive-evernorth-privacy"].fires_today, false, "16 days out: quiet");
  assert.equal(at("2026-11-21")["telmate-data-breach"].fires_today, true, "Telmate 30 days out");
  assert.equal(at("2026-12-02")["mdlive-evernorth-privacy"].status, "missed");
});

test("C91: the search plan names the verified state portal and routes other states through NAUPA; stand-in hits are listed with their amounts", () => {
  const r = F.answer("Check if any state is holding money for me.", ctx());
  assert.equal(r.kind, "unclaimed_search");
  assert.match(r.text, /Illinois: I-Cash \(Illinois State Treasurer\) — search "Rivera, Sam" at https:\/\/icash\.illinoistreasurer\.gov\//);
  assert.match(r.text, /NAUPA's directory at https:\/\/unclaimed\.org/);
  assert.match(r.text, /\$186\.42 from Springfield Utility District/);
  assert.match(r.text, /\$59\.10 from Bay City Water/);
  assert.match(r.text, /no state charges to search or to claim/);
  const bare = F.answer("Check if any state is holding money for me.", ctx({ person: null, states: [] }));
  assert.match(bare.text, /I need the name the accounts were in and the states you've lived in/);
});

test("C91 packet: the claim packet carries the property, the documents and the honest timeline; nothing is submitted", () => {
  const r = F.answer("claim the Springfield Utility District", ctx());
  assert.equal(r.kind, "property_packet");
  assert.match(r.text, /^Claim packet — unclaimed property IL-2026-88410 \(IL\)\. Prepared for you to file; nothing has been submitted\./);
  assert.match(r.text, /\$186\.42 from Springfield Utility District/);
  assert.match(r.text, /government photo ID/);
  assert.match(r.text, /never in this chat/);
  assert.match(r.text, /portal does not promise a processing time/);
});

test("C94: a purchase naming the product confirms the recall with its dollars; a purchase naming nothing is unconfirmed at $0", () => {
  const { confirmed, unconfirmed } = F.matchRecalls(ctx());
  const ids = confirmed.map(m => m.row.id).sort();
  assert.deepEqual(ids, ["cpsc-26-778-jkmax-heated-blankets", "cpsc-26-780-melissa-doug-fire-truck"]);
  const text = F.answer("Anything I own been recalled?", ctx()).text;
  assert.match(text, /JKMAX Heated Blanket: your AMAZON JKMAX HEATED BLANKET charge of \$45\.99 on Mar 3, 2025\. CPSC recall 26-778/);
  assert.match(text, /Expected back on a refund: \$45\.99/);
  assert.match(text, /Melissa & Doug Lights & Sounds Fire Truck Activity Board: your TARGET MELISSA DOUG FIRE TRUCK ACTIVITY BOARD charge of \$30\.00 on Feb 10, 2026\. CPSC recall 26-780/);
  assert.match(text, /Expected back on a refund: \$30\.00/);
  assert.ok(unconfirmed.length >= 1, "the generic Amazon purchase is unconfirmed, not money");
  assert.match(text, /I won't put a dollar on an unconfirmed match/);
  // Adversarial: the right store, the wrong product.
  const wrong = F.matchRecalls(ctx({ transactions: [{ merchant: "TARGET LEGO CITY SET", amount: -59.99, date: "2026-02-10" }] }));
  assert.equal(wrong.confirmed.length, 0);
  assert.equal(wrong.unconfirmed.length, 1);
  // Adversarial: the right product outside the sales window.
  const early = F.matchRecalls(ctx({ transactions: [{ merchant: "TARGET MELISSA DOUG FIRE TRUCK ACTIVITY BOARD", amount: -30.00, date: "2024-01-10" }] }));
  assert.equal(early.confirmed.length, 0);
});

test("C94 packet: the remedy packet is complete and submits nothing; naming the product picks that product's packet", () => {
  const r = F.answer("prepare the JKMAX recall claim", ctx());
  assert.equal(r.kind, "recall_packet");
  assert.match(r.text, /^Recall claim packet — JKMAX Heated Blanket\. Prepared for you to submit; nothing has been sent\./);
  assert.match(r.text, /Expected back: \$45\.99 \(your full purchase price\)/);
  assert.match(r.text, /Stop using the product now/);
  const first = F.answer("prepare the recall claim", ctx());
  assert.match(first.text, /^Recall claim packet — Melissa & Doug Lights & Sounds Fire Truck Activity Board\./);
  assert.match(first.text, /Expected back: \$30\.00\./);
});

test("the earn engine agrees on the recall rows: its E3 matcher confirms the same two purchases from the same dataset", () => {
  const txs = TX.map((t, i) => ({ id: "t" + i, posted_at: t.date, amount: t.amount, merchant_raw: t.merchant, is_pending: false, is_transfer: false }));
  const out = Earn.detect({ today: TODAY, transactions: txs, settlements: [], recalls: recalls.recalls });
  const recallOpps = out.opportunities.filter(o => o.key.startsWith("recall:"));
  const confirmed = recallOpps.filter(o => !o.unconfirmed);
  assert.ok(confirmed.some(o => o.key === "recall:cpsc-26-780-melissa-doug-fire-truck" && o.expected_cents === 3000), JSON.stringify(recallOpps));
  assert.ok(confirmed.some(o => o.key === "recall:cpsc-26-778-jkmax-heated-blankets" && o.expected_cents === 4599), JSON.stringify(recallOpps));
});
