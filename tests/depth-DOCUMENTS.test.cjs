// Documents and security in depth (docs/depth/DOCUMENTS.md): packages/domain/62-agent-documents.js, the vault index
// (metadata only, never the bytes, never an identity or account number), policies and renewals, the beneficiary audit,
// enrollment windows, receipt emails parsed and matched to charges, photo receipts attached by what the person says, the
// unrecognized-charge ladder, phishing signals, the agent's own session audit, tax calendars, the donation log and refund
// tracking. Nothing here reads a mailbox or a camera. The module is not yet imported by any edge or app path. One test per
// sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Emails, rows,
// policies and sessions are MOCK.
// Check: node --test tests/depth-DOCUMENTS.test.cjs && node evals/depth/run.cjs DOCUMENTS
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["32-merchant-label.js", "33-agent-monitors.js", "48-money-math.js", "57-agent-ledger.js", "62-agent-documents.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.D = AgentDocuments;", ctx);
const { D } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const T = "2026-10-12";
const NOW = Date.UTC(2026, 9, 12, 14);
const DAY = 86400000;
const REFUSED = /never text with an identity or account number/;
let n = 0;
const tx = (d, c, m, o) => Object.assign({ id: `mock-${++n}`, account_id: "mock-card", posted_at: d, amount_cents: c, merchant_raw: m, is_pending: false }, o);
const ids = p => plain(p.signals.map(s => s.id));

test("[S01] the vault refuses an identity or account number in any metadata field, spaced SSNs included; an order number is fine", () => {
  const v = D.vault();
  assert.throws(() => v.add({ kind: "tax_form", subkind: "W-2", title: "W-2 2025 SSN 123 45 6789", location: "vault://mock-1" }, NOW), REFUSED);
  assert.throws(() => v.add({ kind: "statement", title: "Mock Bank statement", issuer: "Mock Bank 000123456789", location: "vault://mock-2" }, NOW), REFUSED);
  assert.throws(() => v.add({ kind: "policy", subkind: "auto", title: "Auto", tags: ["card 4111-1111-1111-1111"], location: "vault://mock-3" }, NOW), REFUSED);
  assert.throws(() => v.add({ kind: "id_document", title: "Mock card", location: "vault://mock-4", text: "123 45 6789" }, NOW), REFUSED);
  assert.equal(v.add({ kind: "receipt", title: "Mock Shop $43.20 #112-1234567-1234567", location: "vault://mock-5" }, NOW).id, "doc-1");
  assert.equal(v.add({ kind: "tax_form", subkind: "W-2", title: "W-2 2025 Mock Corp", year: 2025, location: "vault://mock-6" }, NOW).id, "doc-2");
  assert.equal(v.docs.length, 2);
});

test("[S02] a receipt's total is the total, not the subtotal: $43.20 after $40.00 and $3.20 tax", () => {
  const r = D.parseReceipt({ from: "Mock Shop <orders@mockshop.example>", subject: "Your Mock Shop receipt", body: "Subtotal: $40.00\nTax: $3.20\nTotal: $43.20" });
  assert.equal(r.total_cents, 4320);
  assert.equal(r.merchant, "Mock Shop");
  assert.equal(D.parseReceipt({ subject: "Mock order", body: "Item Subtotal $12.00. Grand Total $12.96" }).total_cents, 1296);
});

test("[S03] an order number is a real code: \"Order Confirmation\" is not order number \"Confirmation\", and \"Confirmation: XKJQPL\" is kept", () => {
  const r = D.parseReceipt({ from: "Mock Shop <orders@mockshop.example>", subject: "Order Confirmation", body: "Order #A12345 placed Oct 9, 2026. Order Total: $43.20" });
  assert.deepEqual([r.order, r.total_cents, r.on], ["A12345", 4320, "2026-10-09"]);
  assert.equal(D.parseReceipt({ from: "Mock Shop <orders@mockshop.example>", subject: "Your receipt", body: "Thanks for your order confirmation. Total: $9.99" }).order, null);
  assert.equal(D.parseReceipt({ subject: "Your Mock order #BS-77821 has shipped", body: "Order total: $212.40" }).order, "BS-77821");
  assert.equal(D.parseReceipt({ from: "Mock Air <trips@mockair.example>", subject: "Your trip confirmation", body: "Confirmation: XKJQPL. Total charged: $412.30" }).order, "XKJQPL", "an airline code is all capitals after an explicit marker");
});

