// A refund the person was promised (capability list item 38): "tell me if my $45.99 Amazon refund doesn't arrive by
// Oct 20" becomes a watch through the chat's settings command (_shared/proactive.ts parseCommand over
// AgentAlerts.parseWatch), restated with the deadline in the person's own day, stored so the table's checks pass, and the
// hourly plan() says the refund posting, or its being late, once. Rows are MOCK. Permission-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, parseCommand, settingsMessage, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows } from "./lib/proactive_fixture.ts";

const TZ = "America/New_York";
const SET = Date.UTC(2026, 9, 12, 15, 0); // Mon Oct 12, 11 a.m. in New York
const at = (d: number, h = 14) => Date.UTC(2026, 9, d, h, 0); // 10 a.m. New York on Oct d
const tx = (on: string, cents: number, merchant: string, id: string) => ({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });

function stored(message: string) {
  const c = parseCommand(message, { time_zone: TZ, watches: [] } as any, SET)!;
  return { reply: c.reply, watches: (c.settings.watches || []) as any[] };
}
const refundMsgs = (watches: any[], extra: any[], now: number, sent: any[] = []) =>
  plan({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows(extra)), settings: { time_zone: TZ, watches, alerts: true } as any, sent }, now).messages.filter((m: any) => /^watch:.*:(posted|other|overdue)/.test(m.key));

Deno.test("set in chat: restated with the deadline from today, saved with the person's day, storable", async () => {
  const s = stored("tell me if my $45.99 Amazon refund doesn't arrive by Oct 20");
  assertEquals(s.reply, "I'll tell you when the $45.99 refund from Amazon posts, and if it hasn't by Oct 20, 2026. Say \"show my alerts\" to see them.");
  assertEquals(s.watches.map((w) => [w.kind, w.merchant, w.amount_cents, w.created_on]), [["refund_expected", "Amazon", 4599, "2026-10-12"]]);
  assert(!/\d{9,}/.test(JSON.stringify(s.watches)), "the table refuses a 9-digit run");
  const b = stored("alert me if my Delta refund hasn't come in within 7 business days");
  assertEquals(b.reply, "I'll tell you when the refund from Delta posts, and if it hasn't by Oct 21, 2026 (7 business days, weekends skipped; bank holidays aren't counted). Say \"show my alerts\" to see them.");
  // Saved through the person's session like any other watch.
  const saves: any[] = [];
  const r = await settingsMessage("text me when my $120 refund from REI shows up", { async read() { return { ok: true, settings: { time_zone: TZ, watches: [] } }; }, async save(c: any) { saves.push(c); return true; } }, SET);
  assertEquals(r!.changed, true);
  assertEquals(saves[0].watches[0].merchant, "REI");
});

Deno.test("the hourly run says the refund posting once, and nothing is late after it came in", () => {
  const w = stored("tell me if my $45.99 Amazon refund doesn't arrive by Oct 20").watches;
  const refund = [tx("2026-10-14", 4599, "AMAZON.COM REFUND", "r1")];
  const m = refundMsgs(w, refund, at(14));
  assertEquals(m.map((x: any) => x.kind), ["watch"]);
  assert(m[0].text.startsWith("The $45.99 refund from Amazon posted on Oct 14, 2026: $45.99"), m[0].text);
  assertEquals(refundMsgs(w, refund, at(21)).filter((x: any) => /overdue/.test(x.key)), [], "never late once it posted");
});

Deno.test("late: said the day after the deadline, once, with what was checked; quiet hours don't hold what the person asked for", () => {
  const w = stored("tell me if my $45.99 Amazon refund doesn't arrive by Oct 20").watches;
  const rows = [tx("2026-10-20", -1500, "CHIPOTLE 1234", "c1")];
  assertEquals(refundMsgs(w, rows, at(20)), [], "the deadline day is not late");
  const late = refundMsgs(w, rows, at(21));
  assertEquals(late.map((x: any) => x.key), [`watch:watch:${w[0].id}:overdue`]);
  assert(late[0].text.includes("hasn't posted: it was due by Oct 20, 2026") && late[0].text.includes("Nothing was sent."), late[0].text);
  const again = refundMsgs(w, rows, at(22), [{ key: late[0].key, sent_at: at(21) }]);
  assertEquals(again, [], "once only, by its key");
  const night = refundMsgs(w, rows, Date.UTC(2026, 9, 22, 3, 0)); // 11 p.m. Oct 21 in New York
  assertEquals(night.map((x: any) => x.key), [`watch:watch:${w[0].id}:overdue`], "a watch comes through quiet hours");
});
