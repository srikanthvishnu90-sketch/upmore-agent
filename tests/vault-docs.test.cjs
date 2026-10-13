// K13 vault & documents (real-world C142, C153, C155, C157, C158, C203): packages/domain/118-vault-docs.js over
// STAND-IN fixtures (flagged as such in every answer text that uses them). Muse-parity figures were computed by
// hand first: mileage 2026-01-20 10.00mi @72.5c = $7.25; 2026-09-03 42.60 @76c = $32.38; 2026-09-10 18.75 @76c =
// $14.25; 2026-09-18 42.60 @76c = $32.38; log total 113.95mi / $86.26; airport 27.45 @76c = $20.86, confirmed
// total 141.40mi / $107.12 (per-trip rounding, summed). Charity total $300.00 + $40.00 + $25.00 = $365.00.
// Check: node --test tests/vault-docs.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dir, "118-vault-docs.js"), "utf8") + "\nthis.V = VaultDocs;", ctx);
const { V } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const NOW = Date.UTC(2026, 9, 12, 15, 0, 0);

const breachCtx = () => ({
  breach: { service: "Ticketmaster", disclosed_on: "2024-07-12", source: "stand-in breach record", exposed: ["names", "email addresses", "payment card details"] },
  accounts: [
    { service: "Ticketmaster", payment_card_on_file: true, card_issuer: "Chase" },
    { service: "Gmail", reuses_breached_password: true },
    { service: "Dropbox", reuses_breached_password: true },
    { service: "Chase", reuses_breached_password: false },
  ],
  sessions: [
    { id: "s1", device: "iPhone", location: "Chicago, IL", current: true },
    { id: "s2", device: "Chrome on Windows", location: "Lisbon, PT" },
    { id: "s3", device: "Safari on Mac", location: "Chicago, IL" },
  ],
});
const docs = () => [
  { id: "doc-passport", kind: "id_document", title: "Passport", issuer: "U.S. Department of State", expires_on: "2031-05-14", location: "vault://docs/passport", sha256: V.sha256("stand-in passport bytes") },
  { id: "doc-ssn", kind: "id_document", title: "Social Security card", location: "vault://docs/ssn-card", sha256: V.sha256("stand-in ssn card bytes") },
  { id: "doc-auto", kind: "policy", subkind: "auto", title: "Auto policy", issuer: "Mock Mutual", location: "vault://docs/auto-policy", sha256: V.sha256("stand-in auto policy bytes") },
];
const gate = () => ({ question: "In what city were you born?", answer_hash: V.hashAnswer("Springfield") });
const taxCtx = () => ({
  year: 2025,
  expected: [
    { form: "W-2", issuer: "Mock Corp" }, { form: "1099-INT", issuer: "Mock Bank" }, { form: "1099-DIV", issuer: "Mock Broker" },
    { form: "1099-B", issuer: "Mock Broker" }, { form: "1098", issuer: "Mock Mortgage" }, { form: "1098-T", issuer: "Mock University" },
  ],
  docs: [
    { id: "t1", kind: "tax_form", subkind: "W-2", issuer: "Mock Corp", year: 2025, location: "vault://tax/w2", sha256: V.sha256("w2") },
    { id: "t2", kind: "tax_form", subkind: "1099-INT", issuer: "Mock Bank", year: 2025, location: "vault://tax/int", sha256: V.sha256("int") },
    { id: "t3", kind: "tax_form", subkind: "1099-DIV", issuer: "Mock Broker", year: 2025, location: "vault://tax/div", sha256: V.sha256("div") },
  ],
});
const trips = () => [
  { id: "tr1", on: "2026-01-20", from: "Office", to: "Client site", miles: 10.0, purpose: "client kickoff", kind: "business", confirmed: true },
  { id: "tr2", on: "2026-09-03", from: "Home", to: "Client site", miles: 42.6, purpose: "client meeting", kind: "business", confirmed: true },
  { id: "tr3", on: "2026-09-04", from: "Home", to: "Office", miles: 12.3, purpose: "work", kind: "business", confirmed: true, commute: true },
  { id: "tr4", on: "2026-09-10", from: "Office", to: "Supplier warehouse", miles: 18.75, purpose: "pick up equipment", kind: "business", confirmed: true },
  { id: "tr5", on: "2026-09-12", from: "Home", to: "Grocery", miles: 6.2, purpose: "shopping", kind: "personal", confirmed: true },
  { id: "tr6", on: "2026-09-18", from: "Client site", to: "Home", miles: 42.6, purpose: "return from client meeting", kind: "business", confirmed: true },
  { id: "tr7", on: "2026-09-25", from: "Home", to: "Airport", miles: 27.45, purpose: "flight to client conference", kind: "business", confirmed: false },
];
const charityCtx = () => ({
  year: 2026, stand_in: true,
  charities: ["red cross", "food bank", "wikimedia"],
  transactions: [
    { id: "g0", posted_at: "2026-03-01", amount_cents: -30000, merchant_raw: "AMERICAN RED CROSS", is_pending: true },
    { id: "g1", posted_at: "2026-03-02", amount_cents: -30000, merchant_raw: "AMERICAN RED CROSS" },
    { id: "g2", posted_at: "2026-05-01", amount_cents: -4000, merchant_raw: "MOCK FOOD BANK" },
    { id: "g3", posted_at: "2026-06-15", amount_cents: -2500, merchant_raw: "WIKIMEDIA FOUNDATION" },
    { id: "g4", posted_at: "2026-07-01", amount_cents: -5000, merchant_raw: "RED CROSS FRANCE", currency: "EUR" },
  ],
  receipts: [
    { org: "American Red Cross", amount_cents: 30000, on: "2026-03-02" },
    { org: "Mock Food Bank", amount_cents: 4000, on: "2026-05-01" },
  ],
});
const files = () => [
  { name: "statement_march.pdf", sha256: V.sha256("march statement"), kind: "statement", issuer: "Mock Bank", on: "2026-03" },
  { name: "auto policy scan.pdf", sha256: V.sha256("auto policy"), kind: "policy", subkind: "auto", issuer: "Mock Mutual", on: "2026" },
  { name: "IMG_4021.pdf", sha256: V.sha256("auto policy"), kind: "policy", subkind: "auto", issuer: "Mock Mutual", on: "2026" },
  { name: "car title.pdf", sha256: V.sha256("vehicle title"), kind: "title", on: "2026" },
  { name: "final_FINAL statement (1).pdf", sha256: V.sha256("march statement"), kind: "statement", issuer: "Mock Bank", on: "2026-03" },
];