test("[S04] a receipt from a no-reply mailbox is from the sender's company, and matches that company's charge", () => {
  assert.equal(D.parseReceipt({ from: "no-reply@doordash.com", subject: "Receipt", body: "Total: $43.20" }).merchant, "doordash");
  assert.equal(D.parseReceipt({ from: "receipts@email.uber.com", subject: "Receipt", body: "Total: $43.20" }).merchant, "uber");
  assert.equal(D.parseReceipt({ from: "auto-confirm@amazon.co.uk", subject: "Receipt", body: "Total: $43.20" }).merchant, "amazon");
  assert.equal(D.parseReceipt({ from: "mockshop@mockshop.example", subject: "Receipt", body: "Total: $43.20" }).merchant, "mockshop", "a named mailbox is kept");
  const rc = D.parseReceipt({ from: "no-reply@doordash.com", subject: "Receipt", body: "Total: $43.20 on 2026-10-09" });
  const m = D.matchReceipt(rc, [tx("2026-10-09", -4320, "DOORDASH*MOCK DINER", { id: "mock-dd" }), tx("2026-10-10", -4320, "MOCK GROCER", { id: "mock-gr" })]);
  assert.deepEqual([m.matched, m.reason], ["mock-dd", "amount, date and merchant"]);
});

test("[S05] a link whose text and address are the same site is not a mismatch; a link to another site is", () => {
  const legit = D.phishing({ from: "Mock Bank <alerts@mockbank.com>", claims: "Mock Bank", subject: "Your statement", body: "Hi Ana, view it at <a href=\"https://www.mockbank.com/statements\">www.mockbank.com</a>." });
  assert.ok(!ids(legit).includes("link_mismatch"), JSON.stringify(ids(legit)));
  assert.equal(legit.verdict, "no signals found");
  const spoof = D.phishing({ from: "Mock Bank <alerts@mockbank.com>", claims: "Mock Bank", subject: "Your statement", body: "View it at <a href=\"http://mockbank-secure.top/x\">www.mockbank.com</a>." });
  assert.ok(ids(spoof).includes("link_mismatch"));
});

test("[S06] sender and reply-to domains are read from the address, display names and spaced company names included, and a bare name never crashes", () => {
  assert.deepEqual(ids(D.phishing({ from: "Mock Bank <alerts@mockbank.com>", reply_to: "help@mockbank.com", claims: "Mock Bank", subject: "s", body: "b" })), []);
  assert.deepEqual(ids(D.phishing({ from: "onlinebanking@ealerts.bankofamerica.com", claims: "Bank of America", subject: "Statement", body: "Hi Ana" })), []);
  assert.equal(D.phishing({ from: "Chase", claims: "Chase", subject: "Statement", body: "Hi Ana" }).verdict, "no signals found");
  assert.ok(ids(D.phishing({ from: "Mock Bank <alerts@mockbank.com>", reply_to: "help@mock-recovery.xyz", subject: "s", body: "b" })).includes("reply_to_mismatch"));
  assert.ok(ids(D.phishing({ from: "alerts@mail-blast.xyz", claims: "Mock Bank", subject: "s", body: "b" })).includes("sender_domain_mismatch"));
});

