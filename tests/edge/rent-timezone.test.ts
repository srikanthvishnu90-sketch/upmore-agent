// Rent's month is counted in the person's own day (overnight 2026-10-12). At 11:30 p.m. on Oct 31 in New York (already
// Nov 1 in UTC), with rent due on the 21st and October not yet staged, the UTC day offered November's rent and October's
// silently dropped; the person's day offers October's, ten days late. The flow router passes the zone to rent's session.
import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { buildSessions, localDate } from "../../supabase/functions/_shared/flow_router.ts";

const AT = Date.UTC(2026, 10, 1, 3, 30); // Oct 31, 11:30 p.m. in New York
const rule = { id: "MOCK-rent", user_id: "MOCK-user", kind: "rent", status: "active", amount_cents: 145000, day_of_month: 21, payee_name: "Mike", payee_handle: "@mike", rail: "zelle", funding_label: "checking", created_at: "2026-01-01T00:00:00Z" };
const data: any = { transactions: [], standing: [rule], standing_ok: true, recipients: [], people: [] };

Deno.test("the local date is the person's, not UTC's", () => {
  assertEquals(localDate(AT, "America/New_York"), "2026-10-31");
  assertEquals(localDate(AT, "Not/AZone"), null);
  assertEquals(localDate(AT, null), null);
});

Deno.test("at 11:30 p.m. Oct 31 in New York the unpaid October rent is offered, not November's", () => {
  const local = buildSessions(data, {}, () => AT, "in-app", null, null, "America/New_York").rent.start("pay my rent");
  assertMatch(local.text, /^Rent for October: \$1,450\.00 to Mike/);
  const utc = buildSessions(data, {}, () => AT, "in-app", null, null, null).rent.start("pay my rent");
  assertMatch(utc.text, /^Rent for November/);
});

// Buy and cancel get the same zone (overnight 2026-10-12): "what did I buy today" at 8:30 p.m. ET lists a 3:30 p.m. ET
// fill (00:30 UTC is already tomorrow). The behavior is proven in tests/depth-INV-011 S15 and tests/depth-BILL-003 S12/S14;
// this checks the router hands the zone over. The fill is MOCK.
Deno.test("the flow router gives buy and cancel the person's zone", () => {
  const evening = Date.UTC(2026, 9, 13, 0, 30), fill = Date.UTC(2026, 9, 12, 19, 30);
  const today = (tz: string | null) => {
    const s = buildSessions(data, {}, () => evening, "in-app", null, null, tz);
    s.trade.loop.memory.facts.push({ capability_id: "INV-011", source: "MOCK broker", recorded_at: fill, value: { order_id: "MOCK-ord-1", side: "buy", quantity: 1, symbol: "VOO", fill_price_cents: 400, total_cents: 400, account: "MOCK-acct" } });
    return s.trade.today(evening).text;
  };
  assertMatch(today("America/New_York"), /^1 VOO at \$4\.00/);
  assertEquals(today(null), "Nothing bought today.");
});
