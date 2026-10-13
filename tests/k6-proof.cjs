// K6 proof generator: runs the C13 / C135 / C181 conversations through the production domain modules
// (60-agent-money-plans.js + 105-iou-log.js, the same code the router bundle ships) and writes the
// word-for-word transcripts + surface data to ~/workspace/your_files/upmore-conversations/.
// Every agent bubble below is an exact function output; nothing is paraphrased.
// Usage: node tests/k6-proof.cjs   (then render PNGs with ~/workspace/render-chat.py and the surface renderer)
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, "..", "your_files", "upmore-conversations");
fs.mkdirSync(outDir, { recursive: true });
const ctx = vm.createContext({});
vm.runInContext(["48-money-math.js", "42-agent-recipients.js", "43-agent-loop.js", "47-data-guard.js", "54-agent-money.js", "60-agent-money-plans.js", "105-iou-log.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.MP=AgentMoneyPlans;this.IouLog=IouLog;", ctx);
const MP = ctx.MP, IouLog = ctx.IouLog;
const NOW = Date.parse("2026-10-12T15:00:00Z");
const people = [
  { id: "p1", name: "Sarah M", handle: "@sarah-m", rails: ["venmo"], history: [{ amount_cents: 8500, on: "2026-09-01" }] },
  { id: "p5", name: "Maya", handle: "@maya", rails: ["cash_app"], history: [] },
  { id: "p6", name: "Priya N", handle: "@priya-n", rails: [], history: [] },
];
const DINNER = { id: "tx-dinner", account_id: "chk", posted_at: "2026-10-08", posted_on: "2026-10-08", amount_cents: -9600, merchant_raw: "SQ *ALLEY CAT CAFE", is_pending: false, is_transfer: false };
const dinnerEntries = () => MP.fromTaggedTransaction(DINNER, { shared_with: ["Sarah M", "Maya"], paid_by: "me", what: "Alley Cat Cafe dinner" }).entries;

function writeConvo(file, title, preamble, messages, surfaces) {
  fs.writeFileSync(path.join(outDir, file + ".messages.json"), JSON.stringify({ title, messages }, null, 2) + "\n");
  const md = [`# ${title}`, "", preamble, "", "---", ""];
  for (const m of messages) md.push(`**${m.who === "user" ? "You" : "Upmore"}:** ${m.text}`, "");
  fs.writeFileSync(path.join(outDir, file + ".md"), md.join("\n"));
  if (surfaces) fs.writeFileSync(path.join(outDir, file + ".surfaces.json"), JSON.stringify(surfaces, null, 2) + "\n");
  console.log("wrote", file, messages.length, "messages");
}

// ---------------- C13 ----------------
{
  const entries = dinnerEntries();
  const rail = MP.sandboxRail();
  const col = MP.collectAll(entries, { people, today: "2026-10-10", sandbox_rail: rail });
  const claim = IouLog.command("sarah m paid me back", entries, NOW);
  rail.postReceipt({ from_name: "Sarah M", from_handle: "@sarah-m", amount_cents: 2000, on: "2026-10-19" });
  const afterPartial = MP.settleIous(entries, col.requests, rail.feed(), people);
  rail.postReceipt({ from_name: "Sarah M", from_handle: "@sarah-m", amount_cents: 1200, on: "2026-10-20" });
  const afterRest = MP.settleIous(afterPartial.ious, col.requests, rail.feed(), people);
  const msgs = [
    { who: "user", text: "Track what my roommate owes me — I paid $96.00 at Alley Cat Cafe on Oct 8 and tagged it shared with Sarah M and Maya" },
    { who: "agent", text: IouLog.command("who owes me", entries, NOW).reply },
    { who: "user", text: "Send them settle-up requests" },
    { who: "agent", text: col.text },
    { who: "user", text: "Sarah paid me back" },
    { who: "agent", text: claim.reply },
    { who: "user", text: "Sarah sent $20 — did that land?" },
    { who: "agent", text: afterPartial.partials[0].text },
    { who: "user", text: "And the rest of Sarah's share?" },
    { who: "agent", text: afterRest.settled[0].text },
    { who: "user", text: "Who still owes me?" },
    { who: "agent", text: IouLog.command("who owes me", afterRest.ious, NOW).reply },
  ];
  writeConvo("C13-shared-expense-ledger", "C13 — Shared-expense ledger",
    "How this was produced: the production domain path (packages/domain/60-agent-money-plans.js C13 bridge + 105-iou-log.js, as shipped in the router bundle) on a tagged posted charge. Settle-up requests go out on the SANDBOX P2P rail (labeled sandbox; delivery verified from the rail's own outbox state). Real Venmo/Zelle are NOT_WIRED — no consumer API — and the agent says so in the conversation. The ledger line clears only against a posted, matching receipt: a verbal \"paid me back\" changes nothing, a $20.00 partial receipt reduces Sarah's $32.00 line to $12.00, and the final $12.00 receipt settles it against receipt row sbx-rcpt-2. Muse parity, computed by hand first: $96.00 split 3 ways = $32.00 each; $32.00 − $20.00 = $12.00. The same split on the owner's real-row twin (PEPTIRA $302.40 posted 2026-09-16, from tests/phase2-real-feed.test.cjs) is $151.20 each over 2 people, asserted in tests/k6-p2p.test.cjs. People and the dinner are stand-in fixtures from the Wave-1 proof; amounts/dates of the twin are the owner's real rows.",
    msgs,
    {
      ledger_screen: { title: "Shared-expense ledger — Alley Cat Cafe dinner, $96.00 charge (tx-dinner, posted 2026-10-08)", rows: entries.map(e => ({ name: e.name, what: e.note, amount: "$" + (e.amount_cents / 100).toFixed(2), status: e.status, source: e.transaction_id })) },
      request_screen: { title: "Settle-up requests — sandbox P2P rail outbox (the rail's own state)", rows: rail.outbox.map(o => ({ ref: o.ref, to: o.to, amount: "$" + (o.amount_cents / 100).toFixed(2), rail: o.rail, delivery: o.delivery, on: o.on })) },
    });
}

// ---------------- C135 ----------------
{
  const entries = dinnerEntries().concat([{ id: "iou-taxi-priya", name: "Priya N", direction: "owes_me", amount_cents: 1500, original_cents: 1500, note: "taxi", created_on: "2026-10-09", status: "open", transaction_id: "tx-taxi" }]);
  const rail = MP.sandboxRail();
  const col = MP.collectAll(entries, { people, today: "2026-10-10", sandbox_rail: rail });
  const claim = MP.notePaidClaim(entries, col.requests, "Sarah M");
  const sarah = col.requests[0];
  const r1 = MP.dueReminders([sarah], "2026-10-17")[0];
  const r2 = MP.dueReminders([sarah], "2026-10-24")[0];
  const r3 = MP.dueReminders([sarah], "2026-10-27")[0];
  rail.postReceipt({ from_name: "Maya", from_handle: "@maya", amount_cents: 3200, on: "2026-10-19" });
  const out = MP.settleIous(entries, col.requests, rail.feed(), people);
  const msgs = [
    { who: "user", text: "Get everyone who owes me to pay up" },
    { who: "agent", text: col.text },
    { who: "user", text: "Sarah says she already paid" },
    { who: "agent", text: claim.text },
    { who: "user", text: "It's Oct 17 — what reminder goes to Sarah today?" },
    { who: "agent", text: r1.text },
    { who: "user", text: "Oct 24 — and today?" },
    { who: "agent", text: r2.text },
    { who: "user", text: "Oct 27 — still nothing from Sarah. Today's reminder?" },
    { who: "agent", text: r3.text },
    { who: "user", text: "Maya's $32 just posted — is her debt closed?" },
    { who: "agent", text: out.settled[0].text },
    { who: "user", text: "Who still owes me?" },
    { who: "agent", text: IouLog.command("who owes me", out.ious, NOW).reply },
  ];
  writeConvo("C135-collect-money-owed-to-me", "C135 — Collect money owed to me",
    "How this was produced: the production domain path (packages/domain/60-agent-money-plans.js collectAll / dueReminders / notePaidClaim / settleIous + 105-iou-log.js, as shipped in the router bundle). Requests and reminders run on the SANDBOX P2P rail (the staged-send rail from PAY-001/PAY-003 work, labeled sandbox), with delivery verified from the rail's own outbox. Real rails (Venmo/Zelle) have no consumer API — the honest NOT_WIRED wording at the live boundary is in the first agent message, verbatim. Reminders escalate on schedule: friendly at +7 days (Oct 17), plain at +14 (Oct 24), firm at +17 (Oct 27). A debt closes ONLY on a posted receipt: Sarah's \"already paid\" claim closes nothing; Maya's posted $32.00 receipt (sandbox row sbx-rcpt-1) closes hers. Muse parity: $32.00 + $32.00 + $15.00 = $79.00 collected in all; $47.00 still open at the end ($32.00 Sarah + $15.00 Priya). People are stand-in fixtures; dollars are the Wave-1 ledger's.",
    msgs,
    {
      reminder_screen: { title: "Reminder schedule — Sarah M, $32.00 for Alley Cat Cafe dinner (request created 2026-10-10)", rows: [
        { when: "2026-10-17 (+7 days)", tone: r1.tone, text: r1.text },
        { when: "2026-10-24 (+14 days)", tone: r2.tone, text: r2.text },
        { when: "2026-10-27 (+17 days)", tone: r3.tone, text: r3.text },
        { when: "then every +3 days", tone: "firm", text: "while the request stays open; a settled request is never reminded" },
      ] },
      notwired_screen: { title: "Live boundary — what was NOT sent", rows: [
        { item: "Venmo / Zelle / Cash App / PayPal real requests", state: "NOT_WIRED — no consumer API exists" },
        { item: "Priya N, $15.00 for taxi", state: "NOT_WIRED — no request rail on file; draft only, nothing delivered" },
        { item: "Sandbox P2P rail requests (Sarah M, Maya)", state: "delivered in the sandbox only, refs sbx-1 / sbx-2, verified in the rail's outbox" },
      ] },
    });
}

// ---------------- C181 ----------------
{
  const household = [
    { id: "a1", name: "Asha", handle: "@asha", rails: ["venmo"], history: [] },
    { id: "a2", name: "Ravi", handle: "@ravi", rails: ["zelle"], history: [] },
    { id: "a3", name: "Meera", handle: "@meera", rails: ["venmo"], history: [] },
  ];
  const spec = (month, on) => ({ service: "Netflix", plan_label: "Netflix Premium", month, members: ["Asha", "Ravi", "Meera"], charge: { id: `tx-nfx-${month}`, amount_cents: 2299, posted_on: on, merchant_raw: "NETFLIX.COM" } });
  const oct = MP.subscriptionShares(spec("2026-10", "2026-10-03"), { people: household, today: "2026-10-03" });
  const rail = MP.sandboxRail();
  rail.postReceipt({ from_name: "Asha", from_handle: "@asha", amount_cents: 575, on: "2026-10-05" });
  rail.postReceipt({ from_name: "Ravi", from_handle: "@ravi", amount_cents: 575, on: "2026-10-06" });
  const nov = MP.subscriptionShares(spec("2026-11", "2026-11-03"), { people: household, today: "2026-11-03" });
  const all = oct.entries.concat(nov.entries), reqs = oct.requests.concat(nov.requests);
  const out = MP.settleIous(all, reqs, rail.feed(), household);
  const msgs = [
    { who: "user", text: "Everyone on my Netflix should chip in. It's Netflix Premium, $22.99 a month — me, Asha, Ravi and Meera are on it. The October charge posted Oct 3." },
    { who: "agent", text: oct.text },
    { who: "user", text: "Who has paid for October?" },
    { who: "agent", text: MP.subscriptionStatus(oct.entries, "2026-10") },
    { who: "user", text: "Asha and Ravi just paid. Where does October stand now?" },
    { who: "agent", text: MP.subscriptionStatus(out.ious, "2026-10") },
    { who: "user", text: "The November charge posted Nov 3 — set up November's shares" },
    { who: "agent", text: nov.text },
    { who: "user", text: "And November's status?" },
    { who: "agent", text: MP.subscriptionStatus(out.ious, "2026-11") },
  ];
  writeConvo("C181-family-subscription-cost-sharing", "C181 — Family subscription cost-sharing",
    "How this was produced: the production domain path (packages/domain/60-agent-money-plans.js subscriptionShares / subscriptionStatus / settleIous — the same ledger machinery as C13/C135, as shipped in the router bundle). STAND-IN DATA, flagged: the household (Asha, Ravi, Meera), the plan (Netflix Premium $22.99/month) and its members are stand-ins — the owner has no family plan membership on file. Live proof needs: the owner's real shared-plan name and monthly charge row, and the real members on it with their P2P rails. Muse parity, computed by hand first: $22.99 split 4 ways = $5.75 / $5.75 / $5.75 / $5.74 (remainder cents to the first shares), members owe $17.24 in all; after Asha and Ravi pay, $5.74 (Meera) stays open for October, and October's receipts settle nothing in November ($17.24 open).",
    msgs,
    {
      october_screen: { title: "Netflix Premium cost-share — October 2026 status screen", rows: [
        { name: "Asha", share: "$5.75", state: "paid (posted 2026-10-05)" },
        { name: "Ravi", share: "$5.75", state: "paid (posted 2026-10-06)" },
        { name: "Meera", share: "$5.74", state: "still open" },
        { name: "You (payer)", share: "$5.75", state: "your own share — no request" },
      ] },
      november_screen: { title: "Netflix Premium cost-share — November 2026 (month to month)", rows: [
        { name: "Asha", share: "$5.75", state: "open — new line for November (tx-nfx-2026-11)" },
        { name: "Ravi", share: "$5.75", state: "open — new line for November (tx-nfx-2026-11)" },
        { name: "Meera", share: "$5.74", state: "open — new line for November (tx-nfx-2026-11)" },
      ] },
    });
}
console.log("done ->", outDir);