test("[S07] each phishing signal reads as a sentence after \"it\"", () => {
  const p = D.phishing({ from: "Mock Bank <alerts@mockbank.com>", reply_to: "help@mock-recovery.xyz", claims: "Mock Bank", subject: "Statement", body: "<a href=\"http://mock-recovery.xyz/x\">mockbank.com</a>" });
  assert.equal(p.text, "Phishing: it links to one site while its text names another; sends replies to a different domain than it came from. Do not click or reply. If it names your bank, open the app or type the address yourself. I never ask for a code or password, and neither do they.");
  const q = D.phishing({ from: "Mock Shop <deals@mockshop.example>", subject: "Hello", body: "Dear Customer, see paypa1.com for your refund." });
  assert.equal(q.text, "Suspicious: it uses a look-alike domain; opens with a generic greeting where your bank uses your name. Do not click or reply. If it names your bank, open the app or type the address yourself. I never ask for a code or password, and neither do they.");
});

test("[S08] in early January the marketplace window that opened in November is open now, not \"opens in 295 days\"", () => {
  const w = D.enrollmentWindows({}, "2026-01-10").windows;
  assert.deepEqual(plain(w[0]), { id: "aca_marketplace", name: "Healthcare.gov marketplace open enrollment", opens: "2025-11-01", closes: "2026-01-15", note: "most states; some state marketplaces differ", state: "open, 5 days left" });
  assert.deepEqual([w[1].opens, w[1].state], ["2026-10-15", "opens in 278 days"]);
  const dec = D.enrollmentWindows({}, "2026-12-20").windows;
  assert.deepEqual(plain(dec.map(x => [x.opens, x.state])), [["2026-11-01", "open, 26 days left"], ["2027-10-15", "opens in 299 days"]]);
});

test("[S09] one day is \"1 day\" and the day itself is \"today\" (never \"1 days\" or \"0 days\")", () => {
  const v = D.vault();
  v.add({ kind: "policy", subkind: "auto", title: "Mock auto", issuer: "Mock Mutual", premium_cents: 142000, renews_on: "2026-10-13", location: "vault://mock-p1" }, NOW);
  v.add({ kind: "policy", subkind: "renters", title: "Mock renters", issuer: "Mock Mutual", renews_on: T, location: "vault://mock-p2" }, NOW);
  const r = D.renewals(v, T);
  assert.match(r[0].text, /^auto with Mock Mutual renews 2026-10-13 \(1 day\) at \$1,420\.00\. Two or three quotes now/);
  assert.match(r[1].text, /^renters with Mock Mutual renews 2026-10-12 \(today\)\. Two or three quotes now/);
  assert.match(D.taxCalendar("2026-10-14").text, /^Next: Extended return on 2026-10-15 \(1 day\)\./);
  assert.equal(D.enrollmentWindows({}, "2026-10-14").windows[1].state, "opens in 1 day");
});

