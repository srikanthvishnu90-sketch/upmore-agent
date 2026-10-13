// K6 doorstep evidence: the built flows driven to the doorstep of the real action — filled in, ready,
// STOPPED before the executing tap — rendered from the production modules' actual outputs.
// Environment: sandbox P2P rail (labeled). Real rails are handoff-mode by design (54-agent-money.js:
// the agent stages, the owner taps in their own app) and NOT_WIRED for agent execution; there is no
// manual-connect playbook for Venmo/Zelle/Netflix in the product, so no login screen exists in this
// environment to photograph — the owner's own app/account session is the live doorstep, pending his lane.
// Usage: node scripts/k6-doorstep.cjs
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, "..", "your_files", "upmore-conversations");
const ctx = vm.createContext({});
vm.runInContext(["48-money-math.js", "42-agent-recipients.js", "43-agent-loop.js", "47-data-guard.js", "54-agent-money.js", "60-agent-money-plans.js", "105-iou-log.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.MP=AgentMoneyPlans;", ctx);
const MP = ctx.MP;
const people = [
  { id: "p1", name: "Sarah M", handle: "@sarah-m", rails: ["venmo"], history: [{ amount_cents: 8500, on: "2026-09-01" }] },
  { id: "p5", name: "Maya", handle: "@maya", rails: ["cash_app"], history: [] },
  { id: "p6", name: "Priya N", handle: "@priya-n", rails: [], history: [] },
];
const DINNER = { id: "tx-dinner", account_id: "chk", posted_at: "2026-10-08", posted_on: "2026-10-08", amount_cents: -9600, merchant_raw: "SQ *ALLEY CAT CAFE", is_pending: false, is_transfer: false };
const entries = MP.fromTaggedTransaction(DINNER, { shared_with: ["Sarah M", "Maya"], paid_by: "me", what: "Alley Cat Cafe dinner" }).entries
  .concat([{ id: "iou-taxi-priya", name: "Priya N", direction: "owes_me", amount_cents: 1500, original_cents: 1500, note: "taxi", created_on: "2026-10-09", status: "open", transaction_id: "tx-taxi" }]);
const rail = MP.sandboxRail();
const col = MP.collectAll(entries, { people, today: "2026-10-10", sandbox_rail: rail });
const reqRows = col.requests.map(r => ({
  request: `${r.name} (${(people.find(p => p.id === r.from) || {}).handle || "no handle"})`,
  amount: "$" + (r.amount_cents / 100).toFixed(2),
  note: r.what,
  rail: r.rail || "none on file",
  state: r.sandbox_ref ? `READY — staged, sandbox ref ${r.sandbox_ref}; the executing tap is yours in the app — NOT tapped` : "NOT_WIRED — no rail on file; draft only, cannot be tapped ready",
}));
fs.writeFileSync(path.join(outDir, "C13-shared-expense-ledger.doorstep.json"), JSON.stringify({ title: "DOORSTEP (sandbox rail) — settle-up requests filled in and ready, NOT sent", rows: reqRows.slice(0, 2), note: "Environment: sandbox P2P rail. Real Venmo/Cash App are handoff rails: Upmore stages, you tap Request in your own app session. Reached the doorstep, action ready, not executed." }, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "C135-collect-money-owed-to-me.doorstep.json"), JSON.stringify({ title: "DOORSTEP (sandbox rail) — collection requests filled in and ready, NOT sent", rows: reqRows, note: "Environment: sandbox P2P rail. Priya N has no rail on file (NOT_WIRED) — her request cannot reach a doorstep until she has a rail. Reached the doorstep, action ready, not executed." }, null, 2) + "\n");

const household = [
  { id: "a1", name: "Asha", handle: "@asha", rails: ["venmo"], history: [] },
  { id: "a2", name: "Ravi", handle: "@ravi", rails: ["zelle"], history: [] },
  { id: "a3", name: "Meera", handle: "@meera", rails: ["venmo"], history: [] },
];
const oct = MP.subscriptionShares({ service: "Netflix", plan_label: "Netflix Premium", month: "2026-10", members: ["Asha", "Ravi", "Meera"], charge: { id: "tx-nfx-2026-10", amount_cents: 2299, posted_on: "2026-10-03", merchant_raw: "NETFLIX.COM" } }, { people: household, today: "2026-10-03" });
fs.writeFileSync(path.join(outDir, "C181-family-subscription-cost-sharing.doorstep.json"), JSON.stringify({
  title: "DOORSTEP (stand-in household) — plan members enumerated, cost-share requests filled in and ready, NOT sent",
  rows: oct.shares.map(s => ({ member: s.who === "me" ? "You (plan holder)" : s.who, share: "$" + (s.cents / 100).toFixed(2), state: s.who === "me" ? "your own share — no request" : "READY — cost-share request filled in; the executing tap is yours — NOT tapped" })),
  note: "Environment: local flow on stand-in members. Enumerating the REAL members needs your Netflix account session (no Netflix playbook exists in the product) — live session pending your browser lane. Reached the doorstep, action ready, not executed.",
}, null, 2) + "\n");
console.log("doorstep data written");