test("sha256 matches the published vector for \"abc\"", () => {
  assert.equal(V.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("[C142] affected = breached service + password reusers; the different-password account is not listed; card packet only because payment data was exposed", () => {
  const p = V.breachLockdown(breachCtx());
  assert.deepEqual(plain(p.affected.map(a => a.service)), ["Ticketmaster", "Gmail", "Dropbox"]);
  assert.equal(p.sessions_to_revoke.length, 2);
  assert.deepEqual(plain(p.card_packets.map(x => [x.service, x.issuer])), [["Ticketmaster", "Chase"]]);
  assert.match(p.text, /The other 1 inventoried account\(s\) don't use that password/);
});

test("[C142] execute revokes the other sessions, never the current one, and writes rotation records with vault refs only", () => {
  const c = breachCtx();
  const r = V.breachExecute(c, NOW);
  assert.equal(r.executed, true);
  assert.deepEqual(plain(r.revoked), ["Chrome on Windows in Lisbon, PT", "Safari on Mac in Chicago, IL"]);
  assert.equal(c.sessions[0].revoked_at, undefined);
  assert.equal(c.sessions[1].revoked_at, NOW);
  assert.match(r.text, /vault:\/\/cred\/ticketmaster/);
  assert.match(r.text, /Nothing was ordered/);
});

test("[C142] no breach record handed in is NOT_WIRED, never invented exposure; a non-payment breach makes no card packet", () => {
  assert.match(V.breachLockdown({ accounts: [] }).text, /^Breach data is NOT_WIRED/);
  const c = breachCtx(); c.breach.exposed = ["names", "email addresses"];
  assert.equal(V.breachLockdown(c).card_packets.length, 0);
});

test("[secrets] a password field or an SSN in any input refuses the flow, and no reply ever carries a secret value", () => {
  const c = breachCtx(); c.accounts[0].password = "hunter2";
  assert.throws(() => V.breachLockdown(c), /Refused/);
  const t = taxCtx(); t.docs[0].title = "W-2 123 45 6789";
  assert.throws(() => V.taxFolder(t), /Refused/);
  const out = JSON.stringify([V.breachExecute(breachCtx(), NOW), V.taxFolder(taxCtx()), V.charityRoundup(charityCtx())]);
  assert.ok(!/\d{3}[- ]\d{2}[- ]\d{4}/.test(out));
});

test("[C153] the gate: a right answer returns the vault reference and logs it; a wrong one returns no location and is logged", () => {
  const log = [];
  const ok = V.retrieve(docs(), gate(), "  Springfield ", "Passport", NOW, log);
  assert.equal(ok.ok, true);
  assert.match(ok.text, /vault:\/\/docs\/passport/);
  assert.ok(!/passport bytes|the document itself over text$/.test(ok.text.replace("I never send the document itself over text", "")));
  const bad = V.retrieve(docs(), gate(), "Chicago", "Passport", NOW, log);
  assert.equal(bad.ok, false);
  assert.ok(!bad.text.includes("vault://"), bad.text);
  assert.deepEqual(log.map(e => e.ok), [true, false]);
});

test("[C153] retrieval of a document that is not in the vault says what is, after verification", () => {
  const r = V.retrieve(docs(), gate(), "Springfield", "Birth certificate", NOW, []);
  assert.equal(r.found, false);
  assert.match(r.text, /nothing in the vault matches/);
});

test("[C155] folder: 3 of 6 in with canonical names; each gap names the form, the issuer and where it lives", () => {
  const f = V.taxFolder(taxCtx());
  assert.deepEqual(plain(f.present.map(p => p.file)), ["2025-W-2-mock-corp.pdf", "2025-1099-INT-mock-bank.pdf", "2025-1099-DIV-mock-broker.pdf"]);
  assert.deepEqual(plain(f.missing.map(m => m.form)), ["1099-B", "1098", "1098-T"]);
  assert.match(f.missing[0].where, /broker portal/);
  assert.equal(f.complete, false);
  const done = taxCtx(); done.docs.push(
    { id: "t4", kind: "tax_form", subkind: "1099-B", issuer: "Mock Broker", year: 2025, location: "vault://tax/b", sha256: V.sha256("b") },
    { id: "t5", kind: "tax_form", subkind: "1098", issuer: "Mock Mortgage", year: 2025, location: "vault://tax/1098", sha256: V.sha256("m") },
    { id: "t6", kind: "tax_form", subkind: "1098-T", issuer: "Mock University", year: 2025, location: "vault://tax/t", sha256: V.sha256("t") });
  assert.equal(V.taxFolder(done).complete, true);
});

test("[C157] parity: 113.95 business miles and $86.26 before confirmation; commute and personal excluded; unconfirmed airport trip out", () => {
  const r = V.mileage({ year: 2026, trips: trips(), stand_in: true });
  assert.equal(r.business_miles, "113.95");
  assert.equal(r.deduction_cents, 8626);
  assert.deepEqual(plain(r.rows.map(x => x.deduction_cents)), [725, 3238, 1425, 3238]);
  assert.deepEqual(plain(r.excluded.map(x => x.id)), ["tr3", "tr5"]);
  assert.match(r.excluded[0].reason, /commute/);
  assert.deepEqual(plain(r.unconfirmed.map(x => x.id)), ["tr7"]);
  assert.match(r.csv, /^date,from,to,miles,purpose,rate,deduction\n2026-01-20,Office,Client site,10\.00,client kickoff,72\.5¢,\$7\.25/);
});

test("[C157] confirming the airport trip adds 27.45mi / $20.86: 141.40mi and $107.12; each trip keeps its own date's rate", () => {
  const t = trips(); t.find(x => x.id === "tr7").confirmed = true;
  const r = V.mileage({ year: 2026, trips: t, stand_in: true });
  assert.equal(r.business_miles, "141.40");
  assert.equal(r.deduction_cents, 10712);
  assert.equal(V.rateFor("2026-06-30").label, "72.5¢");
  assert.equal(V.rateFor("2026-07-01").label, "76¢");
});

test("[C158] roundup: $365.00 to the cent; the pending hold is not a second gift; the EUR gift is said, not added; $250+ gift has its acknowledgment", () => {
  const r = V.charityRoundup(charityCtx());
  assert.equal(r.total_cents, 36500);
  assert.equal(r.rows.length, 3);
  assert.equal(r.filed.length, 2);
  assert.deepEqual(plain(r.missing.map(x => x.charity)), ["WIKIMEDIA FOUNDATION"]);
  assert.equal(r.filed[0].needs_acknowledgment, true);
  assert.match(r.text, /counted once/);
  assert.match(r.text, /not added in/);
});

test("[C203] organize: canonical names, hash duplicates removed (first kept), gaps with where each lives; find by name", () => {
  const r = V.organize({ files: files(), stand_in: true });
  assert.deepEqual(plain(r.filed.map(f => f.to)), ["statements/2026-03-mock-bank-statement.pdf", "policies/2026-mock-mutual-auto-policy.pdf", "property/vehicle-title.pdf"]);
  assert.deepEqual(plain(r.duplicates.map(d => d.name)), ["IMG_4021.pdf", "final_FINAL statement (1).pdf"]);
  assert.deepEqual(plain(r.gaps.map(g => g.label)), ["health policy", "the prior year's tax return", "property deed"]);
  const f = V.findDoc(r, "find my auto policy");
  assert.equal(f.found, true);
  assert.match(f.text, /policies\/2026-mock-mutual-auto-policy\.pdf/);
  assert.equal(V.findDoc(r, "find my passport").found, false);
});

test("[chat] the whole conversations route through answer(): breach card -> do it; vault challenge -> answer; folder -> CPA packet; mileage -> confirm; charity; organize -> find", () => {
  const o = () => ({ breachCtx: breachCtx(), docs: docs(), gate: gate(), log: [], tax: taxCtx(), charity: charityCtx(), trips: trips(), files: files(), year: 2026, stand_in: true, previous: [] });
  let s = o();
  const card = V.answer("My email was in the Ticketmaster breach. Handle it.", NOW, s);
  assert.match(card, /^Breach lockdown for Ticketmaster/);
  s.previous = [{ role: "assistant", content: card }];
  assert.match(V.answer("do it", NOW, s), /^Lockdown run for Ticketmaster/);
  s = o();
  const ch = V.answer("show my passport", NOW, s);
  assert.match(ch, /verification question/);
  s.previous = [{ role: "assistant", content: ch }];
  assert.match(V.answer("Springfield", NOW, s), /vault:\/\/docs\/passport/);
  s.previous = [{ role: "assistant", content: ch }];
  assert.ok(!V.answer("Chicago", NOW, s).includes("vault://"));
  s = o();
  const tf = V.answer("Round up everything my CPA needs.", NOW, s);
  assert.match(tf, /3 of 6 forms/);
  s.previous = [{ role: "assistant", content: tf }];
  assert.match(V.answer("send it to my CPA", NOW, s), /packet prepared/);
  s = o();
  const ml = V.answer("Build my business mileage log.", NOW, s);
  assert.match(ml, /\$86\.26/);
  s.previous = [{ role: "assistant", content: ml }];
  const ml2 = V.answer("the airport trip was business", NOW, s);
  assert.match(ml2, /\$107\.12/);
  assert.match(V.answer("Get my donation receipts ready for taxes.", NOW, o()), /\$365\.00/);
  assert.match(V.answer("Organize my financial documents", NOW, o()), /2 duplicates removed/);
  s = o();
  assert.match(V.answer("find my auto policy", NOW, s), /policies\/2026-mock-mutual-auto-policy\.pdf/);
  assert.equal(V.answer("what's the weather", NOW, o()), null);
});