test("[S10] refund windows match the filing: a paper return is 42 days, and a received return past its window is overdue", () => {
  const paper = D.refundTracker({ filed_on: "2026-03-01", efile: false }, "2026-03-20", { stage: "received" });
  assert.equal(paper.text, "Received by the IRS 19 days ago; most paper-filed refunds arrive within 42 days, so by about 2026-04-12.");
  const late = D.refundTracker({ filed_on: "2026-03-01", efile: true }, "2026-04-20", { stage: "received" });
  assert.equal(late.state, "overdue");
  assert.match(late.text, /^Filed 50 days ago, past the typical 21-day window\. Check Where's My Refund/);
  assert.equal(D.refundTracker({ filed_on: "2026-03-01", efile: true }, "2026-03-15", { stage: "received" }).text, "Received by the IRS 14 days ago; most e-filed refunds arrive within 21 days, so by about 2026-03-22.");
});

test("[S11] the donation log counts posted gifts once (a pending hold is not a second gift) and cites its rows", () => {
  const rows = [tx("2026-03-01", -30000, "AMERICAN RED CROSS", { is_pending: true }), tx("2026-03-02", -30000, "AMERICAN RED CROSS"), tx("2026-05-01", -4000, "MOCK FOOD BANK")];
  const dl = D.donationLog(rows, ["red cross", "food bank"], null, 2026);
  assert.equal(dl.total_cents, 34000);
  assert.equal(dl.text, "2026: $340.00 to 2 organizations across 2 gifts. 1 gift of $250 or more has no written acknowledgment in the vault; the IRS wants one for each.");
  assert.deepEqual([dl.source, dl.as_of], ["your transactions", "2026-05-01"]);
});

test("[S12] a device the person revoked is never \"known\": it signing in again is called out as new", () => {
  const sessions = [{ id: "mock-s1", device: "iPhone", location: "Austin, TX", started_at: NOW - 40 * DAY, last_seen_at: NOW - 3600000, current: true }, { id: "mock-s2", device: "Chrome on Windows", location: "Lisbon, PT", started_at: NOW - 30 * DAY, last_seen_at: NOW - 21 * DAY, revoked_at: NOW - 20 * DAY }, { id: "mock-s3", device: "Chrome on Windows", location: "Lisbon, PT", started_at: NOW - DAY, last_seen_at: NOW - 3600000 }];
  const a = D.sessionAudit(sessions, NOW);
  assert.deepEqual(plain(a.new_this_week.map(s => s.id)), ["mock-s3"]);
  assert.equal(a.text, "2 active sessions: iPhone in Austin, TX (this one); Chrome on Windows in Lisbon, PT. New this week and not you here: Chrome on Windows in Lisbon, PT. Say revoke and I end it.");
});

test("[S13] a lapsed policy is said to be lapsed and its premium is not counted as a cost you pay", () => {
  const v = D.vault();
  v.add({ kind: "policy", subkind: "auto", title: "Mock auto", issuer: "Mock Mutual", premium_cents: 142000, expires_on: "2026-09-30", location: "vault://mock-p1" }, NOW);
  v.add({ kind: "policy", subkind: "renters", title: "Mock renters", issuer: "Mock Mutual", premium_cents: 18000, renews_on: "2027-03-01", location: "vault://mock-p2" }, NOW);
  const p = D.policies(v, T);
  assert.equal(p.annual_premiums_cents, 18000);
  assert.equal(p.text, "2 policies on file: auto (Mock Mutual, lapsed 2026-09-30); renters (Mock Mutual, $180.00 a year, renews 2027-03-01). Nothing on file for health; that is a gap in my records, not necessarily in your cover.");
  assert.deepEqual([p.source, p.as_of], ["your vault", T]);
});

test("[S14] renewals within 45 days are raised, day 45 included, day 46 not", () => {
  const v = D.vault();
  v.add({ kind: "policy", subkind: "auto", title: "a", issuer: "Mock Mutual", renews_on: "2026-11-26", location: "vault://a" }, NOW);
  v.add({ kind: "policy", subkind: "home", title: "h", issuer: "Mock Mutual", renews_on: "2026-11-27", location: "vault://h" }, NOW);
  assert.deepEqual(plain(D.renewals(v, T).map(r => [r.line, r.days])), [["auto", 45]]);
});

test("[S15] beneficiaries are due after a life event since the last review, and not before one", () => {
  const v = D.vault();
  v.add({ kind: "policy", subkind: "life", title: "Mock term life", location: "vault://l", beneficiaries: ["Ana"], beneficiaries_reviewed_on: "2026-03-01" }, NOW);
  assert.equal(D.beneficiaryAudit(v, T, [{ kind: "marriage", on: "2026-06-01" }]).due[0].reason, "marriage on 2026-06-01 since the last review");
  assert.equal(D.beneficiaryAudit(v, T, [{ kind: "move", on: "2026-01-01" }]).due.length, 0);
});

test("[S16] estimated-tax dates are only for estimated payers", () => {
  assert.ok(!D.taxCalendar(T).items.some(i => i.id.startsWith("q")));
  const est = D.taxCalendar(T, { estimated_payer: true });
  assert.deepEqual(plain(est.items.slice(0, 2).map(i => [i.id, i.on, i.days])), [["extended", "2026-10-15", 3], ["q4", "2027-01-15", 95]]);
  assert.equal(est.capability_id, "TAX-003");
});

test("[S17] the quarterly estimate rounds up to the whole dollar: $12,345.67 a year is $3,087.00 a quarter", () => {
  const e = D.estimatedTax({ today: T, expected_tax_cents: 1234567, payments: [] });
  assert.equal(e.quarterly_cents, 308700);
  assert.match(e.text, /Paid \$0\.00 of about \$12,345\.67 so far\.$/);
});

test("[S18] a gift of exactly $250.00 needs a written acknowledgment", () => {
  const dl = D.donationLog([tx("2026-04-01", -25000, "MOCK FOOD BANK")], ["food bank"], D.vault(), 2026);
  assert.equal(dl.receipts_missing.length, 1);
  assert.equal(dl.text, "2026: $250.00 to 1 organization across 1 gift. 1 gift of $250 or more has no written acknowledgment in the vault; the IRS wants one for each.");
});

test("[S19] two charges for the receipt's amount and no merchant to tell them apart is asked about, never guessed", () => {
  const m = D.matchReceipt({ total_cents: 4320, merchant: null, on: "2026-10-09" }, [tx("2026-10-09", -4320, "MOCK A", { id: "mock-a" }), tx("2026-10-10", -4320, "MOCK B", { id: "mock-b" })]);
  assert.deepEqual([m.matched, m.reason, m.attach], [null, "2 charges for $43.20 in the window; say which", null]);
});

test("[S20] no sessions says so, and the session in use can't be revoked from itself", () => {
  assert.equal(D.sessionAudit([], NOW).text, "No active sessions.");
  const sessions = [{ id: "mock-s1", device: "iPhone", location: "Austin, TX", started_at: NOW - DAY, current: true }];
  assert.deepEqual(plain(D.revokeSession(sessions, "mock-s1", NOW)), { revoked: false, text: "That is this session; sign out instead." });
  assert.equal(sessions[0].revoked_at, undefined);
});

test("[S21] a converted trial explains a charge: likely yours, with the dispute only if it still looks wrong", () => {
  const t = D.triageCharge(tx(T, -1299, "MOCKFLIX", { id: "mock-t" }), { today: T, transactions: [], trials: [{ merchant: "Mockflix" }] });
  assert.equal(t.verdict, "likely yours");
  assert.equal(t.next, "Mockflix $12.99 is likely yours. If it still looks wrong, I can draft the dispute.");
  const u = D.triageCharge(tx(T, -48900, "ZQX MOCK DIGITAL", { id: "mock-u" }), { today: T, transactions: [] });
  assert.equal(u.next, "Nothing in your history explains Zqx Mock Digital $489.00. If you did not make it: lock the card, then dispute; I draft the dispute and you file it.");
});

test("[S22] a photo receipt is matched within 7 days of the date the person gives", () => {
  const ph = D.attachPhoto({ location: "photo://mock-1" }, { amount_cents: 4320, merchant: "Mock Diner", on: "2026-10-03" }, [tx("2026-10-09", -4320, "MOCK DINER", { id: "mock-d" })]);
  assert.deepEqual([ph.matched, ph.reason, ph.photo.location], ["mock-d", "amount, date and merchant", "photo://mock-1"]);
});

test("[ADV] identity digits in a charge descriptor or a receipt email never surface in what is said", () => {
  const t = D.triageCharge(tx(T, -4900, "PMT 4111111111111111 SSN 123-45-6789"), { today: T, transactions: [] });
  assert.ok(!/4111|6789/.test(t.next + t.merchant), t.next);
  const r = D.parseReceipt({ from: "x@shop.example", subject: "Receipt", body: "Paid with card 4111 1111 1111 1111. Total: $43.20" });
  assert.deepEqual([r.order, r.total_cents], [null, 4320]);
  assert.equal(D.phishing({ subject: "", body: "" }).verdict, "no signals found");
});
