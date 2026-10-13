// K1 conversation capture (2026-10-12): runs every K1 item's conversation through the REAL production code
// path (agent-chat's answer modules + the proactive plan(), the same functions handler.ts calls) over twins
// of the owner's real Chase rows, and writes word-for-word transcripts (.md + .messages.json) to
// ~/workspace/your_files/upmore-conversations/. Run: deno run -A --no-check tests/edge/k1-capture.ts
import { moneyReply } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { feeAuditReply } from "../../supabase/functions/agent-chat/_shared/fee_audit_answer.ts";
import { paycheckReply } from "../../supabase/functions/agent-chat/_shared/paycheck_answer.ts";
import { tipFeesReply } from "../../supabase/functions/agent-chat/_shared/tip_fees_answer.ts";
import { budgetReply } from "../../supabase/functions/agent-chat/_shared/budget_answer.ts";
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
// @ts-ignore: plain JS domain through the generated bundle
import { Budgets } from "../../supabase/functions/_shared/router_core.js";
import { K1_ACCOUNTS, K1_TX } from "./k1-fixtures.ts";

const OUT = "/home/hatch/workspace/your_files/upmore-conversations";
const NOW = new Date("2026-10-12T20:05:00Z");
const TZ = { tz: "America/Chicago" };
const read = { accounts: async () => K1_ACCOUNTS, transactions: async () => K1_TX };
const NOWMS = Date.UTC(2026, 9, 12, 20, 0, 0);
type Msg = { who: "user" | "agent"; text: string };

async function save(slug: string, title: string, header: string, convos: { label: string; messages: Msg[] }[]) {
  let md = `# ${title}\n\n${header}\n`;
  const all: Msg[] = [];
  for (const c of convos) {
    md += `\n## ${c.label}\n\n`;
    for (const m of c.messages) md += `${m.who === "user" ? "USER" : "UPMORE"}: ${m.text}\n---\n`;
    all.push(...c.messages);
  }
  await Deno.writeTextFile(`${OUT}/${slug}.md`, md);
  await Deno.writeTextFile(`${OUT}/${slug}.messages.json`, JSON.stringify({ title, messages: all }, null, 1));
  console.log("wrote", slug);
}
const U = (text: string): Msg => ({ who: "user", text });
const A = (text: string): Msg => ({ who: "agent", text });
const HDR = (data: string) => `Production code path (agent-chat answer modules / proactive plan(), the functions handler.ts calls), ${data}, "now" Oct 12, 2026, America/Chicago. Every message below is complete and word-for-word, both directions, nothing trimmed.`;
const REAL = "over twins of the owner's real Chase rows pulled fresh from SimpleFIN on 2026-10-12 (descriptors twinned; amounts, dates and balances are the real rows' values)";

