// Final A1 — pay-later (Affirm) plan grouping on the owner's real-row twins (Phase A worker A1, 2026-10-12).
// The oracle was counted BY HAND from the raw rows before any code read them: Chase checking, Jul 15-Sep 25 2026,
// 15 Affirm payments totalling $317.63 are SIX plans — one AFFIRM.COM PAYMENTS plan ($61.44 x3, stable plan id
// 185-54233729) and five AFFIRM * PAY plans ($10.84 x3, $6.03 x3, $16.00 x2, $11.42 x2, $13.93 x2), each payment
// carrying a FRESH 8-character per-payment code. Before the fix the module read 13 fragments (12 singles + the 1
// AFFIRM.COM plan) and the chat headline said 4; the feed note read 2. The knowledge that fixes it lives in
// packages/offers/bnpl-providers.json (Affirm descriptor_structure): the code after PAY is a per-payment
// reference (neither plan nor store), PAY there is generic, and the AFFIRM.COM number is a stable plan id.
// Check: node --test tests/final-a1-bnpl.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const B = require(path.join(root, "packages/domain/97-bnpl.js"));
const PROVIDERS = JSON.parse(fs.readFileSync(path.join(root, "packages/offers/bnpl-providers.json"), "utf8"));

const TZ = "America/Chicago";
const NOW = new Date("2026-10-12T15:05:00Z"); // Oct 12, 10:05 a.m. in Chicago
const SYNC = "2026-10-12T14:00:00Z";
let i = 0;
const tx = (posted_on, amount_cents, merchant_raw, o) => Object.assign({ account_id: "chk", provider_transaction_id: `sf-${i++}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: SYNC }, o);
const P = (d, cents, code) => tx(d, -cents, `AFFIRM * PAY ${code} SAN FRANCISCO CA`);
const CODES = ["Y8PRUXM0", "KJ4OR9CH", "SD6B2XRK", "WJSJ24AL", "3U3M7JEN", "N7Q3CCLN", "OIDHK430", "IAYRAUTH", "ZQILNSJX", "6KHJY9TY", "D15Z7DSK", "6GGIXBJA"];
// The owner's rows, twinned only in the stable id's digits (185-54233729 is the rows' own id shape from the tasking).
const TWINS = [
  tx("2026-07-15", -6144, "AFFIRM.COM PAYMENTS 185-54233729 CA"), tx("2026-08-17", -6144, "AFFIRM.COM PAYMENTS 185-54233729 CA"), tx("2026-09-15", -6144, "AFFIRM.COM PAYMENTS 185-54233729 CA"),
  P("2026-07-27", 1084, "SD6B2XRK"), P("2026-08-24", 1084, "ZQILNSJX"), P("2026-09-25", 1084, "Y8PRUXM0"),
  P("2026-07-29", 603, "WJSJ24AL"), P("2026-08-31", 603, "6KHJY9TY"), P("2026-09-25", 603, "3U3M7JEN"),
  P("2026-08-03", 1600, "N7Q3CCLN"), P("2026-09-02", 1600, "KJ4OR9CH"),
  P("2026-08-11", 1142, "OIDHK430"), P("2026-09-21", 1142, "D15Z7DSK"),
  P("2026-08-12", 1393, "IAYRAUTH"), P("2026-09-25", 1393, "6GGIXBJA"),
];
const opts = { tz: TZ, providers: PROVIDERS };
const OLD = tx("2026-07-01", -100, "KROGER #1"); // the rows reach back before every plan

test("hand count, derived first: the twins are 15 payments and $317.63", () => {
  assert.equal(TWINS.length, 15);
  assert.equal(-TWINS.reduce((s, r) => s + r.amount_cents, 0), 31763);
});

test("detect: a per-payment code names no store and no plan; the AFFIRM.COM number is the plan's stable id", () => {
  for (const code of CODES) {
    const d = B.detect(`AFFIRM * PAY ${code} SAN FRANCISCO CA`, PROVIDERS);
    assert.equal(d.provider.id, "affirm", code);
    assert.equal(d.merchant, null, code);
    assert.equal(d.plan_id, null, code);
  }
  const s = B.detect("AFFIRM.COM PAYMENTS 185-54233729 CA", PROVIDERS);
  assert.deepEqual([s.provider.id, s.merchant, s.plan_id], ["affirm", null, "185-54233729"]);
  assert.equal(B.detect("AFFIRM *PAY", PROVIDERS).merchant, null); // the code-less shape still names no store
});

test("the twins read as exactly the six hand-counted plans", () => {
  const res = B.plans(TWINS, NOW, opts);
  assert.equal(res.plans.length, 6);
  const byAmount = new Map(res.plans.map((p) => [p.amount_cents, p]));
  const want = [
    [6144, ["2026-07-15", "2026-08-17", "2026-09-15"], "2026-10-15"],
    [1084, ["2026-07-27", "2026-08-24", "2026-09-25"], "2026-10-25"],
    [603, ["2026-07-29", "2026-08-31", "2026-09-25"], "2026-10-25"],
    [1600, ["2026-08-03", "2026-09-02"], "2026-10-02"],
    [1142, ["2026-08-11", "2026-09-21"], "2026-10-21"],
    [1393, ["2026-08-12", "2026-09-25"], "2026-10-25"],
  ];
  for (const [amt, seen, next] of want) {
    const p = byAmount.get(amt);
    assert.ok(p, `plan of ${amt}`);
    assert.deepEqual([p.cadence, p.seen, p.next], ["monthly", seen, next], `plan of ${amt}`);
    assert.equal(p.label, "Affirm", "a plan's name is the provider, never a per-payment code");
  }
  assert.equal(byAmount.get(6144).plan_id, "185-54233729");
  assert.equal(res.plans.reduce((s, p) => s + p.paid_cents, 0), 31763, "every dollar of the $317.63 is in a plan");
});

test("the list answer on the twins: 6 plans in progress, and no per-payment code anywhere in it", () => {
  const r = B.list(TWINS, "show my bnpl plans", NOW, opts);
  assert.equal(r.split("\n")[0], "Buy now, pay later: 6 plans in progress in your bank and card rows.");
  assert.equal((r.match(/^- Affirm: \$/gm) || []).length, 6);
  assert.match(r, /- Affirm: \$61\.44 a month, 3 payments seen \(Jul 15, Aug 17, Sep 15\)\. Next expected Oct 15 \(inferred from the monthly pattern\)\./);
  assert.match(r, /- Affirm: \$16\.00 a month, 2 payments seen \(Aug 3, Sep 2\)\. The next was expected Oct 2 and isn't in your rows/);
  for (const code of CODES) assert.ok(!new RegExp(code, "i").test(r), `the code ${code} is never shown`);
  assert.doesNotMatch(r, /Pay [A-Za-z0-9]{8}/);
});

test("adversarial: two Affirm plans with the same amount but different cadences stay two plans", () => {
  const rows = [OLD,
    P("2026-07-06", 2500, "AAAAAAAA"), P("2026-07-20", 2500, "BBBBBBB1"), P("2026-08-03", 2500, "CCCCCC22"), P("2026-08-17", 2500, "DDDDDDD3"),
    P("2026-07-27", 2500, "EEEEEEE4"), P("2026-08-26", 2500, "FFFFFFF5"), P("2026-09-25", 2500, "GGGGGGG6")];
  const p = B.plans(rows, NOW, opts).plans;
  assert.equal(p.length, 2);
  assert.deepEqual(p.map((x) => `${x.cadence}:${x.seen.length}`).sort(), ["biweekly:4", "monthly:3"]);
});

test("adversarial: a one-off Affirm payment stays one_off, never a plan in progress", () => {
  const rows = [OLD, P("2026-08-20", 1999, "HHHHHHH7")];
  const p = B.plans(rows, NOW, opts).plans;
  assert.deepEqual(p.map((x) => `${x.cadence}:${x.status}`), ["single:one_off"]);
  assert.doesNotMatch(B.list(rows, "bnpl", NOW, opts), /plans? in progress/); // never presented as a plan
});

test("adversarial: the AFFIRM.COM stable-id family stays one plan even when an amount differs slightly (a fee)", () => {
  const rows = [OLD,
    tx("2026-07-15", -6144, "AFFIRM.COM PAYMENTS 185-54233729 CA"),
    tx("2026-08-17", -6144, "AFFIRM.COM PAYMENTS 185-54233729 CA"),
    tx("2026-09-15", -6199, "AFFIRM.COM PAYMENTS 185-54233729 CA")];
  const p = B.plans(rows, NOW, opts).plans;
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].cadence, p[0].seen.length, p[0].paid_cents, p[0].plan_id], ["monthly", 3, 18487, "185-54233729"]);
});

test("adversarial: a store-named descriptor still names the store, and the other providers' shapes are unchanged", () => {
  assert.equal(B.detect("KLARNA*ASOS.COM", PROVIDERS).merchant, "Asos.com");
  assert.equal(B.detect("KLARNA*TARGET", PROVIDERS).merchant, "Target");
  const rows = [OLD,
    tx("2026-09-14", -2650, "ZIP.CO"), tx("2026-09-28", -2500, "ZIP.CO"), tx("2026-10-12", -2500, "ZIP.CO"),
    tx("2026-08-09", -3000, "AFTERPAY"), tx("2026-08-23", -3000, "AFTERPAY"), tx("2026-09-06", -3000, "AFTERPAY"), tx("2026-09-20", -3000, "AFTERPAY")];
  const res = B.plans(rows, NOW, opts);
  const zip = res.plans.find((x) => x.provider.id === "zip");
  assert.deepEqual([zip.first_cents, zip.amount_cents, zip.left, zip.owed_cents], [2650, 2500, 1, 2500]);
  assert.deepEqual(res.finished.map((x) => x.provider.id), ["afterpay"]);
});

test("the feed's pay-later note on the twins: 6 plans, next instalments $119.66, no per-payment code shown", () => {
  const ctx = vm.createContext({ setTimeout, clearTimeout });
  vm.runInContext(["32-merchant-label.js", "33-agent-monitors.js"].map((f) => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.Mo=AgentMonitors;", ctx);
  let n = 0;
  const dtx = (posted_at, amount, merchant_raw) => ({ id: "t" + (++n), account_id: "chk", amount, amount_cents: Math.round(amount * 100), posted_at, merchant_raw, is_pending: false, is_transfer: false, currency: "USD" });
  const drows = TWINS.map((r) => dtx(r.posted_on, r.amount_cents / 100, r.merchant_raw));
  const f = ctx.Mo.payLaterPlans({ transactions: drows, today: "2026-10-12" });
  assert.equal(f.length, 1);
  assert.equal(f[0].title, "6 pay-later plans in progress");
  assert.equal(f[0].amount, 119.66); // 61.44 + 10.84 + 6.03 + 16.00 + 11.42 + 13.93, one instalment each
  assert.equal(f[0].evidence.computed.plans.length, 6);
  for (const code of CODES) assert.ok(!new RegExp(code, "i").test(f[0].detail), `the code ${code} is never shown in the feed note`);
});
