// C11 (TXN-019): receipt emails that state itemized lines with a label and a number also give subtotal, tip,
// delivery fee, service fee and tax, in cents. Absent or unlabelled amounts stay null — never guessed or derived
// from the total. A totals-only receipt is unchanged apart from the new null fields.
// Check: node --test tests/receipt-items.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, "packages/domain/62-agent-documents.js"), "utf8") + "\nthis.D=AgentDocuments;", ctx);
const D = ctx.D;

test("labelled itemized lines are extracted in cents alongside merchant, total, date and order", () => {
  const email = {
    id: "m-dd1", from: "receipts@doordash.example", from_name: "DoorDash",
    subject: "Your DoorDash order receipt",
    body: [
      "Order #DD-12345", "Placed Apr 3, 2026.",
      "Subtotal $50.00", "Delivery Fee $9.00", "Service Fee: $6.50", "Tip: $7.50", "Tax $3.85",
      "Total $76.85",
    ].join("\n"),
    received_at: "2026-04-03T18:00:00Z",
  };
  const rc = D.parseReceipt(email);
  assert.equal(rc.merchant, "DoorDash");
  assert.equal(rc.total_cents, 7685);
  assert.equal(rc.subtotal_cents, 5000);
  assert.equal(rc.tip_cents, 750);
  assert.equal(rc.delivery_fee_cents, 900);
  assert.equal(rc.service_fee_cents, 650);
  assert.equal(rc.tax_cents, 385);
});

test("label variants: colon, dash, no dollar sign on the labelled line; gratuity reads as tip", () => {
  const rc = D.parseReceipt({
    from: "orders@ubereats.example", from_name: "Uber Eats", subject: "Receipt",
    body: "Subtotal: 40.00\nDelivery Fee - $4.00\nService Fee $2.00\nGratuity: $4.00\nSales Tax: $2.40\nTotal: $52.40",
    received_at: "2026-04-05T18:00:00Z",
  });
  assert.equal(rc.subtotal_cents, 4000);
  assert.equal(rc.delivery_fee_cents, 400);
  assert.equal(rc.service_fee_cents, 200);
  assert.equal(rc.tip_cents, 400);
  assert.equal(rc.tax_cents, 240);
});

test("absent fields stay null; an unlabelled amount is never taken as a tip or a fee", () => {
  const rc = D.parseReceipt({
    from: "orders@bigshop.example", from_name: "BigShop", subject: "Your order",
    body: "Thanks! You saved $4.00 today. Someone mentioned 15% and $2.99 in the footer. Order total: $28.00.",
    received_at: "2026-04-01T12:00:00Z",
  });
  assert.equal(rc.total_cents, 2800);
  assert.equal(rc.subtotal_cents, null);
  assert.equal(rc.tip_cents, null);
  assert.equal(rc.delivery_fee_cents, null);
  assert.equal(rc.service_fee_cents, null);
  assert.equal(rc.tax_cents, null);
});

test("a totals-only receipt is otherwise unchanged: the new fields are all null and the old ones are as before", () => {
  const email = { id: "m1", from: "orders@bigshop.example", from_name: "BigShop", subject: "Your BigShop order #BS-77821 has shipped", body: "Thanks for your order. Order total: $212.40. Placed Oct 9, 2026.", received_at: "2026-10-09T18:00:00Z" };
  const rc = D.parseReceipt(email);
  assert.deepEqual(
    { merchant: rc.merchant, total_cents: rc.total_cents, order: rc.order, on: rc.on, parsed: rc.parsed },
    { merchant: "BigShop", total_cents: 21240, order: "BS-77821", on: "2026-10-09", parsed: true },
  );
  for (const k of ["subtotal_cents", "tip_cents", "delivery_fee_cents", "service_fee_cents", "tax_cents"]) assert.equal(rc[k], null, k);
});

test("a subtotal is not read as the total, and the total is not derived into a subtotal", () => {
  const rc = D.parseReceipt({
    from: "receipts@doordash.example", from_name: "DoorDash", subject: "Receipt",
    body: "Subtotal $28.00\nTotal $31.50",
    received_at: "2026-04-02T12:00:00Z",
  });
  assert.equal(rc.subtotal_cents, 2800);
  assert.equal(rc.total_cents, 3150);
});