// ---------- C1 ----------
{
  const msgs: Msg[] = [];
  for (const q of ["Where did my money go in September?", "how much did i spend on groceries in september", "how much did i spend on sports betting in september", "how much did i spend on prediction markets in september", "how much did i spend on pay-later in september"]) {
    msgs.push(U(q), A((await moneyReply(q, NOW, read, TZ))!));
  }
  await save("C1-show-me-exactly-where-my-money-went", "C1 — Show me exactly where my money went", HDR(REAL), [{ label: "September, with category drill-downs", messages: msgs }]);
}
// ---------- C3 ----------
{
  const msgs = [U("How much can I actually spend right now?"), A((await moneyReply("How much can I actually spend right now?", NOW, read, TZ))!)];
  const withBuffer = await moneyReply("How much can I actually spend right now?", NOW, read, { ...TZ, buffer_cents: 10000 });
  await save("C3-safe-to-spend-number", "C3 — Safe-to-spend number", HDR(REAL) + "\n\nAdversarial variant: the same ask with a $100 buffer in the person's settings (the number drops by exactly the buffer).", [
    { label: "The headline ask on the real rows", messages: msgs },
    { label: "Variant — with a $100 buffer set", messages: [U("How much can I actually spend right now? (with my $100 buffer)"), A(withBuffer!)] },
  ]);
}
// ---------- C4 ----------
{
  const fc = (await moneyReply("Am I going to make it to payday?", NOW, read, TZ))!;
  const prev = { ...read, previous: async () => [{ role: "assistant", content: fc }] };
  const math = (await moneyReply("show me the math", NOW, prev, TZ))!;
  const p = plan({ accounts: mapAccounts(K1_ACCOUNTS as any), transactions: mapTransactions(K1_TX as any), settings: { time_zone: "America/Chicago" }, sent: [] } as any, NOWMS);
  const watch = p.messages.find((m: any) => m.key.startsWith("watch:low_balance"))!;
  await save("C4-cash-flow-forecast", "C4 — Cash-flow forecast", HDR(REAL) + "\n\nThe third message is the proactive low-balance watch from the same day's plan() run: the day-by-day projection including everyday spending, naming the exact day the balance breaks the $100 buffer.", [
    { label: "Forecast, then its math", messages: [U("Am I going to make it to payday?"), A(fc), U("show me the math"), A(math)] },
    { label: "Proactive — the same projection pushed before he asks", messages: [A(watch.text)] },
  ]);
}
// ---------- C5 ----------
{
  const subs = (await moneyReply("what subscriptions do I have?", NOW, read, TZ))!;
  const nf = ["2026-07-15", "2026-08-15", "2026-09-15"].map((d, i) => ({ account_id: "chk", provider_transaction_id: "nf" + i, amount_cents: -1549, posted_on: d, merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" }));
  nf.push({ account_id: "chk", provider_transaction_id: "nf3", amount_cents: -1799, posted_on: "2026-10-11", merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" });
  const payroll = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((d, i) => ({ account_id: "chk", provider_transaction_id: "pay" + i, amount_cents: 180000, posted_on: d, merchant_raw: "ACME CORP PAYROLL DIR DEP", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" }));
  const input = (sent: any[]) => ({ accounts: mapAccounts(K1_ACCOUNTS as any), transactions: mapTransactions([...payroll, ...K1_TX, ...nf] as any), settings: { time_zone: "America/Chicago" }, sent } as any);
  const p1 = plan(input([]), NOWMS);
  let sent = p1.messages.map((m: any) => ({ key: m.key, sent_at: NOWMS, cadence: !!m.cadence }));
  let creep: any = null;
  for (let d = 1; d <= 7 && !creep; d++) {
    const p = plan(input(sent), NOWMS + d * 86400000);
    creep = p.messages.find((m: any) => /went up/.test(m.text)) || null;
    sent = sent.concat(p.messages.map((m: any) => ({ key: m.key, sent_at: NOWMS + d * 86400000, cadence: !!m.cadence })));
  }
  await save("C5-subscription-creep-watch", "C5 — Subscription creep watch", HDR(REAL) + "\n\nThe creep conversation uses a STAND-IN planted merchant (Netflix $15.49 x3, then $17.99 on Oct 11) layered on the real feed — the owner's real rows contain no price increase. The finding is generated on day 1 and held by the proactive daily budget behind the urgent low-balance watch; it surfaces on a following day's run, once.", [
    { label: "The subscription list on the real rows (honestly empty)", messages: [U("what subscriptions do I have?"), A(subs)] },
    { label: "Proactive — the planted rise is caught and quantified (stand-in merchant, real feed)", messages: [A(creep.text)] },
  ]);
}
// ---------- C6 ----------
{
  const msgs: Msg[] = [];
  for (const q of ["How much am I spending on Rebet, really?", "How much am I spending on Kalshi, really?"]) msgs.push(U(q), A((await moneyReply(q, NOW, read, TZ))!));
  await save("C6-category-behavior-tracker", "C6 — Category behavior tracker", HDR(REAL), [{ label: "Merchant totals across every account, trailing 30/90 days", messages: msgs }]);
}
// ---------- C7 ----------
{
  const chat = (await moneyReply("What's this $15.31 Kalshi charge?", NOW, read, TZ))!;
  const tx = (id: string, on: string, cents: number, merchant: string) => ({ account_id: "chk", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed", fetched_at: "2026-10-12T19:30:00Z" });
  const rows = [
    ...["2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"].map((d, i) => tx("sd" + i, d, -1199, "SPOTIFY")),
    ...["2026-07-07", "2026-08-07", "2026-09-07", "2026-10-07"].map((d, i) => tx("sa" + i, d, -1199, "APL*ITUNES")),
  ];
  const p = plan({ accounts: mapAccounts(K1_ACCOUNTS as any), transactions: mapTransactions(rows as any), settings: { time_zone: "America/Chicago" }, sent: [] } as any, NOWMS);
  const dbl = p.messages.find((m: any) => /paid for 2 times over/.test(m.text))!;
  await save("C7-duplicate-and-overlapping-charge-detector", "C7 — Duplicate and overlapping charge detector", HDR(REAL) + "\n\nThe doubled-subscription push uses STAND-IN rows (Spotify direct + via App Store, the classic double) — the owner's real rows contain no doubled subscription; his real double is the Kalshi charge in conversation 1.", [
    { label: "The real double charge, asked in chat", messages: [U("What's this $15.31 Kalshi charge?"), A(chat)] },
    { label: "Proactive — a doubled subscription pushed with its cancel path (stand-in rows)", messages: [A(dbl.text)] },
  ]);
}
// ---------- C9 ----------
{
  const msgs = [U("Can I afford a $1,200 couch?"), A((await moneyReply("Can I afford a $1,200 couch?", NOW, read, TZ))!)];
  await save("C9-can-i-afford-this", "C9 — Can I afford this", HDR(REAL), [{ label: "A $1,200 couch against the real safe-to-spend", messages: msgs }]);
}
// ---------- C10 ----------
{
  const r = (await feeAuditReply("What did banks and cards charge me this year?", NOW, read, TZ))!;
  await save("C10-fee-audit", "C10 — Fee audit", HDR(REAL), [{ label: "Trailing-12-month fee audit", messages: [U("What did banks and cards charge me this year?"), A(r)] }]);
}
// ---------- C11 ----------
{
  const r = (await tipFeesReply("Are delivery fees getting worse?", NOW, { receipts: async () => [], transactions: async () => K1_TX }, TZ))!;
  await save("C11-tip-and-junk-fee-inflation-tracker", "C11 — Tip and junk-fee inflation tracker", HDR(REAL) + "\n\nNOT FINISHED: receipt ingestion is not built, so no itemized receipts exist on file and this honest none-on-file answer is all the production path can say today.", [{ label: "The headline ask, answered honestly", messages: [U("Are delivery fees getting worse?"), A(r)] }]);
}
// ---------- C12 ----------
{
  const real = (await paycheckReply("Did my paycheck land?", NOW, read, TZ))!;
  let n = 0;
  const prow = (d: string, c: number) => ({ account_id: "chk", provider_transaction_id: "p" + (++n), amount_cents: c, posted_on: d, merchant_raw: "ACME PAYROLL DIRECT DEP", is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T19:30:00Z" });
  const short = [prow("2026-08-14", 200000), prow("2026-08-28", 200000), prow("2026-09-11", 200000), prow("2026-09-25", 200000), prow("2026-10-09", 170000)];
  const shortR = (await paycheckReply("is my paycheck short?", NOW, { accounts: read.accounts, transactions: async () => short }, TZ))!;
  const missing = [prow("2026-08-28", 200000), prow("2026-09-11", 200000), prow("2026-09-25", 200000)];
  const missR = (await paycheckReply("did my paycheck land?", NOW, { accounts: read.accounts, transactions: async () => missing }, TZ))!;
  await save("C12-income-reconciliation", "C12 — Income reconciliation", HDR(REAL) + "\n\nConversations 2-3 use a STAND-IN payroll pattern (biweekly $2,000.00 from 'Acme Payroll') — the owner's real feed has no payroll deposits (his income arrives as Zelle, Venmo and platform payouts), so the short/missing machinery is proven on a stand-in pattern and flagged as such.", [
    { label: "The real feed: no paycheck pattern exists, said plainly", messages: [U("Did my paycheck land?"), A(real)] },
    { label: "Stand-in payroll — a paycheck $300.00 short", messages: [U("is my paycheck short?"), A(shortR)] },
    { label: "Stand-in payroll — a missing cycle", messages: [U("did my paycheck land?"), A(missR)] },
  ]);
}
// ---------- C16 ----------
{
  const set = (Budgets as any).command("Cap restaurants at $400 a month", [], NOW, "America/Chicago");
  const budgets = set.watches;
  const status = (await budgetReply("how are my budgets doing?", NOW, { budgets: async () => budgets, transactions: async () => K1_TX }, TZ))!;
  const report = (Budgets as any).monthlyReport(budgets, K1_TX.map((t: any) => ({ ...t, posted_at: t.posted_on, amount: t.amount_cents / 100 })), "2026-09", TZ);
  await save("C16-budgets-that-actually-enforce", "C16 — Budgets that actually enforce", HDR(REAL) + "\n\nThe cap is set in the capability's own words (production path: Budgets.command, the settings-command path handler.ts routes budget sets to), then tracked against the real rows. September's monthly report text is the domain's monthlyReport over the real September rows.", [
    { label: "Set the cap, then ask how it's doing", messages: [U("Cap restaurants at $400 a month"), A(set.reply), U("how are my budgets doing?"), A(status)] },
    { label: "The September monthly report (caps vs actuals)", messages: [A(report.text)] },
  ]);
}
// ---------- C193 ----------
{
  const r = (await feeAuditReply("Am I getting fleeced abroad?", NOW, read, TZ))!;
  await save("C193-foreign-transaction-fee-audit", "C193 — Foreign transaction fee audit", HDR(REAL), [{ label: "The capability's headline ask", messages: [U("Am I getting fleeced abroad?"), A(r)] }]);
}
// ---------- C201 ----------
{
  const { annualCheckupReply } = await import("../../supabase/functions/agent-chat/_shared/annual_checkup_answer.ts");
  const report = (await annualCheckupReply("Run my annual money checkup", NOW, read, TZ))!;
  const checkup = (await moneyReply("How am I doing?", NOW, read, TZ))!;
  await save("C201-annual-money-checkup", "C201 — Annual money checkup", HDR(REAL) + "\n\nBuilt this run (annual_checkup_answer.ts, wired in handler.ts): one composed report over accounts, the fee scan, recurring run-rates, pay-later, the year's in/out and rates/policies, each with its dollars at stake and its approval-gated handoff. It executes nothing itself — approved actions run through their own capabilities behind their own approval cards. Conversation 2 is the monthly checkup surface for contrast.", [
    { label: "The annual checkup, composed over the real rows", messages: [U("Run my annual money checkup"), A(report)] },
    { label: "For contrast — the monthly checkup", messages: [U("How am I doing?"), A(checkup)] },
  ]);
}
// ---------- C165 ----------
{
  const { form1099Reply } = await import("../../supabase/functions/agent-chat/_shared/form1099_answer.ts");
  const noForms = (await form1099Reply("Reconcile my 1099 income", NOW, { ...read, forms1099: async () => [] }, TZ))!;
  const forms = [
    { payer: "Venmo", amount_cents: 100000, kind: "1099-K", year: 2026 },
    { payer: "Rebet", amount_cents: 90000, kind: "1099-MISC", year: 2026 },
  ];
  const withForms = (await form1099Reply("do my 1099s match what I actually got paid?", NOW, { ...read, forms1099: async () => forms }, TZ))!;
  await save("C165-reconcile-my-1099-income", "C165 — Reconcile my 1099 income", HDR(REAL) + "\n\nConversation 1 is the live state today: no 1099 forms are on file (2026 forms are issued in January), so the answer is the full deposit-side reconciliation over his real rows. Conversation 2 adds STAND-IN forms (Venmo 1099-K $1,000.00, Rebet 1099-MISC $900.00) to prove the match: both deltas are flagged in dollars.", [
    { label: "The deposit side on the real rows (no forms on file yet)", messages: [U("Reconcile my 1099 income"), A(noForms)] },
    { label: "The match, on stand-in forms", messages: [U("do my 1099s match what I actually got paid?"), A(withForms)] },
  ]);
}
console.log("done");
