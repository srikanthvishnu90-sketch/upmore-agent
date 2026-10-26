// SERIAL-1500 (3) / SERIAL-1501: BATCH_MAX (10) is a display page, not a scope cap. A long list is drafted and approved
// ten at a time; every page's approvals stand, the send run reads approvals (not the page), and nothing about paging
// cuts what the person approved. This proves THAT and nothing wider: every protection the send path has stays as it is
// and is observed here as a fact: exact per-message approval (a changed draft is refused), the first-week warm-up of 10
// a day, the person's own number up to 30, 90-second spacing, 3 emails to one address in 30 days, do-not-contact, and
// the 7-day approval expiry, which is what bounds a long approved list in practice (a tradeoff, written up in
// docs/architect/reports/OUTREACH-CEILINGS-2026-10-26.md). No real send: a fake sender records what would have gone.
import assertNode from "node:assert/strict";
import {
  admitSend, APPROVAL_TTL_MS, BATCH_MAX, GAP_MS, MAX_DAILY, memoryOutreachStore, messageOf, OPT_OUT_LINE, OUTREACH_INTENT, type OutreachDraft, outreachTurn,
  payloadHash, runOutreachSends, type Sender, WARMUP_DAILY, WARMUP_DAYS,
} from "../../supabase/functions/_shared/career_outreach.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const U = "TEST-PAGES", TH = "TEST-PAGES-THREAD", DAY = 86_400_000;
const T0 = Date.parse("2026-10-14T15:00:00Z"); // 11:00 in New York; days advance at the same hour

async function page(store: ReturnType<typeof memoryOutreachStore>, k: number, at: number) {
  const ds: any[] = [];
  for (let n = 1; n <= BATCH_MAX; n++) {
    const i = (k - 1) * BATCH_MAX + n;
    const d: any = { n, recipient: { name: `Banker ${i} Synthetic`, firm: `Firm ${(i % 7) + 1}`, title: "Analyst", school: "", email: `banker${i}@firm${(i % 7) + 1}.example`, source: `list.csv, row ${i}` },
      subject: `Question about your path, ${i}`, body: `Hi, body ${i}.`, footer: `Sam Student\n\n${OPT_OUT_LINE}`, status: "shown", approved_hash: null, approved_at: null, sent_at: null, gmail_id: null, gmail_thread: null, result: null, created_at: new Date(at).toISOString(), hash: "", shared: [] };
    d.hash = await payloadHash(messageOf(d));
    ds.push(d);
  }
  const saved = await store.saveBatch(U, TH, ds, at);
  store.setIntent(TH, OUTREACH_INTENT);
  return saved;
}
function fakeSender(): Sender & { sent: string[] } {
  const sent: string[] = [];
  return { sent, async send(_u, m) { sent.push(m.to); return { status: "sent", id: `g${sent.length}`, thread_id: `t${sent.length}` }; } };
}
// One day of the scheduled run: runs every 100 seconds from 11:00 until a run sends nothing, as the schedule would.
async function runDay(store: any, sender: Sender, dayStartAt: number) {
  let now = dayStartAt, sentToday = 0;
  for (let k = 0; k < 60; k++) {
    const r = await runOutreachSends({ store, sender, now, tz: async () => "America/New_York" });
    if (!r.sent) return sentToday;
    sentToday += r.sent;
    now += GAP_MS + 10_000;
  }
  return sentToday;
}
const approvedCount = (store: any) => store.dump().drafts.filter((d: OutreachDraft) => d.status === "approved").length;

Deno.test("five pages of ten, each approved as shown: fifty approvals stand; the page shows ten, the run reads fifty; nothing about paging cuts the list", async () => {
  const store = memoryOutreachStore();
  await store.setPrefs(U, { daily_cap: MAX_DAILY, signature: "Sam Student" });
  for (let k = 1; k <= 5; k++) {
    await page(store, k, T0 + k * 60_000);
    const r = await outreachTurn({ message: "send all", userId: U, threadId: TH, now: T0 + k * 60_000 + 5_000, store, gmailConnected: async () => true });
    eq(r?.status, "approved", r?.reply);
    assert(/Approved 10, exactly as shown/.test(r!.reply), r!.reply);
    eq(approvedCount(store), k * BATCH_MAX, `page ${k}: every earlier page's approvals stand`);
  }
  // The page is a display: "show my drafts" shows the newest ten; the approvals are fifty.
  eq((await store.latestBatch(U)).length, BATCH_MAX);
  eq((await store.approvedDue(500)).length, 50, "the send run reads approvals, not the page");
  eq((await store.contacted(U)).size, 50, "the next page never repeats anyone already drafted");
  // Exact per-message approval: each approved hash is the message shown; a changed message is refused.
  const all = store.dump().drafts as OutreachDraft[];
  for (const d of all) eq(d.approved_hash, d.hash, `${d.recipient.email} approved exactly as shown`);
  const one = all[0], changed = { ...one, body: one.body + " and one more line" };
  eq(admitSend({ draft: changed, hash: await payloadHash(messageOf(changed)), now: T0 + DAY, dayStart: T0 + DAY - 3600_000, sends: [], firstSentAt: null, own: MAX_DAILY, dnc: false }), "changed");
  // The protections, observed: 10 a day for the first week even with 30 set and 50 approved, 90 seconds apart; nothing dropped.
  const sender = fakeSender();
  const perDay: number[] = [];
  for (let d = 1; d <= 5; d++) perDay.push(await runDay(store, sender, T0 + d * DAY));
  eq(perDay, [WARMUP_DAILY, WARMUP_DAILY, WARMUP_DAILY, WARMUP_DAILY, WARMUP_DAILY], "the first-week warm-up paces it, 10 a day");
  eq(sender.sent.length, 50, "all fifty went, none lost to paging");
  eq(new Set(sender.sent).size, 50, "each once");
  eq(store.dump().drafts.filter((d: OutreachDraft) => d.status === "sent").length, 50);
});

Deno.test("the 7-day approval expiry, not the page, is what bounds a long approved list: approvals the pace cannot reach in 7 days are dropped as expired", async () => {
  const store = memoryOutreachStore();
  await store.setPrefs(U, { daily_cap: MAX_DAILY, signature: "Sam Student" });
  for (let k = 1; k <= 10; k++) {
    await page(store, k, T0 + k * 60_000);
    eq((await outreachTurn({ message: "send all", userId: U, threadId: TH, now: T0 + k * 60_000 + 5_000, store, gmailConnected: async () => true }))?.status, "approved");
  }
  eq(approvedCount(store), 100, "a hundred approved at once, ten pages");
  const sender = fakeSender();
  const perDay: number[] = [];
  for (let d = 1; d <= 9; d++) perDay.push(await runDay(store, sender, T0 + d * DAY));
  // Days 1-6: the warm-up's 10 a day (60). Day 7: the approvals were made at T0, so the 7-day window closes during that
  // day's run: a few go before it does, and every remaining approval is dropped as expired; nothing goes on day 8 or 9.
  eq(perDay.slice(0, WARMUP_DAYS - 1), Array(WARMUP_DAYS - 1).fill(WARMUP_DAILY), `six full warm-up days: ${perDay}`);
  assert(perDay[6] > 0 && perDay[6] < WARMUP_DAILY, `day 7 is cut by the window closing mid-run: ${perDay}`);
  eq(perDay.slice(WARMUP_DAYS), [0, 0], `after the approval window nothing more goes: ${perDay}`);
  const sent = 60 + perDay[6];
  eq(sender.sent.length, sent);
  const left = store.dump().drafts as OutreachDraft[];
  eq(left.filter((d) => d.status === "sent").length, sent);
  eq(left.filter((d) => d.status === "skipped").length, 100 - sent, `the ${100 - sent} the pace could not reach in 7 days are dropped as expired, and would need approving again`);
  eq(APPROVAL_TTL_MS, 7 * DAY);
});
